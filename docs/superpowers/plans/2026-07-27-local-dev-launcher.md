# Local Development Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level PowerShell launcher that opens the server and web development commands in separate PowerShell windows.

**Architecture:** `start-dev.ps1` resolves its own directory as the repository root, validates the `server` and `web` directories, and starts one `powershell.exe` process per development server. Each child process receives its project directory through `-WorkingDirectory` and stays open with `-NoExit`.

**Tech Stack:** PowerShell, Windows PowerShell process launching, existing npm scripts.

## Global Constraints

- Use the existing `server\package.json` and `web\package.json` commands exactly: `npm run dev`.
- Do not modify application source, dependencies, or environment files.
- Do not start long-lived development processes during automated verification.

---

### Task 1: Add the root development launcher

**Files:**
- Create: `start-dev.ps1`
- Test: inline PowerShell contract checks; no persistent test file is needed for this launch-only utility.

**Interfaces:**
- Consumes: repository-relative `server` and `web` directories.
- Produces: two separate PowerShell windows running the existing server and web `npm run dev` scripts.

- [x] **Step 1: Write and run the failing existence contract**

Run from the repository root:

```powershell
$scriptPath = Join-Path (Get-Location) 'start-dev.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw 'Expected start-dev.ps1 to exist' }
```

Expected: FAIL with `Expected start-dev.ps1 to exist` because the launcher has not been created.

- [ ] **Step 2: Create the launcher with the minimal process contract**

Create `start-dev.ps1` with:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$serverPath = Join-Path $root 'server'
$webPath = Join-Path $root 'web'

foreach ($path in @($serverPath, $webPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) {
        throw "Expected project directory was not found: $path"
    }
}

Start-Process -FilePath 'powershell.exe' -WorkingDirectory $serverPath -ArgumentList @('-NoExit', '-Command', 'npm run dev')
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $webPath -ArgumentList @('-NoExit', '-Command', 'npm run dev')

Write-Host 'Started server and web development windows.'
```

- [ ] **Step 3: Parse and verify the launcher contract without starting child windows**

Run:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'start-dev.ps1'), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -ne 0) { throw ($errors | Out-String) }
$source = Get-Content -Raw -LiteralPath 'start-dev.ps1'
foreach ($expected in @(
    "-WorkingDirectory `$serverPath",
    "-WorkingDirectory `$webPath",
    "'npm run dev'",
    "'-NoExit'"
)) {
    if ($source -notlike "*$expected*") { throw "Missing launcher contract: $expected" }
}
if (([regex]::Matches($source, 'Start-Process')).Count -ne 2) { throw 'Expected exactly two child processes' }
```

Expected: PASS, with no development windows started by the verification command.

- [ ] **Step 4: Inspect the scoped diff and commit the implementation**

Run:

```powershell
git status --short
git diff -- start-dev.ps1
git add -- start-dev.ps1
git commit -m "feat(stage-13): add local dev launcher"
```

Expected: only `start-dev.ps1` is included in the feature commit; unrelated existing untracked files remain untouched.
