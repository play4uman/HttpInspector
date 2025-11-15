using System;
using System.IO;
using FluentAssertions;
using HttpInspector.AspNetCore.Extensions;
using HttpInspector.AspNetCore.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Tests.Extensions;

public class HttpInspectorApplicationBuilderExtensionsTests
{
    [Fact]
    public void UseHttpInspector_AllowsSelectingLogDirectory()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);

        try
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                ContentRootPath = tempRoot
            });

            builder.Services.AddHttpInspector();

            using var app = builder.Build();

            var customDirectory = Path.Combine(tempRoot, "logs");

            app.UseHttpInspector(store => store.DirectoryPath = customDirectory);

            var options = app.Services.GetRequiredService<IOptions<FileHttpInspectorStoreOptions>>().Value;
            var normalized = Path.GetFullPath(customDirectory);

            options.DirectoryPath.Should().Be(normalized);
            options.FilePath.Should().Be(Path.Combine(normalized, "httpinspector-log.jsonl"));
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }
}

