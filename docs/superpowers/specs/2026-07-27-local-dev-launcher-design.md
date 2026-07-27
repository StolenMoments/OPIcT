# Local Development Launcher Design

## Goal

Add a root-level PowerShell script that starts the OPIcT server and web development server in separate PowerShell windows.

## Architecture

`start-dev.ps1` derives the repository root from its own location, then launches two independent `powershell.exe` processes. The server process uses `server` as its working directory and runs `npm run dev`; the web process uses `web` as its working directory and runs `npm run dev`.

The child windows use `-NoExit` so their logs remain visible after startup or failure. The launcher does not manage shutdown, proxy configuration, or environment files; those remain the responsibility of the existing development commands.

## Error handling

The script enables strict mode and stops on launcher errors. It verifies that both expected directories exist before starting either process, preventing a partial launch caused by a malformed checkout.

## Verification

Before implementation, an existence contract is run and must fail because the script is absent. After implementation, PowerShell parsing and static command/working-directory assertions verify the launcher contract without starting long-lived development servers.

## Scope

Only the root-level launcher script is part of the user-facing feature. No application code, dependencies, or frontend styling changes are required.
