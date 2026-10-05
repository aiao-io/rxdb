---
kind: review-plan
object: rxdb-devtools-extension
source_root: apps/rxdb-devtools-extension
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: in-progress
---

# rxdb-devtools-extension：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：全仓总计划 · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

浏览器扩展 background/content bridge/devtools ports，以及工作区共享面板的装载与权限。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 应用                                                                         |
| 源码范围            | [`apps/rxdb-devtools-extension`](../../../apps/rxdb-devtools-extension)      |
| Nx 项目             | `rxdb-devtools-extension`                                                    |
| npm 名称            | `rxdb-devtools-extension`                                                    |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W5 / 高（排期依据，不是缺陷结论）                                            |
| 受控文件盘点        | 38 个；测试/共享套件入口 7 个（按文件名，不代表覆盖率）                      |
| 执行状态            | 执行中：已进入全范围基线/入口阶段；专项及覆盖率未全部完成                    |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

- [`src/background/background-core.ts`](../../../apps/rxdb-devtools-extension/src/background/background-core.ts)
- [`src/content/bridge-core.ts`](../../../apps/rxdb-devtools-extension/src/content/bridge-core.ts)
- [`src/devtools/devtools-init.ts`](../../../apps/rxdb-devtools-extension/src/devtools/devtools-init.ts)
- [`src/devtools/services/port.service.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/port.service.ts)
- [`src/devtools/services/inspected-page-access.service.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts)
- [`README.md`](../../../apps/rxdb-devtools-extension/README.md)
- [`package.json`](../../../apps/rxdb-devtools-extension/package.json)
- [`project.json`](../../../apps/rxdb-devtools-extension/project.json)
- [`tsconfig.app.json`](../../../apps/rxdb-devtools-extension/tsconfig.app.json)
- [`tsconfig.json`](../../../apps/rxdb-devtools-extension/tsconfig.json)

## 3. 专项核查与最低复验场景

| 编号 | 专项                       | 核查动作                                                                                             | 最低复验场景 / 证据要求                                                                              | 状态                                                     |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1   | 跨边界消息身份             | 按 inspected tab/frame/document/session 建模 background/content/port route，核查导航与重连身份更新。 | 错 tab/frame、页面伪造、session rotation、port 重连、未知消息；拒绝时不能写 DB/file。                | 部分核销：已读四段路由/导航身份（详本轮逐C表）           |
| C2   | manifest / CSP / 权限      | 审查 manifest 配置、host permissions、资源暴露和执行 inspected page 的入口。                         | 不支持 scheme、无权限页面、恶意导航、生产 CSP；最小权限，不借调试状态扩大访问。                      | 部分核销：发布权限/CSP；授权晚到待证（详本轮逐C表）      |
| C3   | port 队列与生命周期        | 核查反压、超时、请求关联、disconnect 和 listener cleanup。                                           | 快速切 tab、慢页面、巨大消息、扩展 reload、重复 connect；不泄漏 port 或跨 session 晚到响应。         | 部分核销：port cleanup/退避，授权取消待证（详本轮逐C表） |
| C4   | 面板与 provider capability | 对照 modules/rxdb-devtools-panel 与 rxdb-devtools descriptors，确认 UI 权限提示与实际拒绝一致。      | 只读 provider、危险 file/settings 操作、批量部分失败、敏感 snapshot；权限不能只靠禁用按钮。          | 部分核销：provider token 接线（详本轮逐C表）             |
| C5   | 浏览器 / Electron 档位     | 核查 build-desktop-dev 与标准 extension build 的差异，以及 Chrome/Electron relay conformance。       | 真实 Chromium 扩展、Electron 加载、导航后重连、生产与开发资源；不以单一 chrome mock 宣称全宿主支持。 | 部分核销：Chrome/Electron 变体边界（详本轮逐C表）        |
| C6   | 测试可信度与产物           | 将 unit/conformance、extension E2E、packaged Electron 分开；核查测试 hook 与凭证/调试代码隔离。      | 真实 relay.spec 与安装后的 extension、冷启动、准备产物陈旧检测；不发布 fixture。                     | 部分核销：测试/产物 provenance（详本轮逐C表）            |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **7** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

优先核对以下测试证据入口，随后覆盖项目全部测试与配置：

- [`src/background/background-core.spec.ts`](../../../apps/rxdb-devtools-extension/src/background/background-core.spec.ts)
- [`src/devtools/services/inspected-page-access.service.spec.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.spec.ts)
- [`src/devtools/services/port.service.spec.ts`](../../../apps/rxdb-devtools-extension/src/devtools/services/port.service.spec.ts)
- [`src/content/bridge.spec.ts`](../../../apps/rxdb-devtools-extension/src/content/bridge.spec.ts)
- [`src/manifest.config.spec.ts`](../../../apps/rxdb-devtools-extension/src/manifest.config.spec.ts)
- [`src/public-contracts.spec.ts`](../../../apps/rxdb-devtools-extension/src/public-contracts.spec.ts)

运行配置：[`vite.config.ts`](../../../apps/rxdb-devtools-extension/vite.config.ts)、[`vitest.config.ts`](../../../apps/rxdb-devtools-extension/vitest.config.ts)。核对 include、provider、setup、coverage 与资源回收；文件存在不等于被 target 执行。

应用生产代码以四项覆盖率 ≥ **80%** 作为本轮评审目标（不是声称仓库已有应用硬门禁）；先确认测试配置和测量面。原生 Rust 与前端 TS 分开记录，E2E 不折算生产覆盖率；当前未测量。

### 联审边界

Nx 基线图中的直接内部依赖：[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-devtools-panel`（集成边界）](../../../modules/rxdb-devtools-panel)。

