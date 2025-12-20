using System.Collections.Generic;
using System.Net;
using System.Text.Json;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using HttpInspector.AspNetCore.UI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Endpoints;

internal static class HttpInspectorEndpointRouteBuilderExtensions
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    public static void MapHttpInspectorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var options = endpoints.ServiceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;
        var basePath = HttpInspectorRouteHelper.NormalizeBasePath(options.BasePath);
        var streamPath = $"{basePath}/stream";

        var streamEndpoint = endpoints.MapGet(streamPath, async Task<IResult> (
            DateTimeOffset? since,
            DateTimeOffset? until,
            HttpContext context,
            IHttpInspectorStore store,
            CancellationToken cancellationToken) =>
        {
            // Network security check
            if (!CheckNetworkAccess(context, options))
            {
                return Results.StatusCode(403);
            }

            var payload = new List<JsonElement>();
            await foreach (var entry in store.GetEventsAsync(since, until, cancellationToken).ConfigureAwait(false))
            {
                payload.Add(entry);
            }

            return Results.Json(payload, SerializerOptions);
        });

        ApplySecurity(streamEndpoint, options);

        var uiEndpoint = endpoints.MapGet(basePath, (HttpContext context, HttpInspectorUiRenderer renderer) =>
        {
            // Network security check
            if (!CheckNetworkAccess(context, options))
            {
                return Results.StatusCode(403);
            }

            return renderer.Render();
        });
        ApplySecurity(uiEndpoint, options);

        var assetsEndpoint = endpoints.MapGet($"{basePath}/assets/{{**assetPath}}", (
            string assetPath,
            HttpContext context,
            HttpInspectorAssetProvider assetProvider) =>
        {
            // Network security check
            if (!CheckNetworkAccess(context, options))
            {
                return Results.StatusCode(403);
            }

            return assetProvider.Render(assetPath);
        });
        ApplySecurity(assetsEndpoint, options);
    }

    private static bool CheckNetworkAccess(HttpContext context, HttpInspectorOptions options)
    {
        if (options.AllowedNetworks == null || options.AllowedNetworks.Length == 0)
        {
            return true;
        }

        var remoteIp = context.Connection.RemoteIpAddress;
        return NetworkSecurityHelper.IsIpAddressAllowed(remoteIp, options.AllowedNetworks);
    }

    private static void ApplySecurity(RouteHandlerBuilder builder, HttpInspectorOptions options)
    {
        if (options.RequireAuthentication)
        {
            if (!string.IsNullOrWhiteSpace(options.AuthorizationPolicy))
            {
                builder.RequireAuthorization(options.AuthorizationPolicy);
            }
            else
            {
                builder.RequireAuthorization();
            }
        }
        else
        {
            builder.AllowAnonymous();
        }
    }
}
