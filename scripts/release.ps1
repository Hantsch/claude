#requires -Version 5.1
<#
.SYNOPSIS
    Bumps a plugin's version in plugin.json + marketplace.json and opens a CHANGELOG section.
.DESCRIPTION
    Never commits and never pushes - it edits files and (with -Tag) creates a local git tag.
    Review the diff, then commit yourself.
.PARAMETER Plugin
    Plugin name as listed in .claude-plugin/marketplace.json, e.g. ai-scrum.
.PARAMETER Bump
    major | minor | patch. Ignored when -Version is given.
.PARAMETER Version
    Explicit version instead of a bump, e.g. 2.0.0.
.PARAMETER Tag
    Also create the local git tag <plugin>-v<version>.
.PARAMETER PromoteUnreleased
    Turn the CHANGELOG's "## Unreleased" section into "## <version> - <date>" instead of
    inserting an empty template section, and leave a fresh empty Unreleased behind. Fails
    when that section is empty or still holds placeholders - this is what blocks a release
    without release notes. Used by the CI release workflow.
.PARAMETER NotesOut
    Write the release notes (the promoted section's body) to this file, for use as GitHub
    release notes.
.EXAMPLE
    pwsh -File scripts/release.ps1 -Plugin ai-scrum -Bump minor
.EXAMPLE
    pwsh -File scripts/release.ps1 -Plugin ai-scrum -Version 2.0.0 -Tag
.EXAMPLE
    pwsh -File scripts/release.ps1 -Plugin ai-scrum -Version 1.1.0 -PromoteUnreleased -NotesOut notes.md
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Plugin,
    [ValidateSet('major', 'minor', 'patch')][string]$Bump = 'patch',
    [string]$Version,
    [switch]$Tag,
    [switch]$PromoteUnreleased,
    [string]$NotesOut
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-TextFile {
    # UTF-8 without BOM, explicitly: on PowerShell 5.1 `Set-Content -Encoding UTF8` writes a
    # BOM, and a BOM in front of plugin.json breaks strict JSON parsers.
    param([string]$Path, [string]$Text)
    [IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

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

if ($next -eq $current) { throw "version is already $next - nothing to do" }

# Em dash as a char code on purpose: this file must stay pure ASCII, because PowerShell 5.1
# reads a BOM-less script as ANSI and would parse the 0x94 byte of an em dash as a quote.
$emDash = [char]0x2014
Write-Host "$Plugin`: $current -> $next" -ForegroundColor Cyan

# --- for a promoted release: validate the notes BEFORE touching any manifest -----------
$changelog = ''
$unreleased = $null
$notes = ''
if ($PromoteUnreleased) {
    if (-not (Test-Path $changelogPath)) { throw "not found: $changelogPath" }
    $changelog = Get-Content -Path $changelogPath -Raw -Encoding UTF8

    # \r must be consumed explicitly (.NET's $ matches before \n, so a CRLF file would not
    # match), but not \s* - that would swallow the blank line after the heading.
    $unreleased = [regex]::Match($changelog, '(?m)^##[ \t]+\[?Unreleased\]?[ \t\r]*$')
    if (-not $unreleased.Success) {
        throw "plugins/$Plugin/CHANGELOG.md has no '## Unreleased' heading - a release needs its notes there"
    }

    $bodyStart = $unreleased.Index + $unreleased.Length
    $rest = $changelog.Substring($bodyStart)
    $nextHeading = [regex]::Match($rest, '(?m)^##\s')
    if ($nextHeading.Success) { $notes = $rest.Substring(0, $nextHeading.Index) } else { $notes = $rest }

    $notes = ([regex]::Replace($notes, '(?s)<!--.*?-->', '')).Trim()
    if (-not $notes) {
        throw "'## Unreleased' in plugins/$Plugin/CHANGELOG.md is empty - write the release notes there, or mark the change chore:/docs: so it does not trigger a release"
    }
    # Only the placeholders a template leaves behind - a literal <name> in prose is fine.
    if ($notes -match '(?i)<(what|todo|tbd|fixme)[^>]*>') {
        throw "'## Unreleased' in plugins/$Plugin/CHANGELOG.md still holds the placeholder '$($Matches[0])' - replace it with real notes"
    }
    if ($notes -notmatch '(?m)^\s*[-*]\s+\S') {
        throw "'## Unreleased' in plugins/$Plugin/CHANGELOG.md has no bullet list - write the notes as '- ...' items"
    }
}

# --- plugin.json: replace only the version value, keep formatting ---------------------
$manifestText = [regex]::Replace(
    $manifestText,
    '("version"\s*:\s*")' + [regex]::Escape($current) + '(")',
    "`${1}$next`${2}",
    [System.Text.RegularExpressions.RegexOptions]::None
)
Write-TextFile -Path $manifestPath -Text $manifestText
Write-Host "  updated plugins/$Plugin/.claude-plugin/plugin.json"

# --- marketplace.json: version inside this plugin's entry only ------------------------
$marketText = Get-Content -Path $marketplacePath -Raw -Encoding UTF8
$entryPattern = '("name"\s*:\s*"' + [regex]::Escape($Plugin) + '"[\s\S]{0,600}?"version"\s*:\s*")' + [regex]::Escape($current) + '(")'
if ($marketText -notmatch $entryPattern) {
    throw "could not find the version '$current' inside the '$Plugin' entry of marketplace.json - fix it by hand"
}
$marketText = [regex]::Replace($marketText, $entryPattern, "`${1}$next`${2}")
Write-TextFile -Path $marketplacePath -Text $marketText
Write-Host '  updated .claude-plugin/marketplace.json'

# --- CHANGELOG ------------------------------------------------------------------------
$today = (Get-Date).ToString('yyyy-MM-dd')

if ($PromoteUnreleased) {
    # Rename "## Unreleased" to the new version and leave a fresh empty section behind.
    $replacement = "## Unreleased`r`n`r`n" +
        "<!-- Add your changes here as '- ...' items. A release is blocked while this section is empty. -->`r`n`r`n" +
        "## $next $emDash $today"
    $changelog = $changelog.Remove($unreleased.Index, $unreleased.Length).Insert($unreleased.Index, $replacement)
    Write-TextFile -Path $changelogPath -Text $changelog
    Write-Host "  promoted '## Unreleased' to '## $next' in plugins/$Plugin/CHANGELOG.md"

    if ($NotesOut) {
        Write-TextFile -Path $NotesOut -Text $notes
        Write-Host "  wrote release notes to $NotesOut"
    }

} else {
    # Manual flow: insert an empty section for the new version, to be filled in by hand.
    $section = @"
## $next $emDash $today

### Added

- <what is new>

### Changed

- <what changed>


"@

    if (Test-Path $changelogPath) {
        $changelog = Get-Content -Path $changelogPath -Raw -Encoding UTF8
        # Insert below an existing "## Unreleased" section, above the newest version.
        $firstEntry = [regex]::Match($changelog, '(?m)^##\s+(?!\[?Unreleased)')
        if ($firstEntry.Success) {
            $changelog = $changelog.Insert($firstEntry.Index, $section)
        } else {
            $changelog = $changelog.TrimEnd() + "`r`n`r`n" + $section
        }
        Write-TextFile -Path $changelogPath -Text $changelog
        Write-Host "  opened a $next section in plugins/$Plugin/CHANGELOG.md"
    } else {
        Write-TextFile -Path $changelogPath -Text ("# Changelog $emDash $Plugin`r`n`r`n" + $section)
        Write-Host "  created plugins/$Plugin/CHANGELOG.md"
    }
}

# --- validate ------------------------------------------------------------------------
$validate = Join-Path $PSScriptRoot 'validate.ps1'
if (Test-Path $validate) {
    Write-Host ''
    & $validate
    if ($LASTEXITCODE -ne 0) { throw 'validation failed - fix the problems above before releasing' }
}

# --- optional tag --------------------------------------------------------------------
if ($Tag) {
    $tagName = "$Plugin-v$next"
    git -C $repoRoot tag $tagName
    if ($LASTEXITCODE -eq 0) { Write-Host "  created tag $tagName (not pushed)" -ForegroundColor Green }
}

if (-not $PromoteUnreleased) {
    Write-Host ''
    Write-Host 'Next: fill in the CHANGELOG section, review the diff, then commit and push yourself.' -ForegroundColor Yellow
}
