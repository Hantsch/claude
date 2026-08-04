#requires -Version 5.1
<#
.SYNOPSIS
    Validates every plugin in this marketplace. Same checks CI runs.
.DESCRIPTION
    Checks that the marketplace manifest and all plugin manifests are valid and in sync,
    that commands and agents carry usable frontmatter, and that every file a command
    references (${CLAUDE_PLUGIN_ROOT}/... or templates/...) actually ships.
.EXAMPLE
    pwsh -File scripts/validate.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$script:errors = @()
$script:checks = 0

function Add-Failure {
    param([string]$Where, [string]$Message)
    $script:errors += "$Where`: $Message"
}

function Test-Check {
    param([string]$Where, [string]$Message, [bool]$Condition)
    $script:checks++
    if (-not $Condition) { Add-Failure -Where $Where -Message $Message }
}

function Read-JsonFile {
    param([string]$Path)
    # A UTF-8 BOM in front of a manifest breaks strict JSON parsers, so treat it as an error
    # rather than silently stripping it.
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        Add-Failure -Where $Path -Message 'starts with a UTF-8 BOM - write it as UTF-8 without BOM'
    }
    try {
        return (Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
    } catch {
        Add-Failure -Where $Path -Message "not valid JSON: $($_.Exception.Message)"
        return $null
    }
}

function Get-Frontmatter {
    param([string]$Path)
    $lines = Get-Content -Path $Path -Encoding UTF8
    if ($lines.Count -eq 0 -or $lines[0].Trim() -ne '---') { return $null }
    $map = @{}
    for ($i = 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq '---') { return $map }
        if ($lines[$i] -match '^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$') {
            $map[$Matches[1]] = $Matches[2].Trim()
        }
    }
    return $null   # unterminated frontmatter
}

Write-Host "Validating marketplace in $repoRoot" -ForegroundColor Cyan

# --- marketplace manifest -------------------------------------------------------------
$marketplacePath = Join-Path $repoRoot '.claude-plugin/marketplace.json'
Test-Check -Where 'marketplace' -Message '.claude-plugin/marketplace.json is missing' -Condition (Test-Path $marketplacePath)
if (-not (Test-Path $marketplacePath)) {
    Write-Host 'FAIL: no marketplace manifest' -ForegroundColor Red
    exit 1
}

$marketplace = Read-JsonFile -Path $marketplacePath
if ($null -eq $marketplace) { Write-Host 'FAIL: marketplace manifest unreadable' -ForegroundColor Red; exit 1 }

Test-Check -Where 'marketplace' -Message 'field "name" is missing' -Condition ([bool]$marketplace.name)
Test-Check -Where 'marketplace' -Message 'field "owner" is missing' -Condition ([bool]$marketplace.owner)
Test-Check -Where 'marketplace' -Message 'field "plugins" is empty' -Condition ($marketplace.plugins -and $marketplace.plugins.Count -gt 0)

$validModels = @('opus', 'sonnet', 'haiku', 'fable', 'inherit')
$validEfforts = @('low', 'medium', 'high', 'xhigh', 'max')

