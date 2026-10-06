---
id: US-602
title: 发布产物面向 AI 的可理解性
status: Backlog
priority: Medium
epic: epic-007-public-api-gates
created: 2026-09-22
updated: 2026-10-06
tags: [tooling, dx, llms-txt, agent-skills, package-graph]
---

<!--
INVEST 检查清单:
- [x] Independent: A1 / B / C 只动 scripts/audit/、website/、根 package.json 与 CI 接线、主包非运行时文件，以及核心三个入口的 TSDoc；
      A2 改各包的 manifest（破坏性），单独关闭。任何阶段都不改运行时行为
- [x] Negotiable: 语义事实放哪（中心文件 vs 各包字段）、生成时机、样例宿主、Skill exporter 在对应阶段 plan 定案，约束见技术笔记
- [x] Valuable: 「该装哪几个、哪个槽位、何时 use、事务怎么写」是消费端 AI 今天答错的具体问题，症状见「病灶」
- [x] Estimable: 包与依赖边已实测枚举（门禁范围与投递范围的包数都由扫描得出，见范围边界），规则按包与边线性扫描，不需要通用推荐引擎
- [x] Small: 按 A1 / A2 / B / C 切分，各自有关闭条件；A1 可独立合并
- [x] Testable: 门禁规则用 __fixtures__/ 假包在 node:test 验证；真实仓库、打包消费、站点部署各有独立入口
-->

# 用户故事：发布产物面向 AI 的可理解性

## 作为/我想要/以便

**作为** 在自己项目里用 AI 助手写 Aiao 代码的开发者
**我想要** 助手能说清「npm 上装得到的 `@aiao/*` 包里我该装哪几个、每个配到哪个槽位、按什么顺序组合」
**以便** 我不必先把几十份 README 读一遍，才能让 AI 给出一段能跑、且每个包都装得到的初始化代码

## 病灶

以下三条都能在 npm 已发布的包上复现，不依赖对本仓库的访问：

1. **包选型与组合规则无载体**。正确的分层是：核心 1 个 → **每个后端槽位**选 1 个 backend
   （`sync.local.adapter` / `sync.remote.adapter`，本地 + 远端组合是常态）→ 插件可叠加、部分有运行时前置 →
   框架绑定选 1。旁边还有不进槽位的包：共享实现（`rxdb-adapter-sqlite-core`）、附加能力（`rxdb-adapter-encrypted`）、
   独立工具（`code-editor*`、`utils`、`rxdb-client-generator`、`rxdb-devtools`、`rxdb-test`）。
   这些知识今天散在 [根 README](../../../README.md) 的目录树注释和各包 README 里；唯一被编码成规则的是
   `scripts/audit/docs-plugin-surface.mjs` 的 [`QUERYCACHE_FACTORIES`](../../../scripts/audit/docs-plugin-surface.mjs)——一个情景、
   只用来扫文档，缺的是跨情景、可投递的统一载体：
   - [Supabase 快速开始](../../../packages/rxdb-adapter-supabase/README.md) 同时注册 wa-sqlite 与 Supabase，分别配到 local / remote；
   - [HTTP README「两个槽位各归各位」](../../../packages/rxdb-adapter-http/README.md) 要求消费者自备 local 端 SQLite，
     且 QueryCache 路径必须 `use` history + sync + querycache 三个插件，缺一个 `connect()` 就抛 `RxDBMissingPluginError`——
     而 `rxdb-adapter-http` 的 `peerDependencies` 只有核心与 RxJS，**沿 npm 依赖边推不出这组运行时前置**。

   单个包的 tarball 里没有任何一处描述它与兄弟包的关系，AI 读完 `@aiao/rxdb-plugin-graph@0.0.26`
   也答不出「还要装哪个 adapter、配到哪个槽位」。反过来，仓库 `main` 上有 16 个包不在 `v0.0.26` tag 树里（`git ls-tree v0.0.26 packages/` 与 `packages/` 求差集）：
   tree / working-tree / replay 系 12 个在 npm 上 404，`rxdb-model` 系 4 个停在 0.0.19——只看仓库的 AI 会推荐装不到或装到旧 API 的包。

2. **依赖声明写法分裂，消费者无从判断共享宿主约束**。同一种「需要核心包」的关系有多种写法：

   ```jsonc
   // packages/rxdb-angular/package.json
   "peerDependencies": { "@aiao/rxdb": "^0.0.26", "@aiao/rxdb-plugin-graph": "^0.0.26", "@aiao/utils": "^0.0.26" }
   // packages/rxdb-adapter-http/package.json
   "peerDependencies": { "@aiao/rxdb": "workspace:*" }
   // packages/rxdb-adapter-wa-sqlite/package.json
   "dependencies":     { "@aiao/rxdb": "workspace:*", "@aiao/rxdb-adapter-sqlite-core": "workspace:*" }
   ```

   `dependencies` 本身不必然装出两份核心，peer 也不必然让用户亲手安装；但对一个靠装饰器元数据注册表的库，
   各包对核心给出互不相同的版本约束，就让「核心是否必须单实例、消费者要不要直接装」无从读出，版本错位时核心被装成两份实例是已知故障模式。

   这不是个别包的笔误。**源码计数**：`packages/` 下 24 个包把 `@aiao/rxdb` 放在 `dependencies`，17 个放在
   `peerDependencies`，后者内部又混用 `workspace:*`（3 个）、`*`（12 个）与 `^0.0.26`（`rxdb-angular`、`rxdb-model-angular`，尚未发布）；兄弟边上还有 `>=0.0.26`
   （`code-editor-angular`）。**npm 产物计数**见技术笔记「依赖写法」。框架绑定本身就不对称，且已发布：
   `@aiao/rxdb-angular@0.0.26`（已发布产物）对核心是 peer `*`，`@aiao/rxdb-react@0.0.26` 是 `dependencies` 精确 `0.0.26`，违反三框架对称。
   **复验方式**：`node -e` 遍历 `packages/*/package.json`，按 `@aiao/rxdb` 出现在哪个字段分组计数；产物侧 `npm view <pkg>@latest dependencies peerDependencies`。

