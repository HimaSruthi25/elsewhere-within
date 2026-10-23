# Builds the Elsewhere, Within screensaver into screensaver\out:
#   one "Elsewhere - <Scene title>.scr" per scene, the three WebView2 DLLs it needs, and site\ (the
#   scene library, from library\).
# Usage, from the project folder:  powershell -ExecutionPolicy Bypass -File screensaver\build.ps1
# Needs: Node/npm (already used by the website) and Windows' built-in C# compiler.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$out = Join-Path $here 'out'
$lib = Join-Path $here 'lib'

# Microsoft's official WebView2 package from nuget.org, pinned by version and hash.
$webView2Version = '1.0.4258.31'
$webView2Sha512 = 'HlGVwvyP/IWiXAU8K57Vmg59khY3DWMOxMnH4AHusFRy0/vDAjKItXUIVNXiXXaq4CLfSZyNUic1wOIlnPLsPQ=='
$webView2Files = [ordered]@{
  'Microsoft.Web.WebView2.Core.dll'     = 'lib/net462/Microsoft.Web.WebView2.Core.dll'
  'Microsoft.Web.WebView2.WinForms.dll' = 'lib/net462/Microsoft.Web.WebView2.WinForms.dll'
  'WebView2Loader.dll'                  = 'runtimes/win-x64/native/WebView2Loader.dll'
}

function Step($text) { Write-Host "== $text" }

function Assert-MicrosoftSigned($path) {
  $signature = Get-AuthenticodeSignature $path
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') {
    throw "$path is not validly signed by Microsoft ($($signature.Status))"
  }
}

# 1. WebView2 DLLs (downloaded once, then reused from screensaver\lib).
$missing = @($webView2Files.Keys | Where-Object { -not (Test-Path (Join-Path $lib $_)) })
if ($missing.Count -gt 0) {
  Step "Downloading Microsoft.Web.WebView2 $webView2Version from nuget.org"
  New-Item -ItemType Directory -Force $lib | Out-Null
  $package = Join-Path ([IO.Path]::GetTempPath()) "microsoft.web.webview2.$webView2Version.nupkg"
  Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$webView2Version/microsoft.web.webview2.$webView2Version.nupkg" -OutFile $package -UseBasicParsing
  $hash = [Convert]::ToBase64String([Security.Cryptography.SHA512]::Create().ComputeHash([IO.File]::ReadAllBytes($package)))
  if ($hash -ne $webView2Sha512) { Remove-Item $package; throw 'Downloaded WebView2 package does not match the pinned hash' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($package)
  try {
    foreach ($name in $webView2Files.Keys) {
      $entry = $zip.GetEntry($webView2Files[$name])
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $lib $name), $true)
    }
  } finally { $zip.Dispose(); Remove-Item $package }
}
foreach ($name in $webView2Files.Keys) { Assert-MicrosoftSigned (Join-Path $lib $name) }

# 2. The scene library (library\), built into out\site. screensaver\web is the
# old page: kept, but no longer built.
Step 'Building the scene library'
Push-Location $root
try {
  & npx.cmd vite build --config library/vite.config.js --logLevel warn
  if ($LASTEXITCODE -ne 0) { throw 'Scene library build failed' }
} finally { Pop-Location }
# 3. The .scr files: one small copy of the program per scene, named
#    "Elsewhere - <Scene title>.scr", so each scene is its own entry in Screen
#    Saver Settings. They share site\ and the DLLs; each finds its scene by its file name.
Step 'Compiling the screensaver, one .scr per scene'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "C# compiler not found at $csc" }
foreach ($name in $webView2Files.Keys) { Copy-Item (Join-Path $lib $name) $out -Force }
$scenesFile = Join-Path $out 'site\scenes.json'
if (-not (Test-Path $scenesFile)) { throw 'site\scenes.json is missing; the library build did not write it' }
$scenes = Get-Content $scenesFile -Raw | ConvertFrom-Json
$temp = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereWithin-build'
New-Item -ItemType Directory -Force $temp | Out-Null
$exe = Join-Path $temp 'ElsewhereWithin.exe'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /warnaserror+ `
  "/out:$exe" `
  "/reference:$(Join-Path $lib 'Microsoft.Web.WebView2.Core.dll')" `
  "/reference:$(Join-Path $lib 'Microsoft.Web.WebView2.WinForms.dll')" `
  /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
  (Join-Path $here 'ElsewhereWithin.cs')
if ($LASTEXITCODE -ne 0) { throw 'Compiling the screensaver failed' }
Get-ChildItem $out -Filter *.scr | Remove-Item # including the old single ElsewhereWithin.scr
foreach ($scene in $scenes.scenes) {
  Copy-Item $exe (Join-Path $out "Elsewhere - $($scene.title).scr")
}
Remove-Item $temp -Recurse -Force

$size = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Step ("Done: {0} scene(s) in {1} ({2:N1} MB in total)" -f @($scenes.scenes).Count, $out, $size)