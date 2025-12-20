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
    private readonly RedactionService _redactionService;

    public HttpInspectorMiddleware(
        RequestDelegate next,
        ILogger<HttpInspectorMiddleware> logger,
        IHttpInspectorLogWriter logWriter,
        IOptionsMonitor<HttpInspectorOptions> options,
        HttpInspectorPathFilter pathFilter,
        RedactionService redactionService)
    {
        _next = next;
        _logger = logger;
        _logWriter = logWriter;
        _options = options;
        _pathFilter = pathFilter;
        _redactionService = redactionService;
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
        long? bodyCapturedBytes = null;
        long? bodyOriginalBytes = null;
        bool? isTruncated = null;
        bool? isRedacted = null;

        if (options.LogBodies && options.AllowBodyCapture)
        {
            var contentType = request.ContentType;
            if (_redactionService.ShouldCaptureBody(contentType))
            {
                request.EnableBuffering();
                var result = await ReadStreamWithMetadataAsync(request.Body, options.MaxBodyLength, context.RequestAborted).ConfigureAwait(false);
                body = result.Content;
                bodyCapturedBytes = result.CapturedBytes;
                bodyOriginalBytes = result.OriginalBytes;
                isTruncated = result.IsTruncated;

                if (body != null)
                {
                    if (contentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        body = _redactionService.RedactJsonBody(body);
                        isRedacted = true;
                    }
                    else if (contentType?.Contains("application/x-www-form-urlencoded", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        body = _redactionService.RedactFormBody(body);
                        isRedacted = true;
                    }
                }
            }
        }

        var headers = SnapshotHeaders(request.Headers);
        var queryString = request.QueryString.HasValue ? request.QueryString.Value : null;
        if (!options.Redaction.StoreRawUrl && !string.IsNullOrEmpty(queryString))
        {
            queryString = _redactionService.RedactQueryString(queryString);
            isRedacted = true;
        }

        var entry = new HttpInspectorLogEntry
        {
            Id = correlationId,
            Type = "request",
            Timestamp = DateTimeOffset.UtcNow,
            Method = request.Method,
            Path = request.Path.HasValue ? request.Path.Value : null,
            QueryString = queryString,
            RemoteIp = context.Connection.RemoteIpAddress?.ToString(),
            StatusCode = null,
            Headers = headers,
            Body = body,
            DurationMs = null,
            BodyCapturedBytes = bodyCapturedBytes,
            BodyOriginalBytes = bodyOriginalBytes,
            IsTruncated = isTruncated,
            IsRedacted = isRedacted
        };

        LogStructured(entry, "HttpInspector captured request {Method} {Path}", entry.Method, entry.Path);
        return entry;
    }

    private async Task<HttpInspectorLogEntry> CaptureResponseAsync(HttpContext context, Stream responseBody, string correlationId, TimeSpan elapsed, HttpInspectorOptions options)
    {
        string? body = null;
        long? bodyCapturedBytes = null;
        long? bodyOriginalBytes = null;
        bool? isTruncated = null;
        bool? isRedacted = null;

        if (options.LogBodies && options.AllowBodyCapture)
        {
            var contentType = context.Response.ContentType;
            if (_redactionService.ShouldCaptureBody(contentType))
            {
                var result = await ReadStreamWithMetadataAsync(responseBody, options.MaxBodyLength, context.RequestAborted).ConfigureAwait(false);
                body = result.Content;
                bodyCapturedBytes = result.CapturedBytes;
                bodyOriginalBytes = result.OriginalBytes;
                isTruncated = result.IsTruncated;

                if (body != null && contentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) == true)
                {
                    body = _redactionService.RedactJsonBody(body);
                    isRedacted = true;
                }
            }
        }

        var headers = SnapshotHeaders(context.Response.Headers);
        var queryString = context.Request.QueryString.HasValue ? context.Request.QueryString.Value : null;
        if (!options.Redaction.StoreRawUrl && !string.IsNullOrEmpty(queryString))
        {
            queryString = _redactionService.RedactQueryString(queryString);
            isRedacted = true;
        }

        var entry = new HttpInspectorLogEntry
        {
            Id = correlationId,
            Type = "response",
            Timestamp = DateTimeOffset.UtcNow,
            Method = context.Request.Method,
            Path = context.Request.Path.HasValue ? context.Request.Path.Value : null,
            QueryString = queryString,
            RemoteIp = context.Connection.RemoteIpAddress?.ToString(),
            StatusCode = context.Response.StatusCode,
            Headers = headers,
            Body = body,
            DurationMs = Math.Round(elapsed.TotalMilliseconds, 2, MidpointRounding.AwayFromZero),
            BodyCapturedBytes = bodyCapturedBytes,
            BodyOriginalBytes = bodyOriginalBytes,
            IsTruncated = isTruncated,
            IsRedacted = isRedacted
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

    private IReadOnlyDictionary<string, string> SnapshotHeaders(IHeaderDictionary headers)
    {
        var snapshot = new Dictionary<string, string>(headers.Count, StringComparer.OrdinalIgnoreCase);

        foreach (var header in headers)
        {
            var value = header.Value.ToString();
            if (_redactionService.ShouldRedactHeader(header.Key))
            {
                value = "***REDACTED***";
            }

            snapshot[header.Key] = value;
        }

        return snapshot;
    }

    private record StreamReadResult(string? Content, long CapturedBytes, long OriginalBytes, bool IsTruncated);

    private static async Task<StreamReadResult> ReadStreamWithMetadataAsync(Stream stream, int maxLength, CancellationToken cancellationToken)
    {
        if (!stream.CanRead)
        {
            return new StreamReadResult(null, 0, 0, false);
        }

        var originalPosition = stream.CanSeek ? stream.Position : 0;
        var buffer = ArrayPool<byte>.Shared.Rent(maxLength);
        
        try
        {
            var totalRead = 0;
            var bytesRead = 0;

            while (totalRead < maxLength && 
                   (bytesRead = await stream.ReadAsync(buffer.AsMemory(totalRead, maxLength - totalRead), cancellationToken).ConfigureAwait(false)) > 0)
            {
                totalRead += bytesRead;
            }

            var isTruncated = bytesRead > 0 || (stream.CanSeek && stream.Position < stream.Length);
            var originalLength = stream.CanSeek ? stream.Length : totalRead;

            if (stream.CanSeek)
            {
                stream.Position = originalPosition;
            }

            if (totalRead == 0)
            {
                return new StreamReadResult(null, 0, originalLength, false);
            }

            var content = Encoding.UTF8.GetString(buffer, 0, totalRead);
            return new StreamReadResult(content, totalRead, originalLength, isTruncated);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
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
