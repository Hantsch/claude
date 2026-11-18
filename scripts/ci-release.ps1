#requires -Version 5.1
<#
.SYNOPSIS
    Releases every plugin that has releasable commits since its last tag. Run by CI on main.
.DESCRIPTION
    Per plugin listed in .claude-plugin/marketplace.json:
      1. plan-release.ps1 derives the bump level from the commit messages that touched
         plugins/<name>/ since the tag <name>-v*. Level "none" -> the plugin is skipped.
      2. release.ps1 -PromoteUnreleased writes the new version into plugin.json and
         marketplace.json and turns the CHANGELOG's "## Unreleased" section into the new
         version section. A missing or empty Unreleased section fails the run - that is the
         "no release without release notes" rule.
      3. One commit + one annotated tag <name>-v<version> per plugin.
    Finally everything is pushed. No GitHub release is created for a plugin: Claude Code reads
    the version from the manifests, never from releases, and the notes live in the CHANGELOG.
    The repository's release page belongs to Scrum Control (apps/scrum-control/) alone - its
    self-update reads the repository's latest release, so a plugin release would break it. The tags
    stay - plan-release.ps1 measures each plugin's commits from its last <name>-v* tag.
.PARAMETER Plugin
    Only release this plugin instead of every plugin in the marketplace.
.PARAMETER ForceBump
    Ignore the commit messages and use this level (for a manual workflow_dispatch run).
.PARAMETER DryRun
    Do everything except commit, tag and push. Files are still modified,
    so you can inspect the diff - revert it with `git checkout -- .` afterwards.
.EXAMPLE
    pwsh -File scripts/ci-release.ps1 -DryRun
.EXAMPLE
    pwsh -File scripts/ci-release.ps1 -Plugin ai-scrum -ForceBump minor
#>
[CmdletBinding()]
param(
    [string]$Plugin,
    [ValidateSet('major', 'minor', 'patch')][string]$ForceBump,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$marketplacePath = Join-Path $repoRoot '.claude-plugin/marketplace.json'

function Invoke-Git {
    # Takes an explicit array on purpose: with ValueFromRemainingArguments, a git flag like
    # -a binds as a prefix of the parameter name instead of being passed through.
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)
    if ($DryRun) {
        Write-Host "    [dry-run] git $($GitArgs -join ' ')" -ForegroundColor DarkGray
        return
    }
    & git -C $repoRoot @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE" }
}

$marketplace = Get-Content -Path $marketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
$plugins = @($marketplace.plugins | ForEach-Object { $_.name })
if ($Plugin) {
    if ($plugins -notcontains $Plugin) { throw "'$Plugin' is not listed in marketplace.json" }
    $plugins = @($Plugin)
}

$released = @()

foreach ($name in $plugins) {
    Write-Host ''
    Write-Host "=== $name ===" -ForegroundColor Cyan

    $bump = $ForceBump
    $plan = & (Join-Path $PSScriptRoot 'plan-release.ps1') -Plugin $name
    $plan | ForEach-Object { Write-Host "  $_" }
    if (-not $ForceBump) {
        $bumpLine = $plan | Where-Object { $_ -match '^bump=' } | Select-Object -First 1
        if (-not $bumpLine) { throw "plan-release.ps1 returned no bump level for '$name'" }
        $bump = ($bumpLine -split '=', 2)[1].Trim()
        if (@('none', 'patch', 'minor', 'major') -notcontains $bump) {
            throw "plan-release.ps1 returned an unexpected bump level '$bump' for '$name'"
        }
    }

    if ($bump -eq 'none') {
        Write-Host "  -> nothing to release" -ForegroundColor DarkGray
        continue
    }

    try {
        & (Join-Path $PSScriptRoot 'release.ps1') -Plugin $name -Bump $bump -PromoteUnreleased
    } catch {
        Write-Host ''
        Write-Host "RELEASE BLOCKED for $name`: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Either add the release notes under "## Unreleased", or mark the change as' -ForegroundColor Yellow
        Write-Host 'chore:/docs: (or add [skip release] to the commit) so it does not trigger a release.' -ForegroundColor Yellow
        exit 1
    }

    $version = (Get-Content -Path (Join-Path $repoRoot "plugins/$name/.claude-plugin/plugin.json") -Raw -Encoding UTF8 | ConvertFrom-Json).version
    $tag = "$name-v$version"

    Invoke-Git @('add', "plugins/$name", '.claude-plugin/marketplace.json')
    Invoke-Git @('commit', '-m', "chore(release): $name $version [skip ci]")
    Invoke-Git @('tag', '-a', $tag, '-m', "$name $version")

    $released += [pscustomobject]@{ Name = $name; Version = $version; Tag = $tag; Bump = $bump }
    Write-Host "  -> $bump release $version, tagged $tag" -ForegroundColor Green
}

Write-Host ''
if ($released.Count -eq 0) {
    Write-Host 'Nothing released.' -ForegroundColor DarkGray
    if ($env:GITHUB_STEP_SUMMARY) {
        Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value 'No plugin had releasable commits - nothing released.' -Encoding UTF8
    }
    exit 0
}

Invoke-Git @('push', '--follow-tags')

if ($env:GITHUB_STEP_SUMMARY) {
    $lines = @('## Released', '')
    foreach ($r in $released) { $lines += "- **$($r.Name) $($r.Version)** ($($r.Bump)) - tag ``$($r.Tag)``" }
    Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value ($lines -join "`n") -Encoding UTF8
}
