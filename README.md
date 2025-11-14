# HttpInspector.AspNetCore

[![NuGet](https://img.shields.io/nuget/v/HttpInspector.AspNetCore.svg?style=flat-square)](https://www.nuget.org/packages/HttpInspector.AspNetCore/) [![Publish NuGet](https://github.com/play4uman/HttpInspector/actions/workflows/publish-nuget.yml/badge.svg)](https://github.com/play4uman/HttpInspector/actions)

HttpInspector.AspNetCore turns any ASP.NET Core app into its own request/response inspector. Drop it in, capture structured JSON logs (headers, bodies, timings, correlation IDs), and browse traffic through a zero-config dashboard.

-  **One-line wiring**: `AddHttpInspector` + `UseHttpInspector`, no controllers or static files required.
-  **Built-in UI**: `/http-inspector` hosts an auto-refreshing grid with filters, status coloring, and paired request/response views.
-  **Pluggable storage**: ships with a JSONL file store, but you can swap in your own `IHttpInspectorStore`.
-  **Production-friendly**: path filters, header redaction, optional auth, and SourceLink-enabled NuGet artifacts.

> NuGet package: https://www.nuget.org/packages/HttpInspector.AspNetCore/

## Quick Start

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpInspector();

var app = builder.Build();

app.UseHttpInspector();
app.Run();
```

Visit `/http-inspector` to open the UI or GET `/http-inspector/stream?since=<timestamp>` for raw JSON events.

## Project Layout

| Path | Description |
| --- | --- |
| `src/HttpInspector.AspNetCore` | Production library: middleware, endpoints, options, store, and embedded UI. |
| `samples/SampleApp` | Minimal API demonstrating the two-line integration. |
| `tests/HttpInspector.AspNetCore.Tests` | xUnit/FluentAssertions specs covering options and storage.