3. **致命约束不在高频入口的声明旁**。
   - **插件早装**：贡献仓储的插件必须在 `init()` 之前 `use()`。已发布的例子是 `@aiao/rxdb-plugin-graph`：
     [`RxDBPluginGraph.install`](../../../packages/rxdb-plugin-graph/src/plugin.ts) 调 `this.rxdb.repository('GraphRepository', …)`，
     而 [`RxDB.init`](../../../packages/rxdb/src/RxDB.ts) 先 `#install_plugin()`、后 `entityManager.init()`——晚装时实体已按旧注册表初始化。
     `RxDB.connect()` 在异步启动前调 `init()`，所以实际就是第一次 `connect()` 之前。
     带系统贡献的插件晚装由 `#register_system_contribution()` 直接抛错（例如未发布的 `rxdb-plugin-working-tree`；
     未发布的 `rxdb-plugin-tree` 属于贡献仓储一类，发布后同样适用）。**普通插件晚装合法**——`RxDB.use` 的 TSDoc
     「`init()` 之后注册的插件立即安装」对它们是对的，缺的是对前两类的区分，照着 `.d.ts` 推理会把它推广到所有插件。
   - **事务内 `await entity.save()`**：会落回队列并永久挂起（[rxdb README](../../../packages/rxdb/README.md)）。
     事务入口是 [`RxDBAdapterBase.transaction`](../../../packages/rxdb/src/rxdb-adapter.ts) 的两个抽象重载，各具体适配器覆写
     （如 `RxDBAdapterPGlite.transaction`）；`IRxDBAdapter` 接口上没有 `transaction`，`RxDB` 上也没有；
     [`TransactionExecutor`](../../../packages/rxdb/src/transaction/transaction-executor.interface.ts) 的 TSDoc 已写明
     「持有它才属于本事务，未持有必须重新排队」并给了正例，缺的是 `transaction()` 入口旁的 ❌ 反例。

**已经做对、本故事不重做的部分**：TSDoc 完整保留进 `.d.ts`，且带 ✅/❌ 对照的 `@example`——
已发布的 `@aiao/rxdb-vue` 里 [`useGet`](../../../packages/rxdb-vue/src/hooks.ts) 的声明可见：

```ts
 * const user = useGet(User, 'user-1');            // ✅ 整体持有
 * const { value } = toRefs(useGet(User, 'user-1')); // ✅ toRefs 后解构
 * const { value } = useGet(User, 'user-1');       // ❌ 一次性快照，之后永不更新
```

`.d.ts` 是助手读符号时最常触达的材料，但「经 LSP 进入上下文」取决于助手实现，不作保证。
本故事补的是包**之间**的关系与组合规则，那是 `.d.ts` 结构上无法承载的部分。

## Epic 归属

挂 [epic-007](../../epics/epic-007-public-api-gates.md) 而非 epic-004：本故事不产出任何运行时能力，
交付物是**生成器 + 防漂移门禁**，复用 `api-surface.mjs` 的包扫描与 `requirements/api-baseline/` 数据。
相应地，epic-007 的愿景需从「破坏性变更拦 CI」扩一句到「公开 API 的**对外表达**同样有真相源与门禁」——
该句由本故事的 AC#14 落地。

## 承诺边界

本故事承诺的是：**发现路径明确、材料可读、规则正确、样例可运行**。
助手是否自动摄取 `llms.txt` / Skill / `.d.ts`、实际回答准确率如何，属于后续观察，不写成验收，也不把在线大模型调用变成 CI 前置。

## 交付阶段

| 阶段 | 内容                                                                    | 依赖 | 关闭条件                                              | 状态 |
| ---- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------------- | ---- |
| A1   | 发布发现、语义事实源、漂移门禁与接线、生成生命周期、可运行样例源、TSDoc | 无   | AC#1–3、#5、#6、#12–15                                | ⬜   |
| A2   | `@aiao/*` peer 统一、真实打包与隔离消费验证、迁移发布                   | A1   | AC#4、#7、#8                                          | ⬜   |
| B    | 站点 `llms.txt` / `llms-full.txt`                                       | A1   | AC#9、#10、#16                                        | ⬜   |
| C    | 主包内嵌单份 Agent Skill（exporter 探针先行）                           | A1   | AC#11、#17 通过，或探针失败后在状态中明确标「C 延期」 | ⬜   |

