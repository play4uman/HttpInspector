using System;
using System.IO;
using HttpInspector.AspNetCore.Handlers;
using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using HttpInspector.AspNetCore.UI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Extensions;

public static class HttpInspectorServiceCollectionExtensions
{
    public static HttpInspectorBuilder AddHttpInspector(this IServiceCollection services, Action<HttpInspectorOptions>? configure = null)
    {
        services.AddHttpContextAccessor();
        services.AddOptions<HttpInspectorOptions>();
        
        if (configure is not null)
        {
            services.Configure(configure);
        }

        var builder = new HttpInspectorBuilder(services);

        // Register post-configuration for validation/defaults only
        services.AddSingleton<IPostConfigureOptions<HttpInspectorOptions>, HttpInspectorOptionsPostConfigure>();

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
        services.TryAddSingleton<RedactionService>(sp =>
        {
            var options = sp.GetRequiredService<IOptionsMonitor<HttpInspectorOptions>>();
            return new RedactionService(options.CurrentValue.Redaction);
        });
        services.TryAddTransient<HttpInspectorOutgoingHandler>();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IHttpMessageHandlerBuilderFilter, HttpInspectorOutgoingHandlerBuilderFilter>());

        services.TryAddSingleton<FileHttpInspectorStore>();
        services.TryAddSingleton<IHttpInspectorStore>(sp => sp.GetRequiredService<FileHttpInspectorStore>());
        services.TryAddSingleton<IHttpInspectorLogWriter>(sp => sp.GetRequiredService<FileHttpInspectorStore>());

        // Startup audit logging
        services.AddHostedService<HttpInspectorStartupLogger>();

        return builder;
    }
}

