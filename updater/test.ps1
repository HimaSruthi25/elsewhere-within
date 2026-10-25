# Compiles UpdateLogic.cs with its tests and runs them. Exit code 0 = all passed.
# Usage:  powershell -ExecutionPolicy Bypass -File updater\test.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$exe = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereUpdate-tests.exe'
& $csc /nologo /target:exe /warnaserror+ "/out:$exe" /reference:System.Web.Extensions.dll (Join-Path $here 'UpdateLogic.cs') (Join-Path $here 'tests\UpdateTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compiling the updater tests failed' }
try { & $exe; $code = $LASTEXITCODE } finally { Remove-Item $exe -ErrorAction SilentlyContinue }
if ($code -ne 0) { throw 'Updater tests failed' }