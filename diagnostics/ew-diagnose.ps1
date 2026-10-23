<#
  Elsewhere, Within - Phase 0 screensaver diagnostics (READ-ONLY)
  ----------------------------------------------------------------
  Collects evidence for: "screensaver is selected but does not start after 1 minute idle".
  It changes NOTHING on your system. It only reads settings, files and logs.

  HOW TO RUN (PowerShell as Administrator, so 'powercfg /requests' works):
    cd <folder containing this file>
    powershell -ExecutionPolicy Bypass -File .\ew-diagnose.ps1
  Optional idle test (don't touch mouse/keyboard for ~90 s):
    powershell -ExecutionPolicy Bypass -File .\ew-diagnose.ps1 -IdleTest

  Output: EW-diagnostics.txt next to this script (inside the project folder, so Claude can read it).
#>
param(
  [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent),
  [switch]$IdleTest,
  [int]$IdleSeconds = 90
)

$ErrorActionPreference = 'Continue'
$out = New-Object System.Collections.Generic.List[string]
function W([string]$s) { $out.Add($s); Write-Host $s }
function Section([string]$t) { W ''; W ('=' * 70); W "## $t"; W ('=' * 70) }
function Dump($obj) { W (($obj | Out-String -Width 220).TrimEnd()) }

Add-Type -ErrorAction SilentlyContinue @"
using System;
using System.Runtime.InteropServices;
public static class EwNative {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint a, uint b, ref int c, uint d);
  public static uint IdleSeconds() {
    var l = new LASTINPUTINFO(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l);
    return ((uint)Environment.TickCount - l.dwTime) / 1000;
  }
  public static int Spi(uint action) { int v = 0; SystemParametersInfo(action, 0, ref v, 0); return v; }
}
"@

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Section 'Run info'
W ("Timestamp      : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
W ("Running as admin: $isAdmin")
$os = Get-CimInstance Win32_OperatingSystem
W ("OS             : $($os.Caption) $($os.Version) build $($os.BuildNumber)")
W ("PowerShell     : $($PSVersionTable.PSVersion)")

Section '1. Screensaver settings (registry, current user)'
$desk = Get-ItemProperty 'HKCU:\Control Panel\Desktop' -ErrorAction SilentlyContinue
W ("ScreenSaveActive    : $($desk.ScreenSaveActive)   (1 = on)")
W ("ScreenSaveTimeOut   : $($desk.ScreenSaveTimeOut)  (seconds)")
W ("ScreenSaverIsSecure : $($desk.ScreenSaverIsSecure) (1 = show sign-in on resume)")
W ("SCRNSAVE.EXE        : $($desk.'SCRNSAVE.EXE')")

Section '2. Live system values (what Windows is actually using)'
# SPI_GETSCREENSAVEACTIVE=0x10, SPI_GETSCREENSAVETIMEOUT=0x0E, SPI_GETSCREENSAVERRUNNING=0x72
W ("SPI ScreenSaveActive  : " + [EwNative]::Spi(0x10))
W ("SPI ScreenSaveTimeout : " + [EwNative]::Spi(0x0E) + " s")
W ("SPI ScreensaverRunning: " + [EwNative]::Spi(0x72))
W ("Current idle seconds  : " + [EwNative]::IdleSeconds())

Section '3. Group Policy overrides (these beat the Settings dialog)'
foreach ($p in 'HKCU:\Software\Policies\Microsoft\Windows\Control Panel\Desktop',
               'HKLM:\Software\Policies\Microsoft\Windows\Control Panel\Desktop') {
  if (Test-Path $p) { W "$p :"; Dump (Get-ItemProperty $p) } else { W "$p : (none)" }
}

Section '4. The registered .scr file'
$scr = $desk.'SCRNSAVE.EXE'
if ($scr) {
  $exists = Test-Path -LiteralPath $scr
  W ("Path exists       : $exists")
  W ("Path has spaces   : " + ($scr -match ' '))
  W ("Extension         : " + [IO.Path]::GetExtension($scr))
  if ($exists) {
    $f = Get-Item -LiteralPath $scr
    W ("Size (bytes)      : $($f.Length)")
    W ("Modified          : $($f.LastWriteTime)")
    W ("FileVersion       : $($f.VersionInfo.FileVersion)")
    W ("ProductName       : $($f.VersionInfo.ProductName)")
    W ("SHA-256           : " + (Get-FileHash -LiteralPath $scr -Algorithm SHA256).Hash)
    $sig = Get-AuthenticodeSignature -LiteralPath $scr
    W ("Signature status  : $($sig.Status)")
    W "Other files next to it:"
    Dump (Get-ChildItem -LiteralPath $f.DirectoryName | Select-Object Name, Length, LastWriteTime | Select-Object -First 40)
  }
} else { W 'No screensaver registered for this user.' }

Section '5. Any Elsewhere-related .scr / install folders'
$candidates = @("$env:WINDIR\System32", "$env:WINDIR\SysWOW64", "$env:ProgramFiles", "${env:ProgramFiles(x86)}", "$env:LOCALAPPDATA\Programs", "$env:LOCALAPPDATA")
foreach ($c in $candidates) {
  if (Test-Path $c) {
    Get-ChildItem -Path $c -Filter '*.scr' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'elsewhere|within|stillwater' } | ForEach-Object { W ("SCR: " + $_.FullName + "  (" + $_.Length + " bytes, " + $_.LastWriteTime + ")") }
    Get-ChildItem -Path $c -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'elsewhere|within|stillwater' } | ForEach-Object { W ("DIR: " + $_.FullName) }
  }
}
W 'Uninstall entries:'
Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -match 'elsewhere|within|stillwater' } |
  ForEach-Object { Dump ($_ | Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString, Publisher) }

