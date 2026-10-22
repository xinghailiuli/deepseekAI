# 按依赖顺序拉起全部本地服务；已占端口的会跳过
param(
  [string]$Root = $(if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path } else { (Get-Location).Path }),
  [switch]$Quiet
)
$ErrorActionPreference = 'Continue'
$node = (Get-Command node).Source

function IsUp($port) {
  return (Test-NetConnection 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue)
}
function StartNode($name, $script, $port) {
  if ($port -and (IsUp $port)) { if (-not $Quiet) { Write-Host "  [跳过] $name 已在 :$port" }; return }
  if (-not (Test-Path $script)) { Write-Host "  [缺文件] $name -> $script" -ForegroundColor Yellow; return }
  Start-Process -FilePath $node -ArgumentList $script -WorkingDirectory (Split-Path $script) -WindowStyle Hidden
  if (-not $Quiet) { Write-Host "  [启动] $name" }
}
function StartHiddenPs1($name, $script) {
  if (-not (Test-Path $script)) { Write-Host "  [缺文件] $name -> $script" -ForegroundColor Yellow; return }
  Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$script -WindowStyle Hidden
  if (-not $Quiet) { Write-Host "  [启动] $name" }
}

if (-not $Quiet) { Write-Host "== 启动本地服务 ==" -ForegroundColor Cyan }

StartNode 'bot-daemon(Minecraft)'      (Join-Path $Root 'qq-bot/features/玩游戏/bot-daemon.mjs') 3200
StartNode 'pcgame-service'             (Join-Path $Root 'qq-bot/features/电脑游戏/pcgame-service.mjs') 3205
StartHiddenPs1 'qq-bridge'             (Join-Path $Root 'qq-bot/scripts/start-qq-bot.ps1')

if (-not $Quiet) {
  Write-Host ""
  Start-Sleep -Seconds 8
  Write-Host "== 端口检查 ==" -ForegroundColor Cyan
  foreach ($p in 3100,3200,3205,13000,19387) {
    $s = if (IsUp $p) { 'UP  ' } else { 'DOWN' }
    Write-Host ("  {0}  :{1}" -f $s, $p)
  }
  Write-Host ""
  Write-Host "  3100 桥接 / 3200 bot / 3205 pcgame / 13000 SnowLuma / 19387 DSH"
  Write-Host "  桥接没起来看日志：qq-bot\qq-bridge\state\bridge.log" -ForegroundColor DarkGray
}
