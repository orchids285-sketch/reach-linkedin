# reach-linkedin — start the gateway + a free public tunnel (Windows PowerShell).
#
# Prereqs (one-time):
#   npx -y patchright install chrome
#   npx -y linkedin-mcp-tools@latest --login   # log into YOUR LinkedIn, solve 2FA
#
# Then set the token Reach expects and run this:
#   $env:GATEWAY_TOKEN="<the LINKEDIN_MCP_TOKEN from Reach>"
#   ./run.ps1
#
# It prints a https://<something>.trycloudflare.com URL — send that to your
# operator so Reach's LINKEDIN_MCP_URL is pointed at it. Keep this window open:
# LinkedIn sending only works while this gateway + tunnel are running.

if (-not $env:GATEWAY_TOKEN) {
  Write-Host "ERROR: set `$env:GATEWAY_TOKEN first (the LINKEDIN_MCP_TOKEN value from Reach)." -ForegroundColor Red
  exit 1
}

$port = if ($env:PORT) { $env:PORT } else { "8080" }
Write-Host "[reach-linkedin] starting gateway on :$port ..." -ForegroundColor Cyan
$gw = Start-Process node -ArgumentList "index.mjs" -PassThru -NoNewWindow
Start-Sleep -Seconds 4

Write-Host "[reach-linkedin] opening public tunnel (free, no account) ..." -ForegroundColor Cyan
try {
  npx --yes untun@latest tunnel "http://localhost:$port"
} finally {
  if ($gw -and -not $gw.HasExited) { Stop-Process -Id $gw.Id -Force }
}
