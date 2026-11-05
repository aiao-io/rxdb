# dev-rxdb-p2p

`@aiao/rxdb-plugin-p2p` 的独立 demo（[US-707](../../requirements/stories/future/US-707-p2p-cross-runtime-e2e.md)）：
同一个账号在两台设备（或两个浏览器）上登录，文件在设备之间经 WebRTC DataChannel 直传；
「哪台设备有哪个文件」的持有声明经 `rxdb-plugin-sync` 与 Supabase 同步；没有在线持有者时回退服务器下载。

## 组成

| 部分                           | 承担                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Angular 前端（`src/`）         | 登录、设备登记、本地库（wa-sqlite）与清单同步、信令客户端、对端会话、OPFS 文件存储、下载与块图                                                   |
| Cloudflare Worker（`server/`） | 静态资源；`/app-config.js` 下发公开配置；`/api/signal` 信令 Durable Object（在线状态、转发 SDP / ICE、签发连接票据）；`/api/files/:hash` R2 回退 |
| Supabase（`supabase/`）        | 认证宿主（Auth）；`p2p.devices` 设备登记；`p2p.p2p_file_manifest` 清单表，RLS 拒绝伪造的 `holderId`                                              |
| 共用（`shared/`）              | 信令消息协议、连接票据（Ed25519）                                                                                                                |

认证合同见 [US-704 开工前置](../../requirements/stories/future/US-704-p2p-manifest-discovery.md#开工前置)。

## 本地运行

需要 Docker（本 checkout 专属的隔离 Supabase 栈）和 Node 26。

```bash
pnpm nx run dev-rxdb-p2p:supabase-up   # 起隔离栈并灌入 supabase/p2p-schema.sql，可重复执行
pnpm nx serve dev-rxdb-p2p             # http://localhost:4380；会先起 wrangler dev（8787）
```

用两个浏览器（或普通窗口 + 无痕窗口）打开 http://localhost:4380：一边注册，另一边用同一账号登录。
不同账号也能互传（清单对已认证用户全部可见）。

## 页面入口与管理范围

- `/` 文件共享：选择文件即共享；支持按文件名搜索，筛选可下载文件或本机已有文件。下载会自动连接来源设备，完成后点击「保存到下载目录」。
- `/manage` 本机管理：顶部导航可进入，登录后可用。查看本机共享文件数量和大小、连接与下载状态；保存或确认移除本机副本、断开连接、取消下载和清理已结束记录。
- 「共享选项与示例文件」默认收起，提供服务器副本与示例文件；「高级诊断与演示」位于本机管理页，故障模拟与会话帧默认收起，只在开发构建（`nx serve`）出现，生产构建不含。

本机管理只作用于当前浏览器设备。移除文件会撤回本设备的持有声明并删除本机副本；
其他设备、服务器上的副本及已保存到下载目录的文件仍保留。清理下载记录不删除文件。
当前没有全站管理员角色、跨用户设备封禁或服务器副本删除接口。

### 演示脚本

1. A 展开「共享选项与示例文件」，点「16 MiB 示例」：B 的「共享文件」里出现这一行，持有者是 A（在线点为绿）。
2. B 点「下载到本机」：自动建连，完成后可保存到下载目录，B 登记为第二个持有者。「传输详情」展示块图和「SHA-256 与清单一致」；设备的「连接详情」展示协议和状态。
3. 再开第三个窗口 C 下载同一文件，展开传输详情：块图出现两种颜色（A、B 两个来源）。在 A 的本机管理页展开「高级诊断与演示」，选「每块延迟 200 ms」，颜色向 B 倾斜；在 B 打开「篡改数据块」，B 的块校验失败被丢弃、B 被隔离，由 A 补完。
4. A 在高级诊断中打开「拒绝授权」后再从 A 下载：块请求被拒，下载卡片显示拒绝原因，会话保持就绪。
5. A 在高级诊断中点「卡住本页 10 秒」：对端在心跳超时（6 秒）后一两秒内，在「连接详情」里显示「对端失联（心跳超时）」。
6. 勾上「同时保留服务器副本」再共享，关掉持有者的窗口：另一台设备下载走「服务器回退」。
7. 本机管理的高级诊断中，「会话帧」能看到 hello、`p2p.files.read` 的 request / response、ping / pong、bye。

## 验收测试

```bash
pnpm nx run dev-rxdb-p2p-e2e:e2e-remote
```

`apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts`：构建产物经 wrangler 起 Worker，两个浏览器上下文模拟两台设备，
覆盖 US-707 AC#1～#3、AC#6 的浏览器部分，以及 US-704 AC#9、US-706 AC#2 / AC#6 的服务端合同。CI 由 supabase action 起栈。

## 部署到 Cloudflare

以下命令在 `apps/dev-rxdb-p2p` 目录执行，`wrangler` 即 `./node_modules/.bin/wrangler`，先 `wrangler login`。

1. **Supabase 项目**：
   - SQL Editor 里整段执行 `node scripts/supabase-setup-sql.mjs` 打印的 SQL（rxdb 系统表、同步函数、p2p 表结构、生产权限，包在一个事务里）；
   - Project Settings → Data API → Exposed schemas 加上 `p2p`；
   - 测试期可在 Authentication → Sign In / Providers → Email 关掉 Confirm email，否则注册后要先点邮件里的验证链接。
2. **R2 bucket**：`wrangler r2 bucket create aiao-rxdb-p2p-files`。
3. **发布**：`pnpm nx run dev-rxdb-p2p:deploy`（先构建再 `wrangler deploy`）。
4. **Worker secrets**（不进仓库，重新部署不会清掉；签票私钥每次新生成，只经管道传给 wrangler）：

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon / publishable key> \
     node scripts/deploy-secrets.mjs | wrangler secret bulk
   ```

## 限制

- **只走局域网直连**：不配 STUN / TURN（epic-011 非目标）。跨机器时浏览器用 mDNS 主机候选，屏蔽组播的网络里连不上；
  企业环境可用 Chrome 策略 `WebRtcLocalIpsAllowedUrls` 放开本地 IP。
- **必须是安全上下文**（https 或 localhost）：连接票据用 WebCrypto 的 Ed25519 验签，OPFS 也只在安全上下文可用。
- **服务器回退单次上传 ≤ 100 MB**：Cloudflare 免费 / Pro 域名的请求体上限；更大的文件需要分片上传。
- 断点续传、Electron / Tauri 双进程不在这一轮（US-707 下一轮与阶段 B）。