Nx 基线图中的直接消费者：[`dev-rxdb-electron-e2e`](dev-rxdb-electron-e2e.md)、[`rxdb-devtools-extension-e2e`](rxdb-devtools-extension-e2e.md)。

依赖图只用于导航，不能证明动态加载、生成代码、跨进程协议和真实调用方已全覆盖；没有图边不等于没有消费者。

必须对照的完整链路/语义边界：[`dev-rxdb-electron`](dev-rxdb-electron.md)、[`dev-rxdb-tauri`](dev-rxdb-tauri.md)、[`rxdb-devtools`](../packages/rxdb-devtools.md)、[`rxdb-devtools-extension-e2e`](rxdb-devtools-extension-e2e.md)。

## 5. 执行命令与环境

前置环境：真实 Chromium 扩展加载环境；Electron 档位在 Electron 应用联测。共享面板位于 modules/，纳入集成调用链但不新增独立范围。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

### 基线已确认的评审目标

| Nx target   | 用途与证据边界                                                         |
| ----------- | ---------------------------------------------------------------------- |
| `lint`      | ESLint 零警告；检查忽略、禁用规则与警告策略，不只看进程退出码。        |
| `typecheck` | 公开 API 与本项目 TS 类型；注意配置 include / exclude 的真实范围。     |
| `test`      | 当前 Vitest 配置；核对 Node / DOM / browser project、skip 与依赖任务。 |
| `build`     | 当前构建产物；检查入口、声明、外部依赖、资源与可重复性。               |

表中只列本轮门禁/专项目标，不包含 serve、发布、更新或推断出的逐 spec shard。执行前重新获取 resolved config，确认目标、`dependsOn`、缓存输入及外部副作用；以当前配置为准。

### 常规初筛

```bash
NX_DAEMON=false pnpm nx show project rxdb-devtools-extension --json
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension:lint --max-warnings=0 --skipRemoteCache
CI=true NX_DAEMON=false pnpm nx run-many -t typecheck test build --projects=rxdb-devtools-extension --parallel=1 --skipRemoteCache
```

初筛允许读取本地缓存，但不能据此称本轮真实复现。用于缺陷复现/最终动态结论时，对下列任务使用 `--skipNxCache` 禁用本地缓存，并留存 SHA、命令、运行环境、通过/失败/skip 与日志。

### 专项与当轮动态证据（满足上述隔离前提后）

```bash
CI=true NX_DAEMON=false pnpm nx run rxdb-devtools-extension:test --coverage --skipRemoteCache --skipNxCache
```

- 普通 `test` 自身可能已经是 browser project；没有单独 `test-browser` 不表示缺少浏览器测试。EPIPE、worker 崩溃或 service stopped 先串行隔离复跑，不直接归因为业务缺陷。

## 6. 完成条件

- [ ] 全部受控源码、配置、测试与构建入口完成清点；导航列表之外的文件没有被默认排除。
- [ ] 每个 C 项都有明确结论与证据：通过、确认问题、未验证或不适用；后两者写明原因与补证动作。
- [ ] 不变量/权限边界由源码符号或短代码引用锚定；动态主张有最小复现、当轮命令与运行环境。
- [ ] 实际执行目标、缓存来源、skip、失败与串行复跑完整记录；覆盖率四指标/测量面单独登记。
- [ ] 上下游与适用的三框架/多宿主链路已对照，公开 API 与用户行为变更风险已分类。
- [ ] 确认问题按 P0–P3 去重、登记根因/最小修法/回归场景；未验证项不能包装成已通过。
- [ ] 形成 🟢 / 🟡 / 🔴 的有证据结论，并区分“评审完成”和“修复/发布就绪”；本计划勾选完成不代表缺陷已经修复。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/apps/rxdb-devtools-extension.md)。所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。

## 2026-10-04：树查询与 DevTools 第三批深审

[本对象实际意见与源码/运行证据](../results/apps/rxdb-devtools-extension.md) · 本批台账。未核销项不由生成器、mock 或其它后端门禁代证。

## 2026-10-05 frontends 并行评审收束

