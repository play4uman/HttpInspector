using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Internal;

internal sealed class HttpInspectorOptionsPostConfigure : IPostConfigureOptions<HttpInspectorOptions>
{
    private readonly IHostEnvironment _environment;

    public HttpInspectorOptionsPostConfigure(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public void PostConfigure(string? name, HttpInspectorOptions options)
    {
        var isDevelopment = _environment.IsDevelopment();
        
        // Environment gating: disable in production unless explicitly allowed
        if (_environment.IsProduction() && !options.AllowProduction)
        {
            options.Enabled = false;
        }

        // Safe defaults based on environment
        if (!isDevelopment)
        {
            // Require authentication outside Development
            if (!options.RequireAuthentication)
            {
                options.RequireAuthentication = true;
            }

            // Disable body capture outside Development unless explicitly enabled
            if (options.AllowBodyCapture && options.LogBodies)
            {
                options.AllowBodyCapture = false;
            }

            // Disable replay outside Development unless explicitly enabled
            if (options.AllowReplay)
            {
                options.AllowReplay = false;
            }
        }

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
