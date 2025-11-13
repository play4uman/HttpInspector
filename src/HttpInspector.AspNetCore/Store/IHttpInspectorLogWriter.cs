using HttpInspector.AspNetCore.Models;

namespace HttpInspector.AspNetCore.Store;

public interface IHttpInspectorLogWriter
{
    ValueTask AppendAsync(HttpInspectorLogEntry entry, CancellationToken cancellationToken);
}
