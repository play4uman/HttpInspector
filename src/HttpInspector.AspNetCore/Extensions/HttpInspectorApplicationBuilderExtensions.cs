using System;
using System.IO;
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

    public static WebApplication UseHttpInspector(this WebApplication app, Action<FileHttpInspectorStoreOptions>? configureStore = null)
    {
        ArgumentNullException.ThrowIfNull(app);
        UseHttpInspectorInternal((IApplicationBuilder)app, app, configureStore);
        return app;
    }

    public static IApplicationBuilder UseHttpInspector(this IApplicationBuilder app, Action<FileHttpInspectorStoreOptions>? configureStore = null)
    {
        ArgumentNullException.ThrowIfNull(app);

        if (app is WebApplication webApp)
        {
            UseHttpInspectorInternal(webApp, webApp, configureStore);
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

        UseHttpInspectorInternal(app, endpoints, configureStore);
        return app;
    }

    private static void UseHttpInspectorInternal(IApplicationBuilder app, IEndpointRouteBuilder endpoints, Action<FileHttpInspectorStoreOptions>? configureStore)
    {
        if (configureStore is not null)
        {
            var storeOptions = app.ApplicationServices
                .GetRequiredService<IOptions<FileHttpInspectorStoreOptions>>()
                .Value;

            var originalDirectory = storeOptions.DirectoryPath;
            var originalFilePath = storeOptions.FilePath;

            configureStore(storeOptions);
            AlignDirectoryOverrides(storeOptions, originalDirectory, originalFilePath);
        }

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

    private static void AlignDirectoryOverrides(
        FileHttpInspectorStoreOptions options,
        string? originalDirectory,
        string? originalFilePath)
    {
        if (string.IsNullOrWhiteSpace(options.DirectoryPath))
        {
            return;
        }

        var normalizedDirectory = Path.GetFullPath(options.DirectoryPath);
        var normalizedOriginalDirectory = string.IsNullOrWhiteSpace(originalDirectory)
            ? null
            : Path.GetFullPath(originalDirectory);

        options.DirectoryPath = normalizedDirectory;

        if (normalizedOriginalDirectory is not null &&
            string.Equals(normalizedDirectory, normalizedOriginalDirectory, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var filePathCustomized = !string.IsNullOrWhiteSpace(options.FilePath) &&
            !string.Equals(options.FilePath, originalFilePath, StringComparison.OrdinalIgnoreCase);

        if (filePathCustomized)
        {
            return;
        }

        var fileName = !string.IsNullOrWhiteSpace(originalFilePath)
            ? Path.GetFileName(originalFilePath)
            : null;

        if (string.IsNullOrEmpty(fileName))
        {
            fileName = FileHttpInspectorDefaults.DefaultFileName;
        }

        options.FilePath = Path.Combine(normalizedDirectory, fileName);
    }
}