三种投递格式**全部由 A1 的事实源与样例源生成**，不各自手写——否则就是三份互相漂移的文档。
B / C 只依赖 A1 的知识契约，不因 A2 的破坏性发布而停工；但生成物必须标明对应的发布版本，
不得把未发布的包或新写法（如 A2 之后才成立的安装清单）当作现版本用法投递。
A1 的 TSDoc（AC#12）与事实源、门禁、样例零耦合，可先单独提 PR。
故事 `Done` 要求 A1 / A2 / B 关闭，且 C 已交付或已按上表标为延期——不允许一边宣称整体完成、一边忽略 AC#11。

## 范围边界

### In Scope

- **A1 · 发布发现**：一次扫描、三个出口，包数都从扫描得出，不硬编码——
  - **门禁范围**：`packages/*` 下有 `package.json` 且非 private，不要求 `src/index.ts`，`rxdb-test` 在内（由扫描得出，不硬编码）。保证登记完整。
  - **投递范围**：最近一个 `v*` release tag 树里的包（`git ls-tree <tag> packages/` 离线得出，今 `v0.0.26` 下 34 个）。
    B / C 的选型索引、安装清单只取这个集合，生成物的版本标识就是这个 tag。
  - **API 基线范围**：`listPublicPackages()` 现有过滤，保持不变。
- **A1 · 语义事实源**：只登记 manifest 表达不了的事实，安装依赖边一律从 `package.json` 读取、不复制。
  至少覆盖：每包角色（core / backend / shared-impl / capability / plugin / binding / model / tool / standalone）、
  backend 可占的槽位（local / remote）、适用宿主、绑定与框架的对应；以及**组合情景**——每个情景给出必需包、
  必须 `use` 的插件、槽位分配与时序约束。首版情景矩阵固定为：纯本地、local + Supabase 双向同步、HTTP QueryCache、
  graph 插件、三框架绑定、code-editor 独立选型（tree 插件情景同时登记，进入投递范围后才投递）。
  情景只声明入口插件，插件间的前置（如 sync 的 `inject: ['plugin:history']`）从源码读，不在事实源里复制。
  `scripts/audit/docs-plugin-surface.mjs` 的 [`QUERYCACHE_FACTORIES`](../../../scripts/audit/docs-plugin-surface.mjs) / `QUERYCACHE_PACKAGES`
  改为从事实源读取、删掉硬编码，QueryCache 情景只剩一处人工来源
- **A1 · 漂移门禁**：`scripts/audit/package-graph.mjs`，校验——门禁范围的包全部登记、无删包残留与重复、
  情景无悬空引用（引用未登记的包或插件）、字段齐全、角色 / 槽位合法（同一情景的同一槽位不得放两个 backend，
  shared-impl / capability 不得占槽位）、`@aiao/*` 依赖不成环、情景的必需插件集合对插件 `inject` 依赖闭合
  （读 `inject` 若需 AST 成本过高，退为事实源与 `inject` 的交叉校验，A1 plan 写明取舍）。错误信息指向包名、字段与来源文件
- **A1 · 接线**：根 `package.json` 新增 `audit:package-graph`；`ci-template.yml` 在独立审计步骤（与 `audit:api-surface` 并列）
  每次 CI 跑真实 `packages/` 的 `--check`；发布前沿用同一步骤。`*.spec.mjs` 只用 fixtures，由既有 `pnpm test-scripts` 覆盖
- **A1 · 生成生命周期**：生成器读事实源 + manifest + 模板 + 样例源，输出稳定排序、不含当前时间，携带发布版本与事实摘要。
  事实源、manifest、模板、样例、生成器脚本进入**消费它们的** target（website build、主包 build / pack）的 Nx 输入或显式任务依赖；
  不全仓禁缓存。「构建时生成」还是「提交生成物 + `--check` 防漂移」在 A1 plan 二选一
- **A1 · 可运行样例源**：一个完整、独立的样例——安装清单与版本范围、编译选项（装饰器配置）、实体定义、
  `use → 注册 adapter → await connect → CRUD → disconnect`。宿主为 Node、本地 backend 选一个能在 Node 离线运行的（plan 定案），
  不要求在线 Supabase。它是载体中样例片段与安装清单的唯一输入，A1 内就在工作区跑通并进 CI（AC#15），B / C 不投递未执行过的样例
- **A1 · TSDoc**：`RxDB.use`（区分普通插件 / 贡献仓储 / 带系统贡献三类，保持现有安装与销毁语义）、
  `RxDB.connect`（`init()` 时序）、`RxDBAdapterBase.transaction` 两个重载（✅ 经 executor 取 repository 读写 / ❌ 回调里 `await entity.save()`），
  并在 `TransactionExecutor` 与 `EntityBase.save` 加交叉提示。不新增 `RxDB.transaction()`，不改运行时行为
- **A2 · peer 统一**：`@aiao/rxdb` 一律进 `peerDependencies`；`@aiao/*` 之间所有 peer 写法统一为 `workspace:^`，
  原有 `peerDependenciesMeta.optional` 语义保留；门禁加这条规则