Section '6. What is keeping the PC awake (power requests)'
if ($isAdmin) {
  Dump (powercfg /requests)
  W '--- Request overrides ---'
  Dump (powercfg /requestsoverride)
} else { W 'SKIPPED: re-run PowerShell as Administrator to capture powercfg /requests (very important).' }

Section '7. WebView2 runtime (only matters if the app is web-based)'
$wv = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
W ("WebView2 version: " + $(if ($wv) { $wv.pv } else { 'not found (machine-wide)' }))

Section '8. Crash / error events, last 3 days'
try {
  $ev = Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = (Get-Date).AddDays(-3); Id = 1000, 1001, 1026 } -ErrorAction Stop |
        Where-Object { $_.Message -match 'elsewhere|within|\.scr|msedgewebview2|electron|tauri' } | Select-Object -First 20
  if ($ev) { foreach ($e in $ev) { W ("[$($e.TimeCreated)] Id $($e.Id): " + (($e.Message -split "`n" | Select-Object -First 6) -join ' | ')) } }
  else { W 'No matching crash events.' }
} catch { W "Could not read events: $($_.Exception.Message)" }

Section '9. Project folder'
W "Root: $ProjectRoot"
if (Test-Path $ProjectRoot) {
  $skip = '\\(node_modules|\.git|target|obj|\.next|\.cache)(\\|$)'
  W '--- Tree (depth 3, build/dependency folders hidden) ---'
  Get-ChildItem -Path $ProjectRoot -Recurse -Depth 3 -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $skip } | Select-Object -First 400 |
    ForEach-Object { W ($_.FullName.Substring($ProjectRoot.Length) + $(if ($_.PSIsContainer) { '\' } else { "  ($($_.Length) b)" })) }

  W ''
  W '--- Key config files (contents) ---'
  $names = 'package.json','tauri.conf.json','Cargo.toml','*.csproj','*.vcxproj','*.iss','*.nsi','electron-builder.*','forge.config.*','*.wxs','README*'
  $files = Get-ChildItem -Path $ProjectRoot -Recurse -Depth 4 -Include $names -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch $skip } | Select-Object -First 15
  foreach ($f in $files) { W ''; W ">>> $($f.FullName)"; Get-Content -LiteralPath $f.FullName -TotalCount 150 | ForEach-Object { W $_ } }

  W ''
  W '--- Code lines that handle screensaver arguments (/s /p /c) ---'
  $src = Get-ChildItem -Path $ProjectRoot -Recurse -File -Include *.cs,*.cpp,*.c,*.h,*.rs,*.ts,*.js,*.mjs,*.py,*.go -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch $skip }
  $src | Select-String -Pattern '"/s"|"/p"|"/c"|''/s''|''/p''|''/c''|argv|GetCommandLineArgs|process\.argv|std::env::args|\.scr\b|SCRNSAVE' -ErrorAction SilentlyContinue |
    Select-Object -First 80 | ForEach-Object { W ("$($_.Path.Substring($ProjectRoot.Length)):$($_.LineNumber): $($_.Line.Trim())") }

  $inst = Join-Path $ProjectRoot 'release\ElsewhereWithin-Setup.exe'
  if (Test-Path $inst) { W ''; W ("Installer SHA-256: " + (Get-FileHash $inst -Algorithm SHA256).Hash + "  size " + (Get-Item $inst).Length) }
  W ''
  W '--- Git status ---'
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Push-Location $ProjectRoot; Dump (git log --oneline -n 10 2>&1); Dump (git status --short 2>&1 | Select-Object -First 40); Dump (git remote -v 2>&1); Pop-Location
  } else { W 'git not installed / not on PATH' }
} else { W 'Project folder NOT FOUND at this path.' }

