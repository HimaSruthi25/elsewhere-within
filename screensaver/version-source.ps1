# Prints the path of a generated C# file holding the app version, which lives in
# one place: "version" in package.json. Every program is compiled with this file,
# so each knows its own version (shown in Settings, used by the updater).
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "package.json version '$version' must look like 1.2.3" }
$dir = Join-Path ([IO.Path]::GetTempPath()) 'ElsewhereWithin-build'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir 'Version.g.cs'
[IO.File]::WriteAllText($file, "// Generated from package.json by screensaver\version-source.ps1.`npublic static class BuildInfo { public const string Version = `"$version`"; }`n")
$file