- **A2 · 发布链验证**：从各项目**解析后的** release packageRoot（如 `rxdb-angular` 是 `dist/packages/rxdb-angular`）真实 `pnpm pack`，
  在工作区外的临时消费者用 npm 与 pnpm 安装同批 tgz 验证（见 AC#8）
- **B**：文档站构建产出 `llms.txt`（分节索引，头部由事实源生成：分层选型表 + 最小可运行样例）与 `llms-full.txt`；
  链接一律取 [`docusaurus.config.ts`](../../../website/docusaurus.config.ts) 的 `url`（现为 `https://docs.aiao.io`），生成器不硬编码域名
- **B · 语料口径**：投递范围内的包全部进 `llms.txt` 选型索引（一句话简述 + 权威链接）；范围外的包（只在 `main` 上，
  或 npm 上停在旧版本如 `rxdb-model` 系）一律不给安装命令，是不列还是显式标「未发布（仅 `main`）」在 B plan 二选一。
  站点从 `main` 构建（`netlify.toml`），所以这条过滤必须在生成器里，不能指望站点内容自然对齐 npm。
  `llms-full.txt` 只承诺**站点公开文档全文**（手册 + API 页），不承诺「所有包全文」。未进 TypeDoc 入口的包在索引里显式标出覆盖方式
- **C**：`@aiao/rxdb` 主包内 `skills/aiao-rxdb/SKILL.md`（frontmatter 按锁定 exporter 的 schema），正文由事实源与样例源生成、只覆盖投递范围；
  `files` 白名单加 `"skills"`、`keywords` 加 `agent-skills`；`package.json` 的元数据字段按锁定 exporter 的 schema 声明（不预设 `agents`）

### Out of Scope

- **MCP 服务器**——价值独立（能回答「我已装这几个包，还缺什么」这类静态文档答不了的问题）、
  前置独立（需消费者改 MCP 配置）、关闭条件独立，按 CONVENTIONS「新开编号」判据另立故事。
  它应建在本故事的事实源之上，不另起一份数据
- 通用约束求解器 / 推荐引擎——固定规则 + 情景矩阵足够
- 为每个包各写一份 Skill 或 `AGENTS.md`——维护成本乘以包数且必然漂移，与唯一事实源冲突
- 把 `skills/` 塞进主包以外的任何包；包安装时自动改写消费者助手目录的副作用；为追多个生态约定加多套 fallback
- 扩大 `api-surface.mjs` 的扫描粒度（仍是名称 + kind），分级判定不变
- 各包 README 的重写；本故事只在事实源里补关系，不动 README 正文
- 为了让生成器好写而增删任何包的 `exports` 或拆分包；把 `rxdb-test` 塞进 TypeDoc
- 额外的 JSON 端点
- `apps/` / `modules/` / `examples/` 下的项目（临时消费者在工作区外临时创建，不新增正式 app）

## 验收标准

