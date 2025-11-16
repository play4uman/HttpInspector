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
                var directory = opts.DirectoryPath;
                if (string.IsNullOrWhiteSpace(directory))
                {
                    var root = env.ContentRootPath ?? AppContext.BaseDirectory;
                    directory = Path.Combine(root, "App_Data");
                }

                Directory.CreateDirectory(directory);
                opts.DirectoryPath = directory;

                if (string.IsNullOrWhiteSpace(opts.FilePath))
                {
                    opts.FilePath = Path.Combine(directory, FileHttpInspectorDefaults.DefaultFileName);
                }
            })
            .PostConfigure(opts =>
            {
                if (opts.MaxFileSizeBytes <= 0)
                {
                    opts.MaxFileSizeBytes = 5 * 1024 * 1024;
                }

                if (opts.RetainedFileCount < 0)
                {
                    opts.RetainedFileCount = 0;
                }

                if (opts.RetainedDays < 0)
                {
                    opts.RetainedDays = 0;
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

