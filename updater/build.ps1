# Compiles ElsewhereUpdate.exe into screensaver\out (installed with the app).
# screensaver\build.ps1 runs this at the end.
# Usage:  powershell -ExecutionPolicy Bypass -File updater\build.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$out = Join-Path $root 'screensaver\out'
if (-not (Test-Path $out)) { throw "$out is missing; run screensaver\build.ps1 first" }
$versionSource = & (Join-Path $root 'screensaver\version-source.ps1')
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "C# compiler not found at $csc" }
Write-Host '== Compiling ElsewhereUpdate.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /warnaserror+ `
  "/out:$(Join-Path $out 'ElsewhereUpdate.exe')" `
  /reference:System.Web.Extensions.dll /reference:System.Management.dll `
  (Join-Path $here 'UpdateLogic.cs') (Join-Path $here 'ElsewhereUpdate.cs') $versionSource
if ($LASTEXITCODE -ne 0) { throw 'Compiling the updater failed' }