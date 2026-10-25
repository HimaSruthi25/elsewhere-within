# Compiles ElsewhereWallpaper.exe into screensaver\out, next to the screensaver's
# site\ folder and WebView2 DLLs, which it shares. screensaver\build.ps1 runs this
# at the end; run it alone for a quick rebuild of just the wallpaper program.
# Usage:  powershell -ExecutionPolicy Bypass -File wallpaper\build.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$out = Join-Path (Split-Path $here -Parent) 'screensaver\out'
$lib = Join-Path (Split-Path $here -Parent) 'screensaver\lib'
foreach ($required in (Join-Path $lib 'Microsoft.Web.WebView2.Core.dll'), (Join-Path $lib 'Microsoft.Web.WebView2.WinForms.dll'), (Join-Path $out 'site\scenes.json')) {
  if (-not (Test-Path $required)) { throw "$required is missing; run screensaver\build.ps1 first" }
}
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "C# compiler not found at $csc" }
Write-Host '== Compiling ElsewhereWallpaper.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /warnaserror+ `
  "/out:$(Join-Path $out 'ElsewhereWallpaper.exe')" `
  "/reference:$(Join-Path $lib 'Microsoft.Web.WebView2.Core.dll')" `
  "/reference:$(Join-Path $lib 'Microsoft.Web.WebView2.WinForms.dll')" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
  (Join-Path $here 'Logic.cs') (Join-Path $here 'ElsewhereWallpaper.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compiling the wallpaper program failed' }