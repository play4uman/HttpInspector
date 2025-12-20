using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace HttpInspector.AspNetCore.Internal;

internal sealed class HttpInspectorStartupLogger : IHostedService
{
    private readonly ILogger<HttpInspectorStartupLogger> _logger;
    private readonly IHostEnvironment _environment;
    private readonly HttpInspectorOptions _options;

    public HttpInspectorStartupLogger(
        ILogger<HttpInspectorStartupLogger> logger,
        IHostEnvironment environment,
        IOptions<HttpInspectorOptions> options)
    {
        _logger = logger;
        _environment = environment;
        _options = options.Value;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation(
                "HttpInspector is DISABLED (Environment: {Environment}, AllowProduction: {AllowProduction})",
                _environment.EnvironmentName,
                _options.AllowProduction);
            return Task.CompletedTask;
        }

        _logger.LogWarning(
            "HttpInspector is ENABLED | Environment: {Environment} | BasePath: {BasePath} | " +
            "Auth: {RequireAuth} | Policy: {Policy} | BodyCapture: {BodyCapture} | Replay: {Replay} | " +
            "Redaction: {RedactionCount} rules | NetworkRestriction: {NetworkRestriction}",
            _environment.EnvironmentName,
            _options.BasePath,
            _options.RequireAuthentication,
            _options.AuthorizationPolicy ?? "none",
            _options.AllowBodyCapture && _options.LogBodies,
            _options.AllowReplay,
            _options.RedactedHeaders?.Length ?? 0,
            _options.AllowedNetworks?.Length > 0 ? "enabled" : "disabled");

        if (_environment.IsProduction())
        {
            _logger.LogWarning(
                "⚠️  HttpInspector is running in PRODUCTION. Ensure authentication and redaction are properly configured.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
