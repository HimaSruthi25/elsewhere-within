<#
  Elsewhere, Within - resource sampler (READ-ONLY)
  Records CPU and memory of the screensaver and ITS WebView2 processes every 10 s.
  Start it, leave the PC idle so the screensaver runs, then dismiss and press Ctrl+C.
    powershell -ExecutionPolicy Bypass -File .\ew-perf.ps1 -Minutes 12
  Output: diagnostics\EW-perf.csv
#>
param([int]$Minutes = 12, [int]$IntervalSeconds = 10)
$out = Join-Path $PSScriptRoot 'EW-perf.csv'
$cores = [Environment]::ProcessorCount
$prev = @{}
"time,process,pid,cpu_percent_of_pc,working_set_mb,private_mb" | Out-File $out -Encoding ascii
Write-Host "Sampling for $Minutes min into $out. Don't touch the PC; let the screensaver start." -ForegroundColor Green
$end = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $end) {
  $now = Get-Date
  $procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -like 'ElsewhereWithin*' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'ElsewhereWithin')
  }
  $total = 0.0; $mem = 0.0
  foreach ($p in $procs) {
    $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
    if (-not $gp) { continue }
    $cpuNow = $gp.TotalProcessorTime.TotalSeconds
    $pct = ''
    if ($prev.ContainsKey($p.ProcessId)) {
      $d = $cpuNow - $prev[$p.ProcessId].cpu; $t = ($now - $prev[$p.ProcessId].time).TotalSeconds
      if ($t -gt 0) { $pct = [math]::Round(100 * $d / $t / $cores, 2); $total += $pct }
    }
    $prev[$p.ProcessId] = @{ cpu = $cpuNow; time = $now }
    $ws = [math]::Round($gp.WorkingSet64 / 1MB, 1); $mem += $ws
    "{0},{1},{2},{3},{4},{5}" -f $now.ToString('HH:mm:ss'), $p.Name, $p.ProcessId, $pct, $ws, [math]::Round($gp.PrivateMemorySize64 / 1MB, 1) | Out-File $out -Append -Encoding ascii
  }
  Write-Host ("{0}  processes={1}  cpu%={2}  memMB={3}" -f $now.ToString('HH:mm:ss'), @($procs).Count, [math]::Round($total,1), [math]::Round($mem,0))
  Start-Sleep -Seconds $IntervalSeconds
}
Write-Host "Done: $out" -ForegroundColor Green
