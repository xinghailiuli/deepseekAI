# 一键备份小鲸鱼档案（人物卡 / 日记 / 聊天记录 / 代码快照 / deploy 文档）并推 GitHub
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File backup.ps1
$ErrorActionPreference = 'Continue'
$root = 'D:\deepseenhanress\鲸鱼档案'
$today = Get-Date -Format 'yyyy-MM-dd'
$node = 'C:\Program Files\nodejs\node.exe'
$logDir = 'D:\deepseenhanress\qq-bot\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'backup.log'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
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
  $diaryJs = @'
import fs from "node:fs";
const src = "D:/deepseenhanress/qq-bot/features/diary/diary.jsonl";
const root = "D:/deepseenhanress/yujian-dangan/diary";
if (!fs.existsSync(src)) { console.log("日记源不存在，跳过"); process.exit(0); }
const rows = fs.readFileSync(src, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const byDay = {};
for (const r of rows) { const d = String(r.time || "").slice(0, 10); (byDay[d] = byDay[d] || []).push(r); }
for (const [day, list] of Object.entries(byDay)) {
  const body = list.map((r) => "## " + r.time + "\n\n心情：" + (r.mood || "—") + "\n\n" + r.content + "\n").join("\n");
  fs.writeFileSync(root + "/" + day + ".md", "# " + day + " 日记（共 " + list.length + " 条）\n\n" + body, "utf8");
}
console.log("日记天数=" + Object.keys(byDay).length);
'@
  # 路径里带中文，单独用变量替换，避免上面的模板被 PowerShell 二次解析
  $diaryJs = $diaryJs.Replace('D:/deepseenhanress/qq-bot/features/diary/diary.jsonl', 'D:/deepseenhanress/qq-bot/features/日记/diary.jsonl')
  $diaryJs = $diaryJs.Replace('D:/deepseenhanress/yujian-dangan/diary', 'D:/deepseenhanress/鲸鱼档案/日记')
  $tmp = Join-Path $root 'tmp-diary.mjs'
  [IO.File]::WriteAllText($tmp, $diaryJs, (New-Object Text.UTF8Encoding($false)))
  W (& $node $tmp)
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue

  # 3) 聊天记录（本地留存，.gitignore 已排除，不会推到公开仓库）
  $chatJs = @'
import fs from "node:fs";
import path from "node:path";
const p = "D:/deepseenhanress/qq-bot/qq-bridge/state/social-v2.json";
if (!fs.existsSync(p)) { console.log("状态文件不存在，跳过"); process.exit(0); }
const st = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
const root = "$CHAT_ROOT";
if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
const stamp = process.argv[2] || "latest";
for (const [key, conv] of Object.entries(st.conversations || {})) {
  const msgs = (conv.recentMessages || []).filter((m) => m && m.text).slice(-40);
  if (!msgs.length) continue;
  const lines = msgs.map((m) => "- " + (m.isSelf ? "她" : "对方") + "：" + String(m.text).replace(/\n/g, " ").slice(0, 200));
  const name = key.replace(":", "-");
  fs.writeFileSync(path.join(root, name + "-" + stamp + ".md"), "# " + key + " 最近对话（" + lines.length + " 条）\n\n" + lines.join("\n") + "\n", "utf8");
}
console.log("聊天记录已更新");
'@
  $chatJs = $chatJs.Replace('$CHAT_ROOT', 'D:/deepseenhanress/鲸鱼档案/聊天记录')
  $tmp2 = Join-Path $root 'tmp-chat.mjs'
  [IO.File]::WriteAllText($tmp2, $chatJs, (New-Object Text.UTF8Encoding($false)))
  W (& $node $tmp2 $today)
  Remove-Item $tmp2 -Force -ErrorAction SilentlyContinue

  # 4) 代码快照：每次更新都要能回滚（只收代码与配置，token 一律脱敏）
  $snap = Join-Path $root '代码快照'
  if (-not (Test-Path $snap)) { New-Item -ItemType Directory -Path $snap -Force | Out-Null }
  $copies = @(
    @{ from = 'D:\deepseenhanress\qq-bot\qq-bridge\src\bridge.js';                                 to = '代码快照\bridge.js' },
    @{ from = 'D:\deepseenhanress\qq-bot\qq-bridge\dsh\agent-presets\qq-chat-v2\agent.cordis.yml'; to = '代码快照\agent.cordis.yml' },
    @{ from = 'D:\deepseenhanress\qq-bot\qq-bridge\plugins\qq-agent-presets\qq-tool-restrict.mjs'; to = '代码快照\qq-tool-restrict.mjs' },
    @{ from = 'D:\deepseenhanress\qq-bot\scripts\daily-diary.ps1';                                 to = '代码快照\daily-diary.ps1' },
    @{ from = 'D:\deepseenhanress\qq-bot\scripts\restart-dsh.ps1';                                 to = '代码快照\restart-dsh.ps1' },
    @{ from = 'D:\deepseenhanress\qq-bot\scripts\connect-phone-adb.ps1';                           to = '代码快照\connect-phone-adb.ps1' },
    @{ from = 'D:\deepseenhanress\qq-bot\features\日记\diary-mcp.mjs';                             to = '代码快照\diary-mcp.mjs' },
    @{ from = 'D:\deepseenhanress\qq-bot\features\手机\android-mcp.mjs';                           to = '代码快照\android-mcp.mjs' },
    @{ from = 'D:\deepseenhanress\qq-bot\features\小黑盒\heybox-mcp.mjs';                          to = '代码快照\heybox-mcp.mjs' }
  )
  $copied = 0
  foreach ($c in $copies) {
    if (Test-Path $c.from) { Copy-Item $c.from (Join-Path $root $c.to) -Force; $copied++ }
  }
  W "代码快照已更新：$copied 个文件"

  # 5) 配置脱敏快照
  $redactJs = @'
import fs from "node:fs";
const src = "$CFG_SRC";
const dst = "$CFG_DST";
const cfg = JSON.parse(fs.readFileSync(src, "utf8").replace(/^\uFEFF/, ""));
const SECRET = /token|secret|password|apikey|accesstoken|cookie/i;
const walk = (o, p) => {
  if (Array.isArray(o)) return o.map((v, i) => walk(v, p + "[" + i + "]"));
  if (o && typeof o === "object") {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = (SECRET.test(k) && typeof v === "string" && v) ? "***" : walk(v, p + "." + k);
    }
    return out;
  }
  return o;
};
fs.writeFileSync(dst, JSON.stringify(walk(cfg, ""), null, 2), "utf8");
console.log("配置脱敏快照已更新");
'@
  $redactJs = $redactJs.Replace('$CFG_SRC', 'D:/deepseenhanress/qq-bot/qq-bridge/config.json')
  $redactJs = $redactJs.Replace('$CFG_DST', 'D:/deepseenhanress/鲸鱼档案/代码快照/config.redacted.json')
  $tmp3 = Join-Path $root 'tmp-redact.mjs'
  [IO.File]::WriteAllText($tmp3, $redactJs, (New-Object Text.UTF8Encoding($false)))
  W (& $node $tmp3)
  Remove-Item $tmp3 -Force -ErrorAction SilentlyContinue

  # 6) 提交
  Set-Location $root
  $status = git status --porcelain
  if (-not ($status | Where-Object { $_ })) {
    W "没有变更，跳过提交"
  } else {
    git add -A 2>&1 | Out-Null
    $msg = "备份 $today（人物卡/日记/代码快照/deploy）"
    git -c user.name="xinghailiuli" -c user.email="xinghailiuli@users.noreply.github.com" commit -q -m $msg 2>&1 | Out-Null
    W "已提交：$msg"
  }

  # 7) 推送
  $env:GIT_TERMINAL_PROMPT = '0'
  git remote set-url origin https://github.com/xinghailiuli/deepseekAI.git 2>&1 | Out-Null
  $push = git push origin HEAD:main 2>&1
  $tail = ($push | Select-Object -Last 2) -join ' | '
  if ($LASTEXITCODE -eq 0) {
    W "推送成功：$tail"
  } else {
    W "推送失败：$tail"
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
