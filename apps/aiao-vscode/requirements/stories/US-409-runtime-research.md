# US-409 运行时调研

[US-409](US-409-browser-runtime-comparison.md) 的候选调研。「对比」与「关键证据」只读上游源码、文档、npm 元数据与官网，未运行其代码；路径均指各自上游仓库。阶段 B 起的小节是实跑结果。数据截至 2026-11-07，重新评估前先复核版本与最近提交。

## 对比

| 方式                         | 原理                                                                        | 装依赖                                                             | 终端与进程                                | 服务预览与热更新                                     | Angular                        | 许可与维护                                                          |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| esbuild-wasm（本地项目预览） | 浏览器内只编译项目源码，框架运行时构建时预打包                              | 不装，只用模板锁定的依赖                                           | 无                                        | 沙箱 iframe，保存即重编译                            | 浏览器 JIT                     | MIT；本仓库维护                                                     |
| WebContainer（当前「运行」） | 闭源运行时，StackBlitz 托管                                                 | 真 npm 10 / pnpm 8.15.6                                            | `jsh` + pty（尺寸、resize、OSC 状态标记） | 独立域名预览 + WebSocket                             | ng serve 实测通过              | 客户端包 MIT；商业生产使用需授权；依赖 StackBlitz 服务              |
| vivari                       | 浏览器引擎运行逐字 vendored 的 Node v24 `lib/`，Worker 内核 + Wasm 文件系统 | 真 npm 10.9 / yarn 1.22 / pnpm 9.15，读锁文件，OPFS 缓存           | 子进程 + 极简 `sh`；无 pty，固定 80×24    | Service Worker；WebSocket 经注入隧道；默认与宿主同源 | 22 + pnpm 实测装不上，npm 可行 | MIT（含 Artistic-2.0、MPL-2.0 组件）；2026-07 起，单人，无浏览器 CI |
| Nodepod                      | JS 重写 Node API，每个进程一个 Worker                                       | 自研 npm / pnpm / yarn，只认 `package-lock.json`，不跑 postinstall | 自研 shell，无 pty                        | Service Worker + WebSocket 垫片；线上需通配域名      | 无任何证据                     | MIT + Commons Clause；单人                                          |
| almostnode                   | JS shim，在宿主主线程 `eval`                                                | 自研 mini npm，无锁文件、无 postinstall，默认不装 devDependencies  | 无真进程，按输出静默判定退出              | 无 WebSocket；Vite / Next 为自研仿制                 | 无                             | MIT；2026-02 起停更，自称非生产可用                                 |
| burrow                       | 浏览器引擎运行 TS，`bun.wasm` 只做转译                                      | 自研 `bun install`，不跑脚本                                       | 无子进程；shell 为 JS 版 bash，输出非流式 | 无 WebSocket；只声明 Bun.serve / Hono                | 无                             | MIT；仅 2026-07-14～15 有提交，无 npm 包                            |

结论：能完整跑「真实包管理器安装 + 真实开发服务器」的候选只有 vivari，其次 Nodepod（限 Vite 类）。almostnode、burrow 作为轻量方案的下限参照。

## 关键证据

### WebContainer

- 官网商业使用页：「Licensing is required for production usage of the API in a commercial, for-profit setting. (Prototypes or POCs do not require a commercial license.)」
- `@webcontainer/api` 1.6.4 的 `LICENSE` 为 MIT（StackBlitz Inc.），运行时本体从 StackBlitz 域名加载。

### vivari（`@vivari/core` 1.2.1）

