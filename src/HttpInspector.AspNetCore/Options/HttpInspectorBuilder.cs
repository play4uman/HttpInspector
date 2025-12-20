using Microsoft.Extensions.DependencyInjection;

namespace HttpInspector.AspNetCore.Options;

public sealed class HttpInspectorBuilder
{
    internal IServiceCollection Services { get; }

    internal HttpInspectorBuilder(IServiceCollection services)
    {
        Services = services;
    }

    /// <summary>
    /// Apply development-friendly defaults:
    /// - Body capture enabled
    /// - Replay enabled
    /// - No authentication required
    /// </summary>
    public HttpInspectorBuilder UseDevelopmentDefaults()
    {
        Services.Configure<HttpInspectorOptions>(options =>
        {
            options.AllowBodyCapture = true;
            options.AllowReplay = true;
            options.RequireAuthentication = false;
        });
        return this;
    }

    /// <summary>
    /// Apply production-safe defaults:
    /// - Body capture disabled
    /// - Replay disabled
    /// - Authentication required
    /// </summary>
    public HttpInspectorBuilder UseProductionDefaults()
    {
        Services.Configure<HttpInspectorOptions>(options =>
        {
            options.AllowBodyCapture = false;
            options.AllowReplay = false;
            options.RequireAuthentication = true;
        });
        return this;
    }

    /// <summary>
    /// Apply staging defaults:
    /// - Body capture enabled (for debugging)
    /// - Replay disabled (safety)
    /// - Authentication required
    /// </summary>
    public HttpInspectorBuilder UseStagingDefaults()
    {
        Services.Configure<HttpInspectorOptions>(options =>
        {
            options.AllowBodyCapture = true;
            options.AllowReplay = false;
            options.RequireAuthentication = true;
        });
        return this;
    }

    /// <summary>
    /// Configure HttpInspector options. This can be called before or after preset methods.
    /// Settings here will override preset defaults if called after, or be overridden if called before.
    /// </summary>
    public HttpInspectorBuilder Configure(Action<HttpInspectorOptions> configure)
    {
        Services.Configure(configure);
        return this;
    }
}
