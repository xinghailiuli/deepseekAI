// 日记 MCP server（stdio）—— 让 QQ 里的鲸鱼娘能自己写日记
//
// 主文件：本目录 diary.jsonl，一行一条 JSON {time, mood, content}
//   - 只追加，不删改；时间由程序生成（北京时间），模型不能指定日期
//   - 不限条数、不限字数、不限时段；并发写入持锁，重试不重复落盘
// 阅读副本：鲸鱼档案\日记\YYYY-MM-DD.md（按天生成，只读用；JSONL 仍是唯一主文件）
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIARY = path.join(__dirname, 'diary.jsonl');
const LOCK = path.join(__dirname, '.diary.lock');
const ARCHIVE = 'D:\\deepseenhanress\\鲸鱼档案\\日记';

// 不做每日条数限制，也不限制写什么：想什么时候写、写多少都行。
// 只保留两个纯技术保护，都不干预内容：
//   RETRY_WINDOW_MS —— 同一次写入被重试时（几秒内提交完全相同的文字）不重复落盘
//   LOCK_*          —— 并发写入不交错
const RETRY_WINDOW_MS = 30 * 1000;
const LOCK_STALE_MS = 15 * 1000;
const LOCK_WAIT_MS = 5000;

// ---------- 时间：显式北京时间，不依赖本机时区 ----------
const BJ_FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
function nowBeijing() {
  return BJ_FMT.format(new Date()).replace('T', ' ');   // "2026-10-27 15:04"
}
const dateOf = (time) => String(time).slice(0, 10);

// ---------- 文件 ----------
function readLines() {
  try {
    return fs.readFileSync(DIARY, 'utf8').split('\n').filter((l) => l.trim());
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}
function parseLine(line) {
  try { return JSON.parse(line); } catch { return { content: line }; }
}
function allEntries() {
  return readLines().map(parseLine);
}
// 按记录时间倒序（时间写成 YYYY-MM-DD HH:mm，可直接字典序比较）
function sortedByTimeDesc(entries) {
  return entries.slice().sort((a, b) => String(b.time ?? '').localeCompare(String(a.time ?? '')));
}

// 简单互斥：用 'wx' 建锁文件；持有超过 LOCK_STALE_MS 视为残留锁
function acquireLock() {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > LOCK_STALE_MS) fs.unlinkSync(LOCK);
      } catch { /* 别人刚释放，重试即可 */ }
      const until = Date.now() + 15;
      while (Date.now() < until) { /* 短暂自旋，避免频繁抢占 */ }
    }
  }
  return false;
}
function releaseLock() {
  try { fs.unlinkSync(LOCK); } catch { /* 已被清理 */ }
}
function withLock(fn) {
  if (!acquireLock()) return { ok: false, reason: 'locked' };
  try { return { ok: true, value: fn() }; }
  finally { releaseLock(); }
}

const contentHash = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);

// 原子写：先写临时文件再 rename，避免阅读副本被读到半截
function writeFileAtomic(target, data) {
  const tmp = target + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, target);
}

// 按天重建 Markdown 阅读副本
function rebuildDayMarkdown(date) {
  const entries = allEntries().filter((e) => dateOf(e.time) === date);
  if (!entries.length) return;
  entries.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
  const parts = [`# ${date} 日记（共 ${entries.length} 条）`, ''];
  for (const e of entries) {
    parts.push(`## ${e.time}`, '');
    if (e.mood) parts.push(`心情：${e.mood}`, '');
    parts.push(String(e.content ?? ''), '');
  }
  try {
    fs.mkdirSync(ARCHIVE, { recursive: true });
    writeFileAtomic(path.join(ARCHIVE, date + '.md'), parts.join('\n'));
  } catch { /* 阅读副本失败不影响主文件 */ }
}

const server = new McpServer({ name: 'diary', version: '1.1.0' });
const fail = (error) => ({
  isError: true,
  content: [{ type: 'text', text: '日记操作失败：' + String(error?.code ?? error?.message ?? error) }],
});
const text = (t) => ({ content: [{ type: 'text', text: t }] });

server.tool(
  'diary_write',
  '写一条日记（只追加，不覆盖、不删除，日期由程序生成）。什么时候写、写多少、写什么都可以，没有条数和字数限制。第一人称，写真实发生的事和你的感受就好。写完不必向用户汇报。',
  {
    content: z.string().describe('日记正文，第一人称，写多少都行'),
    mood: z.string().optional().describe('可选：一个词的心情，如 还行/困/开心/有点烦'),
  },
  async ({ content, mood }) => {
    const body = String(content ?? '').trim();
    if (!body) return text('内容为空，没有写入。');
    const hash = contentHash(body);

    const result = withLock(() => {
      const entries = allEntries();
      const now = nowBeijing();
      const nowMs = Date.now();

      // 只挡「同一次写入被重试」：仅当**最新一条**内容完全相同、且文件刚刚被写过（30 秒内）才跳过。
      // 注意 time 只精确到分钟，不能拿它算时间差，所以用文件 mtime。
      const last = entries.length ? entries[entries.length - 1] : null;
      if (last && contentHash(String(last.content ?? '')) === hash) {
        let ageMs = Infinity;
        try { ageMs = Date.now() - fs.statSync(DIARY).mtimeMs; } catch { /* 拿不到就当作非重试 */ }
        if (ageMs < RETRY_WINDOW_MS) return { skipped: 'retry', time: last.time };
      }

      const entry = { time: now, mood: String(mood ?? '').trim() || undefined, content: body };
      fs.appendFileSync(DIARY, JSON.stringify(entry) + '\n', 'utf8');
      return { written: entry };
    });

    if (!result.ok) return text('日记正忙，这次没写进去，过一会儿再试。');
    const value = result.value;
    if (value.skipped === 'retry') return text(`这几秒内刚写过一模一样的（${value.time}），没有重复落盘。想再写一遍的话，隔一会儿再来。`);

    const entry = value.written;
    rebuildDayMarkdown(dateOf(entry.time));
    return text(`已写下：${entry.time} ${entry.content}`);
  }
);

server.tool(
  'diary_read',
  '翻自己的日记（最近若干条，按记录时间倒序）。想不起某件事、或想接着上次的情绪聊时可以看。平时不用反复翻全部日记。',
  { limit: z.number().int().min(1).max(30).optional().describe('要看几条，默认 8，最多 30') },
  async ({ limit }) => {
    try {
      const n = Math.min(Math.max(Number(limit) || 8, 1), 30);
      const entries = sortedByTimeDesc(allEntries());
      if (!entries.length) return text('日记还是空的。');
      return text(JSON.stringify(entries.slice(0, n), null, 2));
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'diary_search',
  '在日记里搜关键词（只读）。用于确认某件事以前记没记过。',
  {
    keyword: z.string().describe('要搜的词'),
    limit: z.number().int().min(1).max(30).optional().describe('最多返回几条，默认 10'),
  },
  async ({ keyword, limit }) => {
    try {
      const kw = String(keyword ?? '').trim();
      if (!kw) return text('关键词为空。');
      const n = Math.min(Math.max(Number(limit) || 10, 1), 30);
      const hits = sortedByTimeDesc(
        allEntries().filter((e) => JSON.stringify(e).includes(kw))
      ).slice(0, n);
      if (!hits.length) return text(`日记里没有提到「${kw}」。`);
      return text(JSON.stringify(hits, null, 2));
    } catch (error) { return fail(error); }
  }
);

await server.connect(new StdioServerTransport());
