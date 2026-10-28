// 小黑盒站点级 MCP（独立 serverName: heybox → 工具前缀 mcp__heybox__）
// 只有六个工具：搜索/列表/读帖/拟稿/提交/查状态。没有通用浏览器、任意点击、JS 执行、文件或桌面能力。
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readPost, searchPosts, listPosts } from './src/read.mjs';
import { createDraft, readDraft, listDrafts, assertAccountId } from './src/drafts.mjs';
import { loadPolicy } from './src/publish.mjs';
import { readCurrentAccount, submitPost, readPublishDiagnostics, warmUp } from './src/adapter.mjs';
import { commentOnPost } from './src/comment.mjs';
import { replyToComment } from './src/comment-reply.mjs';
import { savePostImages, previewPostImages } from './src/media.mjs';

const server = new McpServer({ name: 'heybox', version: '0.1.0' });

const fail = (error) => ({
  content: [{ type: 'text', text: String(error?.message ?? error) }],
  isError: true
});

server.tool(
  'hb_read_post',
  '读一条小黑盒公开帖子的标题/作者/正文（只读，匿名或登录态均可）。传 linkId 或帖子链接。正文最多 8000 字。',
  {
    linkId: z.string().optional().describe('帖子 id（链接里 /bbs/link/<id> 的那段）'),
    url: z.string().optional().describe('或直接给帖子链接')
  },
  async ({ linkId, url }) => {
    try {
      const post = await readPost({ linkId, url });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            标题: post.title,
            作者: post.author,
            链接: post.url,
            可见性: post.visibility,
            备注: post.note ?? null,
            正文字数: post.body.length,
            已截断: post.truncated,
            正文: post.body,
            评论数: post.commentTotal ?? (Array.isArray(post.comments) ? post.comments.length : 0),
            评论: post.comments ?? []
          }, null, 2)
        }]
      };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_search',
  '站内搜索帖子（只读）。注意：站内搜索路由尚未取得实测导航证据，当前会明确返回 ROUTE_UNVERIFIED，不会按猜测路径访问。',
  {
    query: z.string().describe('搜索词（1–60 字）'),
    limit: z.number().int().min(1).max(10).optional().describe('返回条数，默认 5，上限 10')
  },
  async ({ query, limit }) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await searchPosts({ query, limit }), null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_list',
  '看板块/首页帖子列表（只读）。注意：板块列表路由尚未取得实测导航证据，当前会明确返回 ROUTE_UNVERIFIED。',
  {
    section: z.string().optional().describe('板块标识（可选）'),
    limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 10，上限 20')
  },
  async ({ section, limit }) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await listPosts({ section, limit }), null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_draft_post',
  '生成一条发帖草稿（只写本地，不提交、不触网）。返回 draftId，之后由 hb_submit_post 提交。',
  {
    section: z.string().describe('目标板块'),
    title: z.string().max(30).describe('图文标题（≤30 字）'),
    body: z.string().describe('正文（≤8000 字）')
  },
  async ({ section, title, body }) => {
    try {
      const policy = loadPolicy();
      const accountId = assertAccountId(policy.expectedAccountId, 'policy.expectedAccountId');
      const draft = createDraft({ section, title, body, accountId });
      return { content: [{ type: 'text', text: JSON.stringify({ ...draft, 提示: '草稿已保存，尚未提交' }, null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_submit_post',
  '提交一条已存在的草稿（唯一会真正写平台的动作）。confirm:true 只是程序参数，不能替代授权记录；结果未知时不得自动重发。',
  {
    draftId: z.string().describe('hb_draft_post 返回的 draftId'),
    confirm: z.boolean().describe('必须为 true 才会尝试提交')
  },
  async ({ draftId, confirm }) => {
    try {
      const result = await submitPost({ draftId, confirm });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_post_status',
  '只读本地提交记录及诊断；不会访问平台核实帖子。unknown 不能据此判定未发布，禁止重复提交。',
  {
    draftId: z.string().optional().describe('草稿 id'),
    url: z.string().optional().describe('或帖子链接（仅用于核对已提交记录）')
  },
  async ({ draftId, url }) => {
    try {
      if (draftId) {
        const draft = readDraft(draftId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              draftId: draft.draftId,
              source: 'local-record',
              onlineVerified: false,
              status: draft.status,
              attempts: draft.attempts,
              url: draft.submittedUrl ?? null,
              lastError: draft.lastError ?? null,
              diagnostics: readPublishDiagnostics({ draftId }).drafts[0]
            }, null, 2)
          }]
        };
      }
      if (url) {
        const hit = listDrafts().find((d) => d.submittedUrl === url);
        return { content: [{ type: 'text', text: JSON.stringify({ url, draftId: hit?.draftId ?? null, status: hit?.status ?? 'unknown' }, null, 2) }] };
      }
      throw new Error('需要 draftId 或 url');
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_ready',
  '只读预热：打开小黑盒首页并读到当前登录账号，把浏览器留在热会话里约 2 分钟，让随后的 hb_submit_post 省掉启动与首次加载（实测能省 10~30 秒）。不会发帖、不打开编辑器、不改任何平台状态；必须在确认要发布前才用。',
  {},
  async () => {
    try {
      const r = await warmUp({});
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_diagnostics',
  '只读诊断：列出本地草稿真实位置、状态、提交阶段、是否尝试点击、脱敏 HTTP 错误状态；不访问网页、不读取任意文件、不返回正文或 Cookie。历史 unknown 不表示未发布，禁止自动重提。',
  { draftId: z.string().optional().describe('可选草稿 ID；不传返回最新最多 30 条本地记录') },
  async ({ draftId }) => {
    try { return { content: [{ type: 'text', text: JSON.stringify(readPublishDiagnostics({ draftId }), null, 2) }] }; }
    catch (error) { return fail(error); }
  }
);

server.tool(
  'hb_comment_post',
  '在别人的小黑盒帖子下回复一条评论（会真实发言）。有每日次数与同帖同文去重限制；结果无法确认时不要重发。',
  {
    linkId: z.string().describe('帖子 id（链接里 /bbs/link/<id> 那段）'),
    text: z.string().describe('评论内容（≤200 字）')
  },
  async ({ linkId, text }) => {
    try {
      const policy = loadPolicy();
      const identity = await readCurrentAccount();
      const result = await commentOnPost({
        postId: String(linkId).trim(),
        text,
        accountId: identity.accountId,
        policy
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, 账号: identity.accountId }, null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'hb_reply_comment',
  '回复小黑盒某条评论下面的楼中楼（会真实发言）。必须明确给出目标评论：commentId，或 author + text 片段。找不到、命中多条或目标已删除时直接拒绝，不会改发顶层评论。先传 dryRun=true 看预览再发。',
  {
    linkId: z.string().describe('帖子 id'),
    commentId: z.string().optional().describe('目标评论 id（最可靠，优先用它）'),
    author: z.string().optional().describe('目标评论的作者昵称（配合 text 定位时用）'),
    text: z.string().optional().describe('目标评论的正文片段（用于定位，不是回复内容）'),
    reply: z.string().describe('要回复的正文（≤200 字）'),
    dryRun: z.boolean().optional().describe('true=只定位并返回预览，不发送')
  },
  async ({ linkId, commentId, author, text, reply, dryRun }) => {
    try {
      const policy = loadPolicy();
      const identity = await readCurrentAccount();
      const result = await replyToComment({
        postId: String(linkId).trim(),
        target: { commentId, author, text },
        text: reply,
        accountId: identity.accountId,
        policy,
        dryRun: dryRun === true
      });
      return { content: [{ type: 'text', text: JSON.stringify({ ...result, 账号: identity.accountId }, null, 2) }] };
    } catch (error) {
      return fail(error);
    }
  }
);

await server.connect(new StdioServerTransport());
server.tool(
  'hb_save_images',
  '把小黑盒某篇帖子里的图片下载并存到你自己的图片目录（之后可以用 qq_send_local_image 发到 QQ）。适合看到好看的图、表情包想存下来的时候。',
  {
    linkId: z.string().describe('帖子 id（read_post 用的那个）'),
    max: z.number().int().min(1).max(10).optional().describe('最多存几张，默认 6'),
    picks: z.array(z.number().int().min(1).max(10)).optional().describe('要存哪几张（用 hb_preview_images 看到的 index）；不传就按顺序存')
  },
  async ({ linkId, max, picks }) => {
    try {
      const r = await savePostImages({ linkId: String(linkId), max: max ?? 6, picks: picks ?? [] });
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `存图失败：${error?.message ?? error}` }], isError: true };
    }
  }
);
server.tool(
  'hb_preview_images',
  '先把小黑盒这篇帖子里的候选图"看一眼"（直接作为图像给你），返回每张的 index；确认哪张是你要的，再用 hb_save_images 的 picks 存那几张。别盲存——不看就存很容易存成无关图。',
  {
    linkId: z.string().describe('帖子 id'),
    max: z.number().int().min(1).max(6).optional().describe('最多预览几张，默认 4')
  },
  async ({ linkId, max }) => {
    try {
      const r = await previewPostImages({ linkId: String(linkId), max: max ?? 4 });
      const content = r.images.map((img) => ({ type: 'image', data: img.base64, mimeType: 'image/jpeg' }));
      content.push({ type: 'text', text: JSON.stringify({ linkId: r.linkId, title: r.title, images: r.images.map((i) => ({ index: i.index, dim: i.dim, bytes: i.bytes })), note: r.note }) });
      return { content };
    } catch (error) {
      return { content: [{ type: 'text', text: `预览失败：${error?.message ?? error}` }], isError: true };
    }
  }
);
