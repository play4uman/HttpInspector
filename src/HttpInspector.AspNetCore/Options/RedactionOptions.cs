namespace HttpInspector.AspNetCore.Options;

public class RedactionOptions
{
    public string[] RedactedHeaders { get; set; } = new[]
    {
        "Authorization",
        "Cookie",
        "Set-Cookie",
        "X-Api-Key",
        "X-Amz-Security-Token"
    };

    public string[] RedactQueryKeys { get; set; } = new[]
    {
        "token",
        "access_token",
        "api_key",
        "key",
        "signature",
        "password",
        "secret",
        "auth"
    };

    public string[] BodyRedactionPaths { get; set; } = Array.Empty<string>();

    public bool StoreRawUrl { get; set; } = false;

    public string[] AllowedBodyContentTypes { get; set; } = new[]
    {
        "application/json",
        "application/xml",
        "text/xml",
        "text/plain",
        "application/x-www-form-urlencoded"
    };

    public string[] SkipBodyContentTypes { get; set; } = new[]
    {
        "multipart/form-data",
        "application/octet-stream",
        "image/*",
        "video/*",
        "audio/*"
    };
}
