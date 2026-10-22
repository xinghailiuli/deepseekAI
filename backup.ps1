# 一键备份小鲸鱼档案（人物卡 / 日记 / 喜好 / deploy 文档）并自动推送
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File backup.ps1
$ErrorActionPreference = 'Continue'
$root = 'D:\deepseenhanress\鲸鱼档案'
$today = Get-Date -Format 'yyyy-MM-dd'
$node = 'C:\Program Files\nodejs\node.exe'
$logDir = 'D:\deepseenhanress\qq-bot\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'backup.log'
function W($m) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Output $m
}

try {
  # 1) 人物卡快照
  Copy-Item 'D:\deepseenhanress\qq-bot\qq-bridge\roles\鲸鱼娘.md' (Join-Path $root "人物卡\鲸鱼娘-$today.md") -Force
  W "人物卡已快照"

  # 2) 日记：按天拆文件
  $py = @'
import fs from "node:fs";
const src = "D:/deepseenhanress/qq-bot/features/日记/diary.jsonl";
const root = "D:/deepseenhanress/鲸鱼档案/日记";
if (!fs.existsSync(src)) { console.log("日记源不存在，跳过"); process.exit(0); }
const rows = fs.readFileSync(src, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byDay = {};
for (const r of rows) { const d = String(r.time || "").slice(0, 10); (byDay[d] = byDay[d] || []).push(r); }
for (const [day, list] of Object.entries(byDay)) {
  const body = list.map((r) => `## ${r.time}\n\n心情：${r.mood || "—"}\n\n${r.content}\n`).join("\n");
  fs.writeFileSync(`${root}/${day}.md`, `# ${day} 日记（共 ${list.length} 条）\n\n${body}`, "utf8");
}
console.log("日记天数=" + Object.keys(byDay).length);
'@
  $tmp = Join-Path $root 'tmp-diary.mjs'
  [IO.File]::WriteAllText($tmp, $py, (New-Object Text.UTF8Encoding($false)))
  W (& $node $tmp)
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue

  # 3) 聊天记录（本地留存，.gitignore 已排除，不会推到公开仓库）
  $py2 = @'
import fs from "node:fs";
const p = "D:/deepseenhanress/qq-bot/qq-bridge/state/social-v2.json";
if (!fs.existsSync(p)) { console.log("状态文件不存在，跳过"); process.exit(0); }
const st = JSON.parse(fs.readFileSync(p, "utf8"));
const root = "D:/deepseenhanress/鲸鱼档案/聊天记录";
if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
const stamp = process.argv[2];
for (const [key, conv] of Object.entries(st.conversations || {})) {
  const msgs = (conv.recentMessages || []).filter((m) => m && m.text).slice(-40);
  if (!msgs.length) continue;
  const lines = msgs.map((m) => `- ${m.isSelf ? "她" : "对方"}：${String(m.text).replace(/\n/g, " ").slice(0, 200)}`);
  fs.writeFileSync(`${root}/${key.replace(":", "-")}-${stamp}.md`, `# ${key} 最近对话（留最近 ${lines.length} 条）\n\n${lines.join("\n")}\n`, "utf8");
}
console.log("聊天记录已更新");
'@
  $tmp2 = Join-Path $root 'tmp-chat.mjs'
  [IO.File]::WriteAllText($tmp2, $py2, (New-Object Text.UTF8Encoding($false)))
  W (& $node $tmp2 $today)
  Remove-Item $tmp2 -Force -ErrorAction SilentlyContinue

  # 4) 提交（git add -A 同时覆盖 deploy 文档的新改动）
  Set-Location $root
  $status = git status --porcelain
  if (-not ($status | Where-Object { $_ })) {
    W "没有变更，跳过提交"
  } else {
    git add -A 2>&1 | Out-Null
    $msg = "备份 $today（人物卡/日记/喜好/deploy）"
    git -c user.name="xinghailiuli" -c user.email="xinghailiuli@users.noreply.github.com" commit -q -m $msg 2>&1 | Out-Null
    W "已提交：$msg"
  }

  # 5) 推送：优先用 Windows 凭据管理器里已授权的 GitHub 凭据（无需手输 token）
  $env:GIT_TERMINAL_PROMPT = '0'
  git remote set-url origin https://github.com/xinghailiuli/deepseekAI.git 2>&1 | Out-Null
  $push = git push origin HEAD:main 2>&1
  $tail = ($push | Select-Object -Last 2) -join ' | '
  if ($LASTEXITCODE -eq 0) {
    W "推送成功：$tail"
  } else {
    W "推送失败：$tail"
    # 兜底：还有人手动填过 token 就用一次（不落盘到 .git/config）
    $tok = ''
    try { $tok = (Get-Content 'D:\deepseenhanress\qq-bot\features\GitHub\config.json' -Raw -Encoding UTF8 | ConvertFrom-Json).token } catch {}
    if ($tok) {
      W "尝试用 config 里的 token 兜底推送"
      $p2 = git -c credential.helper= push "https://x-access-token:$tok@github.com/xinghailiuli/deepseekAI.git" HEAD:main 2>&1
      W ("兜底结果：" + (($p2 | Select-Object -Last 1) -join ''))
    }
  }
} catch {
  W ("备份异常：" + $_.Exception.Message)
  exit 1
}
W "备份流程结束"
