using HttpInspector.AspNetCore.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpInspector();

var app = builder.Build();

app.MapGet("/", () => "HttpInspector sample ready.");
app.MapGet("/api/time", () => new { Timestamp = DateTimeOffset.UtcNow, Greeting = "Hello" });

app.UseHttpInspector();

app.Run();
