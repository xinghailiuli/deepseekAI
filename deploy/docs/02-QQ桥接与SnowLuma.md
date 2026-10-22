# 02 · QQ 接入（SnowLuma + qq-bridge）

这是整个部署里**最容易卡住**的一步，按顺序来。

## 一、SnowLuma（OneBot 网关）

用 Docker 跑，因为它是 Linux 程序，而且扫码画面要能看。

```powershell
docker run -d --name qqsl-snowluma `
  -p 6081:6081 -p 5180:5180 -p 13000:13000 -p 13001:13001 `
  --restart unless-stopped `
  <snowluma 镜像>
```

- `6081` = noVNC，浏览器打开 `http://127.0.0.1:6081` 看容器里的桌面
- `13000` = OneBot v11 HTTP，桥接连这个
- 进去后扫码登录你的 **QQ 小号**（不要用主号）

**踩坑**：noVNC 只是「看」，消息不依赖它；它断了消息照走，不用管。

## 二、qq-bridge

```powershell
cd qq-bot/qq-bridge
copy ..\..\deploy\config\config.example.json config.json
# 编辑 config.json：填 ownerQQ、allow.private / allow.groups、dsh 地址
npm install
powershell -File ..\scripts\start-qq-bot.ps1     # 或 node src/bridge.js
```

启动后日志应出现：

```
[bridge] 控制台已监听 http://127.0.0.1:3100
[bridge] SnowLuma 已连接 connected=True online=True
[bridge] DSH 就绪 dshReady=True
```

### 三件必须改的配置

| 配置 | 说明 |
| --- | --- |
| `allow.private` | **私聊白名单**，只填你自己的号。空数组 + `allowAllWhenEmpty:true` 会回复任何人，别这么干 |
| `allow.groups` | 群白名单，AI 只能在这几个群说话 |
| `consoleToken` | 留空会自动生成到 `state/console-token`；这个串等于管理员密码，别外传 |

## 三、控制台怎么用

所有控制台请求都要带 `x-console-token`：

```powershell
$ct = Get-Content state\console-token
# 看最近消息
curl "http://127.0.0.1:3100/api/socialV2/recent?key=private:<你的号>&limit=5" -H "x-console-token: $ct"
# 手动唤醒（叫醒 AI 干活）
curl -X POST "http://127.0.0.1:3100/api/socialV2/wake" -H "x-console-token: $ct" `
     -H "Content-Type: application/json; charset=utf-8" --data-binary "@wake.json"
```

### ⚠️ 唤醒必踩的编码坑

PowerShell 5.1 的 `ConvertTo-Json | Invoke-WebRequest -Body` **不会按 UTF-8 编码**，
中文变成 `?????`，日志里看着「已唤醒」其实 AI 收到的是问号。

```powershell
# 错的（中文全丢）
Invoke-WebRequest ... -Body (@{key='...'; reason='中文'} | ConvertTo-Json)

# 对的（显式 UTF-8 字节）
$bytes = [Text.Encoding]::UTF8.GetBytes((@{key='...'; reason='中文'} | ConvertTo-Json -Compress))
Invoke-WebRequest ... -ContentType 'application/json; charset=utf-8' -Body $bytes
```

验证：`state/bridge.log` 里 `控制台：手动唤醒` 那一行能看到正常中文就对了。

## 四、DSH 挂 MCP

把 `mcp/cordis.patch.example.yml` 里对应的段落贴进
`C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`，重启 DSH。

**注意**：DSH 重启会**重写 patch 文件**，你手工加的 args 可能被抹掉。
改完先备份 patch，重启后 `diff` 一下。

## 五、模式说明

| 模式 | 行为 | 什么时候用 |
| --- | --- | --- |
| `chat` | 普通问答，不接 QQ | 调试模型 |
| `closed-agent` | 只走内部，不发言 | 压测工具链 |
| `reserved2` | 二代仿真：会潜水、会挑时机、会自己发消息 | **长期运行用这个** |

`reserved2` 下 AI 拿到的 prompt 里带着「当前多少人说话、上次发言多久、要不要开口」，
所以它才不像客服。

## 六、语音 & 表情包

- 语音：`edge-tts` 生成 → `ffmpeg` 转码到 `qq-bridge/audio/` → `qq_send_voice`
- 群聊**默认禁语音**（配置里把群排除），私聊限制每天 3~8 条
- QQ 原生小黄脸：消息文本里写 `[face:14]`，桥接会拆成 `{type:'face'}` 段
  （常用：14 微笑 / 13 呲牙 / 178 斜眼笑 / 76 赞 / 6 害羞）
