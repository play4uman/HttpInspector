using System;
using System.IO;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using HttpInspector.AspNetCore.UI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace HttpInspector.AspNetCore.Extensions;

public static class HttpInspectorServiceCollectionExtensions
{
    public static IServiceCollection AddHttpInspector(this IServiceCollection services, Action<HttpInspectorOptions>? configure = null)
    {
        services.AddOptions<HttpInspectorOptions>();
        if (configure is not null)
        {
            services.Configure(configure);
        }

        services.PostConfigure<HttpInspectorOptions>(options =>
        {
            options.PathIncludePatterns ??= Array.Empty<string>();
            options.PathExcludePatterns ??= Array.Empty<string>();
            options.RedactedHeaders ??= Array.Empty<string>();
            if (options.MaxBodyLength <= 0)
            {
                options.MaxBodyLength = 10_000;
            }
        });

        services.AddOptions<FileHttpInspectorStoreOptions>()
            .Configure<IHostEnvironment>((opts, env) =>
            {
                if (string.IsNullOrWhiteSpace(opts.FilePath))
                {
                    var root = env.ContentRootPath ?? AppContext.BaseDirectory;
                    var appData = Path.Combine(root, "App_Data");
                    Directory.CreateDirectory(appData);
                    opts.FilePath = Path.Combine(appData, "httpinspector-log.jsonl");
                }
            });

        services.TryAddSingleton<HttpInspectorPathFilter>();
        services.TryAddSingleton<HttpInspectorUiRenderer>();
        services.TryAddSingleton<HttpInspectorAssetProvider>();

        services.TryAddSingleton<FileHttpInspectorStore>();
        services.TryAddSingleton<IHttpInspectorStore>(sp => sp.GetRequiredService<FileHttpInspectorStore>());
        services.TryAddSingleton<IHttpInspectorLogWriter>(sp => sp.GetRequiredService<FileHttpInspectorStore>());

        return services;
    }
}
