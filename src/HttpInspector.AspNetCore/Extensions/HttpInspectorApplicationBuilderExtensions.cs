using System;
using HttpInspector.AspNetCore.Endpoints;
using HttpInspector.AspNetCore.Middleware;
using HttpInspector.AspNetCore.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Extensions;

public static class HttpInspectorApplicationBuilderExtensions
{
    private const string MiddlewareKey = "__HttpInspector_Middleware";
    private const string EndpointsKey = "__HttpInspector_Endpoints";

    public static WebApplication UseHttpInspector(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        UseHttpInspectorInternal((IApplicationBuilder)app, app);
        return app;
    }

    public static IApplicationBuilder UseHttpInspector(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);

        if (app is WebApplication webApp)
        {
            UseHttpInspectorInternal(webApp, webApp);
            return webApp;
        }

        var endpoints = app as IEndpointRouteBuilder;
        if (endpoints is null)
        {
            if (app.Properties.TryGetValue("__EndpointRouteBuilder", out var builder) && builder is IEndpointRouteBuilder captured)
            {
                endpoints = captured;
            }
            else
            {
                throw new InvalidOperationException("HttpInspector requires endpoint routing. Call UseHttpInspector after the WebApplication is built.");
            }
        }

        UseHttpInspectorInternal(app, endpoints);
        return app;
    }

    private static void UseHttpInspectorInternal(IApplicationBuilder app, IEndpointRouteBuilder endpoints)
    {
        var options = app.ApplicationServices.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;
        if (!options.Enabled)
        {
            return;
        }

        var properties = app.Properties;
        if (!properties.ContainsKey(MiddlewareKey))
        {
            app.UseMiddleware<HttpInspectorMiddleware>();
            properties[MiddlewareKey] = true;
        }

        if (!properties.ContainsKey(EndpointsKey))
        {
            endpoints.MapHttpInspectorEndpoints();
            properties[EndpointsKey] = true;
        }
    }
}
