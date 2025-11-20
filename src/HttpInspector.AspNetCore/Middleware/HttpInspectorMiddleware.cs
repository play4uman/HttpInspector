using System.Buffers;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Threading;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Models;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Middleware;

public sealed class HttpInspectorMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<HttpInspectorMiddleware> _logger;
    private readonly IHttpInspectorLogWriter _logWriter;
    private readonly IOptionsMonitor<HttpInspectorOptions> _options;
    private readonly HttpInspectorPathFilter _pathFilter;

    public HttpInspectorMiddleware(
        RequestDelegate next,
        ILogger<HttpInspectorMiddleware> logger,
        IHttpInspectorLogWriter logWriter,
        IOptionsMonitor<HttpInspectorOptions> options,
        HttpInspectorPathFilter pathFilter)
    {
        _next = next;
        _logger = logger;
        _logWriter = logWriter;
        _options = options;
        _pathFilter = pathFilter;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var options = _options.CurrentValue;
        if (!options.Enabled)
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        var inspectorPath = new PathString(HttpInspectorRouteHelper.NormalizeBasePath(options.BasePath));
        if (context.Request.Path.StartsWithSegments(inspectorPath, out _))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        if (!_pathFilter.ShouldCapture(context.Request.Path, options))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }


        var correlationId = Guid.NewGuid().ToString("n", CultureInfo.InvariantCulture);
        HttpInspectorCorrelationContext.Set(context, correlationId);

        try
        {
            var requestEntry = await CaptureRequestAsync(context, correlationId, options).ConfigureAwait(false);
            await PersistAsync(requestEntry, context.RequestAborted).ConfigureAwait(false);

            var originalBody = context.Response.Body;
            await using var buffer = new MemoryStream();
            context.Response.Body = buffer;
            var stopwatch = Stopwatch.StartNew();
            ExceptionDispatchInfo? capturedException = null;

            try
            {
                await _next(context).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                capturedException = ExceptionDispatchInfo.Capture(ex);
            }

            stopwatch.Stop();
            buffer.Seek(0, SeekOrigin.Begin);
            var responseEntry = await CaptureResponseAsync(context, buffer, correlationId, stopwatch.Elapsed, options).ConfigureAwait(false);
            buffer.Seek(0, SeekOrigin.Begin);
            await buffer.CopyToAsync(originalBody, context.RequestAborted).ConfigureAwait(false);
            context.Response.Body = originalBody;

            await PersistAsync(responseEntry, context.RequestAborted).ConfigureAwait(false);

            capturedException?.Throw();
        }
        finally
        {
            HttpInspectorCorrelationContext.Clear(context);
        }
    }

    private async Task<HttpInspectorLogEntry> CaptureRequestAsync(HttpContext context, string correlationId, HttpInspectorOptions options)
    {
        var request = context.Request;
        string? body = null;
        if (options.LogBodies)
        {
            request.EnableBuffering();
            body = await ReadStreamAsync(request.Body, options.MaxBodyLength, context.RequestAborted).ConfigureAwait(false);
        }

        var headers = SnapshotHeaders(request.Headers, options);
        var entry = new HttpInspectorLogEntry
        {
            Id = correlationId,
            Type = "request",
            Timestamp = DateTimeOffset.UtcNow,
            Method = request.Method,
            Path = request.Path.HasValue ? request.Path.Value : null,
            QueryString = request.QueryString.HasValue ? request.QueryString.Value : null,
            RemoteIp = context.Connection.RemoteIpAddress?.ToString(),
            StatusCode = null,
            Headers = headers,
            Body = body,
            DurationMs = null
        };

        LogStructured(entry, "HttpInspector captured request {Method} {Path}", entry.Method, entry.Path);
        return entry;
    }

    private async Task<HttpInspectorLogEntry> CaptureResponseAsync(HttpContext context, Stream responseBody, string correlationId, TimeSpan elapsed, HttpInspectorOptions options)
    {
        string? body = null;
        if (options.LogBodies)
        {
            body = await ReadStreamAsync(responseBody, options.MaxBodyLength, context.RequestAborted).ConfigureAwait(false);
        }

        var headers = SnapshotHeaders(context.Response.Headers, options);
        var entry = new HttpInspectorLogEntry
        {
            Id = correlationId,
            Type = "response",
            Timestamp = DateTimeOffset.UtcNow,
            Method = context.Request.Method,
            Path = context.Request.Path.HasValue ? context.Request.Path.Value : null,
            QueryString = context.Request.QueryString.HasValue ? context.Request.QueryString.Value : null,
            RemoteIp = context.Connection.RemoteIpAddress?.ToString(),
            StatusCode = context.Response.StatusCode,
            Headers = headers,
            Body = body,
            DurationMs = Math.Round(elapsed.TotalMilliseconds, 2, MidpointRounding.AwayFromZero)
        };

        LogStructured(entry, "HttpInspector captured response {StatusCode} {Path}", entry.StatusCode, entry.Path);
        return entry;
    }

    private async Task PersistAsync(HttpInspectorLogEntry entry, CancellationToken cancellationToken)
    {
        try
        {
            await _logWriter.AppendAsync(entry, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector could not persist {Type} event", entry.Type);
        }
    }

    private static IReadOnlyDictionary<string, string> SnapshotHeaders(IHeaderDictionary headers, HttpInspectorOptions options)
    {
        var snapshot = new Dictionary<string, string>(headers.Count, StringComparer.OrdinalIgnoreCase);
        var redacted = options.RedactedHeaders is { Length: > 0 }
            ? new HashSet<string>(options.RedactedHeaders, StringComparer.OrdinalIgnoreCase)
            : null;

        foreach (var header in headers)
        {
            var value = header.Value.ToString();
            if (redacted is not null && redacted.Contains(header.Key))
            {
                value = "<redacted>";
            }

            snapshot[header.Key] = value;
        }

        return snapshot;
    }

    private static async Task<string?> ReadStreamAsync(Stream stream, int maxLength, CancellationToken cancellationToken)
    {
        if (!stream.CanRead)
        {
            return null;
        }

        stream.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var minimumLength = Math.Max(maxLength, 1);
        var rentedLength = Math.Min(minimumLength, 4096);
        var buffer = ArrayPool<char>.Shared.Rent(rentedLength);
        try
        {
            var builder = new StringBuilder();
            while (builder.Length < maxLength)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var charsToRead = Math.Min(buffer.Length, maxLength - builder.Length);
                var read = await reader.ReadAsync(buffer.AsMemory(0, charsToRead)).ConfigureAwait(false);
                if (read == 0)
                {
                    break;
                }

                builder.Append(buffer, 0, read);
            }

            if (builder.Length == 0)
            {
                return null;
            }

            var truncated = builder.Length >= maxLength;
            var result = builder.ToString();
            if (truncated)
            {
                result += " …(truncated)";
            }

            return result;
        }
        finally
        {
            ArrayPool<char>.Shared.Return(buffer);
            stream.Seek(0, SeekOrigin.Begin);
        }
    }

    private void LogStructured(HttpInspectorLogEntry entry, string message, params object?[] args)
    {
        using var scope = _logger.BeginScope(new Dictionary<string, object?>
        {
            ["HttpLog"] = entry
        });
        _logger.LogInformation(message, args);
    }
}
