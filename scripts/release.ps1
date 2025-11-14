param(
    [string]$DefaultBranch = 'master',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
    $cmd = "git " + ($Arguments -join ' ')
    Write-Host "? $cmd" -ForegroundColor Cyan
    if ($DryRun) {
        return
    }

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $cmd"
    }
}

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $DefaultBranch) {
    throw "Release script must run from '$DefaultBranch' (current: '$currentBranch')."
}

Invoke-Git fetch origin $DefaultBranch --tags
Invoke-Git pull --ff-only origin $DefaultBranch

$pendingChanges = git status --porcelain
if ($pendingChanges) {
    throw "Working tree has uncommitted changes. Commit or stash before releasing."
}

$tags = (& git tag --list 'v*' | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Sort-Object { [version]($_.TrimStart('v')) } -Descending)
if ($tags.Count -gt 0) {
    $latestTag = $tags[0]
    [void]($latestTag -match '^v(?<maj>\d+)\.(?<min>\d+)\.(?<patch>\d+)$')
    $major = [int]$Matches['maj']
    $minor = [int]$Matches['min']
    $patch = [int]$Matches['patch']
} else {
    Write-Warning 'No semantic tags found. Starting from v1.0.0'
    $major = 1
    $minor = 0
    $patch = 0
    $latestTag = $null
}

if ($latestTag) {
    Write-Host "Latest tag: $latestTag"
}

$minor++
$patch = 0
$newTag = "v$major.$minor.$patch"
Write-Host "Next tag: $newTag" -ForegroundColor Green

if ($DryRun) {
    Write-Host 'Dry run enabled; skipping git tag/push.' -ForegroundColor Yellow
    exit 0
}

Invoke-Git tag $newTag
Invoke-Git push origin $newTag
