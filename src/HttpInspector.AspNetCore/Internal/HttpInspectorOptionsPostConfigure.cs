using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Internal;

internal sealed class HttpInspectorOptionsPostConfigure : IPostConfigureOptions<HttpInspectorOptions>
{
    public void PostConfigure(string? name, HttpInspectorOptions options)
    {
        // Validation and normalization only - no environment-based opinions
        options.PathIncludePatterns ??= Array.Empty<string>();
        options.PathExcludePatterns ??= Array.Empty<string>();
        options.RedactedHeaders ??= Array.Empty<string>();
        options.AllowedNetworks ??= Array.Empty<string>();
        
        if (options.MaxBodyLength <= 0)
        {
            options.MaxBodyLength = 10_000;
        }

        options.Outgoing.RedactedHeaders ??= new[] { "Authorization", "Cookie" };
        if (options.Outgoing.MaxBodyLength <= 0)
        {
            options.Outgoing.MaxBodyLength = 10_000;
        }
    }
}
