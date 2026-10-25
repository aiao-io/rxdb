# 依赖升级记录（2026-10-25）

本次覆盖 pnpm 工作区的直接依赖、锁文件中的间接依赖、现有 overrides，以及三个 Rust 项目的兼容依赖更新。共调整 32 份 package.json、114 处依赖声明，以及 3 份 Cargo.lock。优先更新当前兼容版本线；保留上游明确限制和已有运行时回归所要求的版本。

## 关键版本

| 依赖                                      | 升级前        | 升级后        |
| ----------------------------------------- | ------------- | ------------- |
| pnpm                                      | 10.34.6       | 10.34.8       |
| Angular CLI / build / devkit / schematics | 22.2.2        | 22.2.4        |
| Angular CDK                               | 22.2.3        | 22.2.4        |
| ng-packagr                                | 22.2.4        | 22.2.5        |
| Analog 插件                               | 2.8.1         | 2.9.2         |
| Vite（主工作区）                          | 8.3.4         | 8.3.5         |
| Vite（小程序）                            | 6.4.4         | 6.4.5         |
| Vitest 及配套 browser / coverage / UI 包  | 4.1.11        | 4.1.12        |
| Electron                                  | 44.7.2        | 44.9.3        |
| electron-builder                          | 26.15.3       | 26.18.0       |
| Taro 全套                                 | 4.3.0         | 4.3.1         |
| @axe-core/playwright                      | 4.13.0        | 4.14.0        |
| Happy DOM                                 | 20.14.6       | 21.0.4        |
| Supabase 客户端                           | 2.117.3       | 2.118.0       |
| PGlite                                    | 0.5.10        | 0.5.11        |
| 官方 SQLite WASM                          | 3.53.4-build2 | 3.54.1-build1 |
| ESLint                                    | 10.12.0       | 10.13.0       |
| typescript-eslint                         | 8.71.2        | 8.72.0        |
| Lucide 三框架                             | 1.57.0        | 1.61.0        |
| Tauri Rust crate                          | 2.12.2        | 2.12.5        |
| tauri-build                               | 2.7.2         | 2.7.4         |

Electron 的命令入口移除 `corepack` 前缀，直接调用 pnpm，使其适配仓库声明的 Node 26 环境；Electron / Tauri 的命令文档同步更新。Angular 模型包的 Lucide peer 从精确 `1.57.0` 扩为 `^1.57.0`，同时接纳旧版本和升级后的 1.61.0。

升级后的 axe 4.14 新检查发现示例工作树按钮的固定 `aria-label` 没有覆盖动态可见文本。Angular / React / Vue 三端各删除一处冗余 `aria-label`，由按钮内容直接提供 accessible name；可见文案、title、布局和点击逻辑保持一致。原有五态 axe 零违规断言完整保留。

Taro 的四处本地修复继续保留，补丁映射与文件名同步到 4.3.1，安装后核对了四处修复内容。

安全相关 overrides 更新包括 DOMPurify、undici、serialize-javascript、fast-uri 和 http-cache-semantics。另为 `@angular/build` 固定的旧 Vite、`miniprogram-automator` 固定的旧 debug 添加了同主版本覆盖。

依赖清单变化触发的包组合知识摘要已通过原生成器同步更新，生成内容的功能描述没有变化。

安装仍会报告上游 peer 范围未覆盖 Babel 8、Vue Router 5、ESLint 10、Vite 8，以及 Taro 间接组件的 React 19 peer。没有添加新的忽略规则；本次通过构建、类型检查和测试验证实际兼容性。

## 保留版本及原因

- TypeScript 保持 6.0.3：`@angular/compiler-cli@22.2.3` 和 `@angular/build@22.2.4` 要求 `>=6.0 <6.1`；继续保留既有本地补丁。
- Nx 保持 24.0.1：核对时已是当前稳定版本。
- Vitest 保留 4.x，Electron 保留 44.x：采用各自版本线的安全修复，避免在依赖维护中同时引入测试框架和桌面运行时的主版本迁移。
- 小程序 React / React DOM 保持 18.3.1，配套 React 类型声明保留 18.x，React 插件保持 4.7.0，Vite 保持 6.x：保留 Taro 的兼容组合及既有定向 overrides。
- 小程序 `@subframe7536/sqlite-wasm` 保持精确版本 1.3.1：1.4.0 的 glue 读取导出 Global，会破坏 iOS 微信的 `WXWebAssembly`。对应测试为 `packages/rxdb-adapter-miniprogram/src/__tests__/subframe-glue-exported-globals.spec.ts`。
- `miniprogram-automator` 保持 0.12.1：微信开发者工具 CLI 接入探测在 25 秒内未能返回，无法验证 0.13.0 的 GUI 驱动兼容性；仅通过定向 override 更新其 debug 依赖。未修改开发者工具安全设置。
- `wa-sqlite` 保持不可变 commit tarball 和原 SHA-512；不把供应链固定改为浮动版本。
- `electron-debug` 4.x / `electron-reloader` 1.x 保留现有兼容版本线。
- Rust `rusqlite` 保留 0.33，`gix` 保留 0.89；较新的 0.x 版本线可能包含不兼容 API。三个 Cargo.lock 只解析各自 manifest 允许的兼容更新。统计工具仍声明 Rust 1.88；核对其 167 个锁定 crate 的注册表 rust-version 声明，未发现超过 1.88 的要求。

