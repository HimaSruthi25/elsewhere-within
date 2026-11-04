<#
  Elsewhere, Within - per-scene cost of the live wallpaper (reads only, changes nothing permanent)
  For each scene: switches the wallpaper to it, shows the desktop, waits for it to settle,
  then measures CPU, memory and GPU of the wallpaper + its WebView2 processes.
  Your chosen scene is put back at the end.

  Run (wallpaper installed; keep your hands off the mouse while it runs, ~1 min per scene):
    powershell -ExecutionPolicy Bypass -File .\ew-scene-perf.ps1
  Only some scenes:
    powershell -ExecutionPolicy Bypass -File .\ew-scene-perf.ps1 -Scenes ginkgo-courtyard,lakeside-blocks
  Output: EW-scene-perf.csv next to this script (send it to Claude).
#>
param([string[]]$Scenes, [int]$SettleSeconds = 15, [int]$MeasureSeconds = 20)

$ErrorActionPreference = 'Stop'
$app   = Join-Path $env:LOCALAPPDATA 'Programs\ElsewhereWithin'
$exe   = Join-Path $app 'ElsewhereWallpaper.exe'
$json  = Join-Path $app 'site\scenes.json'
$key   = 'HKCU:\Software\ElsewhereWithin\Wallpaper'
$out   = Join-Path $PSScriptRoot 'EW-scene-perf.csv'
$cores = [Environment]::ProcessorCount
if (-not (Test-Path $exe)) { throw "Wallpaper not found at $exe" }

$all = (Get-Content $json -Raw | ConvertFrom-Json).scenes | ForEach-Object { $_.id }
if (-not $Scenes) { $Scenes = $all }
$original = (Get-ItemProperty $key -Name Scene -ErrorAction SilentlyContinue).Scene
$shell = New-Object -ComObject Shell.Application

function Get-WallpaperProcs {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'ElsewhereWallpaper.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'WebView2-wallpaper')
  }
}
function Stop-Wallpaper {
  if (Get-Process ElsewhereWallpaper -ErrorAction SilentlyContinue) {
    & $exe /quit
    for ($i = 0; $i -lt 20 -and (Get-Process ElsewhereWallpaper -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
  }
}
function Get-GpuPercent($ids) {
  try {
    $samples = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage' -ErrorAction Stop).CounterSamples
    $sum = 0.0
    foreach ($s in $samples) { if ($s.InstanceName -match 'pid_(\d+)_' -and $ids -contains [int]$Matches[1]) { $sum += $s.CookedValue } }
    return [math]::Round($sum, 1)
  } catch { return '' }
}

"scene,cpu_percent_of_pc,gpu3d_percent,private_mb,working_set_mb,processes" | Out-File $out -Encoding ascii
Write-Host "Measuring $($Scenes.Count) scenes (~$([math]::Round(($SettleSeconds+$MeasureSeconds+8)*$Scenes.Count/60)) min). Don't touch the mouse." -ForegroundColor Green

foreach ($id in $Scenes) {
  Stop-Wallpaper
  Set-ItemProperty $key -Name Scene -Value $id
  Start-Process $exe
  Start-Sleep -Seconds 3
  $shell.MinimizeAll()               # show the desktop so the wallpaper runs (not frozen)
  Start-Sleep -Seconds $SettleSeconds

  $procs = @(Get-WallpaperProcs); $ids = $procs | ForEach-Object { [int]$_.ProcessId }
  $t0 = @{}; foreach ($i in $ids) { $p = Get-Process -Id $i -ErrorAction SilentlyContinue; if ($p) { $t0[$i] = $p.TotalProcessorTime.TotalSeconds } }
  $gpu = @(); $w0 = Get-Date
  for ($k = 0; $k -lt [math]::Max(1, [int]($MeasureSeconds / 5)); $k++) { Start-Sleep -Seconds 4; $gpu += Get-GpuPercent $ids }
  $sec = ((Get-Date) - $w0).TotalSeconds

  $cpu = 0.0; $priv = 0.0; $ws = 0.0
  foreach ($i in $ids) {
    $p = Get-Process -Id $i -ErrorAction SilentlyContinue; if (-not $p) { continue }
    if ($t0.ContainsKey($i)) { $cpu += ($p.TotalProcessorTime.TotalSeconds - $t0[$i]) }
    $priv += $p.PrivateMemorySize64; $ws += $p.WorkingSet64
  }
  $gpuNums = @($gpu | Where-Object { $_ -ne '' })
  $gpuAvg = if ($gpuNums.Count) { [math]::Round(($gpuNums | Measure-Object -Average).Average, 1) } else { '' }
  $row = '{0},{1},{2},{3},{4},{5}' -f $id, [math]::Round(100 * $cpu / $sec / $cores, 1), $gpuAvg, [math]::Round($priv / 1MB), [math]::Round($ws / 1MB), $ids.Count
  $row | Out-File $out -Append -Encoding ascii
  Write-Host $row
}

Stop-Wallpaper
if ($original) { Set-ItemProperty $key -Name Scene -Value $original }
Start-Process $exe
$shell.UndoMinimizeALL()
Write-Host "Done. Your scene is back. Results: $out" -ForegroundColor Green