foreach ($entry in $marketplace.plugins) {
    $name = $entry.name
    $where = "plugin '$name'"

    Test-Check -Where $where -Message 'name must be lowercase kebab-case' -Condition ($name -match '^[a-z0-9]+(-[a-z0-9]+)*$')
    Test-Check -Where $where -Message 'marketplace entry has no description' -Condition ([bool]$entry.description)
    Test-Check -Where $where -Message 'marketplace entry has no version' -Condition ([bool]$entry.version)

    if (-not $entry.source) { Add-Failure -Where $where -Message 'marketplace entry has no source'; continue }

    $pluginDir = Join-Path $repoRoot ($entry.source -replace '^\./', '')
    if (-not (Test-Path $pluginDir)) {
        Add-Failure -Where $where -Message "source '$($entry.source)' does not exist"
        continue
    }

    # --- plugin manifest --------------------------------------------------------------
    $manifestPath = Join-Path $pluginDir '.claude-plugin/plugin.json'
    if (-not (Test-Path $manifestPath)) {
        Add-Failure -Where $where -Message '.claude-plugin/plugin.json is missing'
        continue
    }
    $manifest = Read-JsonFile -Path $manifestPath
    if ($null -eq $manifest) { continue }

    Test-Check -Where $where -Message "plugin.json name '$($manifest.name)' differs from marketplace name '$name'" -Condition ($manifest.name -eq $name)
    Test-Check -Where $where -Message "plugin.json version '$($manifest.version)' differs from marketplace version '$($entry.version)'" -Condition ($manifest.version -eq $entry.version)
    Test-Check -Where $where -Message 'plugin.json has no description' -Condition ([bool]$manifest.description)
    Test-Check -Where $where -Message "version '$($manifest.version)' is not semver (x.y.z)" -Condition ($manifest.version -match '^\d+\.\d+\.\d+$')
    Test-Check -Where $where -Message 'README.md is missing' -Condition (Test-Path (Join-Path $pluginDir 'README.md'))

    $changelogPath = Join-Path $pluginDir 'CHANGELOG.md'
    Test-Check -Where $where -Message 'CHANGELOG.md is missing' -Condition (Test-Path $changelogPath)
    if (Test-Path $changelogPath) {
        $changelog = Get-Content -Path $changelogPath -Raw -Encoding UTF8
        Test-Check -Where $where -Message "CHANGELOG.md has no section for version $($manifest.version)" -Condition ($changelog -match [regex]::Escape($manifest.version))
        # The release workflow promotes this section to the new version number.
        Test-Check -Where $where -Message "CHANGELOG.md has no '## Unreleased' section (the release workflow needs it)" -Condition ($changelog -match '(?m)^##[ \t]+\[?Unreleased\]?[ \t\r]*$')
    }

    # --- commands ---------------------------------------------------------------------
    $commandDir = Join-Path $pluginDir 'commands'
    $commands = @()
    if (Test-Path $commandDir) { $commands = @(Get-ChildItem -Path $commandDir -Filter '*.md' -File) }
    Test-Check -Where $where -Message 'no commands and no agents found' -Condition ($commands.Count -gt 0 -or (Test-Path (Join-Path $pluginDir 'agents')))

    foreach ($cmd in $commands) {
        $cwhere = "$where / commands/$($cmd.Name)"
        $fm = Get-Frontmatter -Path $cmd.FullName
        if ($null -eq $fm) {
            Add-Failure -Where $cwhere -Message 'missing or unterminated YAML frontmatter'
            continue
        }
        Test-Check -Where $cwhere -Message 'frontmatter has no "description"' -Condition ([bool]$fm['description'])
        if ($fm['model']) {
            Test-Check -Where $cwhere -Message "model '$($fm['model'])' is not one of: $($validModels -join ', ')" -Condition ($validModels -contains $fm['model'])
        }
        if ($fm['effort']) {
            Test-Check -Where $cwhere -Message "effort '$($fm['effort'])' is not one of: $($validEfforts -join ', ')" -Condition ($validEfforts -contains $fm['effort'])
        }
    }

    # --- agents -----------------------------------------------------------------------
    $agentDir = Join-Path $pluginDir 'agents'
    if (Test-Path $agentDir) {
        foreach ($agent in Get-ChildItem -Path $agentDir -Filter '*.md' -File) {
            $awhere = "$where / agents/$($agent.Name)"
            $fm = Get-Frontmatter -Path $agent.FullName
            if ($null -eq $fm) {
                Add-Failure -Where $awhere -Message 'missing or unterminated YAML frontmatter'
                continue
            }
            Test-Check -Where $awhere -Message 'frontmatter has no "description"' -Condition ([bool]$fm['description'])
            Test-Check -Where $awhere -Message 'frontmatter has no "name"' -Condition ([bool]$fm['name'])
            if ($fm['name']) {
                Test-Check -Where $awhere -Message "frontmatter name '$($fm['name'])' differs from file name '$($agent.BaseName)'" -Condition ($fm['name'] -eq $agent.BaseName)
            }
            if ($fm['model']) {
                Test-Check -Where $awhere -Message "model '$($fm['model'])' is not one of: $($validModels -join ', ')" -Condition ($validModels -contains $fm['model'])
            }
        }
    }

    # --- referenced files ship --------------------------------------------------------
    $mdFiles = @(Get-ChildItem -Path $pluginDir -Filter '*.md' -File -Recurse |
        Where-Object { $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar)templates$([IO.Path]::DirectorySeparatorChar)*" })

    foreach ($file in $mdFiles) {
        $text = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        $rel = $file.FullName.Substring($pluginDir.Length).TrimStart('\', '/')

        # ${CLAUDE_PLUGIN_ROOT}/<path>
        foreach ($m in [regex]::Matches($text, '\$\{CLAUDE_PLUGIN_ROOT\}/([A-Za-z0-9._\-/]+)')) {
            $target = $m.Groups[1].Value.TrimEnd('.', ',', ')')
            Test-Check -Where "$where / $rel" -Message "references '`${CLAUDE_PLUGIN_ROOT}/$target', which does not ship" -Condition (Test-Path (Join-Path $pluginDir $target))
        }

        # templates/<file> mentioned in prose
        foreach ($m in [regex]::Matches($text, '(?<![A-Za-z0-9._/\-])templates/([A-Za-z0-9._\-]+\.[A-Za-z0-9]+)')) {
            $target = "templates/$($m.Groups[1].Value)"
            Test-Check -Where "$where / $rel" -Message "references '$target', which does not ship" -Condition (Test-Path (Join-Path $pluginDir $target))
        }
    }
}

# --- report ---------------------------------------------------------------------------
Write-Host ''
if ($script:errors.Count -eq 0) {
    Write-Host "OK - $($script:checks) checks passed." -ForegroundColor Green
    exit 0
}

Write-Host "FAILED - $($script:errors.Count) problem(s) in $($script:checks) checks:" -ForegroundColor Red
foreach ($e in $script:errors) { Write-Host "  - $e" -ForegroundColor Red }
exit 1
