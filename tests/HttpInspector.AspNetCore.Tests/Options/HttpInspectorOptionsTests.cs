using FluentAssertions;
using HttpInspector.AspNetCore.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Options;

public class HttpInspectorOptionsTests
{
    [Fact]
    public void Defaults_Are_Set()
    {
        var options = new HttpInspectorOptions();

        options.Enabled.Should().BeTrue();
        options.LogBodies.Should().BeTrue();
        options.MaxBodyLength.Should().Be(10_000);
        options.BasePath.Should().Be("/http-inspector");
        options.RequireAuthentication.Should().BeFalse();
        options.PathIncludePatterns.Should().NotBeNull();
        options.PathExcludePatterns.Should().NotBeNull();
        options.RedactedHeaders.Should().NotBeNull();
    }
}
