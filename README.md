# HttpInspector.AspNetCore

HttpInspector.AspNetCore is a plug-and-play HTTP inspector for ASP.NET Core applications. It logs structured request/response payloads, persists them via pluggable storage, and serves an embedded dashboard at `/http-inspector`.

## Quick Start

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpInspector();
var app = builder.Build();
app.UseHttpInspector();
app.Run();
```

Point your browser at `/http-inspector` for the UI or call `/http-inspector/stream` to fetch raw JSON events.

## Projects

- `src/HttpInspector.AspNetCore` – main library with middleware, endpoints, storage, and UI assets.
- `samples/SampleApp` – runnable demo showing the default configuration.
- `tests/HttpInspector.AspNetCore.Tests` – xUnit test suite for middleware and storage components.
