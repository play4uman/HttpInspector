using System.Net;
using System.Net.Sockets;

namespace HttpInspector.AspNetCore.Internal;

internal static class NetworkSecurityHelper
{
    public static bool IsIpAddressAllowed(IPAddress? remoteIp, string[] allowedNetworks)
    {
        if (remoteIp == null || allowedNetworks.Length == 0)
        {
            return true; // No restrictions
        }

        foreach (var network in allowedNetworks)
        {
            if (IsIpInNetwork(remoteIp, network))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsIpInNetwork(IPAddress ipAddress, string cidrNotation)
    {
        if (string.IsNullOrWhiteSpace(cidrNotation))
        {
            return false;
        }

        var parts = cidrNotation.Split('/');
        if (parts.Length != 2)
        {
            // Try exact IP match
            return IPAddress.TryParse(cidrNotation, out var exactMatch) && ipAddress.Equals(exactMatch);
        }

        if (!IPAddress.TryParse(parts[0], out var networkAddress) || !int.TryParse(parts[1], out var prefixLength))
        {
            return false;
        }

        // Convert to IPv6 for consistent comparison
        var ipBytes = ipAddress.AddressFamily == AddressFamily.InterNetworkV6
            ? ipAddress.GetAddressBytes()
            : ipAddress.MapToIPv6().GetAddressBytes();

        var networkBytes = networkAddress.AddressFamily == AddressFamily.InterNetworkV6
            ? networkAddress.GetAddressBytes()
            : networkAddress.MapToIPv6().GetAddressBytes();

        // Adjust prefix length for IPv4-mapped addresses
        if (networkAddress.AddressFamily == AddressFamily.InterNetwork)
        {
            prefixLength += 96; // IPv4-mapped IPv6 addresses have 96 bits of prefix
        }

        var maskBits = prefixLength;
        for (var i = 0; i < ipBytes.Length && maskBits > 0; i++)
        {
            var mask = maskBits >= 8 ? 0xFF : (byte)(0xFF << (8 - maskBits));
            if ((ipBytes[i] & mask) != (networkBytes[i] & mask))
            {
                return false;
            }
            maskBits -= 8;
        }

        return true;
    }
}
