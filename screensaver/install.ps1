# Installs the built screensaver (screensaver\out) for the current user and
# opens Windows Screen Saver Settings with the default scene selected. No admin rights.
# Every scene is its own "Elsewhere - <Scene title>.scr" entry in that list.
# Usage:  powershell -ExecutionPolicy Bypass -File screensaver\install.ps1
#   -CopyOnly   copy the files but leave the Windows screensaver choice alone
param([switch]$CopyOnly)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'out'
$target = Join-Path $env:LOCALAPPDATA 'Programs\ElsewhereWithin'
$ourItems = 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'site', 'Uninstall.exe'
function IsOurs($name) { $ourItems -contains $name -or $name -like 'Elsewhere - *.scr' -or $name -eq 'ElsewhereWithin.scr' }

if (-not (Test-Path (Join-Path $source 'site\scenes.json'))) { throw 'Build it first: screensaver\build.ps1' }
$scenes = Get-Content (Join-Path $source 'site\scenes.json') -Raw | ConvertFrom-Json
$default = $scenes.scenes | Where-Object { $_.id -eq $scenes.default }

# This folder belongs to the screensaver; refuse to touch one that holds anything else.
if (Test-Path $target) {
  $foreign = @(Get-ChildItem $target | Where-Object { -not (IsOurs $_.Name) })
  if ($foreign.Count -gt 0) { throw "$target contains files that are not the screensaver's ($($foreign.Name -join ', ')); nothing was changed" }
}

Get-Process | Where-Object { $_.Name -eq 'ElsewhereWithin' -or $_.Name -like 'Elsewhere - *' } | Stop-Process -Force
New-Item -ItemType Directory -Force $target | Out-Null
Get-ChildItem $target | Where-Object { $_.Name -ne 'Uninstall.exe' } | Remove-Item -Recurse -Force
Get-ChildItem $source | ForEach-Object { Copy-Item $_.FullName (Join-Path $target $_.Name) -Recurse }
Write-Host "Installed to $target"

if ($CopyOnly) { return }
# Windows' own install command (the same as right-click > Install on a .scr):
# selects this screensaver and opens Screen Saver Settings. The path stays
# unquoted, as in Windows' Install verb; quotes would be stored in the setting.
$scr = Join-Path $target "Elsewhere - $($default.title).scr"
Start-Process rundll32.exe -ArgumentList "desk.cpl,InstallScreenSaver $scr"
Write-Host 'Screen Saver Settings is open: set "Wait", then click OK.'