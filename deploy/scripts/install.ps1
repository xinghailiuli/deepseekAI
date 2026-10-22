param(
  [string]$Root = $(if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path } else { (Get-Location).Path })
)
$ErrorActionPreference = 'Continue'
$ok = 0; $bad = 0

Write-Host "== 1. 环境体检 ==" -ForegroundColor Cyan
function Check($name, $cmd, $hint) {
  $p = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($p) { Write-Host ("  [OK]   {0,-10} {1}" -f $name, $p.Source); $script:ok++ }
  else    { Write-Host ("  [缺]   {0,-10} {1}" -f $name, $hint); $script:bad++ }
}
Check 'node'   'node'   '装 Node.js 20+  https://nodejs.org'
Check 'npm'    'npm'    '随 Node 一起装；不在 PATH 时用 node "...\npm-cli.js"'
Check 'git'    'git'    '装 Git for Windows'
Check 'docker' 'docker' '装 Docker Desktop（只为跑 SnowLuma）'

Write-Host ""
Write-Host "== 2. 目录脚手架 ==" -ForegroundColor Cyan
$dirs = @(
  'qq-bot/qq-bridge/state', 'qq-bot/qq-bridge/roles', 'qq-bot/qq-bridge/audio',
  'qq-bot/features/写作/截图', 'qq-bot/features/写作/图片',
  'qq-bot/features/小黑盒', 'qq-bot/features/电脑游戏', 'qq-bot/features/小游戏',
  'qq-bot/features/玩游戏', 'qq-bot/features/GitHub', 'qq-bot/scripts',
  '鲸鱼档案/人物卡', '鲸鱼档案/日记', '鲸鱼档案/喜好'
)
foreach ($d in $dirs) {
  $p = Join-Path $Root $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null; Write-Host "  + $d" }
}
Write-Host "  目录就绪：$Root"

Write-Host ""
Write-Host "== 3. 配置文件 ==" -ForegroundColor Cyan
$cfg = Join-Path $Root 'qq-bot/qq-bridge/config.json'
if (-not (Test-Path $cfg)) {
  Copy-Item (Join-Path $Root 'deploy/config/config.example.json') $cfg
  Write-Host "  已生成 config.json —— 必须改：ownerQQ / allow.private / allow.groups" -ForegroundColor Yellow
} else {
  Write-Host "  config.json 已存在，跳过（不覆盖你的配置）"
}
$role = Join-Path $Root 'qq-bot/qq-bridge/roles/鲸鱼娘.md'
if (-not (Test-Path $role)) {
  Copy-Item (Join-Path $Root 'deploy/config/role-template.md') $role
  Write-Host "  已生成角色卡 roles/鲸鱼娘.md"
}

Write-Host ""
Write-Host "== 4. 依赖安装 ==" -ForegroundColor Cyan
Write-Host "  需要手动执行（各 features 目录分别装）："
Write-Host "    cd qq-bot\qq-bridge ; npm install"
Write-Host "    cd qq-bot\features\GitHub ; npm install"
Write-Host "    cd qq-bot\features\电脑游戏 ; npm install"

Write-Host ""
Write-Host "== 5. 下一步 ==" -ForegroundColor Cyan
@(
  '1) 起 SnowLuma 容器，扫码登录 QQ 小号     → deploy\docs\02-QQ桥接与SnowLuma.md',
  '2) 改 config.json 的三处必填项',
  '3) 把 deploy\mcp\cordis.patch.example.yml 对应段落贴进 DSH profile，重启 DSH',
  '4) 运行 scripts\start-all.ps1',
  '5) 注册看门狗：scripts\watchdog.ps1 + 计划任务（文档 06）'
) | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host ("体检结果：{0} 项就绪 / {1} 项缺失" -f $ok, $bad) -ForegroundColor $(if ($bad -eq 0) { 'Green' } else { 'Yellow' })