- 唯一对象：`rxdb-devtools-extension`，日期 **2026-10-05**；🟡 partial；不升格为全对象完成。
- scope 是范围，不是阅读证明：11/38 个 tracked 有实际展示行，11 个全文已展示；未读 27 个，其余为分段。精确路径/行段/当前 hash 在 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/file-inspection.json`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。
- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。
- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。

### 逐 C 证据、事件顺序、断言与必要待证

| C / 专题                      | 本轮结论                                  | 实际生产路径 / 符号行                                                                                                                                                                                                                                                                                                                                                                                                                 | 事件时序 / 不变量                                                                                                                                               | 测试判别力 / 已用证据                                                                                       | 必要未验与补证动作                                                                                                     |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| C1 跨边界消息身份             | 部分核销：已读四段路由/导航身份           | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/background/index.ts:19-28 sender id/frame gate`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/background/background-core.ts:142-214 INIT-owned tab / old-map release`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/content/bridge-core.ts:34-84 source/origin/direction`                                              | panel INIT 绑定 tab；content 上行必须自己扩展+主帧；同 port 换 tab 已删旧映射；导航推进 epoch；bridge 先校验再 adopt 私有 port。                                | 现有 RV-048 map 修复可见，不报旧红；unit/真实错误 frame/session/document 结果等待主控。                     | 端点才做 payload/session 严校验；relay 不凭 source 常量保证同 origin 脚本可信，document 导航与旧响应实际拒绝尚需证明。 |
| C2 manifest / CSP / 权限      | 部分核销：发布权限/CSP；授权晚到待证      | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/manifest.config.ts:38-70 optional-only / desktop-dev`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts:26-34,66-83,100-121 scheme / requestAccess / revision refresh`                                                                                                                            | 发布只有 scripting + optional hosts；desktop-dev 单独 localhost 静态权限；unsupported scheme 明示；refresh revision 守卫，但 requestAccess await 后没有同守卫。 | 新增 FE-PENDING-002 deferred grant 正对照/导航/销毁三个用例交主控，未 confirm；不说成 Chrome 权限绕过。     | production CSP/资源暴露/实际授权 UI 未核销；E2E 副本静态授权 variance 不能代替 optional grant。                        |
| C3 port 队列与生命周期        | 部分核销：port cleanup/退避，授权取消待证 | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/services/port.service.ts:55-86,120-124,148-203 subscribe / epoch / reconnect / disconnect`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/content/bridge.ts:27-45 adoptPort close old`                                                                                                                                               | 重连1s指数到30s；销毁停 timer、清 listeners/disconnect；导航取消 activation 并推进 epoch；旧私有 port 先摘 handler 再 close。                                   | requestAccess 晚到是否重新 activate 待 probe；完整队列/巨大帧/worker reload/断开 request 关联未执行。       | PortService 本身没有 byte queue/请求表，反压/超时属于端点，不能仅看到 reconnect 就核销这些子项。                       |
| C4 面板与 provider capability | 部分核销：provider token 接线             | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/main.ts:26-45 environment initializer / transport / host / lazy endpoint file channel`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-devtools/src/v2/authorization.ts:172-182 本地三层授权`                                                                                                                                                            | bootstrap 先实例化端点；文件 factory 每次取当前 endpoint，避免新 session 沿用旧实例；真实 permission 必须在 provider 判定，不只 disabled button。               | modules 面板能力 UI 全文件不属本轮已完成对象；只追已读接口边界，不将 unit disabled 当权限证明。             | actual DB/files/settings provider、只读 mutation 拒绝、snapshot 脱敏与批失败需真实用户测试。                           |
| C5 浏览器 / Electron 档位     | 部分核销：Chrome/Electron 变体边界        | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/manifest.config.ts:13-25,61-70 desktop-dev variant`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts:112-134 no permissions host variance`                                                                                                                                                       | Electron 无运行时 permissions 的已声明差异；app scheme unsupported；默认发布不能为它增加 all_urls 静态权限。                                                    | Chrome fixture 真实四段但 DevTools 宿主补 API；本子任务未跑 Chrome/packaged Electron。                      | Electron/Tauri integration 与自定义生产 scheme 未核销；主控既有宿主结果必须注明适用 build，不用 chrome mock 推全宿主。 |
| C6 测试可信度与产物           | 部分核销：测试/产物 provenance            | `/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/tools/prepare.mjs:32-58 current build copy / test-only manifest variance`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts:39-102 host shim / persistent Chromium`；`/Users/jimmy/Documents/aiao/rxdb/apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.spec.ts:106-240 现有 unit 对照` | unit Chrome stubs、conformance、unpacked E2E、packaged Electron 四档不能混称；新增 probe 后旧 lint 输入不覆盖新文件。                                           | main69 lint/typecheck 绿只按旧输入面承接；unit 全套/新增 probe/extension E2E 已排验证请求，等待主控补结果。 | 38 tracked 只读11主体/配置与1测试，其他入口/测试/生产dist仍未全文审；不是完整对象候选。                                |

完整当轮门禁、完成条件逐项证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/results/apps/rxdb-devtools-extension.md`；本对象独立证据副本：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/frontends/objects/rxdb-devtools-extension.md`。
