using System.Text.RegularExpressions;
using HttpInspector.AspNetCore.Options;

namespace HttpInspector.AspNetCore.Internal;

public class RedactionService
{
    private readonly RedactionOptions _options;
    private readonly List<Regex> _headerPatterns;
    private readonly HashSet<string> _queryKeys;

    public RedactionService(RedactionOptions options)
    {
        _options = options;
        _headerPatterns = new List<Regex>();
        
        foreach (var pattern in options.RedactedHeaders)
        {
            if (pattern.Contains('*'))
            {
                var regexPattern = "^" + Regex.Escape(pattern).Replace("\\*", ".*") + "$";
                _headerPatterns.Add(new Regex(regexPattern, RegexOptions.IgnoreCase | RegexOptions.Compiled));
            }
            else
            {
                var exactPattern = "^" + Regex.Escape(pattern) + "$";
                _headerPatterns.Add(new Regex(exactPattern, RegexOptions.IgnoreCase | RegexOptions.Compiled));
            }
        }

        _queryKeys = new HashSet<string>(options.RedactQueryKeys, StringComparer.OrdinalIgnoreCase);
    }

    public bool ShouldRedactHeader(string headerName)
    {
        foreach (var pattern in _headerPatterns)
        {
            if (pattern.IsMatch(headerName))
                return true;
        }
        return false;
    }

    public string RedactQueryString(string? queryString)
    {
        if (string.IsNullOrEmpty(queryString))
            return string.Empty;

        if (!queryString.StartsWith("?"))
            queryString = "?" + queryString;

        var parts = queryString.TrimStart('?').Split('&');
        var redacted = new List<string>();

        foreach (var part in parts)
        {
            var keyValue = part.Split('=', 2);
            if (keyValue.Length == 2 && _queryKeys.Contains(keyValue[0]))
            {
                redacted.Add(keyValue[0] + "=***REDACTED***");
            }
            else
            {
                redacted.Add(part);
            }
        }

        return "?" + string.Join("&", redacted);
    }

    public bool ShouldCaptureBody(string? contentType)
    {
        if (string.IsNullOrEmpty(contentType))
            return true;

        var mediaType = contentType.Split(';')[0].Trim().ToLowerInvariant();

        // Check skip list first
        foreach (var skipType in _options.SkipBodyContentTypes)
        {
            if (IsContentTypeMatch(mediaType, skipType))
                return false;
        }

        // If allowlist is empty, allow all (except skipped)
        if (_options.AllowedBodyContentTypes.Length == 0)
            return true;

        // Check allowlist
        foreach (var allowedType in _options.AllowedBodyContentTypes)
        {
            if (IsContentTypeMatch(mediaType, allowedType))
                return true;
        }

        return false;
    }

    private static bool IsContentTypeMatch(string mediaType, string pattern)
    {
        if (pattern.EndsWith("/*"))
        {
            var prefix = pattern.Substring(0, pattern.Length - 2);
            return mediaType.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
        }
        return mediaType.Equals(pattern, StringComparison.OrdinalIgnoreCase);
    }

    public string? RedactJsonBody(string? body)
    {
        if (string.IsNullOrEmpty(body) || _options.BodyRedactionPaths.Length == 0)
            return body;

        // Simple implementation for now - can be enhanced with proper JSONPath
        var result = body;
        foreach (var path in _options.BodyRedactionPaths)
        {
            result = RedactJsonPath(result, path);
        }
        return result;
    }

    private string RedactJsonPath(string json, string path)
    {
        // Basic implementation - handles simple paths like "$.password" or "$.user.password"
        // For MVP, we'll do simple string replacement for common patterns
        var pathParts = path.TrimStart('$', '.').Split('.');
        
        if (pathParts.Length == 0)
            return json;

        var lastKey = pathParts[pathParts.Length - 1];
        var pattern = $"\"{lastKey}\"\\s*:\\s*\"[^\"]*\"";
        var replacement = $"\"{lastKey}\":\"***REDACTED***\"";
        
        return Regex.Replace(json, pattern, replacement, RegexOptions.IgnoreCase);
    }

    public string? RedactFormBody(string? body)
    {
        if (string.IsNullOrEmpty(body))
            return body;

        var parts = body.Split('&');
        var redacted = new List<string>();

        foreach (var part in parts)
        {
            var keyValue = part.Split('=', 2);
            if (keyValue.Length == 2 && _queryKeys.Contains(keyValue[0]))
            {
                redacted.Add(keyValue[0] + "=***REDACTED***");
            }
            else
            {
                redacted.Add(part);
            }
        }

        return string.Join("&", redacted);
    }
}
