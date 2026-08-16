$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Building frontend and server"
npm run build

Write-Host "==> Deploying to Fly.io"
fly deploy

Write-Host "==> Done"
