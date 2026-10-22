# 一键备份小鲸鱼档案（人物卡 / 日记 / 喜好 / 聊天记录）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File backup.ps1
$ErrorActionPreference = 'Stop'
$root = 'D:\deepseenhanress\鲸鱼档案'
$today = Get-Date -Format 'yyyy-MM-dd'
$node = 'C:\Program Files\nodejs\node.exe'

# 1) 人物卡快照
Copy-Item 'D:\deepseenhanress\qq-bot\qq-bridge\roles\鲸鱼娘.md' (Join-Path $root "人物卡\鲸鱼娘-$today.md") -Force

# 2) 日记：按天拆文件
$py = @'
import fs from "node:fs";
const src = "D:/deepseenhanress/qq-bot/features/日记/diary.jsonl";
const root = "D:/deepseenhanress/鲸鱼档案/日记";
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
& $node $tmp
Remove-Item $tmp -Force

# 3) 聊天记录（本地留存，.gitignore 已排除，不会推到公开仓库）
$py2 = @'
import fs from "node:fs";
const st = JSON.parse(fs.readFileSync("D:/deepseenhanress/qq-bot/qq-bridge/state/social-v2.json", "utf8"));
const root = "D:/deepseenhanress/鲸鱼档案/聊天记录";
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
& $node $tmp2 $today
Remove-Item $tmp2 -Force

# 4) 提交并推送（token 只在本进程内存里，不写进 .git/config）
Set-Location $root
git add -A | Out-Null
$msg = "备份 $today（人物卡/日记/喜好）"
git -c user.name="xinghailiuli" -c user.email="xinghailiuli@users.noreply.github.com" commit -q -m $msg 2>&1 | Out-Null
$tok = (Get-Content 'D:\deepseenhanress\qq-bot\features\GitHub\config.json' -Raw -Encoding UTF8 | ConvertFrom-Json).token
git -c credential.helper= push "https://x-access-token:$tok@github.com/xinghailiuli/deepseekAI.git" HEAD:main 2>&1 | Select-Object -Last 1
Write-Output "备份完成：$msg"
