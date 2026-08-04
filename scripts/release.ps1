#requires -Version 5.1
<#
.SYNOPSIS
    Bumps a plugin's version in plugin.json + marketplace.json and opens a CHANGELOG section.
.DESCRIPTION
    Never commits and never pushes — it edits files and (with -Tag) creates a local git tag.
    Review the diff, then commit yourself.
.PARAMETER Plugin
    Plugin name as listed in .claude-plugin/marketplace.json, e.g. ai-scrum.
.PARAMETER Bump
    major | minor | patch. Ignored when -Version is given.
.PARAMETER Version
    Explicit version instead of a bump, e.g. 2.0.0.
.PARAMETER Tag
    Also create the local git tag <plugin>-v<version>.
.EXAMPLE
    pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor
.EXAMPLE
    pwsh -File scripts/release.ps1 -Plugin ai-scrum -Version 2.0.0 -Tag
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Plugin,
    [ValidateSet('major', 'minor', 'patch')][string]$Bump = 'patch',
    [string]$Version,
    [switch]$Tag
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

$marketplacePath = Join-Path $repoRoot '.claude-plugin/marketplace.json'
$manifestPath = Join-Path $repoRoot "plugins/$Plugin/.claude-plugin/plugin.json"
$changelogPath = Join-Path $repoRoot "plugins/$Plugin/CHANGELOG.md"

foreach ($p in @($marketplacePath, $manifestPath)) {
    if (-not (Test-Path $p)) { throw "not found: $p" }
}

$manifestText = Get-Content -Path $manifestPath -Raw -Encoding UTF8
$manifest = $manifestText | ConvertFrom-Json
$current = $manifest.version
if ($current -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "current version '$current' is not semver" }

if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "-Version '$Version' is not semver" }
    $next = $Version
} else {
    $major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
    if ($Bump -eq 'major') { $major++; $minor = 0; $patch = 0 }
    elseif ($Bump -eq 'minor') { $minor++; $patch = 0 }
    else { $patch++ }
    $next = "$major.$minor.$patch"
}

if ($next -eq $current) { throw "version is already $next — nothing to do" }
Write-Host "$Plugin`: $current -> $next" -ForegroundColor Cyan

# --- plugin.json: replace only the version value, keep formatting ---------------------
$manifestText = [regex]::Replace(
    $manifestText,
    '("version"\s*:\s*")' + [regex]::Escape($current) + '(")',
    "`${1}$next`${2}",
    [System.Text.RegularExpressions.RegexOptions]::None
)
Set-Content -Path $manifestPath -Value $manifestText -Encoding UTF8 -NoNewline
Write-Host "  updated plugins/$Plugin/.claude-plugin/plugin.json"

# --- marketplace.json: version inside this plugin's entry only ------------------------
$marketText = Get-Content -Path $marketplacePath -Raw -Encoding UTF8
$entryPattern = '("name"\s*:\s*"' + [regex]::Escape($Plugin) + '"[\s\S]{0,600}?"version"\s*:\s*")' + [regex]::Escape($current) + '(")'
if ($marketText -notmatch $entryPattern) {
    throw "could not find the version '$current' inside the '$Plugin' entry of marketplace.json — fix it by hand"
}
$marketText = [regex]::Replace($marketText, $entryPattern, "`${1}$next`${2}")
Set-Content -Path $marketplacePath -Value $marketText -Encoding UTF8 -NoNewline
Write-Host '  updated .claude-plugin/marketplace.json'

# --- CHANGELOG: open a new section ---------------------------------------------------
$today = (Get-Date).ToString('yyyy-MM-dd')
$section = @"
## $next — $today

### Added

- <what is new>

### Changed

- <what changed>

"@

if (Test-Path $changelogPath) {
    $changelog = Get-Content -Path $changelogPath -Raw -Encoding UTF8
    $firstEntry = [regex]::Match($changelog, '(?m)^## ')
    if ($firstEntry.Success) {
        $changelog = $changelog.Insert($firstEntry.Index, $section)
    } else {
        $changelog = $changelog.TrimEnd() + "`r`n`r`n" + $section
    }
    Set-Content -Path $changelogPath -Value $changelog -Encoding UTF8 -NoNewline
    Write-Host "  opened a $next section in plugins/$Plugin/CHANGELOG.md"
} else {
    Set-Content -Path $changelogPath -Value ("# Changelog — $Plugin`r`n`r`n" + $section) -Encoding UTF8 -NoNewline
    Write-Host "  created plugins/$Plugin/CHANGELOG.md"
}

# --- validate ------------------------------------------------------------------------
$validate = Join-Path $PSScriptRoot 'validate.ps1'
if (Test-Path $validate) {
    Write-Host ''
    & $validate
    if ($LASTEXITCODE -ne 0) { throw 'validation failed — fix the problems above before releasing' }
}

# --- optional tag --------------------------------------------------------------------
if ($Tag) {
    $tagName = "$Plugin-v$next"
    git -C $repoRoot tag $tagName
    if ($LASTEXITCODE -eq 0) { Write-Host "  created tag $tagName (not pushed)" -ForegroundColor Green }
}

Write-Host ''
Write-Host 'Next: fill in the CHANGELOG section, review the diff, then commit and push yourself.' -ForegroundColor Yellow
