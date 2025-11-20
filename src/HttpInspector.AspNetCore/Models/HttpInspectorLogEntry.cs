using System.Text.Json.Serialization;

namespace HttpInspector.AspNetCore.Models;

public sealed record HttpInspectorLogEntry
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("parentId")]
    public string? ParentId { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("timestamp")]
    public required DateTimeOffset Timestamp { get; init; }

    [JsonPropertyName("method")]
    public string? Method { get; init; }

    [JsonPropertyName("path")]
    public string? Path { get; init; }

    [JsonPropertyName("url")]
    public string? Url { get; init; }

    [JsonPropertyName("queryString")]
    public string? QueryString { get; init; }

    [JsonPropertyName("remoteIp")]
    public string? RemoteIp { get; init; }

    [JsonPropertyName("statusCode")]
    public int? StatusCode { get; init; }

    [JsonPropertyName("headers")]
    public IReadOnlyDictionary<string, string>? Headers { get; init; }

    [JsonPropertyName("requestHeaders")]
    public IReadOnlyDictionary<string, string>? RequestHeaders { get; init; }

    [JsonPropertyName("responseHeaders")]
    public IReadOnlyDictionary<string, string>? ResponseHeaders { get; init; }

    [JsonPropertyName("body")]
    public string? Body { get; init; }

    [JsonPropertyName("requestBody")]
    public string? RequestBody { get; init; }

    [JsonPropertyName("responseBody")]
    public string? ResponseBody { get; init; }

    [JsonPropertyName("exception")]
    public string? Exception { get; init; }

    [JsonPropertyName("faulted")]
    public bool? Faulted { get; init; }

    [JsonPropertyName("durationMs")]
    public double? DurationMs { get; init; }
}
