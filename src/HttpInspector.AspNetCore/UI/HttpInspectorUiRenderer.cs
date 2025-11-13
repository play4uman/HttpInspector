using System.Reflection;
using System.Text;
using System.Threading;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.UI;

internal sealed class HttpInspectorUiRenderer
{
    private readonly IOptions<HttpInspectorOptions> _options;
    private readonly Lazy<string> _template;

    public HttpInspectorUiRenderer(IOptions<HttpInspectorOptions> options)
    {
        _options = options;
        _template = new Lazy<string>(LoadTemplate, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public IResult Render()
    {
        var basePath = HttpInspectorRouteHelper.NormalizeBasePath(_options.Value.BasePath);
        var populated = _template.Value.Replace("__HTTP_INSPECTOR_BASE__", basePath, StringComparison.Ordinal);
        return Results.Content(populated, "text/html; charset=utf-8");
    }

    private static string LoadTemplate()
    {
        var assembly = typeof(HttpInspectorUiRenderer).GetTypeInfo().Assembly;
        const string resourceName = "HttpInspector.AspNetCore.UI.Static.HttpInspector.html";
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded UI resource '{resourceName}' could not be located.");
        using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: false);
        return reader.ReadToEnd();
    }
}
