using HttpInspector.AspNetCore.Extensions;
using HttpInspector.AspNetCore.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace HttpInspector.AspNetCore.Tests.Extensions;

public class HttpInspectorEnvironmentGatingTests
{
    [Fact]
    public void PostConfigure_DevelopmentEnvironment_KeepsDefaultSettings()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Development });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.Enabled);
        Assert.False(options.RequireAuthentication);
        Assert.True(options.AllowBodyCapture);
        Assert.True(options.AllowReplay);
    }

    [Fact]
    public void PostConfigure_ProductionEnvironment_DisablesInspectorByDefault()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.Enabled);
    }

    [Fact]
    public void PostConfigure_ProductionEnvironment_AllowProduction_EnablesInspector()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector(options =>
        {
            options.AllowProduction = true;
        });

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.Enabled);
    }

    [Fact]
    public void PostConfigure_StagingEnvironment_RequiresAuthentication()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Staging });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.RequireAuthentication);
    }

    [Fact]
    public void PostConfigure_StagingEnvironment_DisablesBodyCapture()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Staging });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowBodyCapture);
    }

    [Fact]
    public void PostConfigure_StagingEnvironment_DisablesReplay()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Staging });
        services.AddHttpInspector();

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowReplay);
    }

    [Fact]
    public void PostConfigure_ProductionWithAllowProduction_RequiresAuthentication()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector(options =>
        {
            options.AllowProduction = true;
        });

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.True(options.RequireAuthentication);
    }

    [Fact]
    public void PostConfigure_ProductionWithAllowProduction_DisablesBodyCapture()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector(options =>
        {
            options.AllowProduction = true;
        });

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowBodyCapture);
    }

    [Fact]
    public void PostConfigure_ProductionWithAllowProduction_DisablesReplay()
    {
        // Arrange
        var services = new ServiceCollection();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment { EnvironmentName = Environments.Production });
        services.AddHttpInspector(options =>
        {
            options.AllowProduction = true;
        });

        var serviceProvider = services.BuildServiceProvider();
        var options = serviceProvider.GetRequiredService<IOptions<HttpInspectorOptions>>().Value;

        // Assert
        Assert.False(options.AllowReplay);
    }

    private class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "TestApp";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
