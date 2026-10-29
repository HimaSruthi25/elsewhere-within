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
# The selected scene's file name (long form). Short names such as ELSEWH~3.SCR are handed out
# again when files are recreated, so the same short name could mean another scene afterwards;
# the same selection is written back as a long path at the end.
Add-Type -Namespace EW -Name Paths -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern uint GetLongPathName(string s, System.Text.StringBuilder l, uint n);'
$keepScene = $null
if ($selected -and (Test-Path $selected) -and (Test-Path $target)) {
  $sb = New-Object Text.StringBuilder 1024
  if ([EW.Paths]::GetLongPathName($selected, $sb, 1024) -gt 0) {
    $long = $sb.ToString()
    $dirShort = (New-Object -ComObject Scripting.FileSystemObject).GetFolder((Split-Path $long -Parent)).ShortPath
    $targetShort = (New-Object -ComObject Scripting.FileSystemObject).GetFolder($target).ShortPath
    if ($dirShort -eq $targetShort -and (Split-Path $long -Leaf) -like 'Elsewhere - *.scr') { $keepScene = Split-Path $long -Leaf }
  }
}
$oldScr = Join-Path $target 'ElsewhereWithin.scr'
$oldIsSelected = $selected -and (Test-Path $oldScr) -and (ShortPath $selected) -eq (ShortPath $oldScr)

# A running screensaver or live wallpaper holds its files open. The wallpaper is started again afterwards.
$wallpaperRunning = @(Get-Process ElsewhereWallpaper -ErrorAction SilentlyContinue).Count -gt 0
# Ask the wallpaper to quit by itself first (it may run with other rights than this window).
if ($wallpaperRunning) {
  $exe = Join-Path $target 'ElsewhereWallpaper.exe'
  if (Test-Path $exe) { & $exe /quit | Out-Null }
  for ($i = 0; $i -lt 25 -and @(Get-Process ElsewhereWallpaper -ErrorAction SilentlyContinue).Count -gt 0; $i++) { Start-Sleep -Milliseconds 200 }
}
Get-Process | Where-Object { $_.Name -eq 'ElsewhereWithin' -or $_.Name -eq 'ElsewhereWallpaper' -or $_.Name -eq 'ElsewhereUpdate' -or $_.Name -like 'Elsewhere - *' } | Stop-Process -Force
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
if ($keepScene -and (Test-Path (Join-Path $target $keepScene))) {
  Set-ItemProperty 'HKCU:\Control Panel\Desktop' -Name 'SCRNSAVE.EXE' -Value (Join-Path $target $keepScene)
  Write-Host "Kept the selected screensaver: $keepScene"
}
# The updater's scheduled task (logon + daily), if it is not there yet.
$taskExists = [bool](Get-ScheduledTask -TaskName 'ElsewhereWithin Update' -ErrorAction SilentlyContinue)
if (-not $taskExists -and (Test-Path (Join-Path $target 'ElsewhereUpdate.exe'))) { & (Join-Path $target 'ElsewhereUpdate.exe') /register; Start-Sleep -Seconds 2 }
# The live wallpaper is copied with everything else (the installer makes it optional). Start it again if it was running.
if ($wallpaperRunning) { Start-Process (Join-Path $target 'ElsewhereWallpaper.exe') }
Write-Host ("Deployed {0} scene(s) to {1}; the selected screensaver was not changed." -f $newScr.Count, $target)