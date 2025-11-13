# HttpInspector.AspNetCore

HttpInspector.AspNetCore is a plug-and-play HTTP request/response inspector for ASP.NET Core. Drop it into any app to capture structured JSON logs and review traffic through an embedded UI.

## Quick Start

`csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpInspector();
var app = builder.Build();
app.UseHttpInspector();
app.Run();
`

Visit /http-inspector to open the UI or call /http-inspector/stream for raw JSON events.

## Projects

- src/HttpInspector.AspNetCore – library, middleware, storage, and UI.
- samples/SampleApp – runnable demo showing default registration.
- 	ests/HttpInspector.AspNetCore.Tests – xUnit test suite for middleware and storage.
