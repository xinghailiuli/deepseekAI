// 手机（安卓）MCP：serverName=android → 工具前缀 mcp__android__
// 只做「看屏幕 / 点 / 滑 / 按键 / 列应用 / 开应用」，全部走本机 adb，不执行任意 shell。
// 每个工具都带 device 参数（省略时用唯一在线设备），物理机与模拟器一视同仁。
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const run = promisify(execFile);

const ADB = (() => {
  const env = String(process.env.ADB ?? '').trim();
  if (env && fs.existsSync(env)) return env;
  const candidates = [
    'C:\\Users\\Administrator\\.local\\bin\\adb.exe',
    'D:\\deepseenhanress\\tools\\android\\platform-tools\\adb.exe'
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'adb';
})();

const SHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

async function adb(args, { timeout = 20000 } = {}) {
  const { stdout } = await run(ADB, args, { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
  return stdout;
}

/** 二进制输出（截图）：必须用 buffer 编码，否则 PNG 会被当成 UTF-8 破坏 */
async function adbBuffer(args, { timeout = 30000 } = {}) {
  const { stdout } = await run(ADB, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' });
  return stdout;
}

// 无线 adb 会掉线（手机休眠/WiFi 省电）。掉线时先自动 adb connect 一次，再判定失败。
const LAST_ADDR_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.last-wifi');
function lastWifi() {
  try { return fs.readFileSync(LAST_ADDR_FILE, 'utf8').trim() || null; } catch { return null; }
}
function rememberWifi(addr) {
  try { fs.writeFileSync(LAST_ADDR_FILE, addr, 'utf8'); } catch { /* 记不住不影响使用 */ }
}

async function onlineList() {
  const out = await adb(['devices']);
  return out.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\s+/)).filter((p) => p[1] === 'device').map((p) => p[0]);
}

async function pickDevice(device) {
  let list = await onlineList();
  if (!device && list.length === 0) {
    const addr = lastWifi();
    if (addr) {
      await adb(['connect', addr], { timeout: 12000 }).catch(() => '');
      await new Promise((r) => setTimeout(r, 1500));
      list = await onlineList();
    }
  }
  if (!device && !list.length) throw new Error('没有在线设备：无线可能掉线了（已在尝试自动重连）。确认手机没休眠、和电脑同一 WiFi');
  if (device && !list.includes(device)) {
    await adb(['connect', device], { timeout: 12000 }).catch(() => '');
    await new Promise((r) => setTimeout(r, 1200));
    list = await onlineList();
  }
  if (device) {
    if (!list.includes(device)) throw new Error(`设备 ${device} 不在线（在线：${list.join(', ') || '无'}）`);
    rememberWifi(device);
    return device;
  }
  if (list.length === 1) { if (list[0].includes(':')) rememberWifi(list[0]); return list[0]; }
  if (list.length === 0) throw new Error('没有在线设备：确认手机已插 USB 或已 adb connect，并在手机上允许调试');
  throw new Error(`有多个设备，必须指定 device：${list.join(', ')}`);
}

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
});
const fail = (error) => ({ content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true });

/** uiautomator dump → 精简节点（text/desc/id/bounds），并返回前台包名 */
async function dumpUi(serial) {
  const remote = '/sdcard/window_dump.xml';
  await adb(['-s', serial, 'shell', 'uiautomator', 'dump', remote]);
  const xml = await adb(['-s', serial, 'shell', 'cat', remote]);
  const nodes = [];
  const re = /<node\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const get = (k) => {
      const r = new RegExp(`${k}="([^"]*)"`).exec(attrs);
      return r ? r[1] : '';
    };
    const t = get('text');
    const d = get('content-desc');
    const id = get('resource-id');
    const bounds = get('bounds');
    if (!t && !d && !id) continue;
    nodes.push({ text: t, desc: d, id: id.split('/').pop(), bounds, clickable: get('clickable') === 'true' });
  }
  const fg = await adb(['-s', serial, 'shell', 'dumpsys', 'window']).catch(() => '');
  const focus = (/mCurrentFocus=Window\{[^}]*?\s([\w.]+)\//.exec(String(fg)) || [])[1] || null;
  return { nodes: nodes.slice(0, 80), total: nodes.length, foreground: focus };
}

