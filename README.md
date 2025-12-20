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

builder.Services.AddHttpInspector()
    .UseDevelopmentDefaults();  // Optional: choose your security preset

var app = builder.Build();

app.UseHttpInspector();

app.Run();
```

> **💡 Tip:** Use `.UseDevelopmentDefaults()`, `.UseProductionDefaults()`, or `.UseStagingDefaults()` to quickly apply environment-appropriate security settings. See [Security Configuration](#-security-configuration) for details.

3. Open the dashboard:
```
http://localhost:<port>/http-inspector
```

![Dashboard Preview](https://github.com/play4uman/HttpInspector/blob/master/docs/images/dashboard.png?raw=true)

---

# ✨ Features

## 🕵️ Real-time HTTP Inspection

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

## 🔗 Outgoing HTTP Tracking

Automatically capture all `HttpClient` calls triggered during request processing:

- Child → parent correlation  
- URL, method, headers, body  
- Response status and duration  
- End-to-end request chain visibility  

Enable with: `options.EnableOutgoingTracking = true;`

![Outgoing Requests](https://github.com/play4uman/HttpInspector/blob/master/docs/images/outgoing_request_tracking.png?raw=true)

[See full configuration →](#outgoing-http-request-tracking)

---

## 🔁 Request Replay & Editing

Replay any captured request — or fully **edit it before sending**:

- Edit URL, query parameters, method, headers, and body
- Instant replay via internal loopback  
- Rich request editor with live preview  
- Copy as `curl`, PowerShell, or raw HTTP
- Replay results shown directly in the UI  

![Replay Feature](https://github.com/play4uman/HttpInspector/blob/master/docs/images/replay_request.png?raw=true)

[See security considerations →](#-security-configuration)

---

## 🔒 Security & Data Protection

Built-in security features with zero configuration required:

- **Automatic redaction** of sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`)
- **Query parameter redaction** (`token`, `password`, `api_key`)
- **Binary content skipping** (images, videos, PDFs)
- **Environment presets** for development, staging, and production
- **IP-based access control** with CIDR notation support
- **ASP.NET Core authorization** integration

