namespace HttpInspector.AspNetCore.Options;

public class FileHttpInspectorStoreOptions
{
    public string? FilePath { get; set; }
        = null;

    /// <summary>
    /// The maximum size, in bytes, of a single log file segment before a new file is created.
    /// </summary>
    public long MaxFileSizeBytes { get; set; } = 5 * 1024 * 1024;

    /// <summary>
    /// How many historical log files to keep alongside the actively written file.
    /// </summary>
    public int RetainedFileCount { get; set; } = 4;

    /// <summary>
    /// Maximum age in days for log files. Set to 0 or less to disable time-based cleanup.
    /// </summary>
    public int RetainedDays { get; set; } = 7;
}

