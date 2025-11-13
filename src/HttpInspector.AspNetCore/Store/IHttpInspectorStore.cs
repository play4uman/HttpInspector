using System.Text.Json;

namespace HttpInspector.AspNetCore.Store;

public interface IHttpInspectorStore
{
    IAsyncEnumerable<JsonElement> GetEventsAsync(DateTimeOffset? since, CancellationToken cancellationToken = default);
}
