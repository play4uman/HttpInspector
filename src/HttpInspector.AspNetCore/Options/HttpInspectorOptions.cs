namespace HttpInspector.AspNetCore.Options;

public class HttpInspectorOptions
{
    public bool Enabled { get; set; } = true;

    public bool LogBodies { get; set; } = true;

    public bool EnableOutgoingTracking { get; set; } = true;

    public int MaxBodyLength { get; set; } = 10_000;

    public string BasePath { get; set; } = "/http-inspector";

    public bool RequireAuthentication { get; set; }
        = false;

    public string[]? PathIncludePatterns { get; set; }
        = Array.Empty<string>();

    public string[]? PathExcludePatterns { get; set; }
        = Array.Empty<string>();

    public string[]? RedactedHeaders { get; set; }
        = new[] { "Authorization", "Cookie" };

    public OutgoingTrackingOptions Outgoing { get; } = new();
}
