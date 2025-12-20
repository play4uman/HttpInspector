using HttpInspector.AspNetCore.Extensions;
using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Extensions;

public class HttpInspectorBuilderTests
{
    [Fact]
    public void AddHttpInspector_NoPresets_UsesDefaultValues()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Development });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert - Default values from HttpInspectorOptions
        Assert.True(options.Enabled);
        Assert.False(options.RequireAuthentication);
        Assert.True(options.AllowBodyCapture);
        Assert.True(options.AllowReplay);
    }

    [Fact]
    public void UseDevelopmentDefaults_AppliesDevelopmentPreset()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector().UseDevelopmentDefaults();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.AllowBodyCapture);
        Assert.True(options.AllowReplay);
        Assert.False(options.RequireAuthentication);
    }

    [Fact]
    public void UseProductionDefaults_AppliesProductionPreset()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector().UseProductionDefaults();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowBodyCapture);
        Assert.False(options.AllowReplay);
        Assert.True(options.RequireAuthentication);
    }

    [Fact]
    public void UseStagingDefaults_AppliesStagingPreset()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Staging });
        services.AddHttpInspector().UseStagingDefaults();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.AllowBodyCapture); // Staging allows body capture for debugging
        Assert.False(options.AllowReplay); // But disables replay for safety
        Assert.True(options.RequireAuthentication);
    }

    [Fact]
    public void Configure_OverridesPresetDefaults()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector()
            .UseProductionDefaults()
            .Configure(options =>
            {
                options.AllowReplay = true; // Override production default
            });

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowBodyCapture); // Still production default
        Assert.True(options.RequireAuthentication); // Still production default
        Assert.True(options.AllowReplay); // Overridden
    }

    [Fact]
    public void Configure_BeforePreset_IsOverriddenByPreset()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector(options =>
            {
                options.AllowReplay = true;
            })
            .UseProductionDefaults(); // This runs after, so it wins

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowReplay); // Production preset wins
    }

    [Fact]
    public void MultiplePresets_LastOneWins()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector()
            .UseDevelopmentDefaults()
            .UseProductionDefaults(); // Last one applied

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert - Production preset should be active
        Assert.False(options.AllowBodyCapture);
        Assert.False(options.AllowReplay);
        Assert.True(options.RequireAuthentication);
    }

    private class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "TestApp";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
