#requires -Version 5.1
<#
  restart-dsh.ps1 —— 重启 DeepSeek Harness 桌面版（让它重新加载 profile 插件 / MCP / 工具守卫）

  重要：本脚本必须由「计划任务」启动（QQWhale-DshRestart），不能由 DSH 内部的工具进程启动。
  原因：脚本要杀掉所有 "DeepSeek Harness" 进程，如果它自己是 DSH 的子孙进程，会把自己也杀掉，
  于是日志停在杀掉前两个 PID、DSH 只死一半 —— 2026-10-24 21:05 那次就是这么卡住的。

  用法（安全）：
    schtasks /run /tn "QQWhale-DshRestart"
#>
param(
  [int]$DelaySeconds = 0
)
$ErrorActionPreference = 'Continue'
$log = 'D:\deepseenhanress\qq-bot\state\logs\dsh-restart.log'
$status = 'D:\deepseenhanress\qq-bot\state\dsh-restart-status.json'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log($m) { ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) | Add-Content -Path $log -Encoding UTF8 }
function Save-Status([hashtable]$h) {
  try { [IO.File]::WriteAllText($status, ($h | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) } catch {}
}

$exe = 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$script:dshName = 'DeepSeek Harness'

Log '=== restart-dsh 开始（计划任务模式）==='
Save-Status @{ phase = 'start'; at = (Get-Date).ToString('s') }

if ($DelaySeconds -gt 0) { Log "延迟 $DelaySeconds 秒"; Start-Sleep -Seconds $DelaySeconds }

# 1) 杀掉全部 DSH 进程，最多 5 轮
$killed = 0
for ($round = 1; $round -le 5; $round++) {
  $procs = @(Get-Process -Name $dshName -ErrorAction SilentlyContinue)
  if ($procs.Count -eq 0) { break }
  Log ("第 $round 轮停止进程: " + (($procs | ForEach-Object { $_.Id }) -join ','))
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed++ } catch { Log ("停止失败 PID=" + $p.Id + ": " + $_.Exception.Message) }
  }
  Start-Sleep -Seconds 3
}
$left = @(Get-Process -Name $dshName -ErrorAction SilentlyContinue)
Log ("已停止 $killed 个进程；剩余 " + $left.Count)
Save-Status @{ phase = 'stopped'; killed = $killed; left = $left.Count; at = (Get-Date).ToString('s') }

# 2) 等 19387 真正释放（最多 30 秒）
$freed = $false
for ($i = 0; $i -lt 15; $i++) {
  if (-not (Test-NetConnection 127.0.0.1 -Port 19387 -InformationLevel Quiet -WarningAction SilentlyContinue)) { $freed = $true; break }
  Start-Sleep -Seconds 2
}
Log ("端口 19387 已释放 = $freed")

# 3) 重新启动
if (-not (Test-Path $exe)) { Log ("找不到可执行文件: $exe"); Save-Status @{ phase = 'failed'; reason = 'exe-missing' }; exit 1 }
try { Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe); Log '已启动 DSH' }
catch { Log ("启动失败: " + $_.Exception.Message); Save-Status @{ phase = 'failed'; reason = 'spawn'; error = $_.Exception.Message }; exit 1 }

# 4) 等端口就绪（最多 120 秒）
$up = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  if (Test-NetConnection 127.0.0.1 -Port 19387 -InformationLevel Quiet -WarningAction SilentlyContinue) { $up = $true; break }
}
$owner = $null
try {
  $c = Get-NetTCPConnection -LocalPort 19387 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $owner = $c.OwningProcess }
} catch {}
Log ("DSH 19387 就绪 = $up；监听 PID = $owner")
Save-Status @{ phase = 'up'; ready = $up; listenPid = $owner; at = (Get-Date).ToString('s') }

# 5) 手机 adb（USB 优先，否则上次成功的无线地址）
$phone = 'D:\deepseenhanress\qq-bot\scripts\connect-phone-adb.ps1'
if (Test-Path $phone) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phone 2>&1 | Out-Null; Log '已执行手机 adb 连接' }
  catch { Log ("手机连接脚本异常: " + $_.Exception.Message) }
}

# 6) 看门狗（桥接 / Magpie / 游戏服务）
$wd = 'D:\deepseenhanress\qq-bot\scripts\whale-watchdog.ps1'
if (Test-Path $wd) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wd 2>&1 | Out-Null; Log '已执行看门狗' }
  catch { Log ("看门狗异常: " + $_.Exception.Message) }
}

# 7) MCP 自查：同一 MCP 出现两份就是预设里重复挂了
$mcps = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'diary-mcp|heybox-mcp|android-mcp|bili-mcp' }
$counts = @{}
foreach ($m in $mcps) {
  $n = if ($m.CommandLine -match 'diary-mcp') { 'diary' } elseif ($m.CommandLine -match 'heybox-mcp') { 'heybox' } elseif ($m.CommandLine -match 'android-mcp') { 'android' } else { 'bili' }
  $counts[$n] = [int]$counts[$n] + 1
}
Log ("MCP 实例: " + (($counts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' '))
Log '=== restart-dsh 结束 ==='
Save-Status @{ phase = 'done'; ready = $up; listenPid = $owner; mcp = $counts; at = (Get-Date).ToString('s') }
