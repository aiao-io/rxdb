---
id: US-409
title: 浏览器运行时切换与对比
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-07
updated: 2026-11-07
tags: [aiao-vscode, terminal, webcontainer, runtime, benchmark]
---

# 用户故事：浏览器运行时切换与对比

## 作为/我想要/以便

**作为** aiao-vscode 的维护者
**我想要** 在同一个工作台里切换 6 种浏览器内运行方式，并用同一套脚本比较它们的性能、易用性、兼容性与功能
**以便** 用数据决定「运行」用哪个运行时，而不是默认绑定 WebContainer

今天踩得到的症状（[US-408](US-408-browser-terminal.md) 的同一套探针实测）：

- 「运行」从点击到服务页可见要 21～43 秒（React 23.7 秒、Vue 21.5 秒、Angular 42.6 秒），本地项目预览只要 1～2 秒。
- WebContainer 运行时闭源、由 StackBlitz 托管，[商业生产使用需要授权](https://webcontainers.io/enterprise)，不能自托管、不能离线。
- Angular 组件模板热更新在 WebContainer 预览页里被静默丢弃，只能靠整页刷新绕开。

## 范围边界

### In Scope

- 运行时适配接口：在现有终端运行时边界（文件系统、挂载、进程、服务就绪、释放）上增加能力声明；WebContainer 迁为第一个适配器，用户可见行为不变。
- 独立源宿主：WebContainer 以外的运行时各自放进独立源的宿主 iframe，工作台经 postMessage 调用；它们的 Service Worker 不注册在工作台的源上，不与 aiao-vscode 的离线 Service Worker（ngsw）冲突，项目代码与服务预览碰不到工作台存储。
- 切换入口：工作台设置「运行方式」（存 `preferences.json`）与地址参数 `?runtime=`；esbuild-wasm 作为「即时编译（无终端）」一档。
- 分层接入：vivari、Nodepod 完整适配并跑全矩阵；almostnode、burrow 只做最薄适配，按它们自身能力跑冒烟，失败记为兼容性结果。
- 对比基准：`aiao-vscode:verify-runtimes` 跑「运行时 × 四个内置模板」，产出 `benchmarks/browser-workbench-runtimes.json` 与对比报告。

### Out of Scope

- 更换默认运行时：本故事只产出数据与推荐，改默认值另行立项。
- 为 almostnode、burrow 补终端、流、挂载等它们本身缺失的能力。
- Nodepod 的商用采用：许可证为 MIT + Commons Clause，正式采用前需法务确认，本故事仅内部评估。
- 线上子域名部署与真实 origin 复验，沿用路线图「真实部署与公开访问」。

## 交付阶段

| 阶段 | 交付                     | 前置与关闭条件                                                                                                                  | 范围         | 状态 |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---- |
| A    | 适配接口、切换入口与基线 | WebContainer 迁为适配器且 US-408 用例与 verify-terminal 全绿；可切换 esbuild-wasm / WebContainer；基准脚本测出两者基线，AC#1～4 | 当前登记范围 | ✅   |
| B    | 独立源宿主与 vivari      | A 通过后先做宿主验证（跨源隔离、SharedArrayBuffer、Service Worker 作用域、Worker 资源路径），再接 vivari 跑四个模板，AC#5～8    | 当前登记范围 | ⬜   |
| C    | Nodepod                  | 复用 B 的宿主协议，完整适配并跑四个模板，AC#9～10                                                                               | 当前登记范围 | ⬜   |
| D    | almostnode、burrow 冒烟  | 最薄适配，按各自声称的能力跑冒烟并记录失败原因，AC#11                                                                           | 当前登记范围 | ⬜   |
| E    | 全矩阵与推荐             | 全部运行时跑完矩阵（每格 3 次取中位数，记录机器负载与浏览器版本），出对比报告与推荐，AC#12～13                                  | 当前登记范围 | ⬜   |

A 是 B～E 的前置：适配接口与基准口径先在两个已有方式上定型，后接的运行时只加适配器与宿主，不改测量口径。
某个运行时跑不通时保留失败证据并写进兼容性结果，不删模板、不退回同源嵌入。所有阶段均为本故事关闭所必需，没有候选 AC。

## 验收标准

### 阶段 A：适配接口、切换入口与基线

| #   | 前置条件               | 操作                                        | 预期结果                                                                                                     | 状态 |
| --- | ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 现有 WebContainer 终端 | 运行时迁为适配器                            | US-408 的终端与项目运行单测、`verify-terminal` 全部通过，行为不变                                            | ✅   |
| 2   | 工作台已打开项目       | 在设置里选「运行方式」或带 `?runtime=` 打开 | 「运行」走所选方式；切换时释放当前运行时与服务预览；选 esbuild-wasm 时「运行」只刷新本地项目预览，不启动终端 | ✅   |
| 3   | 适配器声明了能力       | 运行项目                                    | 有带状态标记 shell 的运行时走「输入命令」，没有的直接起安装、启动进程并自行回显命令行                        | ✅   |
| 4   | `verify-runtimes` 基准 | 对 esbuild-wasm、WebContainer 跑四个模板    | 报告含各阶段耗时、改动后预览更新延迟、内存、下载量与成败原因                                                 | ✅   |

### 阶段 B：独立源宿主与 vivari

| #   | 前置条件         | 操作                                     | 预期结果                                                                                             | 状态 |
| --- | ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 5   | 工作台已跨源隔离 | 嵌入独立源宿主 iframe                    | 宿主内 `crossOriginIsolated` 为真、SharedArrayBuffer 可用；宿主的 Service Worker 不影响工作台的 ngsw | ⬜   |
| 6   | vivari 宿主      | 运行四个内置模板                         | 安装、启动、服务预览与热更新逐项给出成败；Angular 22 + pnpm 单独给出结论                             | ⬜   |
| 7   | vivari 服务预览  | 在服务页里读取工作台的存储               | 读不到：服务预览与工作台不同源                                                                       | ⬜   |
| 8   | vivari 终端      | 交互命令、Ctrl+C、文件双向同步、终端尺寸 | 用与 WebContainer 相同的断言，结果写进报告；不支持 pty 时终端固定 80×24 而不报错                     | ⬜   |

### 阶段 C：Nodepod

| #   | 前置条件      | 操作             | 预期结果                                               | 状态 |
| --- | ------------- | ---------------- | ------------------------------------------------------ | ---- |
| 9   | Nodepod 宿主  | 运行四个内置模板 | 与 AC#6 同一口径给出结果；Angular 无上游证据，单独记录 | ⬜   |
| 10  | 报告与 README | 查看许可说明     | 标明 MIT + Commons Clause 与「仅内部评估」             | ⬜   |

### 阶段 D：almostnode、burrow 冒烟

| #   | 前置条件 | 操作                                                                       | 预期结果                               | 状态 |
| --- | -------- | -------------------------------------------------------------------------- | -------------------------------------- | ---- |
| 11  | 最薄适配 | 跑各自声称支持的最小场景（almostnode：npm + 自研 Vite；burrow：Bun.serve） | 成败与失败原因记入兼容性矩阵，不补能力 | ⬜   |

### 阶段 E：全矩阵与推荐

| #   | 前置条件   | 操作                                            | 预期结果                                                            | 状态 |
| --- | ---------- | ----------------------------------------------- | ------------------------------------------------------------------- | ---- |
| 12  | 全部适配器 | `pnpm nx run aiao-vscode:verify-runtimes`       | 每格 3 次取中位数，记录机器负载与浏览器版本；报告写入 `benchmarks/` | ⬜   |
| 13  | 对比报告   | 比较性能、易用性、兼容性、功能与许可 / 维护风险 | 给出推荐与理由；更换默认运行时另行立项                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 验收证据

| 范围        | 复验方式                                                                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 调研结论    | [运行时调研](US-409-runtime-research.md)（只读上游源码与文档，未运行其代码）                                                                                                                                                                                                                                                                        |
| 阶段 A 单测 | `pnpm nx test aiao-vscode`：`terminal-runtime.spec.ts`（带标记 shell 与进程两种项目运行、适配器声明的命令）、`webcontainer-adapter.spec.ts`、`workbench-state.spec.ts`、`mount-run.spec.ts`「运行方式」、`mount.spec.ts` 设置对话框                                                                                                                 |
| 阶段 A 回归 | `pnpm nx run aiao-vscode:verify-terminal --production --channel=chrome`：11 项通过，页面与控制台无错误                                                                                                                                                                                                                                              |
| 阶段 A 基线 | `pnpm nx run aiao-vscode:verify-runtimes --production --channel=chrome`；[报告](../../benchmarks/browser-workbench-runtimes.json)：四模板各 3 次全部通过。中位数——esbuild-wasm 运行 0.1～1.4 秒、改动生效 0.2～1.9 秒、运行期下载 0；WebContainer 运行到服务页 13.6～27.9 秒、改动生效 0.1～1.8 秒、停止后再运行 3.7～8.9 秒、运行期下载 42～111 MB |
| 阶段 B～E   | 随阶段补充；基准统一由 `pnpm nx run aiao-vscode:verify-runtimes` 复跑                                                                                                                                                                                                                                                                               |

## 技术笔记

- **适配接口**：沿用 `TerminalContainer`（文件系统、挂载、进程、`server-ready`、释放），适配器另声明能力——交互 shell 命令、项目运行是否走带状态标记的 shell（WebContainer 的 `jsh --osc`）、是否支持 pty 尺寸与 resize、支持的包管理器。工作台面向的 `TerminalRuntime` 接口不变。
- **项目运行**：有带标记 shell 的适配器沿用 US-408 的「输入命令」流程；其余直接起安装进程、成功后起启动进程，并自行回显命令行。
- **独立源宿主**：vivari、Nodepod、almostnode 都在根作用域注册 Service Worker，同源嵌入会顶掉 ngsw，且它们的服务预览默认与宿主同源。宿主页按运行时分源（本地不同端口、线上子域名），带 COOP / COEP / CORP 响应头，iframe 声明 `allow="cross-origin-isolated"`；协议把 `TerminalContainer` 的方法与流映射成 postMessage 请求、响应与流事件。
- **测量口径**：冷启动用全新浏览器上下文（无 OPFS 缓存），热启动用同一上下文再跑；改动延迟从保存到服务页内容变化计时，以页面导航与 DOM 读数为准；记录 `os.loadavg()` 与浏览器版本，负载过高时重跑。安装耗时受网络与 CDN 缓存影响很大（同一天两轮 WebContainer 运行到服务页的中位数相差 30%～70%），阶段 E 各运行时在同一时段交替跑，报告给出最小 / 最大值而不只给中位数。
- **已知风险**：vivari 发布产物里 Worker 资源路径写死，需自托管验证；Nodepod 线上预览需要通配域名；almostnode 在宿主主线程执行项目代码，只能在独立源宿主里跑。

## 实现文件

| 阶段 | 位置                                                                                     | 职责                                                                            |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A    | `apps/aiao-vscode/src/workbench/terminal/runtime-adapter.ts`                             | 运行方式标识与名称、能力声明、适配器接口                                        |
| A    | `apps/aiao-vscode/src/workbench/terminal/webcontainer-adapter.ts`                        | WebContainer 适配器：`jsh` / `jsh --osc`、授权 key 只配置一次                   |
| A    | `apps/aiao-vscode/src/workbench/terminal/terminal-runtime.ts`                            | 与运行时无关的终端运行时：文件同步、交互 Shell，带标记 shell 与进程两种项目运行 |
| A    | `apps/aiao-vscode/src/workbench/workbench-state.ts`、`workbench-settings.ts`、`mount.ts` | 「运行方式」偏好与设置项、`?runtime=` 覆盖、「运行」按方式分支                  |
| A～E | `apps/aiao-vscode/scripts/verify-runtimes.mjs`                                           | 对比基准脚本与报告                                                              |
| B～D | `apps/aiao-vscode/runtime-hosts/`                                                        | 各运行时的独立源宿主页与 postMessage 协议                                       |

## References

- [WebContainer 商业使用说明](https://webcontainers.io/enterprise)
- [vivari](https://github.com/maitrungduc1410/vivari)、[Nodepod](https://github.com/R1ck404/Nodepod)、[almostnode](https://github.com/macaly/almostnode)、[burrow](https://github.com/Dhravya/burrow)
