using HttpInspector.AspNetCore.Internal;
using HttpInspector.AspNetCore.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Internal;

public class RedactionServiceTests
{
    [Fact]
    public void ShouldRedactHeader_ExactMatch_ReturnsTrue()
    {
        var options = new RedactionOptions
        {
            RedactedHeaders = new[] { "Authorization", "Cookie" }
        };
        var service = new RedactionService(options);

        Assert.True(service.ShouldRedactHeader("Authorization"));
        Assert.True(service.ShouldRedactHeader("authorization"));
        Assert.True(service.ShouldRedactHeader("Cookie"));
    }

    [Fact]
    public void ShouldRedactHeader_WildcardPattern_ReturnsTrue()
    {
        var options = new RedactionOptions
        {
            RedactedHeaders = new[] { "X-Custom-*", "X-Api-*" }
        };
        var service = new RedactionService(options);

        Assert.True(service.ShouldRedactHeader("X-Custom-Token"));
        Assert.True(service.ShouldRedactHeader("X-Custom-Secret"));
        Assert.True(service.ShouldRedactHeader("X-Api-Key"));
        Assert.False(service.ShouldRedactHeader("X-Other-Header"));
    }

    [Fact]
    public void ShouldRedactHeader_DefaultHeaders_IncludesSecurityHeaders()
    {
        var options = new RedactionOptions();
        var service = new RedactionService(options);

        Assert.True(service.ShouldRedactHeader("Authorization"));
        Assert.True(service.ShouldRedactHeader("Cookie"));
        Assert.True(service.ShouldRedactHeader("Set-Cookie"));
        Assert.True(service.ShouldRedactHeader("X-Api-Key"));
        Assert.True(service.ShouldRedactHeader("X-Amz-Security-Token"));
    }

    [Theory]
    [InlineData("?token=secret123", "?token=***REDACTED***")]
    [InlineData("?access_token=abc", "?access_token=***REDACTED***")]
    [InlineData("?api_key=xyz", "?api_key=***REDACTED***")]
    [InlineData("?key=value", "?key=***REDACTED***")]
    [InlineData("?signature=sig123", "?signature=***REDACTED***")]
    [InlineData("?foo=bar&token=secret", "?foo=bar&token=***REDACTED***")]
    [InlineData("?token=secret&foo=bar", "?token=***REDACTED***&foo=bar")]
    public void RedactQueryString_RedactsSensitiveKeys(string input, string expected)
    {
        var options = new RedactionOptions();
        var service = new RedactionService(options);

        var result = service.RedactQueryString(input);

        Assert.Equal(expected, result);
    }

    [Fact]
    public void RedactQueryString_EmptyOrNull_ReturnsEmpty()
    {
        var service = new RedactionService(new RedactionOptions());

        Assert.Equal(string.Empty, service.RedactQueryString(null));
        Assert.Equal(string.Empty, service.RedactQueryString(""));
    }

    [Fact]
    public void RedactQueryString_NoSensitiveKeys_RemainsUnchanged()
    {
        var service = new RedactionService(new RedactionOptions());
        var input = "?foo=bar&baz=qux";

        var result = service.RedactQueryString(input);

        Assert.Equal(input, result);
    }

    [Theory]
    [InlineData("application/json", true)]
    [InlineData("application/xml", true)]
    [InlineData("text/xml", true)]
    [InlineData("text/plain", true)]
    [InlineData("application/x-www-form-urlencoded", true)]
    [InlineData("multipart/form-data", false)]
    [InlineData("application/octet-stream", false)]
    [InlineData("image/png", false)]
    [InlineData("image/jpeg", false)]
    [InlineData("video/mp4", false)]
    [InlineData("audio/mpeg", false)]
    public void ShouldCaptureBody_FiltersByContentType(string contentType, bool expected)
    {
        var service = new RedactionService(new RedactionOptions());

        var result = service.ShouldCaptureBody(contentType);

        Assert.Equal(expected, result);
    }

    [Fact]
    public void ShouldCaptureBody_WithCharset_StillWorks()
    {
        var service = new RedactionService(new RedactionOptions());

        Assert.True(service.ShouldCaptureBody("application/json; charset=utf-8"));
        Assert.False(service.ShouldCaptureBody("multipart/form-data; boundary=something"));
    }

    [Fact]
    public void RedactJsonBody_RedactsSpecifiedPaths()
    {
        var options = new RedactionOptions
        {
            BodyRedactionPaths = new[] { "$.password", "$.user.ssn" }
        };
        var service = new RedactionService(options);
        var json = "{\"password\":\"secret123\",\"username\":\"john\"}";

        var result = service.RedactJsonBody(json);

        Assert.Contains("\"password\":\"***REDACTED***\"", result);
        Assert.Contains("\"username\":\"john\"", result);
    }

    [Fact]
    public void RedactJsonBody_NoPaths_ReturnsUnchanged()
    {
        var options = new RedactionOptions
        {
            BodyRedactionPaths = Array.Empty<string>()
        };
        var service = new RedactionService(options);
        var json = "{\"password\":\"secret123\"}";

        var result = service.RedactJsonBody(json);

        Assert.Equal(json, result);
    }

    [Theory]
    [InlineData("password=secret123", "password=***REDACTED***")]
    [InlineData("token=abc123", "token=***REDACTED***")]
    [InlineData("username=john&password=secret", "username=john&password=***REDACTED***")]
    [InlineData("api_key=xyz", "api_key=***REDACTED***")]
    public void RedactFormBody_RedactsSensitiveFields(string input, string expected)
    {
        var service = new RedactionService(new RedactionOptions());

        var result = service.RedactFormBody(input);

        Assert.Equal(expected, result);
    }

    [Fact]
    public void RedactFormBody_NullOrEmpty_ReturnsAsIs()
    {
        var service = new RedactionService(new RedactionOptions());

        Assert.Null(service.RedactFormBody(null));
        Assert.Empty(service.RedactFormBody(""));
    }

    [Fact]
    public void ShouldCaptureBody_AllowlistEmpty_AllowsAllExceptSkipped()
    {
        var options = new RedactionOptions
        {
            AllowedBodyContentTypes = Array.Empty<string>(),
            SkipBodyContentTypes = new[] { "image/*" }
        };
        var service = new RedactionService(options);

        Assert.True(service.ShouldCaptureBody("application/custom"));
        Assert.False(service.ShouldCaptureBody("image/png"));
    }

    [Fact]
    public void ShouldCaptureBody_AllowlistSpecified_OnlyAllowsListed()
    {
        var options = new RedactionOptions
        {
            AllowedBodyContentTypes = new[] { "application/json" },
            SkipBodyContentTypes = Array.Empty<string>()
        };
        var service = new RedactionService(options);

        Assert.True(service.ShouldCaptureBody("application/json"));
        Assert.False(service.ShouldCaptureBody("application/xml"));
    }
}
