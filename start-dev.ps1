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