- 架构：`ARCHITECTURE.md` §3、§7.3（Kernel Worker、FS / Fetcher Worker、每个 PID 一个 Process Worker）；`runtime/node/lib/fs.js` 头注释说明逐字 vendored Node v24.18.0。
- 原生依赖替换表：`runtime/toolchain-shims.js`（esbuild→esbuild-wasm、rollup→@rollup/wasm-node、lightningcss→lightningcss-wasm）；`vendor/*-pack.bin` 不在 npm 包内，需用仓库 `npm run vendor:*` 自建。
- 终端：`kernel-host/coreutils.js` 写明不支持 `$VAR`、glob、后台 `&`、子 shell；`tty.js` 写明浏览器里没有真实终端。
- 要求 COOP same-origin + COEP require-corp，否则 boot 抛 `ERR_NOT_ISOLATED`；预览隔离需另起源（`docs/deployment.md`）。
- README 声明「not an API-compatible drop-in」，`roadmap.md` 把 WebContainer API 兼容列为不做。
- 发布产物 `dist/index.js` 的 Worker 地址写死为 `/assets/kernel-worker-*.js`，需在阶段 B 实测。

### Nodepod（`@r1ck404/nodepod` 1.11.2）

- 架构：`website/src/content/docs/docs/concepts/how-nodepod-works.mdx`（「not a port of the Node.js executable」），`src/polyfills/`。
- 包管理：`src/shell/commands/{npm,pnpm,yarn,bun}.ts` 为重实现；仓库内检索 `pnpm-lock`、`yarn.lock`、`postinstall` 无命中。
- 兼容实测：`tests/browser/RUNTIME-COMPATIBILITY.md`（Vite 5～8 共 21 个模板、Next 13～16 仅 webpack）；Angular 无任何夹具或 issue。
- 需要 COOP / COEP 与 SharedArrayBuffer；运行时从 jsdelivr / esm.sh 拉 esbuild、rollup（`src/constants/cdn-urls.ts`）。
- 许可：`LICENSE` 为 MIT + Commons Clause v1.0，不授予「Sell」权利；`docs/concepts/licensing.md` 不回答商用问题。

### almostnode（`almostnode` 0.2.14）

- 执行在宿主主线程同源（`src/runtime.ts`，`docs/security.html`）；虚拟文件系统为内存 Map（`src/virtual-fs.ts`）。
- 自研 dev server：`ViteDevServer` / `NextDevServer` 不读 `vite.config` 与插件，React 钉在 esm.sh 18.2.0（`config/cdn.ts`）。
- 未解决：#17 默认漏装 devDependencies，#21 真实 Vite + React 19 项目起不来，#16 create-vite@9 失败。
- README 标注 experimental，FAQ「Is this production-ready? No.」；最后提交与发布均为 2026-02-14。

### burrow

- `bun.wasm` 只做 TS / JSX 转译（README「JSC-in-WASM isn't practical」），仓库无其构建脚本。
- `COMPAT.md` §3、§4、§6：`fs` / `child_process` / `net` / `vm` 抛错，无生命周期脚本与原生扩展，Worker 不能访问虚拟文件系统。
- 预览走 Service Worker `/preview/<port>/` 到 Worker 里的 `Bun.serve({ fetch })`，不支持 WebSocket。
- 未发布 npm 包；10 次提交，仅 2026-07-14～15 活跃。

## 阶段 B 验证：vivari 独立源宿主（2026-11-07）

做法：`@vivari/core` 1.2.1 的 npm 包（无依赖、无安装脚本）放进独立源宿主页（`localhost:4397`），由模拟工作台（`localhost:4398`，同站不同源，自注册根作用域 Service Worker）以 `allow="cross-origin-isolated"` 嵌入；两源都带 COOP / COEP，宿主另带 `Cross-Origin-Resource-Policy: cross-origin`。每个模板用全新浏览器上下文（无 OPFS 缓存），Chrome 156，Apple M1 Max。

