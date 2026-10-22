# 每 3 分钟巡检：掉哪个端口拉哪个。由计划任务 QQWhale-Guard 调用（配 run-hidden.vbs 避免闪窗）
param(
  [string]$Root = $(if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path } else { (Get-Location).Path }),
  [int[]]$Ports = @(3100, 3200, 3205),
  [switch]$Log
)
$ErrorActionPreference = 'Continue'
$logFile = Join-Path $Root 'qq-bot\logs\watchdog.log'
$logDir = Split-Path $logFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log($msg) {
  if (-not $Log) { return }
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function IsUp($port) {
  return (Test-NetConnection 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)
}

$down = @($Ports | Where-Object { -not (IsUp $_) })
if ($down.Count -eq 0) { Write-Log '全部在线'; exit 0 }
Write-Log ("掉线端口: " + ($down -join ','))

# 缺哪个起哪个（start-all 内部也会跳过在线的）
& (Join-Path $PSScriptRoot 'start-all.ps1') -Root $Root -Quiet

# SnowLuma 容器兜底（Docker 在就跑）
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  $running = (& docker ps --filter "name=qqsl-snowluma" --format "{{.Names}}" 2>$null)
  if (-not $running) {
    Write-Log 'SnowLuma 容器不在运行，尝试启动'
    & docker start qqsl-snowluma 2>$null | Out-Null
  }
}
Write-Log '已尝试恢复'
