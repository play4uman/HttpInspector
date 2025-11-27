# HttpInspector.AspNetCore

[![NuGet](https://img.shields.io/nuget/v/HttpInspector.AspNetCore.svg?style=flat-square)](https://www.nuget.org/packages/HttpInspector.AspNetCore/)
[![Publish NuGet](https://github.com/play4uman/HttpInspector/actions/workflows/publish-nuget.yml/badge.svg)](https://github.com/play4uman/HttpInspector/actions)

## A Zero-Config Live HTTP Inspector for ASP.NET Core

**HttpInspector.AspNetCore** provides a built-in, real-time view of incoming and outgoing HTTP traffic inside any ASP.NET Core application.  
It captures the complete request lifecycle and exposes it through a polished, embedded dashboard ideal for development, testing, QA, CI pipelines, and microservice debugging.

It is **not** a replacement for ELK, Seq, or Application Insights.  
Instead, it fills the gap between “no visibility at all” and “full observability stack,” and does so with almost no setup.

---

# 💡 Philosophy

HttpInspector focuses on being:

- **Fast to enable**  
- **Effortless to use**  
- **Powerful for debugging**  
- **Zero-infrastructure**  
- **In-app and self-contained**  

It provides immediate clarity into what the API is doing **right now**, especially in complex request chains — all without the overhead of full observability stacks.

---

# 🖼 Dashboard Preview
1. Install the NuGet package:
   ```bash
   dotnet add package HttpInspector.AspNetCore --version 1.4.0
   ```
  2. Use the [Quick Start Guide](#-quick-start) to set up the package in your ASP.NET project
  3. Open the dashboard:
  ```
  http://localhost:<port>/http-inspector
  ```

![Dashboard Preview](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.4.0/dashboard.png?raw=true)

---

# ✨ Features

## 🎛 Real-time visual dashboard

Access `/http-inspector` to see:

- Live stream of captured HTTP traffic  
- Expandable request/response panels  
- Syntax-highlighted JSON bodies  
- Duration bars & status color coding  
- Free-text, method, and status filters  
- Smooth, responsive UI designed for developers  

![Expanded Request](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.4.0/request_details.png?raw=true)

---

## 🔗 Outgoing HTTP request tracking

Automatically captures all `HttpClient` calls triggered during request processing.

- Child → parent correlation  
- URL, method, headers, body  
- Response status and duration  
- End-to-end request chain visibility  

![Outgoing Requests](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.4.0/outgoing_request_tracking.png?raw=true)

---

## 🔁 Request replay & editing built-in

Replay any captured request — or fully **edit it before sending**.

Edit anything:
- URL and query parameters  
- HTTP method  
- Headers (add/remove/change)  
- Body (JSON, XML, form-data, raw text)

Features:
- Instant replay via internal loopback  
- Rich request editor with live preview  
- Copy as:
  - `curl`
  - PowerShell
  - Raw HTTP
- Replay results shown directly inside the UI  

![Replay Feature](https://github.com/play4uman/HttpInspector/blob/master/docs/images/v1.5.0/replay_request.png?raw=true)


---

## 🔒 Safe and configurable

- Redact sensitive headers  
- Truncate large request/response bodies  
- Include/exclude specific paths  
- Optional authentication for the dashboard  
- Configurable retention and file rotation
  
---

## 📦 Extensible storage

The storage layer is fully pluggable via:

```csharp
public interface IHttpInspectorStore
{
    IAsyncEnumerable<JsonElement> GetEventsAsync(DateTimeOffset? since, CancellationToken ct);
}
```

Use the built-in JSONL file store or replace it with:

- SQLite  
- SQL databases  
- Cloud blob storage  
- In-memory ring buffers  
- Custom backends  

---

## 🌐 Streaming API

Query traffic programmatically:

```
/http-inspector/stream?since=<timestamp>
```

Returns an efficient JSON array with incremental fetch capability, ideal for:

- automation  
- custom dashboards  
- debugging pipelines  
- IDE integrations  

---

# 🚀 Quick Start

Enable HttpInspector with **two lines**:

```csharp
var builder = WebApplication.CreateBuilder(args);

#if DEBUG
builder.Services.AddHttpInspector();
#endif

var app = builder.Build();

#if DEBUG
app.UseHttpInspector();
#endif

app.Run();
```

---

# ⚙️ Optional Configuration

```csharp
app.UseHttpInspector(store =>
{
    store.MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    store.RetainedFileCount = 4;
    store.RetainedDays = 14;
});
```

---
