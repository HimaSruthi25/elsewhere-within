# Quick update while developing: builds, then copies the new files into the
# installed folder (%LOCALAPPDATA%\Programs\ElsewhereWithin). No dialogs, and it
# never changes which screensaver Windows has selected. Run the installer once first.
# Usage:  powershell -ExecutionPolicy Bypass -File screensaver\deploy.ps1
#   -SkipBuild   copy the existing screensaver\out as it is
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$out = Join-Path $here 'out'
$target = Join-Path $env:LOCALAPPDATA 'Programs\ElsewhereWithin'

if (-not (Test-Path $target)) { throw "$target does not exist; run release\ElsewhereWithin-Setup.exe once first" }
if (-not $SkipBuild) { & (Join-Path $here 'build.ps1') }

# The selected screensaver (read only), to keep it working if it is the old single .scr.
$selected = (Get-ItemProperty 'HKCU:\Control Panel\Desktop').'SCRNSAVE.EXE'
if ($selected) { $selected = $selected.Trim().Trim('"') }
# Windows may store a short (8.3) path, so compare short forms.
function ShortPath($path) {
  try { return (New-Object -ComObject Scripting.FileSystemObject).GetFile($path).ShortPath.ToLowerInvariant() } catch { return $null }
}
$oldScr = Join-Path $target 'ElsewhereWithin.scr'
$oldIsSelected = $selected -and (Test-Path $oldScr) -and (ShortPath $selected) -eq (ShortPath $oldScr)

# A running screensaver holds its .scr and DLLs open.
Get-Process | Where-Object { $_.Name -eq 'ElsewhereWithin' -or $_.Name -like 'Elsewhere - *' } | Stop-Process -Force
Start-Sleep -Milliseconds 700

# Remove our old files: every .scr, and site\. Uninstall.exe and the registry stay as they are.
$newScr = @(Get-ChildItem $out -Filter 'Elsewhere - *.scr' | ForEach-Object { $_.Name })
foreach ($file in Get-ChildItem $target -Filter *.scr) {
  if ($oldIsSelected -and $file.Name -eq 'ElsewhereWithin.scr') { continue } # handled below
  Remove-Item $file.FullName -Force
}
if (Test-Path (Join-Path $target 'site')) { Remove-Item (Join-Path $target 'site') -Recurse -Force }
Get-ChildItem $out | ForEach-Object { Copy-Item $_.FullName (Join-Path $target $_.Name) -Recurse -Force }

# The old single ElsewhereWithin.scr: gone, unless Windows has it selected. Then it
# stays (replaced by a copy of the new program, which shows the default scene) so the
# selection keeps working until you pick a scene in Screen Saver Settings.
$old = Join-Path $target 'ElsewhereWithin.scr'
if (Test-Path $old) {
  Copy-Item (Join-Path $target $newScr[0]) $old -Force
  Write-Host 'Note: the old "ElsewhereWithin" screensaver is still selected. Pick one of the "Elsewhere - ..." scenes in Screen Saver Settings.'
}
Write-Host ("Deployed {0} scene(s) to {1}; the selected screensaver was not changed." -f $newScr.Count, $target)