using System.Collections.Generic;
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
            IHttpInspectorStore store,
            CancellationToken cancellationToken) =>
        {
            var payload = new List<JsonElement>();
            await foreach (var entry in store.GetEventsAsync(since, cancellationToken).ConfigureAwait(false))
            {
                payload.Add(entry);
            }

            return Results.Json(payload, SerializerOptions);
        });

        ApplySecurity(streamEndpoint, options);

        var uiEndpoint = endpoints.MapGet(basePath, (HttpInspectorUiRenderer renderer) => renderer.Render());
        ApplySecurity(uiEndpoint, options);

        var assetsEndpoint = endpoints.MapGet($"{basePath}/assets/{{**assetPath}}", (
            string assetPath,
            HttpInspectorAssetProvider assetProvider) => assetProvider.Render(assetPath));
        ApplySecurity(assetsEndpoint, options);
    }

    private static void ApplySecurity(RouteHandlerBuilder builder, HttpInspectorOptions options)
    {
        if (options.RequireAuthentication)
        {
            builder.RequireAuthorization();
        }
        else
        {
            builder.AllowAnonymous();
        }
    }
}