Section '10. Dev tools present'
foreach ($t in 'git','node','npm','dotnet','cargo','rustc','python','code','gh','iscc','makensis') {
  $c = Get-Command $t -ErrorAction SilentlyContinue
  W ("{0,-9}: {1}" -f $t, $(if ($c) { $c.Source } else { '-' }))
}

Section '10b. The screensaver''s own logs'
$appLog = Join-Path $env:LOCALAPPDATA 'ElsewhereWithin\screensaver.log'
if (Test-Path $appLog) { W ">>> $appLog (last 200 lines)"; Get-Content $appLog -Tail 200 | ForEach-Object { W $_ } }
else { W "No screensaver log at $appLog  -> the .scr has NEVER run for this user (not even Preview)." }
$setupLog = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereWithin-Setup.log'
if (Test-Path $setupLog) { W ''; W ">>> $setupLog"; Get-Content $setupLog -Tail 60 | ForEach-Object { W $_ } } else { W 'No setup log.' }
$inst = Join-Path $env:LOCALAPPDATA 'Programs\ElsewhereWithin'
W ''
W "Installed folder: $inst  exists=$(Test-Path $inst)"
if (Test-Path $inst) { Dump (Get-ChildItem $inst | Select-Object Name, Length, LastWriteTime) }
$sp = Join-Path $inst 'ElsewhereWithin.scr'
if (Test-Path $sp) {
  W ("Installed .scr SHA-256: " + (Get-FileHash $sp -Algorithm SHA256).Hash)
  W ("8.3 short path: " + (New-Object -ComObject Scripting.FileSystemObject).GetFile($sp).ShortPath)
}
W ("8.3 name creation on C: : " + ((fsutil 8dot3name query C: 2>&1) -join ' '))

if ($IdleTest) {
  Section "11. Idle test ($IdleSeconds s) - DO NOT touch mouse/keyboard"
  W 'If idle seconds drop back toward 0 while you are not touching anything, something is faking input.'
  $end = (Get-Date).AddSeconds($IdleSeconds)
  while ((Get-Date) -lt $end) {
    W ("{0}  idle={1,4}s  screensaverRunning={2}" -f (Get-Date -Format 'HH:mm:ss'), [EwNative]::IdleSeconds(), [EwNative]::Spi(0x72))
    Start-Sleep -Seconds 5
  }
}

$path = Join-Path $PSScriptRoot 'EW-diagnostics.txt'
$out | Out-File -FilePath $path -Encoding utf8
Write-Host ''
Write-Host "Saved: $path  - tell Claude it's done." -ForegroundColor Green
