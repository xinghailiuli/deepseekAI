# 每日日记兜底：只写本地日记，默认不发帖。
#
# 行为：
#   - 默认（不传参）：只让她写日记，绝不发帖。
#   - -Post：显式要求时才把日记发到小黑盒（已授权的发帖能力不变）。
#   - qq-bridge\state\diary-post-off 仍可强制关闭发帖（老开关继续有效）。
#
# 设计：日记保存经历与感受，发帖是另一件事，不默认绑定。
param(
  [string]$Key = 'private:3244998247',
  [switch]$Post
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

# 发帖只有在明确 -Post 且未关闭时才发生
$postOff = (Test-Path (Join-Path $root 'state\diary-post-off')) -or (-not $Post)

$diary = @'
【今天的日记】
现在做一件事：调用 mcp__diary__diary_write，记下今天。
写你此刻真想记的那件事或那种感觉，第一人称，1~3 句，200 字以内，mood 填一个词。
写什么由你定，但这一步今天要做完——日记只有你自己写才算数。
日记只存本地，写完不用跟任何人汇报。
'@

# 注意：PowerShell 变量名不区分大小写，这里不能叫 $post —— 那会和 [switch]$Post 参数撞名。
$postPart = @'
如果今天写了日记，可以再把这篇日记发到小黑盒：用 hb_draft_post(section="盒友杂谈", title=自己起一个 30 字以内的标题, body=日记正文 + 一两句自己的感想)，然后用 hb_submit_post 提交。
发帖前自己读一遍：不要出现真实姓名、QQ 号、手机号、路径、任何密钥或聊天原文。内容不满意就改标题重发草稿，不要连发两条。
'@

# reason 用专用类型：桥接会走 dailyDiary 分支（任务型），不会被包成「判断要不要说话」的社交唤醒。
# 需要发小黑盒时用 dailyDiaryPost，同样由桥接分支处理。
$reason = if ($postOff) { 'dailyDiary' } else { 'dailyDiaryPost' }

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
