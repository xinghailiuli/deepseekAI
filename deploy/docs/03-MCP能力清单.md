# 03 · MCP 能力清单

每个能力一个文件夹（`features/<名字>/`），一个 `*-mcp.mjs` 就是一个 MCP 服务。
全部是 Node stdio MCP，注册方式见 `mcp/cordis.patch.example.yml`。

## 命名空间总表

| 命名空间 | 工具数 | 干什么 | 写操作 |
| --- | --- | --- | --- |
| `snowluma` | 43 | QQ 本体：读写消息、表情包、语音、记忆、唤醒配置 | 会发言 |
| `snowluma-host` | 1 | 网关探活 | 只读 |
| `bili` | 12 | B 站：搜索、看视频（字幕/抽帧）、评论、动态 | 评论/动态需开开关 |
| `heybox` | 9 | 小黑盒：读帖、发帖、存图（先预览再存） | 发帖需开开关 |
| `github` | 8 | 仓库/issue/PR/代码搜索 | 默认全只读 |
| `web-search-safe` | 2 | 联网搜索、抓网页正文 | 只读 |
| `diary` | 3 | 自己的日记（只追加，不删改） | 写日记 |
| `music` | 3 | 看/控制电脑上正在放的音乐、QQ 语音转文字 | 控制播放 |
| `minecraft` | 6 | 进服、说话、跳跃、跟人、看俯视图 | 会动 |
| `pcgame` | 10 | 窗口截图/点击/按键、启动 PC 游戏、模拟器打游戏 | 会点鼠标 |
| `xiaoxiaole` | 5 | 自己写的消消乐（纯 Node 画棋盘） | 玩 |
| `diary`/`github`/`bili`/`heybox`/`minecraft` | — | 都可通过 `tool_activate` 分页加载 | — |

## 写操作的三道闸

平台类工具（B 站评论、小黑盒发帖）默认**全关**，必须显式开：

```
环境变量        BILI_ALLOW_WRITE=1 / HEYBOX_ALLOW_PUBLISH=1
每小时上限      评论 ≤6 条/小时
24h 去重        同内容 24 小时内不重复发
审计            features/<平台>/audit.jsonl 每次记一行
```

结果未知（比如提交后被风控）**绝对不自动重试**，等人确认。

## 工具白名单（重要）

QQ 里跑的是受限 agent，桥接插件 `qq-tool-restrict.mjs` 用**前缀白名单**控制它能碰哪些工具：

```js
const SAFE_PREFIXES = [
  'mcp__snowluma__', 'mcp__pcgame__', 'mcp__xiaoxiaole__',
  'mcp__github__', 'mcp__bili__', 'mcp__heybox__', ...
];
```

**这个白名单是进程内存里的**：改了文件要**重启 DSH** 才生效。
不生效时的典型报错：`工具 xxx 不在 QQ 桥接白名单内`。

## 各能力的实现要点

### bili（B 站）
- `bili_feed` 首页推荐 → `bili_watch` 组合拳（有字幕给全文，没字幕抽 3 帧）
- 封面/画面都要真图，纯标题读不出内容
- 评论要 `--allow-write`，且只在真看完时发

### heybox（小黑盒）
- 存图必须**先 `hb_preview_images` 看，再 `hb_save_images(picks)`**：盲存容易存成站点图标
- 图片域名过滤：只认 `*.max-c.com`，且 URL 常带 `?imageMogr2/...`，别按 `.jpg` 结尾判断
- 匿名 profile 渲染出来只有壳，标题会变成站名 → 要切登录态 `profile:'main'`
- 发帖走「草稿 → 提交」两步，提交是唯一真写平台的动作

### github
- 8 个工具全是只读；token 放 `config.json`，**用完清空**（本次部署就清理过一次）
- `gh_my_repos` 用来回答「我有哪些项目」

### minecraft
- Java 8 只能跑 1.16.5；prismarine-viewer 的 3D 视图要原生 `canvas`，装不上就别硬上
- 替代方案：自己用纯 Node 画 19×19 俯视图（`mc_view`），98ms 出图

### xiaoxiaole / pcgame
见 `04-游戏自动化.md`

## 反模式（别这么写）

| 别做 | 因为 |
| --- | --- |
| 一个 MCP 塞 40 个工具 | 模型选工具会崩，按平台拆命名空间 |
| 让 MCP 自己发 QQ 消息 | 绕过了桥接的限速/白名单/审计 |
| 用 Playwright 干一切 | 常驻浏览器吃 500MB+，能用纯 Node 画就别开浏览器 |
| 把 token 写进代码 | 提交一次就泄露了，全走 config + 环境变量 |
