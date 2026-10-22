# 停掉本地服务（只停本包启动的 node 进程，不动 DSH / 容器）
param(
  [string]$Root = $(if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path } else { (Get-Location).Path })
)
$ErrorActionPreference = 'Continue'
$patterns = @('bridge\.js', 'bot-daemon\.mjs', 'pcgame-service\.mjs', 'xiaoxiaole', 'game-mcp\.mjs',
              'mc-mcp\.mjs', 'heybox-mcp\.mjs', 'bili-mcp\.mjs', 'github-mcp\.mjs', 'pcgame-mcp\.mjs')

Write-Host "== 停止本地服务 ==" -ForegroundColor Cyan
$killed = 0
foreach ($proc in (Get-CimInstance Win32_Process -Filter "Name='node.exe'")) {
  $cmd = [string]$proc.CommandLine
  foreach ($pat in $patterns) {
    if ($cmd -match $pat) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Write-Host ("  [停] {0}  {1}" -f $proc.ProcessId, $pat)
        $killed++
      } catch {
        Write-Host ("  [失败] {0}  {1}" -f $proc.ProcessId, $_.Exception.Message) -ForegroundColor Yellow
      }
      break
    }
  }
}
Write-Host ("共停止 {0} 个进程。SnowLuma 容器与 DSH 不受影响（要停用 docker stop / 关 DSH）。" -f $killed)
