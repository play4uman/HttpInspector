using System.Text.Json;

namespace HttpInspector.AspNetCore.Store;

public interface IHttpInspectorStore
{
    IAsyncEnumerable<JsonElement> GetEventsAsync(
        DateTimeOffset? since,
        DateTimeOffset? until = null,
        CancellationToken cancellationToken = default);
}
