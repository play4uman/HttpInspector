using System;
using HttpInspector.AspNetCore.Handlers;
using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Internal;

internal sealed class HttpInspectorOutgoingHandlerBuilderFilter : IHttpMessageHandlerBuilderFilter
{
    private readonly IOptionsMonitor<HttpInspectorOptions> _options;

    public HttpInspectorOutgoingHandlerBuilderFilter(IOptionsMonitor<HttpInspectorOptions> options)
    {
        _options = options;
    }

    public Action<HttpMessageHandlerBuilder> Configure(Action<HttpMessageHandlerBuilder> next)
    {
        return builder =>
        {
            ArgumentNullException.ThrowIfNull(builder);
            next(builder);

            if (!_options.CurrentValue.EnableOutgoingTracking)
            {
                return;
            }

            var handler = builder.Services.GetRequiredService<HttpInspectorOutgoingHandler>();
            builder.AdditionalHandlers.Insert(0, handler);
        };
    }
}
