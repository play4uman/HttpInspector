using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Options;

public class HttpInspectorSecurityOptionsTests
{
    [Fact]
    public void DefaultOptions_HasReasonableDefaults()
    {
        // Arrange
        var options = new HttpInspectorOptions();

        // Assert
        Assert.True(options.Enabled);
        Assert.True(options.AllowBodyCapture);
        Assert.True(options.AllowReplay);
        Assert.False(options.RequireAuthentication);
        Assert.Null(options.AuthorizationPolicy);
        Assert.Null(options.AllowedNetworks);
    }

    [Fact]
    public void AllowBodyCapture_DefaultsToTrue()
    {
        // Arrange & Act
        var options = new HttpInspectorOptions();

        // Assert
        Assert.True(options.AllowBodyCapture);
    }

    [Fact]
    public void AllowReplay_DefaultsToTrue()
    {
        // Arrange & Act
        var options = new HttpInspectorOptions();

        // Assert
        Assert.True(options.AllowReplay);
    }

    [Fact]
    public void AuthorizationPolicy_CanBeSet()
    {
        // Arrange
        var options = new HttpInspectorOptions
        {
            AuthorizationPolicy = "AdminOnly"
        };

        // Assert
        Assert.Equal("AdminOnly", options.AuthorizationPolicy);
    }

    [Fact]
    public void AllowedNetworks_CanBeSet()
    {
        // Arrange
        var options = new HttpInspectorOptions
        {
            AllowedNetworks = new[] { "192.168.1.0/24", "10.0.0.0/8" }
        };

        // Assert
        Assert.NotNull(options.AllowedNetworks);
        Assert.Equal(2, options.AllowedNetworks.Length);
        Assert.Contains("192.168.1.0/24", options.AllowedNetworks);
        Assert.Contains("10.0.0.0/8", options.AllowedNetworks);
    }
}
