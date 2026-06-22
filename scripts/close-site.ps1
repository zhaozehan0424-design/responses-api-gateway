$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

node .\scripts\site-toggle.js close
if ($LASTEXITCODE -ne 0) { throw "Failed to update local site routes." }

node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"
if ($LASTEXITCODE -ne 0) { throw "vercel.json is invalid." }

$tmp = Join-Path $env:TEMP "site-closed-true.txt"
Set-Content -Path $tmp -Value "true" -NoNewline
Write-Host "Removing old SITE_CLOSED value if it exists..."
npx vercel env rm SITE_CLOSED production -y
if ($LASTEXITCODE -ne 0) {
  Write-Host "SITE_CLOSED did not exist or could not be removed; continuing with add step."
}

Write-Host "Setting SITE_CLOSED=true..."
Get-Content -Raw $tmp | npx vercel env add SITE_CLOSED production
if ($LASTEXITCODE -ne 0) { throw "Failed to set SITE_CLOSED=true in Vercel." }

npx vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) { throw "Vercel production deploy failed." }

Write-Host "Site closed. Public pages, docs, dashboard, and Discord login are disabled. Admin and /v1 API routes remain unchanged."
