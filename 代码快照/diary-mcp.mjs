// 日记 MCP server（stdio）—— 让 QQ 里的鲸鱼娘能自己写日记（只追加，不删改）
// 数据：本目录 diary.jsonl，一行一条 JSON {time, mood, content}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIARY = path.join(__dirname, 'diary.jsonl');
const MAX_CONTENT = 500;

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
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

const server = new McpServer({ name: 'diary', version: '1.0.0' });
const fail = error => ({ isError: true, content: [{ type: 'text', text: '日记操作失败：' + String(error?.code ?? error?.message ?? error) }] });

server.tool(
  'diary_write',
  '写一条日记（只追加，不覆盖、不删除）。用第一人称写下此刻想记住的事：今天发生了什么、对方说了什么、你的心情。一到三句话即可，不要写成作文。',
  {
    content: z.string().describe('日记正文，1~3 句，第一人称，200 字以内'),
    mood: z.string().optional().describe('可选：一个词的心情，如 还行/困/开心/有点烦')
  },
  async ({ content, mood }) => {
    const text = String(content ?? '').trim();
    if (!text) return { content: [{ type: 'text', text: '内容为空，没有写入。' }] };
    const clipped = text.length > MAX_CONTENT ? text.slice(0, MAX_CONTENT) : text;
    const entry = { time: nowLocal(), mood: String(mood ?? '').trim() || undefined, content: clipped };
    try {
      fs.appendFileSync(DIARY, JSON.stringify(entry) + '\n', 'utf8');
    } catch (error) {
      return fail(error);
    }
    return { content: [{ type: 'text', text: `已写下：${entry.time} ${clipped}` }] };
  }
);

server.tool(
  'diary_read',
  '翻自己的日记（最近若干条，倒序）。想不起某件事、或想接着上次的情绪聊时可以看。',
  { limit: z.number().int().min(1).max(30).optional().describe('要看几条，默认 8，最多 30') },
  async ({ limit }) => {
    try {
    const n = Math.min(Math.max(Number(limit) || 8, 1), 30);
    const lines = readLines();
    if (!lines.length) return { content: [{ type: 'text', text: '日记还是空的。' }] };
    const items = lines.slice(-n).reverse().map(parseLine);
    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    } catch (error) { return fail(error); }
  }
);

server.tool(
  'diary_search',
  '在日记里搜关键词（只读）。用于确认某件事以前记没记过。',
  {
    keyword: z.string().describe('要搜的词'),
    limit: z.number().int().min(1).max(30).optional().describe('最多返回几条，默认 10')
  },
  async ({ keyword, limit }) => {
    try {
    const kw = String(keyword ?? '').trim();
    if (!kw) return { content: [{ type: 'text', text: '关键词为空。' }] };
    const n = Math.min(Math.max(Number(limit) || 10, 1), 30);
    const hits = readLines().map(parseLine).filter((e) => JSON.stringify(e).includes(kw)).slice(-n).reverse();
    if (!hits.length) return { content: [{ type: 'text', text: `日记里没有提到「${kw}」。` }] };
    return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] };
    } catch (error) { return fail(error); }
  }
);

await server.connect(new StdioServerTransport());
