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

// Register HTTP inspector dependecies 👇
#if DEBUG
builder.Services.AddHttpInspector();
#endif

var app = builder.Build();

// Enable it as part of the ASP.NET Core pipeline 👇
#if DEBUG
app.UseHttpInspector();
#endif

app.Run();
```

That's it! You can now visit `/http-inspector` to open the UI or GET `/http-inspector/stream?since=<timestamp>` for raw JSON events.

### All Requests View
![Request Details](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.1.0/list_requests.png?raw=true)

### Request details
![Request Details](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.1.0/detail_requests.png?raw=true)

## Project Layout

| Path | Description |
| --- | --- |
| `src/HttpInspector.AspNetCore` | Production library: middleware, endpoints, options, store, and embedded UI. |
| `samples/SampleApp` | Minimal API demonstrating the two-line integration. |
| `tests/HttpInspector.AspNetCore.Tests` | xUnit/FluentAssertions specs covering options and storage.
