# Builds release\ElsewhereWithin-Setup.exe: one file holding the finished
# screensaver (screensaver\out) and Microsoft's WebView2 Runtime bootstrapper.
# Usage, from the project folder:
#   powershell -ExecutionPolicy Bypass -File screensaver\build-installer.ps1
#   -SkipScreensaverBuild   package the existing screensaver\out as it is
param([switch]$SkipScreensaverBuild)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$out = Join-Path $here 'out'
$lib = Join-Path $here 'lib'
$release = Join-Path $root 'release'
$setup = Join-Path $release 'ElsewhereWithin-Setup.exe'

function Step($text) { Write-Host "== $text" }
function Assert-MicrosoftSigned($path) {
  $signature = Get-AuthenticodeSignature $path
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') {
    throw "$path is not validly signed by Microsoft ($($signature.Status))"
  }
}

# 1. The screensaver itself.
if (-not $SkipScreensaverBuild) { & (Join-Path $here 'build.ps1') }
foreach ($required in 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'site\index.html', 'site\scenes.json', 'ElsewhereWallpaper.exe') {
  if (-not (Test-Path (Join-Path $out $required))) { throw "screensaver\out is missing $required; run screensaver\build.ps1" }
}
if (@(Get-ChildItem $out -Filter 'Elsewhere - *.scr').Count -eq 0) { throw 'screensaver\out has no scene .scr files; run screensaver\build.ps1' }

# 2. Microsoft's WebView2 Runtime bootstrapper (small; downloads the runtime
#    only on PCs that lack it). Microsoft permits redistributing it.
$bootstrapper = Join-Path $lib 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path $bootstrapper)) {
  Step 'Downloading the WebView2 Runtime bootstrapper from Microsoft'
  Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper -UseBasicParsing
}
Assert-MicrosoftSigned $bootstrapper

# 3. Payload: exactly what the installed screensaver needs.
Step 'Packing the screensaver'
$payload = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereWithin-payload.zip'
if (Test-Path $payload) { Remove-Item $payload }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($out, $payload, [IO.Compression.CompressionLevel]::Optimal, $false)

# 4. The installer.
Step 'Compiling ElsewhereWithin-Setup.exe'
New-Item -ItemType Directory -Force $release | Out-Null
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
try {
  & $csc /nologo /target:winexe /platform:anycpu /optimize+ /warnaserror+ `
    "/out:$setup" "/win32manifest:$(Join-Path $here 'installer\setup.manifest')" `
    "/resource:$payload,payload.zip" "/resource:$bootstrapper,MicrosoftEdgeWebview2Setup.exe" `
    /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll `
    (Join-Path $here 'installer\Setup.cs')
  if ($LASTEXITCODE -ne 0) { throw 'Compiling the installer failed' }
} finally { Remove-Item $payload -ErrorAction SilentlyContinue }

$file = Get-Item $setup
Step ("Done: {0} ({1:N1} MB, SHA-256 {2})" -f $file.FullName, ($file.Length / 1MB), (Get-FileHash $setup -Algorithm SHA256).Hash)