| 检查                  | 结果                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 宿主跨源隔离          | `crossOriginIsolated` 为真，SharedArrayBuffer 可用                                                                                                                                     |
| 工作台 Service Worker | vivari 启动前后不变（各自在自己的源上）                                                                                                                                                |
| 服务预览的源          | `http://localhost:4397/preview/<端口>/`，在宿主源上，不在工作台源上                                                                                                                    |
| Worker 资源           | 内核 Worker 写死 `/assets/kernel-worker-*.js`（从源根解析），宿主页把 `dist/assets` 放在源根 `/assets/` 即可                                                                           |
| 包管理器资源          | 运行时从**宿主源根**取 `/vendor/{npm,pnpm,yarn,corepack}-pack.bin`；npm 包里没有，可从 vivari.run 的 `/studio/vendor/` 取静态文件（gzip，npm 2.8 MB、pnpm 3.7 MB），无需运行其构建脚本 |
| 启动                  | 约 0.1 秒（资源全在本地）                                                                                                                                                              |
| 终端                  | `isTTY` 为假，`columns` / `rows` 固定 80 / 24                                                                                                                                          |

| 模板                         | 安装                                                                                                     | 开发服务器就绪 | 页面可见 | 改动生效                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- | -------- | ------------------------------------------------------ |
| vanilla（pnpm）              | 4.4 秒                                                                                                   | 5.5 秒         | +0.2 秒  | 0.2 秒                                                 |
| react（pnpm）                | 3.9 秒                                                                                                   | 4.2 秒         | +0.8 秒  | 0.2 秒                                                 |
| vue（pnpm）                  | 3.8 秒                                                                                                   | 4.8 秒         | +0.6 秒  | 0.2 秒                                                 |
| angular（pnpm）              | 失败：esbuild 安装脚本报 `Unsupported platform: linux wasm32 LE`；加 `--ignore-scripts` 后构建时同样报错 | —              | —        | —                                                      |
| angular（npm，关闭并行构建） | 69.6 秒                                                                                                  | 13.3 秒        | +0.2 秒  | 组件模板热更新被预览页静默丢弃（与 WebContainer 相同） |

- Angular + pnpm 失败的根因：vivari 把 esbuild 换成 esbuild-wasm 依赖它对 pnpm 存储逻辑的补丁，日志显示 `pnpm store-alias patch did NOT apply … (version drift)`；npm 路径的替换正常。
- 默认并行构建时 `ng serve` 停在 `Building...`（错误死在 worker 线程里没有传出来）；`NG_BUILD_PARALLEL_TS=0`、`NG_BUILD_MAX_WORKERS=1` 后报出明确错误。npm 路径下是否必须关闭并行构建待接入后再测。
- vite 8 在 vivari 里同样临时下载 rolldown 的 wasm 绑定（日志写作「on WebContainer」）。

## 阶段 B 接入：vivari 进工作台（2026-11-07）

做法：工作台用隐藏 iframe 嵌入独立源的内核宿主页（本地 `localhost:4331`），握手后经私有 `MessagePort` 走宿主协议（`src/workbench/terminal/runtime-host-protocol.ts`）；服务预览改走宿主源上的预览容器页 `/preview-frame.html`。基准用 `verify-runtimes --production --runtimes=vivari --channel=chrome`：生产构建、全新浏览器上下文、每格 3 次，Chrome 156，Apple M1 Max，负载 4.7～6.8；[报告](../../benchmarks/browser-workbench-runtimes-vivari.json)。

| 模板            | 运行到服务页（中位，最小～最大） | 安装        | 开发服务器就绪 | 改动生效 | 停止    | 停止后再运行 | 运行期下载 | 进程树 RSS |
| --------------- | -------------------------------- | ----------- | -------------- | -------- | ------- | ------------ | ---------- | ---------- |
| vanilla         | 7.8 秒（7.7～8.0）               | 2.6～2.8 秒 | 3.3 秒         | 0.11 秒  | 27 毫秒 | 2.2 秒       | 18.7 MB    | 2.7 GB     |
| react           | 8.9 秒（8.9～9.2）               | 2.7～3.0 秒 | 3.3～3.6 秒    | 0.12 秒  | 26 毫秒 | 2.3 秒       | 20.1 MB    | 2.8 GB     |
| vue             | 9.0 秒（8.6～9.3）               | 2.8～3.1 秒 | 3.6～4.2 秒    | 0.12 秒  | 28 毫秒 | 2.6 秒       | 22.2 MB    | 2.9 GB     |
| angular（pnpm） | 3 次都在安装阶段失败（退出码 1） | —           | —              | —        | —       | —            | 34.5 MB    | —          |

