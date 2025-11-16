using System;
using System.Collections.Generic;
using System.Globalization;
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
    private const string TimestampFormat = "yyyyMMdd'T'HHmmssfff'Z'";
    private static readonly Encoding LogEncoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    private static readonly int NewLineByteCount = LogEncoding.GetByteCount(Environment.NewLine);

    private readonly ILogger<FileHttpInspectorStore> _logger;
    private readonly FileHttpInspectorStoreOptions _options;
    private readonly string _baseFilePath;
    private readonly string _directory;
    private readonly string _fileNamePrefix;
    private readonly string _fileExtension;
    private readonly SemaphoreSlim _writerGate = new(1, 1);
    private readonly JsonSerializerOptions _serializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    };

    private LogFileSegment? _activeSegment;
    private bool _disposed;

    public FileHttpInspectorStore(
    IOptions<FileHttpInspectorStoreOptions> options,
    IHostEnvironment environment,
    ILogger<FileHttpInspectorStore> logger)
    {
        _logger = logger;
        _options = options.Value;
        _baseFilePath = ResolvePath(_options, environment);
        _directory = Path.GetDirectoryName(_baseFilePath) ?? string.Empty;
        _fileNamePrefix = Path.GetFileNameWithoutExtension(_baseFilePath);
        _fileExtension = Path.GetExtension(_baseFilePath);
        _activeSegment = LoadLatestSegment();
    }

    public async ValueTask AppendAsync(HttpInspectorLogEntry entry, CancellationToken cancellationToken)
    {
        ThrowIfDisposed();
        await _writerGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            EnsureDirectory();

            var payload = JsonSerializer.Serialize(entry, _serializerOptions);
            var payloadBytes = (long)LogEncoding.GetByteCount(payload) + NewLineByteCount;
            var segment = EnsureActiveSegment(entry.Timestamp, payloadBytes);

            await File.AppendAllTextAsync(segment.Path, payload + Environment.NewLine, LogEncoding, cancellationToken)
            .ConfigureAwait(false);

            ApplyRetentionPolicies();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector failed to append log entry to {FilePath}", _activeSegment?.Path ?? _baseFilePath);
        }
        finally
        {
            _writerGate.Release();
        }
    }

    public async IAsyncEnumerable<JsonElement> GetEventsAsync(
    DateTimeOffset? since,
    DateTimeOffset? until,
    [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ThrowIfDisposed();

        if (since.HasValue && until.HasValue && since.Value >= until.Value)
        {
            yield break;
        }

        var segments = EnumerateSegments();
        if (segments.Count == 0)
        {
            yield break;
        }

        if (until.HasValue && segments[0].StartTimestamp > until.Value)
        {
            yield break;
        }

        var startIndex = since.HasValue ? FindSegmentIndex(segments, since.Value) : 0;
        var endIndex = segments.Count - 1;
        if (until.HasValue)
        {
            endIndex = FindSegmentIndex(segments, until.Value);
        }

        if (startIndex >= segments.Count || startIndex > endIndex)
        {
            yield break;
        }

        for (var i = startIndex; i <= endIndex && i < segments.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await foreach (var element in ReadSegmentAsync(
            segments[i],
            since,
            until,
            since.HasValue && i == startIndex,
            until.HasValue && i == endIndex,
            cancellationToken).ConfigureAwait(false))
            {
                yield return element;
            }
        }
    }

    private LogFileSegment EnsureActiveSegment(DateTimeOffset entryTimestamp, long nextWriteBytes)
    {
        var utc = entryTimestamp.ToUniversalTime();
        var entryDate = DateOnly.FromDateTime(utc.Date);

        if (_activeSegment is null)
        {
            _activeSegment = LoadLatestSegment();
        }

        if (_activeSegment is null)
        {
            _activeSegment = CreateSegment(utc);
            return _activeSegment;
        }

        if (utc < _activeSegment.StartTimestamp)
        {
            _activeSegment = FindSegmentForTimestamp(utc) ?? CreateSegment(utc);
        }
        else if (entryDate != _activeSegment.Date || ShouldRotateForSize(_activeSegment.Path, nextWriteBytes))
        {
            _activeSegment = CreateSegment(utc);
        }

        return _activeSegment;
    }

    private bool ShouldRotateForSize(string path, long nextWriteBytes)
    {
        if (_options.MaxFileSizeBytes <= 0)
        {
            return false;
        }

        try
        {
            var info = new FileInfo(path);
            var currentLength = info.Exists ? info.Length : 0;
            if (currentLength <= 0)
            {
                return false;
            }

            return currentLength + nextWriteBytes > _options.MaxFileSizeBytes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector failed to enforce log size limit for {FilePath}", path);
            return false;
        }
    }

    private LogFileSegment CreateSegment(DateTimeOffset timestamp)
    {
        var utc = timestamp.ToUniversalTime();
        var formatted = utc.ToString(TimestampFormat, CultureInfo.InvariantCulture);
        var path = ComposeFilePath(formatted);
        var suffix = 1;
        while (File.Exists(path))
        {
            path = ComposeFilePath($"{formatted}_{suffix++}");
        }

        return new LogFileSegment(path, utc, DateOnly.FromDateTime(utc.Date));
    }

    private LogFileSegment? FindSegmentForTimestamp(DateTimeOffset timestamp)
    {
        LogFileSegment? candidate = null;
        foreach (var segment in EnumerateSegments())
        {
            if (segment.StartTimestamp <= timestamp)
            {
                candidate = segment;
            }
            else
            {
                break;
            }
        }

        return candidate;
    }

    private string ComposeFilePath(string suffix)
    {
        var fileName = string.IsNullOrEmpty(_fileExtension)
        ? $"{_fileNamePrefix}-{suffix}"
        : $"{_fileNamePrefix}-{suffix}{_fileExtension}";
        return string.IsNullOrEmpty(_directory) ? fileName : Path.Combine(_directory, fileName);
    }

    private List<LogFileSegment> EnumerateSegments()
    {
        var result = new List<LogFileSegment>();
        if (!Directory.Exists(_directory))
        {
            return result;
        }

        var searchPattern = string.IsNullOrEmpty(_fileExtension)
        ? $"{_fileNamePrefix}-*"
        : $"{_fileNamePrefix}-*{_fileExtension}";

        foreach (var file in Directory.EnumerateFiles(_directory, searchPattern))
        {
            if (TryParseSegment(file, out var segment))
            {
                result.Add(segment!);
            }
        }

        result.Sort((a, b) => a.StartTimestamp.CompareTo(b.StartTimestamp));
        return result;
    }

    private LogFileSegment? LoadLatestSegment()
    {
        LogFileSegment? latest = null;
        foreach (var segment in EnumerateSegments())
        {
            latest = segment;
        }

        return latest;
    }

    private bool TryParseSegment(string path, out LogFileSegment? segment)
    {
        segment = null;
        var fileName = Path.GetFileName(path);
        if (!fileName.StartsWith($"{_fileNamePrefix}-", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrEmpty(_fileExtension) && !fileName.EndsWith(_fileExtension, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var suffixLength = fileName.Length - _fileNamePrefix.Length - 1;
        if (!string.IsNullOrEmpty(_fileExtension))
        {
            suffixLength -= _fileExtension.Length;
        }

        if (suffixLength <= 0)
        {
            return false;
        }

        var suffix = fileName.Substring(_fileNamePrefix.Length + 1, suffixLength);
        var timestampPart = suffix.Split('_')[0];
        if (!DateTimeOffset.TryParseExact(timestampPart, TimestampFormat, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var start))
        {
            return false;
        }

        segment = new LogFileSegment(path, start, DateOnly.FromDateTime(start.Date));
        return true;
    }

    private int FindSegmentIndex(IReadOnlyList<LogFileSegment> segments, DateTimeOffset timestamp)
    {
        if (segments.Count == 0)
        {
            return 0;
        }

        var low = 0;
        var high = segments.Count - 1;
        while (low <= high)
        {
            var mid = (low + high) / 2;
            if (segments[mid].StartTimestamp <= timestamp)
            {
                low = mid + 1;
            }
            else
            {
                high = mid - 1;
            }
        }

        return Math.Max(0, high);
    }

    private async IAsyncEnumerable<JsonElement> ReadSegmentAsync(
    LogFileSegment segment,
    DateTimeOffset? since,
    DateTimeOffset? until,
    bool applySinceFilter,
    bool applyUntilFilter,
    [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        FileStream stream;
        try
        {
            stream = new FileStream(segment.Path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        }
        catch (FileNotFoundException)
        {
            yield break;
        }

        await using (stream.ConfigureAwait(false))
        {
            long startOffset = 0;
            if (applySinceFilter && since.HasValue)
            {
                startOffset = SeekToTimestampOffset(stream, since.Value);
            }

            stream.Seek(startOffset, SeekOrigin.Begin);
            using var reader = new StreamReader(stream, LogEncoding, detectEncodingFromByteOrderMarks: true, bufferSize: 4096, leaveOpen: true);

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
                    DateTimeOffset? entryTimestamp = null;

                    if ((applySinceFilter || applyUntilFilter) && TryGetTimestamp(root, out var ts))
                    {
                        entryTimestamp = ts;
                    }

                    if (since.HasValue && applySinceFilter)
                    {
                        includeEntry = !entryTimestamp.HasValue || entryTimestamp.Value > since.Value;
                    }

                    if (applyUntilFilter && until.HasValue)
                    {
                        if (entryTimestamp.HasValue && entryTimestamp.Value > until.Value)
                        {
                            break;
                        }

                        includeEntry &= entryTimestamp is null || entryTimestamp.Value <= until.Value;
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
    }

    private long SeekToTimestampOffset(FileStream stream, DateTimeOffset since)
    {
        if (stream.Length == 0)
        {
            return 0;
        }

        long low = 0;
        long high = stream.Length;
        long candidate = 0;

        while (low < high)
        {
            var mid = (low + high) / 2;
            var lineStart = AlignToLineStart(stream, mid);
            if (lineStart >= stream.Length)
            {
                break;
            }

            var (timestamp, nextPosition) = ReadTimestampAt(stream, lineStart);
            if (timestamp is null)
            {
                if (nextPosition <= lineStart)
                {
                    nextPosition = lineStart + 1;
                }

                low = Math.Min(nextPosition, stream.Length);
                candidate = low;
                continue;
            }

            if (timestamp.Value <= since)
            {
                low = Math.Min(nextPosition, stream.Length);
                candidate = low;
            }
            else
            {
                high = lineStart;
                candidate = lineStart;
            }
        }

        var offset = Math.Min(candidate, stream.Length);
        if (offset <= 0)
        {
            return 0;
        }

        var rewindStart = Math.Max(0, offset - 65_536);
        return AlignToLineStart(stream, rewindStart);
    }

    private static long AlignToLineStart(FileStream stream, long position)
    {
        if (position <= 0)
        {
            return 0;
        }

        var target = Math.Min(position, stream.Length - 1);
        var current = target;
        while (current > 0)
        {
            current--;
            stream.Seek(current, SeekOrigin.Begin);
            var value = stream.ReadByte();
            if (value == -1)
            {
                break;
            }

            if (value == '\n')
            {
                return current + 1;
            }
        }

        return 0;
    }

    private (DateTimeOffset? Timestamp, long NextPosition) ReadTimestampAt(FileStream stream, long position)
    {
        stream.Seek(position, SeekOrigin.Begin);
        using var reader = new StreamReader(stream, LogEncoding, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true);
        var line = reader.ReadLine();
        var next = stream.Position;
        if (string.IsNullOrWhiteSpace(line))
        {
            return (null, next);
        }

        if (TryExtractTimestampFromLine(line, out var timestamp))
        {
            return (timestamp, next);
        }

        return (null, next);
    }

    private static bool TryExtractTimestampFromLine(string line, out DateTimeOffset timestamp)
    {
        timestamp = default;
        try
        {
            using var doc = JsonDocument.Parse(line);
            if (doc.RootElement.ValueKind == JsonValueKind.Object &&
            doc.RootElement.TryGetProperty("timestamp", out var tsElement) &&
            tsElement.ValueKind == JsonValueKind.String &&
            DateTimeOffset.TryParse(tsElement.GetString(), out var parsed))
            {
                timestamp = parsed;
                return true;
            }
        }
        catch (JsonException)
        {
        }

        return false;
    }

    private void ApplyRetentionPolicies()
    {
        PruneByCount();
        PruneExpiredFiles();
    }

    private void PruneByCount()
    {
        if (_options.RetainedFileCount < 0)
        {
            return;
        }

        var segments = EnumerateSegments();
        var protectedCount = Math.Max(1, _options.RetainedFileCount + 1);
        if (segments.Count <= protectedCount)
        {
            return;
        }

        var removable = segments.Count - protectedCount;
        for (var i = 0; i < removable; i++)
        {
            TryDeleteFile(segments[i].Path);
        }
    }

    private void PruneExpiredFiles()
    {
        if (_options.RetainedDays <= 0)
        {
            return;
        }

        var threshold = DateTimeOffset.UtcNow.AddDays(-_options.RetainedDays);
        foreach (var segment in EnumerateSegments())
        {
            if (segment.StartTimestamp < threshold)
            {
                TryDeleteFile(segment.Path);
            }
        }
    }

    private void TryDeleteFile(string path)
    {
        if (_activeSegment is not null && string.Equals(path, _activeSegment.Path, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (DirectoryNotFoundException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "HttpInspector failed to delete log file {FilePath}", path);
        }
    }

    private void EnsureDirectory()
    {
        if (!string.IsNullOrEmpty(_directory))
        {
            Directory.CreateDirectory(_directory);
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
            return Path.GetFullPath(options.FilePath);
        }

        if (!string.IsNullOrWhiteSpace(options.DirectoryPath))
        {
            var directory = Path.GetFullPath(options.DirectoryPath);
            Directory.CreateDirectory(directory);
            return Path.Combine(directory, FileHttpInspectorDefaults.DefaultFileName);
        }

        var root = environment.ContentRootPath ?? AppContext.BaseDirectory;
        var appData = Path.Combine(root, "App_Data");
        Directory.CreateDirectory(appData);
        return Path.Combine(appData, FileHttpInspectorDefaults.DefaultFileName);
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

    private sealed record LogFileSegment(string Path, DateTimeOffset StartTimestamp, DateOnly Date);
}

