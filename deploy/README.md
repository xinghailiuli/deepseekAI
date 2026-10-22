# QQ 小鲸鱼 · 一键部署包

把「一个活在 QQ 里的 AI 角色」从零搭起来的最小可用包。整套东西在 Windows 上跑通并长期运行过：
2 个群 + 1 个私聊、语音/表情包/发图、B 站刷视频、小黑盒发帖存图、GitHub 只读、Minecraft、
自研消消乐、以及**真的操控模拟器打手机游戏**（用 MuMu 打过开心消消乐五关三星）。

> 这不是框架，是一份「照着抄就能跑」的部署记录 + 脚本。所有密钥、QQ 号、cookie 都在模板里留空。

## 目录

```
deploy/
├─ README.md                 ← 你在这里
├─ docs/
│  ├─ 01-架构.md             整体链路与端口
│  ├─ 02-QQ桥接与SnowLuma.md  QQ 接入（最容易卡的一步）
│  ├─ 03-MCP能力清单.md       14 个 MCP 命名空间都在干什么
│  ├─ 04-游戏自动化.md        截图/点击/DPI/模拟器/galgame
│  ├─ 05-踩坑清单.md          20 条真实踩过的坑（含修法）
│  └─ 06-运维与备份.md        守护、日志、备份到 GitHub
├─ config/
│  ├─ config.example.json    桥接配置模板（脱敏，需填自己的）
│  └─ role-template.md       角色卡模板（换掉人设即可复用）
├─ scripts/
│  ├─ install.ps1            环境体检 + 目录脚手架
│  ├─ start-all.ps1          按顺序拉起全部服务
│  ├─ stop-all.ps1           反向停
│  └─ watchdog.ps1           每 3 分钟巡检，掉线自动拉起
└─ mcp/
   └─ cordis.patch.example.yml  MCP 注册片段（贴进 DSH profile）
```

## 10 分钟看清这套东西长什么样

```
QQ 号（小号）
  ↕ SnowLuma OneBot v11（Docker / WSL2，端口 13000）
qq-bridge（Node，端口 3100，控制台带 x-console-token）
  ↕ 本地 HTTP
DSH（DeepSeek Harness 桌面版，127.0.0.1:19387）
  ├─ 14 个 MCP 服务（QQ/B站/小黑盒/GitHub/MC/游戏…）
  └─ 角色卡 role.md（人设、工具用法、说话的规矩）
```

详细端口表与数据流见 `docs/01-架构.md`。

## 三条最短路径

**A. 只想让 AI 在 QQ 里聊天**
`docs/02` 装 SnowLuma → `config/config.example.json` 填号 → `scripts/start-all.ps1` → 在 DSH 里挂 `snowluma` MCP。

**B. 想让它会刷 B 站 / 发小黑盒 / 看 GitHub**
`docs/03` 逐个 MCP 说明 + 各自的开关（写操作默认全部关闭，要显式开）。

**C. 想让它自己玩游戏（含手机模拟器）**
`docs/04`，重点是 DPI 感知和「窗口内相对坐标」两件事，不搞懂这两个点击永远偏移。

## 前置依赖

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Windows | 10/11 | 脚本是 PowerShell；PS 5.1 也能跑，但中文脚本必须存成 **UTF-8 带 BOM** |
| Node.js | 20+ | 桥接和全部 MCP 都是 Node |
| Docker Desktop | 任意较新版 | 只为跑 SnowLuma（WSL2 后端） |
| DSH | 0.1.x | DeepSeek Harness 桌面版，提供模型与 MCP 宿主 |
| ffmpeg（可选） | 任意 | 语音条转码 |
| MuMu / 雷电（可选） | 任意 | 手机游戏自动化 |

## 装完之后的日常

```
开机      → 计划任务 QQWhale-Watchdog 自动拉起全部服务
每 3 分钟 → QQWhale-Guard 巡检 3100/3200/3205/13000，掉了就重启
每天      → backup.ps1 把人设/日记/喜好推到私有或公开仓库
```

见 `docs/06-运维与备份.md`。

## 许可

自用部署记录，随取随改。里面的坑都是真踩过的，改坏了别找我。
