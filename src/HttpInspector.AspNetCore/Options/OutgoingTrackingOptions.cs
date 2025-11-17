using System;

namespace HttpInspector.AspNetCore.Options;

public sealed class OutgoingTrackingOptions
{
    private int _maxBodyLength = 10_000;

    public bool CaptureRequestBody { get; set; } = true;

    public bool CaptureResponseBody { get; set; } = true;

    public bool IncludeUrlQuery { get; set; } = true;

    public string[]? RedactedHeaders { get; set; } = new[] { "Authorization", "Cookie" };

    public int MaxBodyLength
    {
        get => _maxBodyLength;
        set => _maxBodyLength = value <= 0 ? 10_000 : value;
    }
}