| #   | 前置条件                              | 操作                                                                                                                                                                                                                                                                                                                                                  | 预期结果                                                                                                                                                                                                                                                                                                                                                                | 状态 |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | A1：fixtures                          | 分别构造：未登记的非 private 包、**无 `src/index.ts` 的非 private 资源包**未登记、登记了已删除的包、重复登记、情景引用未登记的包；另给一个只在工作树、不在 fixture tag 树里的包                                                                                                                                                                       | 门禁非零退出，各自指出包名与来源字段；资源包与 `rxdb-test` 类 tool 包进入门禁范围，`listPublicPackages()` 的返回不变；tag 外的包在门禁范围内、不在投递范围内                                                                                                                                                                                                            | ⬜   |
| 2   | A1：fixtures                          | 情景在同一槽位放两个 backend；把 shared-impl 或 capability 包放进槽位；制造 `@aiao/*` 依赖环                                                                                                                                                                                                                                                          | 门禁非零退出，指明情景名 / 槽位 / 环上的包                                                                                                                                                                                                                                                                                                                              | ⬜   |
| 3   | A1：fixtures                          | 正例：wa-sqlite（local）+ Supabase（remote）；SQLite（local）+ HTTP（remote）QueryCache；具体 SQLite adapter 依赖 sqlite-core；本地 adapter + encrypted；backend 间单向边（如 `miniprogram → wa-sqlite`、`electron ⇢ pglite` optional peer）；反例：QueryCache 情景只声明 sync + querycache、而 sync 的 fixture `inject` 含 history 时删掉 history 包 | 正例全部通过；QueryCache 情景算出的必需项含 local backend 与 history / sync / querycache 三个插件（history 经 `inject` 闭合得出），纯本地情景不含它们；code-editor 情景不含任何 RxDB adapter；反例非零退出并指出缺的插件；`docs-plugin-surface` 的 QueryCache 包名取自事实源                                                                                            | ⬜   |
| 4   | A2：fixtures                          | `@aiao/rxdb` 放在 `dependencies`；`@aiao/*` peer 写成 `*` / `workspace:*` / `>=x`；删掉原有 `peerDependenciesMeta.optional`                                                                                                                                                                                                                           | 门禁非零退出；统一为 `peerDependencies` + `workspace:^` 且 optional 保留后通过                                                                                                                                                                                                                                                                                          | ⬜   |
| 5   | A1：真实仓库副本                      | 在临时副本里制造一处漏登，执行 CI 使用的**顶层入口** `pnpm audit:package-graph`                                                                                                                                                                                                                                                                       | 非零退出并显示为审计失败；未改动时同一入口在真实 `packages/` 上通过                                                                                                                                                                                                                                                                                                     | ⬜   |
| 6   | A1：fixtures                          | 生成器对同一 fixture 事实源 + 模板连续生成两次；手改生成物后跑 `--check`                                                                                                                                                                                                                                                                              | 两次输出字节一致、不含当前时间、带版本标识与事实摘要；篡改被 `--check` 检出并非零退出                                                                                                                                                                                                                                                                                   | ⬜   |
| 7   | A2 合并后                             | 对发布发现函数列出的全部项目跑 build                                                                                                                                                                                                                                                                                                                  | 全部通过，集合含 `rxdb-angular` / `rxdb-react` / `rxdb-vue`（它们不带 `js-lib` 标签，不能用 `tag:js-lib` 代替发布集合）；无运行时代码变更                                                                                                                                                                                                                               | ⬜   |
| 8   | A2：各 packageRoot 已真实 `pnpm pack` | 解包检查；在工作区外临时项目分别用 npm、pnpm 安装同批 tgz（不经 workspace links / tsconfig paths），覆盖代表性 adapter / plugin / binding 组合                                                                                                                                                                                                        | 发布后的 dependencies / peers 为 `^<版本>`、入口与 `.d.ts` 齐全；三框架绑定可导入并最小构建；兼容组合下核心解析为同一路径；核心版本不兼容时安装或解析明确失败；A1 样例源编译、跑通 CRUD 断言并正常退出                                                                                                                                                                  | ⬜   |
| 9   | B：本地 build                         | `pnpm nx build website`                                                                                                                                                                                                                                                                                                                               | 输出含 `llms.txt` 与 `llms-full.txt`；`llms.txt` 每节有链接与一句话描述，投递范围内的包都在选型索引里、范围外的包没有安装命令（另有 fixture：不在 tag 树里的包、npm 上停在旧版本的包都不生成安装命令），版本标识等于最近 `v*` tag，链接以 `docusaurus.config.ts` 的 `url` 为前缀；两文件不超过 B plan 定的 UTF-8 字节上限，超限时构建失败而非静默截断；中文与代码块完整 | ⬜   |
| 10  | B：站点已部署                         | 请求 `https://docs.aiao.io/llms.txt` 与 `https://docs.aiao.io/llms-full.txt`                                                                                                                                                                                                                                                                          | 均为 HTTP 成功、最终 URL 符合部署策略（旧域名 `rxdb.netlify.app` 是别名还是重定向在 B plan 写明）、`Content-Type: text/plain; charset=utf-8`、正文不是 HTML fallback，含版本标识、选型表与样例片段。线上请求只作部署 smoke，不进 fixtures 单测                                                                                                                          | ⬜   |
| 11  | C：exporter 已锁定                    | 临时项目安装真实核心 tgz（**核心为直接依赖**），执行锁定的 exporter 固定命令                                                                                                                                                                                                                                                                          | 生成的 Skill 路径、内容、相对引用与事实源一致；`SKILL.md` ≤ 8192 字节；tgz 含 `skills/aiao-rxdb/SKILL.md`，`files` 去掉 `"skills"` 时不含（反向用例）；核心仅被 peer 自动安装、或 Skill 路径无效时，结果与所选 exporter 文档一致并明确报告，不靠手工拷贝                                                                                                                | ⬜   |
| 12  | A1：TSDoc 已补                        | 读**实际打包**的 `.d.ts`，按符号与重载归属检查                                                                                                                                                                                                                                                                                                        | `RxDB.use` 区分三类插件且保留「普通插件晚装立即安装」；`RxDBAdapterBase.transaction` 两个重载都带 ✅ / ❌ `@example`，各具体适配器的 `transaction` 覆写不带与基类矛盾的 TSDoc；正例可编译，反例由受控队列 spy 或带清理的超时用例证明会重新排队，不挂死测试套件                                                                                                          | ⬜   |
| 13  | 全部阶段合并                          | `pnpm test-all` + CI 审计步骤                                                                                                                                                                                                                                                                                                                         | 绿；新增 `*.spec.mjs` 全部基于 `__fixtures__/` 假包，不断言真实 `packages/` 内容；真实仓库校验只走 `audit:package-graph`                                                                                                                                                                                                                                                | ⬜   |
| 14  | A1 合并                               | 读 epic-007 愿景段、status-overview 与 roadmap 的 US-602 摘要                                                                                                                                                                                                                                                                                         | 愿景已含「公开 API 的对外表达同样有真相源与门禁」一句且本故事列入目标清单；派生视图的阶段与排期表述与本故事一致                                                                                                                                                                                                                                                         | ⬜   |
| 15  | A1：样例源已落地                      | CI 中在工作区内用 Node + 离线本地 backend 编译并运行样例源                                                                                                                                                                                                                                                                                            | 跑通 `use → 注册 adapter → await connect → CRUD → disconnect`，CRUD 有断言，进程正常退出；样例任一步失败时 CI 失败                                                                                                                                                                                                                                                      | ⬜   |
| 16  | B：生成生命周期已接线                 | 暖缓存后只改语义事实或模板，再 `pnpm nx build website`                                                                                                                                                                                                                                                                                                | 不命中旧缓存，`llms.txt` 对应内容随之变化                                                                                                                                                                                                                                                                                                                               | ⬜   |
| 17  | C：生成生命周期已接线                 | 暖缓存后只改语义事实或模板，不手动生成，直接 build 并 `pnpm pack` 主包                                                                                                                                                                                                                                                                                | tgz 内的 `SKILL.md` 与事实源同版，不带出旧 Skill                                                                                                                                                                                                                                                                                                                        | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**语义事实放哪，A1 plan 二选一**：