[Full security configuration →](#-security-configuration)

---

## 📦 Pluggable Storage

Replace the default file store with your own implementation:

```csharp
public interface IHttpInspectorStore
{
    IAsyncEnumerable<JsonElement> GetEventsAsync(DateTimeOffset? since, CancellationToken ct);
}
```

Options: SQLite, SQL databases, cloud storage, in-memory buffers, or custom backends.

---

## 🌐 Streaming API

Query traffic programmatically: `/http-inspector/stream?since=<timestamp>`

Returns efficient JSON arrays with incremental fetch capability for automation, custom dashboards, and IDE integrations.

---

# 📖 Configuration Guide

## Environment Presets

HttpInspector provides three presets for quick configuration:

### Development
```csharp
builder.Services.AddHttpInspector().UseDevelopmentDefaults();
```
- ✅ Body capture, ✅ Replay, ❌ Authentication

### Production
```csharp
builder.Services.AddHttpInspector().UseProductionDefaults();
```
- ❌ Body capture, ❌ Replay, ✅ Authentication

### Staging
```csharp
builder.Services.AddHttpInspector().UseStagingDefaults();
```
- ✅ Body capture, ❌ Replay, ✅ Authentication

[See advanced security configuration →](#-security-configuration)

---

## Basic Customization

```csharp
builder.Services.AddHttpInspector()
    .UseDevelopmentDefaults()
    .Configure(options =>
    {
        options.BasePath = "/inspector";
        options.MaxBodyLength = 128_000;
        options.PathExcludePatterns = new[] { "/health", "/metrics" };
    });
```

[See full configuration reference →](#️-configuration-reference)

---

# 📚 Advanced Configuration

## 🔒 Security Configuration

### Environment Presets

Choose the preset that matches your deployment scenario:

**Development Preset**
```csharp
builder.Services.AddHttpInspector().UseDevelopmentDefaults();
```
- Body capture: ✅ Enabled
- Request replay: ✅ Enabled  
- Authentication: ❌ Not required

**Production Preset**
```csharp
builder.Services.AddHttpInspector().UseProductionDefaults();
```
- Body capture: ❌ Disabled
- Request replay: ❌ Disabled
- Authentication: ✅ Required

**Staging Preset**
```csharp
builder.Services.AddHttpInspector().UseStagingDefaults();
```
- Body capture: ✅ Enabled (for debugging)
- Request replay: ❌ Disabled (for safety)
- Authentication: ✅ Required

### Custom Security Configuration

Override preset defaults or configure from scratch:

```csharp
builder.Services.AddHttpInspector()
    .UseProductionDefaults()
    .Configure(options =>
    {
        options.RequireAuthentication = true;
        options.AuthorizationPolicy = "AdminOnly";
        options.AllowedNetworks = new[] { "10.0.0.0/8", "192.168.1.0/24" };
        options.AllowBodyCapture = false;
        options.AllowReplay = false;
    });
```

### Custom Redaction Patterns

Add your own redaction rules using wildcard patterns:

```csharp
builder.Services.AddHttpInspector()
    .UseProductionDefaults()
    .Configure(options =>
    {
        // Redact custom headers (supports wildcards)
        options.Redaction.RedactedHeaders = new[]
        {
            "Authorization",
            "X-Custom-*",      // Matches X-Custom-Token, X-Custom-Secret, etc.
            "X-Internal-*"
        };
        
        // Redact query parameters
        options.Redaction.RedactQueryKeys = new[] { "apiKey", "sessionToken" };
        
        // Redact JSON body fields (JSONPath syntax)
        options.Redaction.BodyRedactionPaths = new[] { "$.password", "$.user.ssn" };
    });
```

### Network Restrictions

Limit access to specific IP ranges (CIDR notation):

```csharp
builder.Services.AddHttpInspector()
    .UseProductionDefaults()
    .Configure(options =>
    {
        options.AllowedNetworks = new[]
        {
            "192.168.1.0/24",   // Local network
            "10.0.0.0/8",       // Corporate network
            "127.0.0.1"         // Localhost only
        };
    });
```

### Content-Type Filtering

Control what content types are captured:

```csharp
builder.Services.AddHttpInspector()
    .UseDevelopmentDefaults()
    .Configure(options =>
    {
        options.Redaction.SkipBodyContentTypes = new[]
        {
            "multipart/form-data",  // File uploads
            "application/pdf",
            "image/*",
            "video/*"
        };
    });
```

### Custom Authorization Policies

Integrate with ASP.NET Core authorization:

```csharp
// Define policy
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("InspectorAccess", policy =>
        policy.RequireRole("Admin", "Developer"));
});

// Apply to HttpInspector
builder.Services.AddHttpInspector()
    .UseProductionDefaults()
    .Configure(options =>
    {
        options.RequireAuthentication = true;
        options.AuthorizationPolicy = "InspectorAccess";
    });
```

## 🔗 Outgoing HTTP Tracking Configuration

Track outgoing HTTP calls made through `IHttpClientFactory`:

```csharp
builder.Services.AddHttpInspector()
    .UseDevelopmentDefaults()
    .Configure(options =>
    {
        options.EnableOutgoingTracking = true;
        
        // Optional: configure outgoing tracking behavior
        options.Outgoing.IncludeUrlQuery = true;
        options.Outgoing.MaxBodyLength = 4_096;
        options.Outgoing.RedactedHeaders = new[] { "Authorization", "Cookie" };
    });
```

Then inject `IHttpClientFactory` in your endpoints or controllers:

```csharp
app.MapGet("/api/external", async (IHttpClientFactory factory) =>
{
    var client = factory.CreateClient();
    var response = await client.GetAsync("https://api.example.com/data");
    return await response.Content.ReadAsStringAsync();
});
```

All HTTP calls made through `IHttpClientFactory` will be automatically tracked and correlated with their parent requests.

## 📦 Storage Configuration

Configure the built-in JSONL file storage:

```csharp
app.UseHttpInspector(store =>
{
    store.MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    store.RetainedFileCount = 4;               // Keep last 4 files
    store.RetainedDays = 14;                   // Delete files older than 14 days
});
```

### Custom Storage Backend

Replace the default storage with your own implementation:

```csharp
public interface IHttpInspectorStore
{
    IAsyncEnumerable<JsonElement> GetEventsAsync(DateTimeOffset? since, CancellationToken ct);
}

// Register your implementation
builder.Services.AddSingleton<IHttpInspectorStore, MyCustomStore>();
```

## ⚙️ Full Configuration Reference

All available options with their defaults:

```csharp
builder.Services.AddHttpInspector()
    .UseDevelopmentDefaults()
    .Configure(options =>
    {
        // Dashboard settings
        options.BasePath = "/http-inspector";           // Dashboard URL path
        options.Enabled = true;                         // Enable/disable middleware
        
        // Capture settings
        options.AllowBodyCapture = true;                // Capture request/response bodies
        options.LogBodies = true;                       // Log bodies to storage
        options.MaxBodyLength = 10_000;                 // Max body size in bytes (10KB)
        
        // Security settings
        options.RequireAuthentication = false;          // Require auth to access dashboard
        options.AuthorizationPolicy = null;             // Custom authorization policy name
        options.AllowedNetworks = null;                 // IP whitelist (CIDR notation)
        options.AllowReplay = true;                     // Enable replay functionality
        
        // Filtering
        options.PathIncludePatterns = Array.Empty<string>();  // Include only matching paths
        options.PathExcludePatterns = Array.Empty<string>();  // Exclude matching paths
        
        // Outgoing request tracking
        options.EnableOutgoingTracking = true;          // Track outgoing HTTP calls
        options.Outgoing = new HttpInspectorOutgoingOptions
        {
            IncludeUrlQuery = true,                     // Capture query strings
            MaxBodyLength = 10_000,                     // Max body size in bytes
            RedactedHeaders = new[] { "Authorization", "Cookie" }
        };
        
        // Redaction
        options.Redaction = new HttpInspectorRedactionOptions
        {
            RedactedHeaders = new[] { "Authorization", "Cookie", "Set-Cookie" },
            RedactQueryKeys = Array.Empty<string>(),
            BodyRedactionPaths = Array.Empty<string>(),
            SkipBodyContentTypes = Array.Empty<string>()
        };
    });
```

---
