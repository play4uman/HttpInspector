using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Models;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Handlers;

public sealed class HttpInspectorOutgoingHandler : DelegatingHandler
{
    private readonly IHttpInspectorLogWriter _logWriter;
    private readonly IOptionsMonitor<HttpInspectorOptions> _options;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<HttpInspectorOutgoingHandler> _logger;

    public HttpInspectorOutgoingHandler(
        IHttpInspectorLogWriter logWriter,
        IOptionsMonitor<HttpInspectorOptions> options,
        IHttpContextAccessor httpContextAccessor,
        ILogger<HttpInspectorOutgoingHandler> logger)
    {
        _logWriter = logWriter;
        _options = options;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var inspectorOptions = _options.CurrentValue;
        if (!inspectorOptions.EnableOutgoingTracking)
        {
            return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }

        var tracking = inspectorOptions.Outgoing;
        var callId = Guid.NewGuid().ToString("n", CultureInfo.InvariantCulture);
        var parentId = ResolveParentId();
        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        var requestHeaders = SnapshotHeaders(tracking, request.Headers, request.Content?.Headers);
        string? requestBody = null;
        if (tracking.CaptureRequestBody)
        {
            requestBody = await ReadContentSafeAsync(request.Content, tracking.MaxBodyLength, cancellationToken, ensureBuffer: true).ConfigureAwait(false);
        }

        HttpResponseMessage? response = null;
        Exception? capturedException = null;
        try
        {
            response = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
            return response;
        }
        catch (Exception ex)
        {
            capturedException = ex;
            throw;
        }
        finally
        {
            stopwatch.Stop();
            var responseHeaders = SnapshotHeaders(tracking, response?.Headers, response?.Content?.Headers);
            string? responseBody = null;
            if (response is not null && tracking.CaptureResponseBody)
            {
                responseBody = await ReadContentSafeAsync(response.Content, tracking.MaxBodyLength, cancellationToken).ConfigureAwait(false);
            }

            var entry = new HttpInspectorLogEntry
            {
                Id = callId,
                ParentId = parentId,
                Type = "outgoing",
                Timestamp = startedAt,
                Method = request.Method.Method,
                Url = BuildDisplayUrl(request.RequestUri, tracking.IncludeUrlQuery),
                StatusCode = response is not null ? (int)response.StatusCode : null,
                DurationMs = Math.Round(stopwatch.Elapsed.TotalMilliseconds, 2, MidpointRounding.AwayFromZero),
                RequestHeaders = requestHeaders,
                ResponseHeaders = responseHeaders,
                RequestBody = requestBody,
                ResponseBody = responseBody,
                Exception = capturedException?.ToString(),
                Faulted = capturedException is not null || cancellationToken.IsCancellationRequested
            };

            await PersistAsync(entry, cancellationToken).ConfigureAwait(false);
        }
    }

    private string? ResolveParentId()
    {
        return HttpInspectorCorrelationContext.TryGet(_httpContextAccessor.HttpContext, out var correlationId)
            ? correlationId
            : null;
    }

    private async ValueTask PersistAsync(HttpInspectorLogEntry entry, CancellationToken cancellationToken)
    {
        try
        {
            await _logWriter.AppendAsync(entry, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector could not persist outgoing call {CallId}", entry.Id);
        }
    }

    private static IReadOnlyDictionary<string, string>? SnapshotHeaders(OutgoingTrackingOptions options, params HttpHeaders?[] candidates)
    {
        Dictionary<string, string>? snapshot = null;
        var redacted = options.RedactedHeaders is { Length: > 0 }
            ? new HashSet<string>(options.RedactedHeaders, StringComparer.OrdinalIgnoreCase)
            : null;

        foreach (var headers in candidates)
        {
            if (headers is null)
            {
                continue;
            }

            foreach (var header in headers)
            {
                snapshot ??= new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var value = string.Join(", ", header.Value ?? Array.Empty<string>());
                if (redacted is not null && redacted.Contains(header.Key))
                {
                    value = "<redacted>";
                }

                snapshot[header.Key] = value;
            }
        }

        return snapshot;
    }

    private static async Task<string?> ReadContentSafeAsync(
        HttpContent? content,
        int maxLength,
        CancellationToken cancellationToken,
        bool ensureBuffer = false)
    {
        if (content is null)
        {
            return null;
        }

        try
        {
            if (ensureBuffer)
            {
                try
                {
                    await content.LoadIntoBufferAsync(maxLength).ConfigureAwait(false);
                }
                catch
                {
                    // Fire-and-forget best effort buffering. If it fails we still try to read whatever is available.
                }
            }

            var payload = await content.ReadAsStringAsync().ConfigureAwait(false);
            if (string.IsNullOrEmpty(payload))
            {
                return null;
            }

            if (payload.Length <= maxLength)
            {
                return payload;
            }

            return payload[..maxLength] + " .(truncated)";
        }
        catch
        {
            return "<unavailable>";
        }
    }

    private static string? BuildDisplayUrl(Uri? uri, bool includeQuery)
    {
        if (uri is null)
        {
            return null;
        }

        var value = uri.ToString();
        if (!includeQuery)
        {
            var queryIndex = value.IndexOf('?');
            if (queryIndex >= 0)
            {
                value = value[..queryIndex];
            }
        }

        return value;
    }
}