- **方案 a：中心文件** `requirements/package-graph.json`。一处可读、门禁实现简单、与 `requirements/api-baseline/` 同构。
- **方案 b：各包 `package.json` 自带字段**，生成器聚合。角色、槽位、宿主天然属于单包；但**情景**是跨包事实，仍需一处中心声明。

倾向 a：情景与槽位分配本就是跨包事实。两个方案都只放语义事实，安装依赖边读 manifest——每种事实只有一个权威来源，
不让两份人工清单互校。关系方向与依赖种类在事实源里分开命名：实现依赖（manifest 的 dep / peer / optional）、
推荐搭配、必须 `use` 的插件，三者不混叫 dependency。

**包扫描复用** [`api-surface.mjs`](../../../scripts/audit/api-surface.mjs) 的那一次目录遍历，但门禁范围**不复用**它的两个过滤条件
（要求 `src/index.ts`、`EXCLUDED` 排除 `rxdb-test`）——那是 API 基线范围的裁剪。已定案：关系图的登记边界是**门禁范围**，`rxdb-test` 进图，角色为 tool；
投递边界是**投递范围**，两个集合不由同一份清单承担——门禁要完整性，投递要可安装性。

- `@aiao/rxdb-test@0.0.26` 已在 npm 上，也在 `v0.0.26` tag 树里，`nx.json` 的 `release.projects` 是 `packages/*`。消费者装得到的包就会被问到，图里缺它，等于替它回答「不存在」。
- 投递范围取 tag 树而不是 `npm view`：离线、确定，CI 的 `ci-template.yml` 已 `fetch-depth: 0` + `fetch-tags: true`。
  tag 外的包是 `packages/` 与 tag 树的差集；[release-plan](../../release-plan.md) 的「只在 `main` 上存在的 12 个包」是桥接锚点处的口径。
- `listPublicPackages()` 排除 `rxdb-test` 是 **API 基线范围**的裁剪（[versioning-policy](../../versioning-policy.md) 把它定为非产品 API），
  不是「是否公开」的判定，保持不变。
- 边界是 `packages/` 目录，不是 `private` 标记：`apps/dev-rxdb-react`、`apps/dev-rxdb-vue` 的
  `package.json` 同样叫 `@aiao/*` 且未标 `private`，只是不在门禁范围内。`packages/` 下没有 `package.json` 的残留目录（如 `rxdb-adapter-desktop/`）不算包。

**槽位规则**：互斥的作用域是「同一情景（同一实体同步配置）的同一 local / remote 槽位」，不是「同一项目只能装一个 adapter」——
[`RxDB.adapter()`](../../../packages/rxdb/src/RxDB.ts) 按名称注册工厂，一个实例可注册多个、不同实体可选不同后端。
backend 之间的单向依赖边真实存在且合法（`rxdb-adapter-miniprogram` 依赖 `rxdb-adapter-wa-sqlite`、`rxdb-adapter-electron` 对
`rxdb-adapter-pglite` 是 optional peer），门禁只禁成环，不禁单向边。

**门禁接线**：根 [`package.json`](../../../package.json) 的 `test-all` 是 `nx affected -t ...`，不调用任何 `audit:*` 根脚本；`test-scripts` 只跑 `*.spec.mjs`。
[CI](../../../.github/workflows/ci-template.yml) 的审计是显式逐条调用的独立步骤——新建脚本不会被自动执行。
因此采用成本最低的「每次 CI 独立审计步骤」，不做 affected target；发布前沿用同一步骤（release-plan 执行顺序第 0 步所在的 CI 段）。

**生成生命周期**：[`nx.json`](../../../nx.json) 的 `namedInputs.default` 是 `{projectRoot}/**/*` 加空的 `sharedGlobals`。
若事实源在 `requirements/`、生成器在 `scripts/`，它们天然不属于 website 或 `packages/rxdb` 的输入——
不显式声明，改了事实源后 build 会命中旧缓存、pack 会带出旧 Skill。生成器自身的确定性由 A1 的 AC#6 守，
两个消费 target 的缓存正确性分别由 B 的 AC#16、C 的 AC#17 守——各自在产物存在的阶段验收。

