#requires -Version 5.1
<#
.SYNOPSIS
    Fails when there are release-worthy commits but no release notes under '## Unreleased'.
.DESCRIPTION
    The verdict the release workflow reaches after a merge to main - reached before the merge
    instead of after it. plan-release.ps1 derives the bump level from the commits that touched
    the app since the last scrum-control-v* tag. A level other than "none" means the next push
    to main releases the app, so apps/scrum-control/CHANGELOG.md must already hold the notes;
    release.ps1 -ValidateNotesOnly then applies the identical check the release itself would.

    Before the first release there is no tag and therefore nothing a push could release by
    itself - the first release is started by hand (ci-release.ps1 -Version, or the workflow
    input), and release.ps1 checks the notes then. So there is nothing to check here yet.

    Nothing is written and nothing is committed - this only reports.

    Needs the full history and the tags, so the workflow checks out with fetch-depth: 0.
.EXAMPLE
    pwsh -File apps/scrum-control/scripts/check-notes.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# plan-release.ps1 answers "none" for everything that is not a release by itself: no releasable
# commit since the last tag, and no tag at all yet.
$plan = & (Join-Path $PSScriptRoot 'plan-release.ps1')
$bumpLine = $plan | Where-Object { $_ -match '^bump=' } | Select-Object -First 1
if (-not $bumpLine) { throw 'plan-release.ps1 returned no bump level' }
$bump = ($bumpLine -split '=', 2)[1].Trim()

if ($bump -eq 'none') {
    Write-Host 'scrum-control: no releasable commits - nothing to check.' -ForegroundColor DarkGray
    exit 0
}

$nextLine = $plan | Where-Object { $_ -match '^next=' } | Select-Object -First 1
$next = ($nextLine -split '=', 2)[1].Trim()

try {
    & (Join-Path $PSScriptRoot 'release.ps1') -ValidateNotesOnly
} catch {
    Write-Host ''
    Write-Host "RELEASE WOULD BE BLOCKED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    Write-Host "Merging this to main would release scrum-control $next ($bump), but the notes are not ready." -ForegroundColor Yellow
    Write-Host 'Either write them under "## Unreleased" in apps/scrum-control/CHANGELOG.md, or mark the change as' -ForegroundColor Yellow
    Write-Host 'chore:/docs: (or add [skip release] to the commit) so it does not release.' -ForegroundColor Yellow
    exit 1
}

Write-Host "Merging this to main would release scrum-control $next ($bump) - notes are ready." -ForegroundColor Green
