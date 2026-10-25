# Compiles Logic.cs with its tests and runs them. Exit code 0 = all passed.
# Usage:  powershell -ExecutionPolicy Bypass -File wallpaper\test.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereWallpaper-tests.exe'
& $csc /nologo /target:exe /warnaserror+ "/out:$exe" /reference:System.Drawing.dll (Join-Path $here 'Logic.cs') (Join-Path $here 'tests\LogicTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compiling the tests failed' }
try { & $exe; $code = $LASTEXITCODE } finally { Remove-Item $exe -ErrorAction SilentlyContinue }
if ($code -ne 0) { throw 'Wallpaper tests failed' }