**依赖写法**（已定案，A2 执行）：`@aiao/rxdb` 一律进 `peerDependencies`，写 `workspace:^`；`@aiao/*` 之间其余 peer 边同样统一为 `workspace:^`。

- 发布产物对核心包给出三种关系（`npm view <pkg>@latest` 逐包核对 0.0.26 产物）：`workspace:*` 不论在 `dependencies` 还是 peer 里都被改写成精确版本
  （20 个包精确依赖 `0.0.26`、3 个包精确 peer），`*` 原样发布（6 个包的 peer 没有任何版本约束，哪个版本的核心都算满足）；
  另有 `rxdb-model` 系 3 个钉在 `0.0.19`，12 个 404。源码计数见病灶 2；与它的差额落在只在 `main` 上的包，以及源码里尚未发布的 `^0.0.26` peer 写法。
- `workspace:^` 发布时改写成 `^<版本>`（pnpm 的改写规则，仅 `pnpm pack` / `pnpm publish` 生效；AC#8 用真实 pack 核对产物，不用 `npm pack --dry-run`）。
  它在 0.0.x 下等于精确版本，从 0.1 起是「同一 minor 内的 patch 都兼容」，与 [versioning-policy](../../versioning-policy.md) 的 0.x 口径（minor 可能含破坏性变更）一致。
- 发布根以 `options.packageRoot ?? projectConfig.root` 为准：Angular 绑定发 `dist/packages/rxdb-angular`，不是源码目录。AC#8 逐项目解析，不假设都是 `packages/<name>`。
- 工作区内 peer 写法可行（`rxdb-adapter-encrypted` / `-http` / `-supabase` 今天就只有 peer），但本仓 `.npmrc` 开了 `auto-install-peers`、关了严格 peer 校验——
  **工作区绿不能证明外部消费者装配安全**，所以 AC#8 必须在工作区外跑。临时消费者的写法参照
  [`desktop-adapter-consumer.mjs`](../../../scripts/audit/desktop-adapter-consumer.mjs)（参数化目标表，不复制第二份脚本）。
- 放在 `dependencies` 的兄弟边（`@aiao/utils`、`rxdb-adapter-sqlite-core` 之于各 SQLite 适配器等）由 manifest 照实读出，
  是否改成 peer 按「消费者会不会直接 import、是否必须单实例」逐条判，A2 plan 列清。
