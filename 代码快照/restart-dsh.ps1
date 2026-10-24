#requires -Version 5.1
<#
  restart-dsh.ps1 —— 重启 DeepSeek Harness 桌面版（用于让其重新加载 profile 插件与工具守卫）
  - 只重启 DSH 进程，不动 WSL / Docker 容器 / 容器里的 QQ / qq-bridge
  - 由计划任务在独立进程里执行，避免随 DSH 一起被杀
#>
param(
  # 延迟多少秒后再动手：给当前对话留时间把消息发出去
  [int]$DelaySeconds = 3
)
$ErrorActionPreference = 'Continue'
$log = 'D:\deepseenhanress\qq-bot\state\logs\dsh-restart.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log($m) { ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) | Add-Content -Path $log -Encoding UTF8 }

$exe = 'C:\Users\Administrator\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
Log '=== restart-dsh 开始 ==='

if ($DelaySeconds -gt 0) { Log ('延迟 ' + $DelaySeconds + ' 秒后重启'); Start-Sleep -Seconds $DelaySeconds }

$procs = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
Log ('发现 DSH 进程: ' + ($procs | ForEach-Object { $_.Id } | Sort-Object) -join ',')
foreach ($p in $procs) {
  try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Log ("已停止 PID=" + $p.Id) } catch { Log ("停止失败 PID=" + $p.Id + ": " + $_.Exception.Message) }
}

Start-Sleep -Seconds 6
$left = Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue
if ($left) {
  foreach ($p in $left) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
  Start-Sleep -Seconds 4
  Log ('二次清理后剩余: ' + ((Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count))
}

if (-not (Test-Path $exe)) { Log ('找不到 DSH 可执行文件: ' + $exe); exit 1 }
try {
  Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
  Log '已重新启动 DSH'
} catch {
  Log ('启动失败: ' + $_.Exception.Message)
  exit 1
}

Start-Sleep -Seconds 8
Log ('重启后进程数: ' + ((Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Measure-Object).Count))

# 等 DSH 端口就绪（最多 120 秒），再继续恢复其余服务
$up = $false
for ($i = 0; $i -lt 60; $i += 1) {
  Start-Sleep -Seconds 2
  if (Test-NetConnection 127.0.0.1 -Port 19387 -InformationLevel Quiet -WarningAction SilentlyContinue) { $up = $true; break }
}
Log ('DSH 19387 就绪 = ' + $up)

# 连手机（USB 优先，否则上次成功的无线地址）
$phone = 'D:\deepseenhanress\qq-bot\scripts\connect-phone-adb.ps1'
if (Test-Path $phone) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $phone 2>&1 | Out-Null; Log '已执行手机 adb 连接' } catch { Log ('手机连接脚本异常: ' + $_.Exception.Message) }
}

# 恢复桥接 / Magpie / 游戏服务
$wd = 'D:\deepseenhanress\qq-bot\scripts\whale-watchdog.ps1'
if (Test-Path $wd) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $wd 2>&1 | Out-Null; Log '已执行看门狗' } catch { Log ('看门狗异常: ' + $_.Exception.Message) }
}

Log '=== restart-dsh 结束 ==='
