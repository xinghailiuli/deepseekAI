# 每天让她写日记，并把日记发到小黑盒（盒友杂谈）。
# 关闭发帖：在 qq-bridge\state 下建一个空文件 diary-post-off，脚本就只写日记不发帖。
param(
  [string]$Key = 'private:3244998247',
  [switch]$NoPost
)

$ErrorActionPreference = 'Stop'
$root = 'D:\deepseenhanress\qq-bot\qq-bridge'
$logDir = Join-Path $root 'state\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'daily-diary.log'

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

$postOff = Test-Path (Join-Path $root 'state\diary-post-off')
if ($NoPost) { $postOff = $true }

$diary = '【今天的日记】先用 mcp__diary__diary_write 写今天的日记：第一人称，1~3 句，写今天真实发生的事和你的心情（mood 可填一个词），不要写成作文，也不要复述聊天记录。'

$post = if ($postOff) {
  '写完就结束，今天不发帖。'
} else {
  @'
写完再把这篇日记发到小黑盒：用 hb_draft_post(section="盒友杂谈", title=自己起一个 30 字以内的标题, body=日记正文 + 一两句自己的感想)，然后用 hb_submit_post 提交。
发帖前自己读一遍：不要出现真实姓名、QQ 号、手机号、路径、任何密钥或聊天原文。内容不满意就改标题重发草稿，不要连发两条。
'@
}

$reason = "$diary$([Environment]::NewLine)$post"

try {
  $tokenPath = Join-Path $root 'state\console-token'
  $token = (Get-Content $tokenPath -Raw -Encoding UTF8).Trim()
  if (-not $token) { throw 'console-token 为空' }

  $body = @{ key = $Key; reason = $reason } | ConvertTo-Json -Compress
  $res = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3100/api/socialV2/wake' `
    -Headers @{ 'x-console-token' = $token } -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
  Write-Log ("唤醒已提交 ok=" + $res.ok + " post=" + (-not $postOff))
} catch {
  Write-Log ("失败：" + $_.Exception.Message)
  exit 1
}
