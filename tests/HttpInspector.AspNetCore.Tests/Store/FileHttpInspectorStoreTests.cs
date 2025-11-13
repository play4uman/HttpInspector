using System.Collections.Generic;
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
        var entry = new HttpInspectorLogEntry
        {
            Id = Guid.NewGuid().ToString("N"),
            Type = "request",
            Timestamp = DateTimeOffset.UtcNow,
            Method = "GET",
            Path = "/api/time",
            QueryString = "?q=1",
            RemoteIp = "127.0.0.1",
            StatusCode = null,
            Headers = new Dictionary<string, string> { ["Host"] = "localhost" },
            Body = "{}",
            DurationMs = null
        };

        await store.AppendAsync(entry, CancellationToken.None);

        var result = new List<JsonElement>();
        await foreach (var item in store.GetEventsAsync(null, CancellationToken.None))
        {
            result.Add(item);
        }

        result.Should().ContainSingle();
        result[0].GetProperty("id").GetString().Should().Be(entry.Id);
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
