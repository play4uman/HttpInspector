# HttpInspector.AspNetCore

[![NuGet](https://img.shields.io/nuget/v/HttpInspector.AspNetCore.svg?style=flat-square)](https://www.nuget.org/packages/HttpInspector.AspNetCore/)
[![Publish NuGet](https://github.com/play4uman/HttpInspector/actions/workflows/publish-nuget.yml/badge.svg)](https://github.com/play4uman/HttpInspector/actions)

**HttpInspector** is a **zero-config in-process HTTP inspection dashboard** for **ASP.NET Core**.

It captures **incoming requests**, **responses**, and (optionally) **outgoing `HttpClient` calls** and exposes a **web UI** where you can search, filter, inspect payloads, and **replay** requests.

> Practical goal: give you the “Fiddler/DevTools network tab” experience *inside* your ASP.NET Core app — ideal for local dev, staging, and controlled debugging environments.

It is **not** a replacement for ELK, Seq, or Application Insights.  
Instead, it fills the gap between “no visibility at all” and “full observability stack,” and does so with almost no setup.

---

## Why this exists

HttpInspector fills the space between:

- **Plain logging** (hard to explore, no timeline, no replay)
- **External proxies** (MITM certificates, awkward in containers/Kubernetes, can’t see server-side pipeline details)
- **Full observability stacks** (powerful, but heavy for “I just need to see what this endpoint did right now”)

Use it when you want **fast visibility** and **interactive debugging**, without spinning up an entire platform.

---

# Features

- 🕵️ **Inspect incoming HTTP** requests and responses (headers, status, body)
- 🌍 **Track outgoing HTTP** (`HttpClient`) and correlate it to the triggering request (optional)
- 🔁 **Replay requests** from the UI (edit method/headers/body) *(optional; dangerous in prod)*
- 📋 **Copy-as** `curl`, PowerShell, raw HTTP
- ⏱ **Timeline filtering** by time range, route, method, status, duration
- 🧹 **Retention controls** (max events, max age, max bytes, rotation)
- 🧹 **Redaction** for sensitive headers (and optional body redaction rules)
- 🧩 **Pluggable storage** (file store by default; implement your own)

---

# 🎮 Live Demo

**See HttpInspector in action:**

👉 **[Live HttpInspector demo](https://http-inspector-demo-bdc7bbg9ftcxh4a8.germanywestcentral-01.azurewebsites.net/http-inspector)**

Experience the live dashboard with:
- Real-time HTTP traffic monitoring
- Request/response inspection
- Outgoing HTTP request tracking
- Interactive request replay & editing
- All features running in a live ASP.NET Core application

Try triggering some API calls and watch them appear instantly in the dashboard!

---

# 🚀 Quick Start

1. Install the NuGet package:
```bash
dotnet add package HttpInspector.AspNetCore
```

2. Enable HttpInspector with **two lines**:

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

3. Open the dashboard:
```
http://localhost:<port>/http-inspector
```

![Dashboard Preview](https://github.com/play4uman/HttpInspector/blob/master/docs/images/dashboard.png?raw=true)

## Recommended “safe” configuration

Below is a template that is safer than “just enable it”. Adapt as needed.

```csharp
#if DEBUG
app.UseHttpInspector(options =>
{
    // UI access
    options.RequireAuthentication = true; // strongly recommended outside local dev

    // Capture settings
    options.EnableOutgoingHttpTracking = true;
    options.LogRequestBody = true;
    options.LogResponseBody = true;

    // Limits
    options.MaxBodySizeBytes = 64_000;          // protect memory & disk
    options.MaxEventAge = TimeSpan.FromHours(6); // retention cap
    options.MaxEvents = 10_000;                 // retention cap

    // Redaction (minimum set)
    options.RedactHeaders.Add("Authorization");
    options.RedactHeaders.Add("Cookie");
    options.RedactHeaders.Add("Set-Cookie");

    // Route inclusion/exclusion examples (optional)
    // options.ExcludePathPrefixes.Add("/health");
    // options.ExcludePathPrefixes.Add("/metrics");
});
#endif
```

> **Do not** run with body logging + no auth on a publicly reachable environment.

---

# ✨ Feature Outline

## 🎛 Real-time visual dashboard

Access `/http-inspector` to see:

- Live stream of captured HTTP traffic  
- Expandable request/response panels  
- Syntax-highlighted JSON bodies  
- Duration bars & status color coding  
- Free-text, method, and status filters  
- Smooth, responsive UI designed for developers  
- Supports static time ranges as well as real-time updates

![Time Ranges](https://github.com/play4uman/HttpInspector/blob/master/docs/images/time_range.png?raw=true)


---

## 🔗 Outgoing HTTP request tracking

Automatically captures all `HttpClient` calls triggered during request processing.

- Child → parent correlation  
- URL, method, headers, body  
- Response status and duration  
- End-to-end request chain visibility  

### How to opt-in

Enable outgoing HTTP request tracking in your configuration:

```csharp
builder.Services.AddHttpInspector(options =>
{
    options.EnableOutgoingTracking = true;
    
    // Optional: configure outgoing tracking behavior
    options.Outgoing.IncludeUrlQuery = true;
    options.Outgoing.MaxBodyLength = 4_096;
});
```

Then simply inject `IHttpClientFactory` in your endpoints or controllers:

```csharp
app.MapGet("/api/external", async (IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("demo-api");
    var response = await client.GetAsync("https://api.example.com/data");
    var payload = await response.Content.ReadAsStringAsync();
    return Results.Text(payload, "application/json");
});
```

That's it! All HTTP calls made through `IHttpClientFactory` will be automatically tracked and correlated with their parent requests.

![Outgoing Requests](https://github.com/play4uman/HttpInspector/blob/master/docs/images/outgoing_request_tracking.png?raw=true)

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

![Replay Feature](https://github.com/play4uman/HttpInspector/blob/master/docs/images/replay_request.png?raw=true)


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

# ⚙️ Optional Configuration

## HttpInspector Options

```csharp
builder.Services.AddHttpInspector(options =>
{
    // Customize the dashboard base path (default: "/http-inspector")
    options.BasePath = "/inspector";
    
    // Enable/disable request body logging (default: true)
    options.LogBodies = true;
    
    // Enable outgoing HTTP request tracking (default: true)
    options.EnableOutgoingTracking = true;
    
    // Maximum body length to capture in bytes (default: 10,000)
    options.MaxBodyLength = 10_000;
    
    // Require authentication to access dashboard (default: false)
    options.RequireAuthentication = false;
    
    // Headers to redact from logs (default: Authorization, Cookie)
    options.RedactedHeaders = new[] { "Authorization", "Cookie", "X-API-Key" };
    
    // Path patterns to include/exclude from logging
    options.PathIncludePatterns = new[] { "/api/*" };
    options.PathExcludePatterns = new[] { "/health", "/metrics" };
});
```

## Storage Options

```csharp
app.UseHttpInspector(store =>
{
    store.MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    store.RetainedFileCount = 4;
    store.RetainedDays = 14;
});
```

---
