# Removes the screensaver installed by install.ps1. If one of its scenes is the
# selected screensaver, the choice is set back to (None); any other choice is kept.
# Usage:  powershell -ExecutionPolicy Bypass -File screensaver\uninstall.ps1
$ErrorActionPreference = 'Stop'
$target = Join-Path $env:LOCALAPPDATA 'Programs\ElsewhereWithin'
$data = Join-Path $env:LOCALAPPDATA 'ElsewhereWithin' # WebView2 data and log

# Windows may store the selection quoted or as a short (8.3) path, so compare short forms.
function ShortPath($path) {
  try { return (New-Object -ComObject Scripting.FileSystemObject).GetFolder($path).ShortPath.ToLowerInvariant() } catch { return $null }
}
$desktop = 'HKCU:\Control Panel\Desktop'
$selected = (Get-ItemProperty $desktop).'SCRNSAVE.EXE'
if ($selected) { $selected = $selected.Trim().Trim('"') } # Windows stores it quoted
$isOurs = $false
if ($selected -and (Test-Path $selected) -and (Test-Path $target)) {
  $isOurs = (ShortPath (Split-Path $selected -Parent)) -eq (ShortPath $target) -and $selected -like '*.scr'
}
if ($isOurs) {
  # The same as choosing (None) in Screen Saver Settings.
  Remove-ItemProperty $desktop -Name 'SCRNSAVE.EXE'
  Write-Host 'Screen saver set back to (None).'
} else {
  Write-Host 'Elsewhere, Within is not the selected screensaver; the current choice is unchanged.'
}

Get-Process | Where-Object { $_.Name -eq 'ElsewhereWithin' -or $_.Name -like 'Elsewhere - *' } | Stop-Process -Force
Start-Sleep -Seconds 1 # let its WebView2 processes close
foreach ($folder in $target, $data) {
  if (Test-Path $folder) { Remove-Item $folder -Recurse -Force; Write-Host "Removed $folder" }
}