## 验证

验证环境：macOS x86_64、Node 26.7.0、pnpm 10.34.8、Rust 1.97.1。变更基线为 `08c802e7`；下列 `--base=HEAD` 指本次未提交工作区的该基线。

- 升级前：`@aiao/source:test-scripts` 的 443 项测试通过。
- 升级后：`@aiao/source:test-scripts` 的 443 项测试通过。
- 依赖安装、wa-sqlite 供应链哈希门禁、冻结锁文件离线检查通过。
- 核心 RxDB 测试通过：Lines 96.29%、Branches 92.30%、Functions 96.18%、Statements 95.58%。
- 常规门禁中的 74 个单元测试目标已分批通过；其中 Electron 使用独立串行命令，Supabase 在启动 Docker 后单独补跑。
- PGlite 完整浏览器套件通过：176 个文件、1427 项通过，内置类型检查无错误。
- Supabase 真实服务套件通过：612 项通过，Lines 97.41%、Branches 88.08%；测试后已清理当前 checkout 的隔离容器。本次临时启动的 Docker Desktop 在确认没有其他容器运行后停止。
- BOM 插件完整浏览器套件通过：77 个文件、1316 项通过、1 项跳过，包含 wa-sqlite / PGlite 双后端一致性。
- Electron 后端完整套件单独串行通过：37 个文件、1267 项通过、8 项跳过；覆盖率 Lines 96.65%、Branches 88.30%。
- Tauri 跨进程一致性首轮 690 项通过、9 项跳过，备份内存用例在与 Electron 套件重叠运行时超时；该用例随后单独串行通过，耗时 272 秒，原 300 秒限制和内存断言均未调整。
- Rust 两端 Clippy 零警告；适配器 163 项、Tauri 应用 47 项、统计工具 3 项单元测试通过，共 213 项。
- 微信、头条、支付宝小程序构建及产物验证通过（11 项任务）；Angular / React / Vue 示例应用、Electron 应用构建通过。
- 包组合知识摘要门禁通过。
- Electron 真实打包产物 E2E 通过：56 项通过、4 项按原配置跳过。
- React E2E 首轮 198 项通过、1 项失败；失败来自 axe 4.14 对固定按钮名称的新检查，三框架已同步修正；React 原文件 4 项可访问性测试、三端应用完整单测复跑通过；完整 E2E 复跑 Angular 203 项、React 199 项、Vue 182 项通过，共 584 项。
- 86 个项目的 lint、typecheck、6 个浏览器专项目标、构建及懒加载审计通过；Electron 内存专项 2 项通过。
- HTTP E2E 23 项、BOM E2E 39 项、Supabase E2E 4 项、浏览器扩展 E2E 2 项通过；加上三框架和 Electron，8 个 E2E 目标共 708 项通过、4 项按原配置跳过。
- 文档站和 benchmarks 的 lint、typecheck、test、build 全部通过，文档站包含三框架演示、API 文档和静态站点构建；共完成 30 个含依赖任务。
- 最终复跑根脚本 443 项通过、0 失败、0 跳过；包组合门禁通过（55 个登记包、34 个发布包、9 个情景）。
- 变更文件的 Nx 格式检查和 `git diff HEAD --check` 通过。测试产生的三份首次可见状态报告已归档到临时目录，未纳入依赖升级差异。

全量影响范围为 88 个项目，常规门禁排除文档站和 benchmarks 后为 86 个项目、351 个任务（包含依赖任务）。其中 349 个可执行任务均已核对通过记录，另外 2 个为 `nx:noop` 聚合节点。验证按任务类型串行执行，避免重复运行已通过的 Electron 重型套件：

