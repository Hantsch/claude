#requires -Version 5.1
<#
.SYNOPSIS
    Fails when a plugin has release-worthy commits but no release notes under '## Unreleased'.
.DESCRIPTION
    The verdict the release workflow reaches after a merge to main - reached before the push
    instead of after it. Per plugin: plan-release.ps1 derives the bump level from the commits
    that touched plugins/<name>/ since that plugin's last tag. A level other than "none" means
    the next push to main releases the plugin, so its CHANGELOG must already hold the notes;
    release.ps1 -ValidateNotesOnly then applies the identical check the release itself would.

    Nothing is written and nothing is committed - this only reports.

    Two callers: .githooks/pre-push (enable once with `git config core.hooksPath .githooks`)
    and the validate workflow, which needs the full history for it (fetch-depth: 0).
.PARAMETER Plugin
    Only check this plugin instead of every plugin in the marketplace.
.EXAMPLE
    pwsh -File scripts/check-notes.ps1
.EXAMPLE
    pwsh -File scripts/check-notes.ps1 -Plugin ai-scrum
#>
[CmdletBinding()]
param(
    [string]$Plugin
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$marketplacePath = Join-Path $repoRoot '.claude-plugin/marketplace.json'

$marketplace = Get-Content -Path $marketplacePath -Raw -Encoding UTF8 | ConvertFrom-Json
$plugins = @($marketplace.plugins | ForEach-Object { $_.name })
if ($Plugin) {
    if ($plugins -notcontains $Plugin) { throw "'$Plugin' is not listed in marketplace.json" }
    $plugins = @($Plugin)
}

$blocked = @()
$pending = @()

foreach ($name in $plugins) {
    $plan = & (Join-Path $PSScriptRoot 'plan-release.ps1') -Plugin $name
    $bumpLine = $plan | Where-Object { $_ -match '^bump=' } | Select-Object -First 1
    if (-not $bumpLine) { throw "plan-release.ps1 returned no bump level for '$name'" }
    $bump = ($bumpLine -split '=', 2)[1].Trim()

    if ($bump -eq 'none') {
        Write-Host "$name`: no releasable commits - skipped" -ForegroundColor DarkGray
        continue
    }

    $nextLine = $plan | Where-Object { $_ -match '^next=' } | Select-Object -First 1
    $next = ($nextLine -split '=', 2)[1].Trim()

    try {
        # 6>$null: release.ps1 reports through Write-Host, which Out-Null does not catch.
        & (Join-Path $PSScriptRoot 'release.ps1') -Plugin $name -Bump $bump -ValidateNotesOnly 6>$null
        $pending += "$name $next ($bump)"
        Write-Host "$name`: would release $next ($bump) - notes present" -ForegroundColor Green
    } catch {
        $blocked += [pscustomobject]@{ Name = $name; Bump = $bump; Reason = $_.Exception.Message }
        Write-Host "$name`: would release $next ($bump) - BLOCKED" -ForegroundColor Red
    }
}

Write-Host ''
if ($blocked.Count -eq 0) {
    if ($pending.Count -eq 0) {
        Write-Host 'No plugin would release - nothing to write.' -ForegroundColor DarkGray
    } else {
        Write-Host "Release notes ready for: $($pending -join ', ')" -ForegroundColor Green
    }
    exit 0
}

foreach ($b in $blocked) {
    Write-Host "RELEASE WOULD BREAK for $($b.Name): $($b.Reason)" -ForegroundColor Red
}
Write-Host ''
Write-Host 'Fix it one of three ways, before this reaches main:' -ForegroundColor Yellow
Write-Host '  1. Write the notes under "## Unreleased" in the plugin CHANGELOG (the usual answer).' -ForegroundColor Yellow
Write-Host '  2. Reword the commit as chore:/docs:/ci:/test:/style:/build: if it changes nothing for users.' -ForegroundColor Yellow
Write-Host '  3. Put [skip release] in the commit message.' -ForegroundColor Yellow
Write-Host 'Then amend or add a commit. Bypass this check once with: git push --no-verify' -ForegroundColor Yellow
exit 1
