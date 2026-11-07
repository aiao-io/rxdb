# US-409 运行时调研

[US-409](US-409-browser-runtime-comparison.md) 的候选调研。方法：只读上游源码、文档、npm 元数据与官网，未运行其代码、未安装其包；路径均指各自上游仓库。数据截至 2026-11-07，重新评估前先复核版本与最近提交。

## 对比

| 方式                         | 原理                                                                        | 装依赖                                                             | 终端与进程                                | 服务预览与热更新                                     | Angular            | 许可与维护                                                          |
| ---------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| esbuild-wasm（本地项目预览） | 浏览器内只编译项目源码，框架运行时构建时预打包                              | 不装，只用模板锁定的依赖                                           | 无                                        | 沙箱 iframe，保存即重编译                            | 浏览器 JIT         | MIT；本仓库维护                                                     |
| WebContainer（当前「运行」） | 闭源运行时，StackBlitz 托管                                                 | 真 npm 10 / pnpm 8.15.6                                            | `jsh` + pty（尺寸、resize、OSC 状态标记） | 独立域名预览 + WebSocket                             | ng serve 实测通过  | 客户端包 MIT；商业生产使用需授权；依赖 StackBlitz 服务              |
| vivari                       | 浏览器引擎运行逐字 vendored 的 Node v24 `lib/`，Worker 内核 + Wasm 文件系统 | 真 npm 10.9 / yarn 1.22 / pnpm 9.15，读锁文件，OPFS 缓存           | 子进程 + 极简 `sh`；无 pty，固定 80×24    | Service Worker；WebSocket 经注入隧道；默认与宿主同源 | 声明 21，22 未验证 | MIT（含 Artistic-2.0、MPL-2.0 组件）；2026-07 起，单人，无浏览器 CI |
| Nodepod                      | JS 重写 Node API，每个进程一个 Worker                                       | 自研 npm / pnpm / yarn，只认 `package-lock.json`，不跑 postinstall | 自研 shell，无 pty                        | Service Worker + WebSocket 垫片；线上需通配域名      | 无任何证据         | MIT + Commons Clause；单人                                          |
| almostnode                   | JS shim，在宿主主线程 `eval`                                                | 自研 mini npm，无锁文件、无 postinstall，默认不装 devDependencies  | 无真进程，按输出静默判定退出              | 无 WebSocket；Vite / Next 为自研仿制                 | 无                 | MIT；2026-02 起停更，自称非生产可用                                 |
| burrow                       | 浏览器引擎运行 TS，`bun.wasm` 只做转译                                      | 自研 `bun install`，不跑脚本                                       | 无子进程；shell 为 JS 版 bash，输出非流式 | 无 WebSocket；只声明 Bun.serve / Hono                | 无                 | MIT；仅 2026-07-14～15 有提交，无 npm 包                            |

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