```bash
NX_NO_CLOUD=true pnpm nx run rxdb-adapter-electron:test \
  --output-style=stream --skipRemoteCache -- \
  --maxWorkers=1 --fileParallelism=false

NX_NO_CLOUD=true pnpm nx affected --base=HEAD \
  -t test --exclude=website,benchmarks,rxdb-adapter-electron \
  --output-style=stream --skipRemoteCache --parallel=1 --nxBail

NX_NO_CLOUD=true pnpm nx affected --base=HEAD \
  -t lint typecheck test-memory test-browser build audit-lazy-backend e2e \
  --exclude=website,benchmarks --output-style=stream \
  --skipRemoteCache --parallel=1 --nxBail

NX_NO_CLOUD=true pnpm nx run-many \
  -p website,benchmarks -t lint typecheck test build \
  --output-style=stream --skipRemoteCache --parallel=1 --nxBail

NX_NO_CLOUD=true pnpm nx run-many -p @aiao/source \
  -t test-scripts audit-package-graph --output-style=stream \
  --skipRemoteCache --parallel=1 --nxBail
```

Tauri 首轮一致性覆盖除备份内存外的全部用例；备份内存的单独复跑命令：

```bash
NX_NO_CLOUD=true CARGO_BUILD_JOBS=2 pnpm nx run rxdb-adapter-tauri:test-conformance \
  --output-style=stream --skipRemoteCache -- \
  --maxWorkers=1 --fileParallelism=false conformance/tauri-sqlite-backup-memory.spec.ts
```

Supabase 的首次环境准备因 Docker daemon 未启动而失败；启动本机 Docker 后，真实服务套件单独补跑通过。Supabase 单元测试要求 Docker 可用，隔离容器仍由现有 Nx target 管理：

```bash
NX_NO_CLOUD=true pnpm nx run rxdb-adapter-supabase:test --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-adapter-supabase:test-env-down --skipRemoteCache
```

Electron 的 GitHub 二进制直连下载过慢，本次验证临时使用官方文档支持的 `ELECTRON_MIRROR` / `ELECTRON_CUSTOM_DIR` 方式从 npmmirror 获取同版本文件。独立核对 ZIP SHA-256 与已安装 npm 包内 `checksums.json` 完全一致；二进制版本 44.9.3，`electron-package-dir` 打包通过。仓库默认下载配置保持原状。

第一次全量运行暴露了 Electron 构建依赖不存在的 `corepack`，已修复为直接调用 pnpm。后续并发运行出现 PGlite 冷启动、备份恢复和 Tauri 内存用例超时；Electron 与 Tauri 对应套件均已单独串行通过。没有扩大测试时限或降低断言。

全局设置 `VITEST_MAX_WORKERS=1` 曾使 Angular 绑定的 16 项 mock 测试失败：Analog 默认 VM 线程池在复用 worker 时出现跨文件 mock 状态污染，旧版插件同样采用该默认线程池。指令单文件 16 项通过，移除全局限制后原配置完整 266 项通过。最终命令仅限制 Nx 任务并行度；Electron 重型套件、Tauri 内存用例单独限制 worker。

微信开发者工具 GUI E2E 未执行：CLI 接入探测 25 秒超时，因此保留已验证的 `miniprogram-automator@0.12.1`，不把未验证的 0.13.0 纳入升级。

## 剩余安全告警

`pnpm audit --json` 从 52 条告警降到 11 条；严重级别见下表。这不是零漏洞升级。

| 严重级别 | 升级前 | 升级后 |
| -------- | ------ | ------ |
| Critical | 3      | 2      |
| High     | 20     | 4      |
| Moderate | 22     | 5      |
| Low      | 7      | 0      |

剩余告警集中于构建、文档生成和模板下载工具：

- Taro CLI 的模板下载链：`got` 8/9、`git-clone` 0.1.0、`decompress` 4.2.1、`decode-uri-component` 0.2.2。其中 `decompress` 含 2 条 critical 告警；`git-clone` 和 `decompress` 没有可用修复版本。
- Taro Vite runner 的 `html-minifier` 4.0.0：上游没有可用修复版本。
- OpenAPI 文档生成器经 `postman-collection` 引入 `@faker-js/faker` 5.5.3；修复版本要求 10.5.0 以上，涉及跨多个主版本的 API 变化。
- Codecov 构建插件使用 `zod` 3.25.76；审计给出的修复版本为 4.6.6 以上，需要上游完成主版本迁移。

以上依赖继续保留原兼容关系，不采用跨主版本强制覆盖掩盖告警。
