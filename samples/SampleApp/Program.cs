using System.Net.Http;
using AspNetCoreRateLimit;
using HttpInspector.AspNetCore.Extensions;

var builder = WebApplication.CreateBuilder(args);

// Configure rate limiting
builder.Services.AddMemoryCache();
builder.Services.Configure<IpRateLimitOptions>(options =>
{
    options.EnableEndpointRateLimiting = true;
    options.StackBlockedRequests = false;
    options.HttpStatusCode = 429;
    options.RealIpHeader = "X-Real-IP";
    options.ClientIdHeader = "X-ClientId";
    options.GeneralRules = new List<RateLimitRule>
    {
        new RateLimitRule
        {
            Endpoint = "*",
            Period = "1m",
            Limit = 60
        },
        new RateLimitRule
        {
            Endpoint = "*",
            Period = "10s",
            Limit = 20
        },
        new RateLimitRule
        {
            Endpoint = "*",
            Period = "1s",
            Limit = 5
        },
        new RateLimitRule
        {
            Endpoint = "*/api/*",
            Period = "1m",
            Limit = 30
        },
        new RateLimitRule
        {
            Endpoint = "*/api/*",
            Period = "10s",
            Limit = 10
        }
    };
});
builder.Services.AddInMemoryRateLimiting();
builder.Services.AddSingleton<IRateLimitConfiguration, RateLimitConfiguration>();

builder.Services.AddHttpInspector(options =>
{
    // Uncomment to change the default UI path
    //options.BasePath = "/http-inspector";
    options.EnableOutgoingTracking = true;

    options.Outgoing.IncludeUrlQuery = true;
    options.Outgoing.MaxBodyLength = 4_096;

    options.AllowReplay = false;
});

builder.Services.AddHttpClient("demo-api").ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    // Accept self-signed certs for demo purposes only.
    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
});

var app = builder.Build();

app.UseIpRateLimiting();

app.MapGet("/", () => "HttpInspector sample ready.");
app.MapGet("/api/time", () => new { Timestamp = DateTimeOffset.UtcNow, Greeting = "Hello" });
app.MapGet("/api/external", async (IHttpClientFactory factory) =>
{
    var client = factory.CreateClient("demo-api");
    var response = await client.GetAsync("https://postman-echo.com/get?sample=true");
    var payload = await response.Content.ReadAsStringAsync();
    return Results.Text(payload, "application/json");
});
app.MapPost("/api/echo", async (HttpRequest request) =>
{
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    var bodyObj = new { Echo = System.Text.Json.JsonSerializer.Deserialize<dynamic>(body), Id = Guid.NewGuid() };
    return TypedResults.Ok(bodyObj);
});
app.MapPut("/api/echo", async (HttpRequest request) =>
{
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync();
    var bodyObj = new { Echo = System.Text.Json.JsonSerializer.Deserialize<dynamic>(body), Id = Guid.NewGuid() };
    return TypedResults.Ok(bodyObj);
});
app.MapDelete("/api/echo/{id:int}", async (int id) =>
{
    return TypedResults.Text($"Deleted {id}");
});

app.UseHttpInspector(store =>
{
    store.MaxFileSizeBytes = 2 * 1024 * 1024;
    store.RetainedFileCount = 5;
    store.RetainedDays = 3;
});

app.Run();
