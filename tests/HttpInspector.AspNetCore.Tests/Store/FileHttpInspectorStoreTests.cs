using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using FluentAssertions;
using HttpInspector.AspNetCore.Models;
using HttpInspector.AspNetCore.Options;
using HttpInspector.AspNetCore.Store;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Store;

public sealed class FileHttpInspectorStoreTests : IDisposable
{
    private readonly string _root;

    public FileHttpInspectorStoreTests()
    {
        _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_root);
    }

    [Fact]
    public async Task AppendAndRead_RoundTripsEntries()
    {
        var filePath = Path.Combine(_root, "log.jsonl");
        using var store = CreateStore(filePath);
        var entry = CreateEntry(DateTimeOffset.UtcNow, "entry-1");

        await store.AppendAsync(entry, CancellationToken.None);

        var result = await ReadEventsAsync(store, since: null, until: null);

        result.Should().ContainSingle();
        result[0].GetProperty("id").GetString().Should().Be(entry.Id);
    }

    [Fact]
    public async Task GetEventsAsync_ReturnsEntriesAfterSinceAcrossFiles()
    {
        var filePath = Path.Combine(_root, "log.jsonl");
        using var store = CreateStore(filePath);
        var day1 = new DateTimeOffset(2025, 1, 1, 8, 0, 0, TimeSpan.Zero);
        var day2 = day1.AddDays(1);

        await store.AppendAsync(CreateEntry(day1, "day1"), CancellationToken.None);
        await store.AppendAsync(CreateEntry(day2, "day2"), CancellationToken.None);

        var result = await ReadEventsAsync(store, day2.AddMinutes(-1));

        result.Should().ContainSingle();
        result[0].GetProperty("id").GetString().Should().Be("day2");
    }

    [Fact]
    public async Task GetEventsAsync_SeeksWithinFile()
    {
        var filePath = Path.Combine(_root, "log.jsonl");
        using var store = CreateStore(filePath);
        var start = new DateTimeOffset(2025, 2, 1, 0, 0, 0, TimeSpan.Zero);

        for (var i = 0; i < 50; i++)
        {
            await store.AppendAsync(CreateEntry(start.AddMinutes(i), $"entry-{i:D2}"), CancellationToken.None);
        }

        var result = await ReadEventsAsync(store, start.AddMinutes(40));
        var ids = result.Select(e => e.GetProperty("id").GetString()).ToList();

        ids.Should().Equal(Enumerable.Range(41, 9).Select(i => $"entry-{i:D2}"));
    }

    [Fact]
    public async Task GetEventsAsync_HonorsUpperBound()
    {
        var filePath = Path.Combine(_root, "log.jsonl");
        using var store = CreateStore(filePath);
        var start = new DateTimeOffset(2025, 3, 1, 12, 0, 0, TimeSpan.Zero);

        for (var i = 0; i < 5; i++)
        {
            await store.AppendAsync(CreateEntry(start.AddMinutes(i * 5), $"entry-{i}"), CancellationToken.None);
        }

        var until = start.AddMinutes(12);
        var result = await ReadEventsAsync(store, start.AddMinutes(-5), until);
        var ids = result.Select(e => e.GetProperty("id").GetString()).ToList();

        ids.Should().Equal(new[] { "entry-0", "entry-1", "entry-2" });
    }

    private static async Task<List<JsonElement>> ReadEventsAsync(
        FileHttpInspectorStore store,
        DateTimeOffset? since,
        DateTimeOffset? until = null)
    {
        var result = new List<JsonElement>();
        await foreach (var item in store.GetEventsAsync(since, until, CancellationToken.None))
        {
            result.Add(item);
        }

        return result;
    }

    private static HttpInspectorLogEntry CreateEntry(DateTimeOffset timestamp, string id)
    {
        return new HttpInspectorLogEntry
        {
            Id = id,
            Type = "request",
            Timestamp = timestamp,
            Method = "GET",
            Path = "/api/time",
            QueryString = "?q=1",
            RemoteIp = "127.0.0.1",
            StatusCode = null,
            Headers = new Dictionary<string, string> { ["Host"] = "localhost" },
            Body = "{}",
            DurationMs = null
        };
    }

    private FileHttpInspectorStore CreateStore(string filePath)
    {
        var options = Microsoft.Extensions.Options.Options.Create(new FileHttpInspectorStoreOptions { FilePath = filePath });
        var logger = NullLogger<FileHttpInspectorStore>.Instance;
        var host = new TestHostEnvironment(_root);
        return new FileHttpInspectorStore(options, host, logger);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public TestHostEnvironment(string root)
        {
            ContentRootPath = root;
            EnvironmentName = Environments.Development;
            ApplicationName = "HttpInspector.Tests";
            ContentRootFileProvider = new NullFileProvider();
        }

        public string EnvironmentName { get; set; }
        public string ApplicationName { get; set; }
        public string ContentRootPath { get; set; }
        public IFileProvider ContentRootFileProvider { get; set; }
    }
}
