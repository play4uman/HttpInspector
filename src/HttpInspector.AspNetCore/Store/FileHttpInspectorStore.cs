using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using HttpInspector.AspNetCore.Models;
using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Store;

public sealed class FileHttpInspectorStore : IHttpInspectorStore, IHttpInspectorLogWriter, IDisposable
{
    private readonly ILogger<FileHttpInspectorStore> _logger;
    private readonly string _filePath;
    private readonly SemaphoreSlim _writerGate = new(1, 1);
    private readonly JsonSerializerOptions _serializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    };
    private bool _disposed;

    public FileHttpInspectorStore(
        IOptions<FileHttpInspectorStoreOptions> options,
        IHostEnvironment environment,
        ILogger<FileHttpInspectorStore> logger)
    {
        _logger = logger;
        _filePath = ResolvePath(options.Value, environment);
    }

    public async ValueTask AppendAsync(HttpInspectorLogEntry entry, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        await _writerGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var directory = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var payload = JsonSerializer.Serialize(entry, _serializerOptions);
            await File.AppendAllTextAsync(_filePath, payload + Environment.NewLine, Encoding.UTF8, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector failed to append log entry to {FilePath}", _filePath);
        }
        finally
        {
            _writerGate.Release();
        }
    }

    public async IAsyncEnumerable<JsonElement> GetEventsAsync(
        DateTimeOffset? since,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();
        if (!File.Exists(_filePath))
        {
            yield break;
        }

        using var stream = new FileStream(
            _filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete);
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 4096, leaveOpen: false);

        string? line;
        while ((line = await reader.ReadLineAsync().ConfigureAwait(false)) is not null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            JsonDocument? doc = null;
            var shouldYield = false;
            JsonElement clone = default;

            try
            {
                doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                var includeEntry = true;
                if (since.HasValue && TryGetTimestamp(root, out var ts))
                {
                    includeEntry = ts > since.Value;
                }

                if (includeEntry)
                {
                    clone = root.Clone();
                    shouldYield = true;
                }
            }
            catch (JsonException)
            {
                _logger.LogWarning("HttpInspector skipped malformed log line.");
            }
            finally
            {
                doc?.Dispose();
            }

            if (shouldYield)
            {
                yield return clone;
            }
        }
    }

    private static bool TryGetTimestamp(JsonElement element, out DateTimeOffset timestamp)
    {
        timestamp = default;
        if (element.TryGetProperty("timestamp", out var tsElement) &&
            tsElement.ValueKind == JsonValueKind.String &&
            DateTimeOffset.TryParse(tsElement.GetString(), out var parsed))
        {
            timestamp = parsed;
            return true;
        }

        return false;
    }

    private static string ResolvePath(FileHttpInspectorStoreOptions options, IHostEnvironment environment)
    {
        if (!string.IsNullOrWhiteSpace(options.FilePath))
        {
            return options.FilePath;
        }

        var root = environment.ContentRootPath ?? AppContext.BaseDirectory;
        var appData = Path.Combine(root, "App_Data");
        return Path.Combine(appData, "httpinspector-log.jsonl");
    }

    private void ThrowIfDisposed()
    {
        if (_disposed)
        {
            throw new ObjectDisposedException(nameof(FileHttpInspectorStore));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _writerGate.Dispose();
        _disposed = true;
    }
}