- 对外承诺的措辞：声明共享宿主约束、**推荐把直接 import 的核心列为消费者顶层依赖**、用消费测试防止多实例。不写「改为 peer 即保证单实例」。
- 影响面：消费者需显式安装核心包。提交标注 `BREAKING CHANGE`（0.x 下的级别换算见 versioning-policy §5），
  并在 `website/docs/migration/v1.md` 追加一节迁移说明。
  桥接区间已冻结为 `v0.0.24..de70a1a9`（[release-plan 桥接锚点定案](../../release-plan.md#桥接锚点定案)），
  A2 无论何时合入都进不了桥接版本，合入时点不受 [roadmap 排期约束 12](../../roadmap.md#排期约束) 牵制；
  它的 `BREAKING CHANGE` 随其后的迁移发布声明。

**Skill 的现实定位**：随包 Skill 的生态约定尚未统一。
[antfu/skills-npm PROPOSAL（提交 35ec05a）](https://github.com/antfu/skills-npm/blob/35ec05ae73b2d6db5c8d2058c5ec1c53567ca0f0/PROPOSAL.md)
按 `skills/` 等目录发现、`skills` 字段声明远端策展来源，**没有 `agents` 字段**，且默认只扫项目的直接依赖——核心若只被 peer 自动装上，不在默认发现集合里；
[onmax/npm-agentskills（提交 5a12b7b）](https://github.com/onmax/npm-agentskills/blob/5a12b7b4ab475593af015dd094b1d33419629ad0/README.md)
用 `agents.skills` 的 `{ name, path }` 条目与 `agents export --target <助手>` 命令。两条路线的字段、命令不可互换。
也**没有任何 AI 助手会自动扫 `node_modules`**，消费者必须先跑一次导出工具。

- C 开始前做一次探针，锁定 exporter 包名与版本、命令、目标助手、发现范围、输出是复制还是链接，并校验该版本要求的 frontmatter 与 manifest schema。
- 「导出工具能发现并导出」是 AC#11 的技术验收；「助手实际加载」另做一次手工验收记录在 plan，不并入 AC#11。
- C 定位为**低成本可撤销期权**，探针失败不阻塞 A1 / A2 / B，按「交付阶段」表标「C 延期」。
  已交付时的撤销判据：自 C 首个发布版本起满 6 个月，由 epic-007 owner 复核锁定的 exporter 及至少一个主流助手是否仍支持该约定；
  否则删掉 `skills/` 目录与对应字段，成本是一个目录。

**体积预算**（均按 UTF-8 字节计）：当前 `@aiao/rxdb-plugin-graph@0.0.26` 为 76 文件 / 46,288 B tarball（解包 186,600 B，
`npm view @aiao/rxdb-plugin-graph@0.0.26 dist.fileCount dist.unpackedSize` 可复验；测试与 `*.tsbuildinfo` 已由 `files` 负向模式正确排除）。C 只动主包，单份 `SKILL.md` ≤ 8192 字节。
`llms.txt` / `llms-full.txt` 的上限在 B plan 定案；若另用 token 上限须固定估算方式。超限按模块分片 + 索引链接，不静默截断。

**语料覆盖**：[typedoc.config.cjs](../../../website/typedoc.config.cjs) 的 `entryPoints` 有 41 个包，以下 9 个发布包不在其中：
`rxdb-adapter-electron`、`rxdb-adapter-http`、`rxdb-adapter-miniprogram`、`rxdb-adapter-tauri`、`rxdb-model`、`rxdb-model-angular`、
`rxdb-model-react`、`rxdb-model-vue`、`rxdb-test`。这是 API 页覆盖差异，不是说站点没有它们的手册——
「遍历站点」不等于「遍历所有发布包」，所以选型索引按投递范围生成，全文按站点生成，两个口径分开写。
插件版本与输出格式在 B plan 固定，测试不依赖第三方线上站点。

## 实现文件

| 阶段 | 文件                                                                  | 说明                                                                                                                                |
| ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A1   | `requirements/package-graph.json`                                     | 语义事实源（若 plan 选方案 a）                                                                                                      |
| A1   | `scripts/audit/package-graph.mjs` + `.spec.mjs` + `__fixtures__/`     | 发布发现、漂移门禁、生成器（或拆出独立生成脚本）                                                                                    |
| A1   | `scripts/audit/api-surface.mjs`                                       | 包扫描拆出「门禁范围」「投递范围」「API 基线范围」三个出口                                                                          |
| A1   | `scripts/audit/docs-plugin-surface.mjs`                               | `QUERYCACHE_*` 改读事实源，删掉硬编码                                                                                               |
| A1   | `package.json` / `.github/workflows/ci-template.yml`                  | `audit:package-graph` 根命令与 CI 独立审计步骤                                                                                      |
| A1   | `website/project.json` / `packages/rxdb/project.json`（或 `nx.json`） | 事实源、模板、样例、生成器进入消费 target 的输入或依赖                                                                              |
| A1   | 样例源（位置在 plan 定，不进 `apps/`）                                | 可运行初始化样例，载体片段与安装清单的唯一输入，CI 运行（AC#15）                                                                    |
| A1   | `packages/rxdb/src/RxDB.ts` / `rxdb-adapter.ts` / `transaction/` 等   | `use` / `connect` / `RxDBAdapterBase.transaction` 的 TSDoc                                                                          |
| A1   | `requirements/epics/epic-007-public-api-gates.md`                     | 愿景补一句 + 目标清单加本故事（AC#14）                                                                                              |
| A2   | `packages/*/package.json`                                             | `@aiao/*` peer 统一为 `workspace:^`，optional 保留                                                                                  |
| A2   | `scripts/audit/tree-adapter-dependencies.spec.mjs`                    | 现断言真实 manifest 的 peer 为 `workspace:*`，统一后必红；optional peer 一半并入 `package-graph` 门禁、类型导入一半保留，A2 plan 定 |
| A2   | 打包消费脚本（参照 `desktop-adapter-consumer.mjs`）                   | 真实 tgz 解包与 npm / pnpm 隔离消费（AC#8）                                                                                         |
| A2   | `website/docs/migration/v1.md`                                        | 追加一节：核心包改 peer 的迁移说明                                                                                                  |
| B    | `website/docusaurus.config.ts` / `website/package.json`               | 接入 llms.txt 插件，链接取站点 `url`                                                                                                |
| B    | `website/src/`                                                        | `llms.txt` 头部（由事实源生成）                                                                                                     |
| C    | `packages/rxdb/skills/aiao-rxdb/SKILL.md`                             | 主包单份 Skill，正文生成                                                                                                            |
| C    | `packages/rxdb/package.json`                                          | 按锁定 exporter 的元数据字段 + `files` 加 `"skills"`                                                                                |

## References

- [llmstxt.org](https://llmstxt.org/) — llms.txt 标准
- [docusaurus-plugin-llms](https://github.com/rachfop/docusaurus-plugin-llms) — Docusaurus 3 生成器候选
- [@signalwire/docusaurus-plugin-llms-txt](https://github.com/signalwire/docusaurus-plugins/tree/main/packages/docusaurus-plugin-llms-txt) — 同类候选
- [antfu/skills-npm PROPOSAL（提交 35ec05a）](https://github.com/antfu/skills-npm/blob/35ec05ae73b2d6db5c8d2058c5ec1c53567ca0f0/PROPOSAL.md) — `skills/` 目录发现约定
- [onmax/npm-agentskills（提交 5a12b7b）](https://github.com/onmax/npm-agentskills/blob/5a12b7b4ab475593af015dd094b1d33419629ad0/README.md) — `agents.skills` 与跨助手导出
- [pnpm 10 发布工作区包](https://pnpm.io/10.x/workspaces#publishing-workspace-packages) — `workspace:` 协议改写规则
- [US-601 子路径入口纳入 API 表面基线](./US-601-subpath-api-surface-baseline.md) — 包扫描与基线格式的来源
