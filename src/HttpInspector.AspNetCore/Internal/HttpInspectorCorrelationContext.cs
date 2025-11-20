using System;
using Microsoft.AspNetCore.Http;

namespace HttpInspector.AspNetCore.Internal;

internal static class HttpInspectorCorrelationContext
{
    private static readonly object ContextKey = new();

    public static void Set(HttpContext context, string correlationId)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrEmpty(correlationId);
        context.Items[ContextKey] = correlationId;
    }

    public static bool TryGet(HttpContext? context, out string? correlationId)
    {
        correlationId = null;
        if (context?.Items is null)
        {
            return false;
        }

        if (context.Items.TryGetValue(ContextKey, out var value) && value is string captured)
        {
            correlationId = captured;
            return true;
        }

        return false;
    }

    public static void Clear(HttpContext context)
    {
        if (context?.Items is null)
        {
            return;
        }

        context.Items.Remove(ContextKey);
    }
}
