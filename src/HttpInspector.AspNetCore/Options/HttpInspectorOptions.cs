namespace HttpInspector.AspNetCore.Options;

public class HttpInspectorOptions
{
    /// <summary>
    /// Controls whether HttpInspector is enabled. Default is true.
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Controls whether request/response bodies are captured. Default is true.
    /// </summary>
    public bool AllowBodyCapture { get; set; } = true;

    public bool LogBodies { get; set; } = true;

    public bool EnableOutgoingTracking { get; set; } = true;

    public int MaxBodyLength { get; set; } = 10_000;

    public string BasePath { get; set; } = "/http-inspector";

    /// <summary>
    /// Requires authentication to access the HttpInspector UI and API. 
    /// Default is false.
    /// </summary>
    public bool RequireAuthentication { get; set; } = false;

    /// <summary>
    /// Optional authorization policy name to apply to HttpInspector endpoints.
    /// If specified, the policy must be registered in the application's authorization services.
    /// </summary>
    public string? AuthorizationPolicy { get; set; }

    /// <summary>
    /// Optional list of allowed IP ranges in CIDR notation (e.g., "192.168.1.0/24", "10.0.0.0/8").
    /// If specified, only requests from these IP ranges will be allowed to access HttpInspector.
    /// </summary>
    public string[]? AllowedNetworks { get; set; }

    /// <summary>
    /// Controls whether request replay is allowed. Default is true.
    /// </summary>
    public bool AllowReplay { get; set; } = true;

    public string[]? PathIncludePatterns { get; set; }
        = Array.Empty<string>();

    public string[]? PathExcludePatterns { get; set; }
        = Array.Empty<string>();

    public string[]? RedactedHeaders { get; set; }
        = new[] { "Authorization", "Cookie" };

    public RedactionOptions Redaction { get; } = new();

    public OutgoingTrackingOptions Outgoing { get; } = new();
}
