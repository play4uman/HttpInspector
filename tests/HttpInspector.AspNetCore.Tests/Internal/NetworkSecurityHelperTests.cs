using System.Net;
using HttpInspector.AspNetCore.Internal;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Internal;

public class NetworkSecurityHelperTests
{
    [Fact]
    public void IsIpAddressAllowed_NoRestrictions_ReturnsTrue()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.1.100");
        var allowedNetworks = Array.Empty<string>();

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void IsIpAddressAllowed_NullIp_NoRestrictions_ReturnsTrue()
    {
        // Arrange
        IPAddress? ip = null;
        var allowedNetworks = Array.Empty<string>();

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void IsIpAddressAllowed_ExactMatch_ReturnsTrue()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.1.100");
        var allowedNetworks = new[] { "192.168.1.100" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void IsIpAddressAllowed_CidrMatch_ReturnsTrue()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.1.100");
        var allowedNetworks = new[] { "192.168.1.0/24" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void IsIpAddressAllowed_CidrNoMatch_ReturnsFalse()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.2.100");
        var allowedNetworks = new[] { "192.168.1.0/24" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void IsIpAddressAllowed_MultipleNetworks_OneMatches_ReturnsTrue()
    {
        // Arrange
        var ip = IPAddress.Parse("10.0.5.100");
        var allowedNetworks = new[] { "192.168.1.0/24", "10.0.0.0/16" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public void IsIpAddressAllowed_MultipleNetworks_NoneMatch_ReturnsFalse()
    {
        // Arrange
        var ip = IPAddress.Parse("172.16.1.100");
        var allowedNetworks = new[] { "192.168.1.0/24", "10.0.0.0/16" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void IsIpAddressAllowed_Localhost_LoopbackAllowed_ReturnsTrue()
    {
        // Arrange
        var ip = IPAddress.Loopback;
        var allowedNetworks = new[] { "127.0.0.1" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.True(result);
    }

    [Theory]
    [InlineData("192.168.1.1", "192.168.1.0/24", true)]
    [InlineData("192.168.1.255", "192.168.1.0/24", true)]
    [InlineData("192.168.2.1", "192.168.1.0/24", false)]
    [InlineData("10.0.0.1", "10.0.0.0/8", true)]
    [InlineData("10.255.255.255", "10.0.0.0/8", true)]
    [InlineData("11.0.0.1", "10.0.0.0/8", false)]
    [InlineData("172.16.0.1", "172.16.0.0/12", true)]
    [InlineData("172.31.255.255", "172.16.0.0/12", true)]
    [InlineData("172.32.0.1", "172.16.0.0/12", false)]
    public void IsIpAddressAllowed_CidrNotation_VariousRanges(string ipAddress, string cidr, bool expectedResult)
    {
        // Arrange
        var ip = IPAddress.Parse(ipAddress);
        var allowedNetworks = new[] { cidr };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.Equal(expectedResult, result);
    }

    [Fact]
    public void IsIpAddressAllowed_InvalidCidr_ReturnsFalse()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.1.100");
        var allowedNetworks = new[] { "invalid-cidr" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public void IsIpAddressAllowed_EmptyString_ReturnsFalse()
    {
        // Arrange
        var ip = IPAddress.Parse("192.168.1.100");
        var allowedNetworks = new[] { "" };

        // Act
        var result = NetworkSecurityHelper.IsIpAddressAllowed(ip, allowedNetworks);

        // Assert
        Assert.False(result);
    }
}
