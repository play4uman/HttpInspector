using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.AspNetCore.Http;

namespace HttpInspector.AspNetCore.UI;

internal sealed class HttpInspectorAssetProvider
{
    private const string ResourcePrefix = "HttpInspector.AspNetCore.UI.Static.";
    private static readonly Assembly AssetAssembly = typeof(HttpInspectorAssetProvider).GetTypeInfo().Assembly;
    private static readonly IReadOnlyDictionary<string, string> ContentTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".css"] = "text/css; charset=utf-8",
        [".js"] = "application/javascript; charset=utf-8",
        [".html"] = "text/html; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".map"] = "application/octet-stream"
    };

    public IResult Render(string? asset)
    {
        if (string.IsNullOrWhiteSpace(asset))
        {
            return Results.NotFound();
        }

        var normalized = NormalizeAssetPath(asset);
        if (normalized is null)
        {
            return Results.NotFound();
        }

        var resourceName = BuildResourceName(normalized);
        var stream = AssetAssembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return Results.NotFound();
        }

        var extension = Path.GetExtension(normalized);
        var contentType = ContentTypes.TryGetValue(extension, out var value)
            ? value
            : "application/octet-stream";

        return Results.Stream(stream, contentType);
    }

    private static string? NormalizeAssetPath(string raw)
    {
        var trimmed = raw.Replace('\\', '/').Trim('/');
        if (trimmed.Contains("..", StringComparison.Ordinal))
        {
            return null;
        }

        return trimmed;
    }

    private static string BuildResourceName(string normalized)
    {
        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0)
        {
            return ResourcePrefix.TrimEnd('.');
        }

        if (segments.Length == 1)
        {
            return ResourcePrefix + segments[0];
        }

        var directorySegments = segments[..^1].Select(NormalizeDirectorySegment);
        var directoryPath = string.Join('.', directorySegments);
        var fileSegment = segments[^1];
        return $"{ResourcePrefix}{directoryPath}.{fileSegment}";
    }

    private static string NormalizeDirectorySegment(string segment)
        => segment.Replace('-', '_');
}