同机同浏览器的 WebContainer 基线（约 2.5 小时前跑，[报告](../../benchmarks/browser-workbench-runtimes.json)）：运行到服务页 13.6 / 15.3 / 15.6 秒、停止后再运行 3.7 / 4.2 / 4.7 秒、运行期下载 42 / 53 / 51 MB、进程树 RSS 4.5 / 4.1 / 3.6 GB；改动生效两者相当（0.1～0.2 秒）。vivari 运行到服务页与停止后再运行都快约 40%，运行期下载不到一半，RSS 低 0.7～1.8 GB；但两轮不同时段，网络波动见上文测量口径，阶段 E 交替复测。页面级内存（`measureUserAgentSpecificMemory`）把同站宿主 iframe 与 Worker 的共享内存也算进来（每格约 7.8～8.9 GB），跨运行时不可比，以 RSS 为准。

接入时实测到的约束（上游文档没写或与文档不符）：

- **SDK 的 `fs.watch` 看不到 VM 内进程的写入**：内核只在经 SDK 的写入（`writeFile`、`mkdir`、`mount`、`rm`）后发 `vv-fs-changed`，Shell 里新建文件、安装时改锁文件都不报（类型注释却说 npm install 会触发上千事件）。VM 内 Node 的 `fs.watch` 能看到同进程与子进程的写入，宿主后端因此在 VM 里常驻一个 `node -e` 监听进程，逐行转发事件。这个进程要逐目录监听并跳过忽略目录：VM 内**递归** `fs.watch` 会扫遍 node_modules，pnpm 安装时撞上一闪而过的临时文件（`lstat` 报 ENOENT）就让进程崩溃，连带宿主连接失效（终端看上去卡住、Ctrl+C 无回应）。
- **`node -e 脚本 参数` 不把参数放进 `process.argv`**（真实 Node 会放在 `argv[1]`），监听目录只能直接写进脚本。
- **`server-ready` 给相对地址**（`/preview/<端口>/?__vv_kernel=…`），要相对宿主源解析。
- **热更新隧道要求预览 iframe 的父窗口能直达内核**：预览页的 WebSocket / SSE 垫片嵌入时只 `parent.postMessage`，内核页按同源模式收；工作台跨源转发不了，所以预览放在宿主源的容器页里，容器页按名字（`parent[内核 iframe 名]`）找到同源内核页，挂上内层 iframe 并转交出站帧。
- **没有伪终端**：往进程 stdin 写 `\x03` 停不下 dev 服务；vivari 自带的 `sh`（无参启动即交互，提示符 `project$`）自己处理 ^C。项目「运行」因此由运行时回显 `^C` 并结束前台进程。
- **进程有三份输出视图**：合并输出、stdout、stderr 各排一份队列，不读的视图会一直积累；取消 stdout / stderr 安全，取消合并输出会直接杀进程。
- **文件系统持久化在宿主源 OPFS**：挂载前不清空 `/project`，上一个项目的文件会留在新项目里并被同步回工作台。
- **pnpm 9.15.9**：`pnpm run` 的脚本输出每行出现两次（原样一次、带 `. dev:` 前缀一次，`npm run` 不会）；每次调用都打印 store-alias 补丁失败的日志；Angular 模板因此装不上 esbuild。（同一项目先 `npm install` 再 `pnpm add` 曾表现为卡住，复查是上面递归监听进程崩溃所致，改为逐目录监听后通过。）
- Angular + npm 没在工作台里复测：内置模板带 `pnpm-lock.yaml`，「运行」按锁文件选 pnpm；npm 路径的结论仍以上一节的宿主页验证为准。
- 内核每次安装都会取 `/vendor/depcache/index.json`、`/vendor/locks/index.json`（按 id 查表的预构建快照与锁文件清单），宿主给空表 `{}` 即可，不必 404。
