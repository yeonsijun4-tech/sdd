$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Building frontend and worker"
npm run build

Write-Host "==> Deploying to Cloudflare"
npm run deploy --workspace=worker

Write-Host "==> Deployment finished"
