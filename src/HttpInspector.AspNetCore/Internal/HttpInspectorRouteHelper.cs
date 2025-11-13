namespace HttpInspector.AspNetCore.Internal;

internal static class HttpInspectorRouteHelper
{
    public static string NormalizeBasePath(string? basePath)
    {
        var path = string.IsNullOrWhiteSpace(basePath)
            ? "/http-inspector"
            : basePath.Trim();

        if (!path.StartsWith('/'))
        {
            path = "/" + path;
        }

        if (path.Length > 1 && path.EndsWith("/", StringComparison.Ordinal))
        {
            path = path.TrimEnd('/');
        }

        return path;
    }
}
