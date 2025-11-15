using System.Collections.Generic;
using System.Reflection;
using Microsoft.AspNetCore.Http;

namespace HttpInspector.AspNetCore.UI;

internal sealed class HttpInspectorAssetProvider
{
    private static readonly IReadOnlyDictionary<string, (string ResourceName, string ContentType)> Assets =
        new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            ["httpinspector.css"] = ("HttpInspector.AspNetCore.UI.Static.HttpInspector.css", "text/css; charset=utf-8"),
            ["httpinspector.js"] = ("HttpInspector.AspNetCore.UI.Static.HttpInspector.js", "application/javascript; charset=utf-8")
        };

    private readonly Assembly _assembly = typeof(HttpInspectorAssetProvider).GetTypeInfo().Assembly;

    public IResult Render(string? asset)
    {
        if (string.IsNullOrWhiteSpace(asset))
        {
            return Results.NotFound();
        }

        var normalized = asset.Trim('/');
        if (!Assets.TryGetValue(normalized, out var entry))
        {
            return Results.NotFound();
        }

        var stream = _assembly.GetManifestResourceStream(entry.ResourceName);
        if (stream is null)
        {
            return Results.NotFound();
        }

        return Results.Stream(stream, entry.ContentType);
    }
}