const server = new McpServer({ name: 'android', version: '1.0.0' });

server.tool(
  'devices',
  '列出 adb 能看到的安卓设备（序列号、型号、系统版本、状态）。只有一台时可以省略 device。',
  {},
  async () => {
    try {
      const out = await adb(['devices', '-l']);
      const rows = out.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
      const devices = [];
      for (const line of rows) {
        const [serial, state] = line.split(/\s+/);
        const model = (/model:(\S+)/.exec(line) || [])[1] ?? null;
        const product = (/product:(\S+)/.exec(line) || [])[1] ?? null;
        let androidVersion = null;
        if (state === 'device') {
          androidVersion = (await adb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']).catch(() => '')).trim() || null;
        }
        devices.push({ serial, state, model, product, androidVersion });
      }
      return text({ count: devices.length, devices });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'screen',
  '看手机当前画面：返回前台应用、屏幕上的文字元素（带坐标），并保存一张截图（返回文件路径）。手机锁屏时只能看到锁屏。',
  { device: z.string().optional().describe('adb 序列号；只有一台设备时可省略') },
  async ({ device }) => {
    try {
      const serial = await pickDevice(device);
      const png = await adbBuffer(['-s', serial, 'exec-out', 'screencap', '-p']);
      if (!png || png.length < 1000) throw new Error('截图为空：确认手机已解锁且未黑屏');
      const file = path.join(SHOT_DIR, `phone-${Date.now()}.png`);
      fs.writeFileSync(file, png);
      const ui = await dumpUi(serial);
      // 关键：把截图作为图像内容返回，否则游戏/视频这类没有文字节点的界面模型等于瞎了
      const b64 = fs.readFileSync(file).toString('base64');
      return {
        content: [
          { type: 'image', data: b64, mimeType: 'image/png' },
          {
            type: 'text',
            text: JSON.stringify({
              device: serial,
              screenshot: file,
              foreground: ui.foreground,
              elementCount: ui.total,
              elements: ui.nodes.slice(0, 30),
              note: ui.total === 0
                ? '这个界面没有文字元素（游戏/视频/锁屏都这样），直接看上面那张图；点坐标用 tap 的 x/y（0~1）'
                : undefined
            }, null, 2)
          }
        ]
      };
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'tap',
  '点屏幕：按文字/描述点（text）或按坐标比例点（x,y 为 0~1）。优先用 text，比坐标稳。',
  {
    device: z.string().optional(),
    text: z.string().optional().describe('要点的文字或描述，例如「设置」'),
    x: z.number().min(0).max(1).optional().describe('横向比例 0~1'),
    y: z.number().min(0).max(1).optional().describe('纵向比例 0~1')
  },
  async ({ device, text: label, x, y }) => {
    try {
      const serial = await pickDevice(device);
      if (label) {
        const ui = await dumpUi(serial);
        const hit = ui.nodes.find((n) => n.text === label || n.desc === label)
          || ui.nodes.find((n) => (n.text && n.text.includes(label)) || (n.desc && n.desc.includes(label)));
        if (!hit) throw new Error(`屏幕上没有「${label}」，先调用 screen 看看当前有哪些元素`);
        const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(hit.bounds);
        if (!m) throw new Error(`「${label}」没有有效坐标`);
        const cx = Math.round((Number(m[1]) + Number(m[3])) / 2);
        const cy = Math.round((Number(m[2]) + Number(m[4])) / 2);
        await adb(['-s', serial, 'shell', 'input', 'tap', String(cx), String(cy)]);
        return text({ device: serial, tapped: label, at: [cx, cy], matched: hit.text || hit.desc });
      }
      if (typeof x !== 'number' || typeof y !== 'number') throw new Error('要么传 text，要么同时传 x 和 y');
      const size = (await adb(['-s', serial, 'shell', 'wm', 'size'])).match(/(\d+)x(\d+)/);
      if (!size) throw new Error('读不到屏幕分辨率');
      const px = Math.round(Number(size[1]) * x);
      const py = Math.round(Number(size[2]) * y);
      await adb(['-s', serial, 'shell', 'input', 'tap', String(px), String(py)]);
      return text({ device: serial, tapped: 'coords', at: [px, py], screen: `${size[1]}x${size[2]}` });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'act',
  '手机动作：back/home/recents/enter/unlock/type/swipe。type 需要 text（中文英文都行）。',
  {
    device: z.string().optional(),
    action: z.enum(['back', 'home', 'recents', 'enter', 'type', 'swipe']),
    text: z.string().optional().describe('action=type 时要输入的英文/数字'),
    fromX: z.number().min(0).max(1).optional(),
    fromY: z.number().min(0).max(1).optional(),
    toX: z.number().min(0).max(1).optional(),
    toY: z.number().min(0).max(1).optional()
  },
  async ({ device, action, text: input, fromX, fromY, toX, toY }) => {
    try {
      const serial = await pickDevice(device);
      if (action === 'type') {
        if (!input) throw new Error('action=type 需要 text');
        // 纯 ASCII 走 input text（快）；含中文/emoji 走 ADBKeyboard 广播，打完自动切回原输入法
        if (/[^\x20-\x7E]/.test(input)) {
          const r = await typeUnicode(serial, input);
          return text({ device: serial, typed: input, via: 'adbkeyboard', restoredTo: r.restoredTo });
        }
        await adb(['-s', serial, 'shell', 'input', 'text', input.replace(/ /g, '%s')]);
        return text({ device: serial, typed: input, via: 'input' });
      }
      if (action === 'swipe') {
        if ([fromX, fromY, toX, toY].some((v) => typeof v !== 'number')) throw new Error('swipe 需要 fromX/fromY/toX/toY');
        const size = (await adb(['-s', serial, 'shell', 'wm', 'size'])).match(/(\d+)x(\d+)/);
        const w = Number(size[1]); const h = Number(size[2]);
        await adb(['-s', serial, 'shell', 'input', 'swipe',
          String(Math.round(w * fromX)), String(Math.round(h * fromY)),
          String(Math.round(w * toX)), String(Math.round(h * toY)), '300']);
        return text({ device: serial, swiped: [fromX, fromY, toX, toY] });
      }
      const keyMap = { back: 'KEYCODE_BACK', home: 'KEYCODE_HOME', recents: 'KEYCODE_APP_SWITCH', enter: 'KEYCODE_ENTER' };
      await adb(['-s', serial, 'shell', 'input', 'keyevent', keyMap[action]]);
      return text({ device: serial, action });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'apps',
  '列手机已安装应用（可按名字过滤），或直接打开一个应用（package）。',
  {
    device: z.string().optional(),
    query: z.string().optional().describe('包名关键词，例如 wechat / tencent'),
    launch: z.string().optional().describe('要打开的包名，例如 com.tencent.mm')
  },
  async ({ device, query, launch }) => {
    try {
      const serial = await pickDevice(device);
      if (launch) {
        const out = await adb(['-s', serial, 'shell', 'monkey', '-p', launch, '-c', 'android.intent.category.LAUNCHER', '1']).catch((e) => e.message);
        if (/No activities found|monkey aborted/i.test(String(out))) throw new Error(`打不开 ${launch}：包名可能不对，先用 apps 查`);
        return text({ device: serial, launched: launch });
      }
      const out = await adb(['-s', serial, 'shell', 'pm', 'list', 'packages']);
      let pkgs = out.split(/\r?\n/).map((l) => l.replace(/^package:/, '').trim()).filter(Boolean);
      if (query) pkgs = pkgs.filter((p) => p.toLowerCase().includes(query.toLowerCase()));
      return text({ device: serial, count: pkgs.length, packages: pkgs.slice(0, 60) });
    } catch (e) { return fail(e); }
  }
);

// ── 中文输入：ADBKeyboard 广播（input text 不支持 UTF-8）──────────────
const IME_ADB = 'com.android.adbkeyboard/.AdbIME';

async function currentIme(serial) {
  const out = await adb(['-s', serial, 'shell', 'settings', 'get', 'secure', 'default_input_method']).catch(() => '');
  return String(out).trim() || null;
}

// 用户平时用的输入法：打完中文必须切回它，否则手机上就没法正常打字了
const USER_IME = 'com.baidu.input_vivo/.ImeVivoService';

async function typeUnicode(serial, value) {
  const before = await currentIme(serial);
  const restoreTo = before && before !== IME_ADB ? before : USER_IME;
  try {
    if (before !== IME_ADB) {
      await adb(['-s', serial, 'shell', 'ime', 'set', IME_ADB]);
      await new Promise((r) => setTimeout(r, 600));
    }
    // 广播里带空格/特殊字符会被 shell 拆开，用 base64 传给 ADBKeyboard 更稳
    const b64 = Buffer.from(value, 'utf8').toString('base64');
    await adb(['-s', serial, 'shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', b64], { timeout: 20000 });
    return { imeUsed: IME_ADB, restoredTo: restoreTo };
  } finally {
    await new Promise((r) => setTimeout(r, 400));
    await adb(['-s', serial, 'shell', 'ime', 'set', restoreTo]).catch(() => {});
  }
}

// ── 音乐（网易云）：PC 查歌 → 手机深链播放，绕开手机中文输入 ──────────────
const NM_PKG = 'com.netease.cloudmusic';

async function nmSearch(query, limit = 5) {
  const url = 'https://music.163.com/api/search/get?s=' + encodeURIComponent(query) + '&type=1&limit=' + limit;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://music.163.com/' } });
  if (!res.ok) throw new Error('网易云搜索接口返回 ' + res.status);
  const json = await res.json();
  const songs = (json && json.result && json.result.songs) || [];
  if (!songs.length) throw new Error('没搜到「' + query + '」');
  return songs.map((s) => ({
    id: String(s.id),
    name: s.name,
    artist: (s.artists || []).map((a) => a.name).join('/'),
    album: (s.album && s.album.name) || ''
  }));
}

server.tool(
  'music_search',
  '在网易云搜歌（在电脑上查，不受手机输入法限制）。返回歌曲 id/名字/歌手，挑一首用 music_play 播。',
  { query: z.string().describe('歌名或歌手，中文可以'), limit: z.number().min(1).max(10).optional() },
  async ({ query, limit }) => {
    try { return text({ query, songs: await nmSearch(query, limit || 5) }); } catch (e) { return fail(e); }
  }
);

server.tool(
  'music_play',
  '在手机上打开网易云并播放指定歌曲：传 music_search 拿到的 id，或直接传歌名 query。',
  {
    device: z.string().optional(),
    id: z.string().optional().describe('歌曲 id（music_search 返回）'),
    query: z.string().optional().describe('也可以直接传歌名，内部先搜再播')
  },
  async ({ device, id, query }) => {
    try {
      const serial = await pickDevice(device);
      let songId = id ? String(id) : null;
      let picked = null;
      if (!songId) {
        if (!query) throw new Error('要么传 id，要么传 query');
        const list = await nmSearch(query, 1);
        songId = list[0].id;
        picked = list[0];
      }
      await adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'orpheus://song/' + songId, '-p', NM_PKG]);
      return text({ device: serial, playing: songId, picked });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'music_control',
  '控制手机上的音乐：pause / play / toggle / next / prev / now（now = 看当前在放什么）。',
  { device: z.string().optional(), action: z.enum(['pause', 'play', 'toggle', 'next', 'prev', 'now']) },
  async ({ device, action }) => {
    try {
      const serial = await pickDevice(device);
      if (action === 'now') {
        const out = await adb(['-s', serial, 'shell', 'dumpsys', 'media_session']);
        const meta = (/metadata: size=\d+, description=([^\n]+)/.exec(String(out)) || [])[1] || null;
        const state = (/state=PlaybackState \{state=(\d+)/.exec(String(out)) || [])[1] || null;
        return text({ device: serial, playing: state === '3', state, nowPlaying: meta ? meta.trim() : null });
      }
      const keyMap = { toggle: 'KEYCODE_MEDIA_PLAY_PAUSE', pause: 'KEYCODE_MEDIA_PAUSE', play: 'KEYCODE_MEDIA_PLAY', next: 'KEYCODE_MEDIA_NEXT', prev: 'KEYCODE_MEDIA_PREVIOUS' };
      await adb(['-s', serial, 'shell', 'input', 'keyevent', keyMap[action]]);
      return text({ device: serial, action });
    } catch (e) { return fail(e); }
  }
);

// ── 小黑盒帖子：用手机 App 读正文（浏览器被站点风控拦死，这里绕开）──────
const HB_PKG = 'com.max.xiaoheihe';

/** dump 一次 UI，返回结构化节点（文本/描述/id/bounds/clickable） */
async function hbDump(serial) {
  await adb(['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/hb.xml'], { timeout: 20000 });
  const xml = await adb(['-s', serial, 'shell', 'cat', '/sdcard/hb.xml'], { timeout: 20000 });
  const nodes = [];
  const re = /<node\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = m[1];
    const get = (k) => {
      const r = new RegExp(k + '="([^"]*)"').exec(a);
      return r ? r[1] : '';
    };
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(get('bounds'));
    if (!b) continue;
    nodes.push({
      text: get('text'),
      desc: get('content-desc'),
      id: get('resource-id'),
      clickable: get('clickable') === 'true',
      x1: Number(b[1]), y1: Number(b[2]), x2: Number(b[3]), y2: Number(b[4])
    });
  }
  return nodes;
}

const nodeCenter = (n) => [Math.round((n.x1 + n.x2) / 2), Math.round((n.y1 + n.y2) / 2)];

// 把小黑盒弄回首页：先按返回后退（可能停在帖子/搜索页），仍然没搜索框就冷启动一次。
async function openHeyboxHome(serial, steps) {
  const findSearch = (nodes) =>
    nodes.find((n) => /iv_home_search$/.test(n.id)) || nodes.find((n) => /搜索/.test(n.desc || ''));
  let nodes = await hbDump(serial);
  let btn = findSearch(nodes);
  for (let i = 0; i < 3 && !btn; i++) {
    await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    await new Promise((r) => setTimeout(r, 1300));
    nodes = await hbDump(serial);
    btn = findSearch(nodes);
  }
  if (!btn) {
    steps.push('cold_start');
    await adb(['-s', serial, 'shell', 'am', 'force-stop', HB_PKG]).catch(() => '');
    await new Promise((r) => setTimeout(r, 800));
    await adb(['-s', serial, 'shell', 'monkey', '-p', HB_PKG, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 6000));
    nodes = await hbDump(serial);
    btn = findSearch(nodes);
  }
  return { btn, nodes };
}
server.tool(
  'heybox_post',
  '用手机上的小黑盒 App 搜一个帖子并把正文读出来（浏览器版被站点验证码拦死，这里走 App）。传关键词/标题片段。',
  {
    device: z.string().optional(),
    query: z.string().describe('帖子里出现过的词，比如标题片段'),
    waitMs: z.number().min(2000).max(15000).optional()
  },
  async ({ device, query, waitMs }) => {
    try {
      const serial = await pickDevice(device);
      const steps = [];

      // 1) 打开小黑盒（已经开着就被拉到前台）
      await adb(['-s', serial, 'shell', 'monkey', '-p', HB_PKG, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 4000));
      steps.push('opened');

      // 2) 确保在首页，再点搜索按钮（按 resource-id 找，不猜坐标）
      let { btn: searchBtn, nodes } = await openHeyboxHome(serial, steps);
      if (!searchBtn) throw new Error('回到首页后仍没找到搜索按钮（App 版本可能变了）');
      const [sx, sy] = nodeCenter(searchBtn);
      await adb(['-s', serial, 'shell', 'input', 'tap', String(sx), String(sy)]);
      await new Promise((r) => setTimeout(r, 2500));
      steps.push('search_opened');

      // 3) 点输入框并输入中文
      nodes = await hbDump(serial);
      const edit = nodes.find((n) => n.clickable && /EditText|edit/i.test(n.id)) || nodes.find((n) => n.text === '' && n.clickable);
      if (!edit) throw new Error('没找到搜索输入框');
      const [ex, ey] = nodeCenter(edit);
      await adb(['-s', serial, 'shell', 'input', 'tap', String(ex), String(ey)]);
      await new Promise((r) => setTimeout(r, 1200));
      await typeUnicode(serial, query);
      await new Promise((r) => setTimeout(r, 800));
      await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_ENTER']);
      await new Promise((r) => setTimeout(r, waitMs || 5000));
      steps.push('searched');

      // 4) 点搜索结果里最靠前的那条：标题节点自己不一定 clickable（点击落在父容器上），所以不要求 clickable
      nodes = await hbDump(serial);
      const TABS = /^(综合|内容|用户|话题|专栏|商品|游戏|视频|全部|相关|筛选|最新|最热)$/;
      const candidates = nodes
        .filter((n) => {
          const t = (n.text || '').trim();
          return t.length >= 6 && n.y1 > 300 && !TABS.test(t);
        })
        .sort((a, b2) => a.y1 - b2.y1);
      if (!candidates.length) {
        return text({ device: serial, steps, query, note: '没搜到可点的帖子；返回当前可见文字', visible: nodes.map((n) => n.text).filter(Boolean).slice(0, 20) });
      }
      const first = candidates.find((n, i) => !candidates.slice(0, i).some((m) => Math.abs(m.y1 - n.y1) < 20)) || candidates[0];
      const [cx, cy] = nodeCenter(first);
      await adb(['-s', serial, 'shell', 'input', 'tap', String(cx), String(cy)]);
      await new Promise((r) => setTimeout(r, 4500));
      steps.push('post_opened');

      // 5) 读正文
      const post = await hbDump(serial);
      const texts = post.map((n) => n.text).filter((t) => t && t.length >= 2);
      const body = texts.join('\n').slice(0, 4000);
      return text({
        device: serial,
        steps,
        query,
        tappedTitle: first.text,
        title: texts.find((t) => t.length >= 8) || null,
        chars: body.length,
        body,
        note: '这是手机 App 里看到的帖子文字；需要图就再调 screen 拿截图'
      });
    } catch (e) { return fail(e); }
  }
);

server.tool(
  'swaps',
  '一口气走多步：传 [[x1,y1,x2,y2], ...]（x/y 都是 0~1 比例），依次点两次完成一次交换/消除，最后返回一张最新画面。适合消消乐这类游戏，省掉来回截图。',
  {
    device: z.string().optional(),
    pairs: z.array(z.array(z.number())).min(1).max(6).describe('每组 4 个数：起点x,起点y,终点x,终点y（0~1）'),
    gapMs: z.number().min(100).max(3000).optional().describe('每次点击之间等多久，默认 450ms')
  },
  async ({ device, pairs, gapMs }) => {
    try {
      const serial = await pickDevice(device);
      const size = (await adb(['-s', serial, 'shell', 'wm', 'size'])).match(/(\d+)x(\d+)/);
      if (!size) throw new Error('读不到屏幕分辨率');
      const w = Number(size[1]); const h = Number(size[2]);
      const wait = gapMs || 450;
      const done = [];
      for (const p of pairs) {
        if (!Array.isArray(p) || p.length !== 4 || p.some((v) => typeof v !== 'number')) {
          throw new Error('每组必须是 4 个数字：[x1,y1,x2,y2]');
        }
        const [x1, y1, x2, y2] = p.map((v) => Math.max(0, Math.min(1, v)));
        await adb(['-s', serial, 'shell', 'input', 'tap', String(Math.round(w * x1)), String(Math.round(h * y1))]);
        await new Promise((r) => setTimeout(r, wait));
        await adb(['-s', serial, 'shell', 'input', 'tap', String(Math.round(w * x2)), String(Math.round(h * y2))]);
        await new Promise((r) => setTimeout(r, wait));
        done.push(p);
      }
      const png = await adbBuffer(['-s', serial, 'exec-out', 'screencap', '-p']);
      const file = path.join(SHOT_DIR, `phone-${Date.now()}.png`);
      if (png && png.length > 1000) fs.writeFileSync(file, png);
      return {
        content: [
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify({ device: serial, steps: done.length, screenshot: file }, null, 2) }
        ]
      };
    } catch (e) { return fail(e); }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
