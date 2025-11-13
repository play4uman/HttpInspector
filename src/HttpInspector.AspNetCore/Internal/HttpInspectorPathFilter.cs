using System.Collections.Generic;
using HttpInspector.AspNetCore.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileSystemGlobbing;

namespace HttpInspector.AspNetCore.Internal;

public sealed class HttpInspectorPathFilter
{
    public bool ShouldCapture(PathString path, HttpInspectorOptions options)
    {
        var normalizedPath = Normalize(path);

        if (options.PathIncludePatterns is { Length: > 0 })
        {
            var includeMatcher = BuildMatcher(options.PathIncludePatterns);
            if (!includeMatcher.Match(normalizedPath).HasMatches)
            {
                return false;
            }
        }

        if (options.PathExcludePatterns is { Length: > 0 })
        {
            var excludeMatcher = BuildMatcher(options.PathExcludePatterns);
            if (excludeMatcher.Match(normalizedPath).HasMatches)
            {
                return false;
            }
        }

        return true;
    }

    private static Matcher BuildMatcher(IEnumerable<string> patterns)
    {
        var matcher = new Matcher(StringComparison.OrdinalIgnoreCase);
        foreach (var pattern in patterns)
        {
            if (!string.IsNullOrWhiteSpace(pattern))
            {
                matcher.AddInclude(NormalizeGlob(pattern));
            }
        }

        return matcher;
    }

    private static string Normalize(PathString path)
        => path.HasValue ? path.Value!.TrimStart('/') : string.Empty;

    private static string NormalizeGlob(string pattern)
    {
        var normalized = pattern.Replace("\\", "/", StringComparison.Ordinal);
        return normalized.TrimStart('/');
    }
}
