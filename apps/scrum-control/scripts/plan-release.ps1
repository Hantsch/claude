#requires -Version 5.1
<#
.SYNOPSIS
    Decides whether the app needs a release, and which semver bump, from commit messages.
.DESCRIPTION
    Looks at every commit that touched the app since its last release tag (scrum-control-v*)
    and derives the bump level from Conventional-Commit style subjects. "Touched the app" means
    apps/scrum-control/, plugins/scrum-cockpit/hooks/scan.ts or
    plugins/scrum-cockpit/types/index.d.ts - the app imports those two files, so a change to
    them is a change to the app. The plugins' own tags (ai-scrum-v*, ...) are never looked at.

        <type>!: ... | body contains "BREAKING CHANGE"  -> major
        feat: ...                                       -> minor
        chore|docs|ci|test|style|build: ...              -> no release
        anything else (fix, perf, refactor, plain text)  -> patch

    A commit whose subject or body contains [skip release] never triggers a release.
    The highest level across all commits wins. Prints key=value lines and, inside GitHub
    Actions, appends the same keys to $env:GITHUB_OUTPUT.

    Before the first release there is no scrum-control-v* tag to measure against. The whole
    history of those paths is read instead, and if any of it is releasable the level is
    "initial": the first release ships exactly the version package.json already carries (0.1.0),
    because a bump derived from the whole history would land past the version the app calls its
    first. So the first push to main that touches the app releases it, like every later one.

    This script only reports - it changes nothing.
.EXAMPLE
    pwsh -File scripts/plan-release.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
# apps/scrum-control/scripts -> apps/scrum-control -> apps -> the repository root, where git works.
$gitRoot = Split-Path -Parent (Split-Path -Parent $appRoot)

$tagPrefix = 'scrum-control-v'
# What counts as a change to the app. Paths relative to the repository root.
$appPaths = @(
    'apps/scrum-control',
    'plugins/scrum-cockpit/hooks/scan.ts',
    'plugins/scrum-cockpit/types/index.d.ts'
)

$manifestPath = Join-Path $appRoot 'package.json'
if (-not (Test-Path $manifestPath)) { throw "not found: $manifestPath" }

$current = (Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($current -notmatch '^(\d+)\.(\d+)\.(\d+)$') { throw "current version '$current' is not semver" }
$major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]

# --- commit range ---------------------------------------------------------------------
# Exact scrum-control-v<semver> only: a tag with a suffix is not a release of this app. All tags
# share the prefix, so the version sort orders them by version.
$tags = @(git -C $gitRoot tag --list "$tagPrefix*" --sort=-v:refname | Where-Object { $_ -match '^scrum-control-v\d+\.\d+\.\d+$' })
$lastTag = ''
if ($tags.Count -gt 0) { $lastTag = $tags[0] }

# No tag yet: the whole history of the app's paths, which decides whether the first release is due.
$range = @()
if ($lastTag) { $range = @("$lastTag..HEAD") }
$rs = [char]0x1e
$us = [char]0x1f
$raw = (git -C $gitRoot log @range "--format=%s$us%b$rs" -- @appPaths) -join "`n"
$records = @($raw -split $rs | Where-Object { $_.Trim() -ne '' })

# --- derive the bump ------------------------------------------------------------------
$noReleaseTypes = @('chore', 'docs', 'ci', 'test', 'style', 'build')
$rank = @{ 'none' = 0; 'patch' = 1; 'minor' = 2; 'major' = 3 }
$level = 'none'
$reasons = @()
$considered = 0

foreach ($record in $records) {
    $parts = $record -split $us
    $subject = $parts[0].Trim() -replace "^\s*`n", ''
    $subject = ($subject -split "`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -First 1)
    if (-not $subject) { continue }
    $body = ''
    if ($parts.Count -gt 1) { $body = $parts[1] }
    $considered++

    if ("$subject $body" -match '\[skip release\]') {
        $reasons += "none    <- $subject (skip release)"
        continue
    }

    $commitLevel = 'patch'
    $type = ''
    $bang = $false
    if ($subject -match '^(?<type>[a-zA-Z]+)(\([^)]*\))?(?<bang>!)?:\s*\S') {
        $type = $Matches['type'].ToLower()
        $bang = [bool]$Matches['bang']
    }

    if ($bang -or $body -match 'BREAKING[ -]CHANGE') {
        $commitLevel = 'major'
    } elseif ($type -eq 'feat') {
        $commitLevel = 'minor'
    } elseif ($type -and $noReleaseTypes -contains $type) {
        $commitLevel = 'none'
    }

    $reasons += "$($commitLevel.PadRight(7)) <- $subject"
    if ($rank[$commitLevel] -gt $rank[$level]) { $level = $commitLevel }
}

# --- first release ----------------------------------------------------------------------
# Without a tag a releasable history means the first release, at package.json's own version.
if (-not $lastTag -and $level -ne 'none') {
    $reasons = @("initial <- no $tagPrefix* tag yet: the first release ships package.json's $current") + $reasons
    $level = 'initial'
}

# --- next version ---------------------------------------------------------------------
$next = $current
switch ($level) {
    'major' { $next = "$($major + 1).0.0" }
    'minor' { $next = "$major.$($minor + 1).0" }
    'patch' { $next = "$major.$minor.$($patch + 1)" }
}

# --- report ---------------------------------------------------------------------------
$since = 'no tag yet'
if ($lastTag) { $since = $lastTag }

# Write-Output on purpose: callers (ci-release.ps1) capture these key=value lines.
Write-Output "since=$since"
Write-Output "commits=$considered"
Write-Output "bump=$level"
Write-Output "current=$current"
Write-Output "next=$next"
if ($reasons.Count -gt 0) {
    Write-Output 'commits:'
    foreach ($r in $reasons) { Write-Output "  $r" }
}

if ($env:GITHUB_OUTPUT) {
    $out = @(
        "bump=$level"
        "current=$current"
        "next=$next"
        "commits=$considered"
        "since=$since"
    )
    Add-Content -Path $env:GITHUB_OUTPUT -Value ($out -join "`n") -Encoding UTF8
}
