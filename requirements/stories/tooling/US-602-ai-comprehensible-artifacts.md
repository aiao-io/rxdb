---
id: US-602
title: 发布产物面向 AI 的可理解性
status: Backlog
priority: Medium
epic: epic-007-public-api-gates
created: 2026-09-22
updated: 2026-09-26
tags: [tooling, dx, llms-txt, agent-skills, package-graph]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 scripts/audit/、website/ 与主包的非运行时文件，不碰任何包的运行时代码
- [x] Negotiable: 真相源放哪（中心文件 vs 各包 package.json 字段）在 plan 阶段二选一，见技术笔记
- [x] Valuable: 46 包选型是消费端 AI 今天答错的具体问题，症状见「病灶」
- [x] Estimable: 包数量与关系已枚举清楚，生成器可复用 api-surface.mjs 的包发现逻辑
- [x] Small: 按交付阶段 A/B/C 切分，A 阶段可独立合并
- [x] Testable: 门禁 AC 用 __fixtures__/ 假包在 node:test 验证；生成产物 AC 断言构建输出
-->

# 用户故事：发布产物面向 AI 的可理解性

## 作为/我想要/以便

**作为** 在自己项目里用 AI 助手写 Aiao 代码的开发者
**我想要** 助手能说清「46 个 `@aiao/*` 包里我该装哪几个、按什么顺序组合」
**以便** 我不必先把 46 份 README 读一遍，才能让 AI 给出一段能跑的初始化代码

## 病灶

以下三条都能在消费端复现，不依赖对本仓库的访问：

1. **包选型无载体**。分层（核心 1 个 → 适配器**互斥选 1** → 插件可叠加 → 框架绑定选 1）
   这条知识今天只存在于 [根 README](../../../README.md) 的目录树注释和 46 份分散 README 里。
   单个包的 tarball 里没有任何一处描述它与兄弟包的关系，AI 读完 `@aiao/rxdb-plugin-tree`
   也答不出「还要装哪个 adapter」。

2. **依赖声明自相矛盾，AI 会照抄错的那半边**。同一种「需要核心包」的关系有两种写法：

   ```jsonc
   // packages/rxdb-plugin-tree-react/package.json
   "peerDependencies": { "@aiao/rxdb": "*", "@aiao/rxdb-plugin-tree": "*", "@aiao/rxdb-react": "*" }
   // packages/rxdb-adapter-wa-sqlite/package.json
   "dependencies":     { "@aiao/rxdb": "workspace:*", "@aiao/rxdb-adapter-sqlite-core": "workspace:*" }
   ```

   `peerDependencies` 是 npm 自己会校验的机器可读关系；`dependencies` 则让 AI 判定
   「核心包是 adapter 的实现细节，用户不必显式安装」。对一个靠装饰器元数据注册表的库，
   核心被装成两份实例是已知故障模式。

   这不是个别包的笔误：`packages/` 下 23 个包把 `@aiao/rxdb` 放在 `dependencies`，17 个放在
   `peerDependencies`，后者内部又混用 `workspace:*`（3 个）与 `*`（14 个）。框架绑定本身就不对称——
   `rxdb-angular` 用 peer，`rxdb-react` / `rxdb-vue` 用 dependencies，违反三框架对称。
   **复验方式**：`node -e` 遍历 `packages/*/package.json`，按 `@aiao/rxdb` 出现在哪个字段分组计数。

3. **致命时序只写在 README 正文**。贡献仓储的插件必须在 `init()` 之前 `use()`
   （[rxdb-plugin-tree README](../../../packages/rxdb-plugin-tree/README.md) 的「必须在 init() 之前 use()：
   仓储注册发生在 init() 内部」；`connect()` 会同步调用 `init()`，所以实际就是第一次 `connect()` 之前），
   以及事务内 `await entity.save()` 会落回队列并永久挂起（[rxdb README](../../../packages/rxdb/README.md)）。
   两条都不在 `.d.ts` 里；`RxDB.use` 的 TSDoc 反而只写了「`init()` 之后注册的插件立即安装」，
   照着 `.d.ts` 推理会得出晚装也行的结论。AI 只有主动 open README 才读得到正确约束。

**已经做对、本故事不重做的部分**：TSDoc 完整保留进 `.d.ts`，且带 ✅/❌ 对照的 `@example`——
`TreeRepository` 的声明里可见：

```ts
 * // ✅ 正确：继承 TreeAdjacencyListEntityBase
 * // ❌ 错误：只继承 EntityBase，没有实现 ITreeEntity
```

`.d.ts` 是唯一经 LSP **自动**进入 AI 上下文的通道，这条通道已在位。本故事补的是包**之间**的关系，
那是 `.d.ts` 结构上无法承载的部分。

## Epic 归属

挂 [epic-007](../../epics/epic-007-public-api-gates.md) 而非 epic-004：本故事不产出任何运行时能力，
交付物是**生成器 + 防漂移门禁**，复用 `api-surface.mjs` 的包发现逻辑与 `requirements/api-baseline/` 数据。
相应地，epic-007 的愿景需从「破坏性变更拦 CI」扩一句到「公开 API 的**对外表达**同样有真相源与门禁」——
该句由本故事的 AC#11 落地。

## 交付阶段

| 阶段 | 内容                              | 独立可合并 | 状态 |
| ---- | --------------------------------- | ---------- | ---- |
| A    | 包关系真相源 + 漂移门禁           | 是         | ⬜   |
| B    | 站点 `llms.txt` / `llms-full.txt` | 依赖 A     | ⬜   |
| C    | 主包内嵌单份 Agent Skill          | 依赖 A     | ⬜   |

三种投递格式**全部由 A 阶段的真相源生成**，不各自手写——否则就是三份互相漂移的文档。

## 范围边界

### In Scope

- **A 阶段**：新增包关系真相源，至少覆盖四类事实——分层（core / adapter / plugin / binding / tool）、
  适配器互斥组、框架绑定与框架版本的对齐关系、组合时序约束（`use()` → `init()`，`connect()` 同步调用 `init()`）
- **A 阶段**：`scripts/audit/` 新增门禁，校验三件事：非 private 包全部登记（新增包漏登 = CI 红）、
  图中依赖边与各 `package.json` 的 `dependencies` / `peerDependencies` 实际一致、互斥组内成员不互相依赖
- **A 阶段**：`@aiao/rxdb` 一律声明为 `peerDependencies`，消除病灶 2 的自相矛盾；`@aiao/*` 之间的 peer 版本写法统一为 `workspace:^`
- **B 阶段**：文档站构建产出 `https://rxdb.netlify.app/llms.txt`（分节索引）与 `llms-full.txt`（全文）
- **B 阶段**：`llms.txt` 的头部由 A 阶段真相源生成，含分层选型表与最小可运行样例
- **C 阶段**：`@aiao/rxdb` 主包内 `skills/aiao-rxdb/SKILL.md`（YAML frontmatter + 正文），
  内容为包选型 + 组合规则 + 最小样例，正文由 A 阶段真相源生成
- **C 阶段**：主包 `package.json` 增加 `agents` 字段与 `files` 白名单条目 `"skills"`，
  并在 `keywords` 加 `agent-skills`
- 病灶 3 的两条时序约束提升进对应符号的 TSDoc（`RxDB.use` / `connect` / `transaction`），
  使其经 `.d.ts` 自动进入 AI 上下文

### Out of Scope

- **MCP 服务器**——价值独立（能回答「我已装这几个包，还缺什么」这类静态文档答不了的问题）、
  前置独立（需消费者改 MCP 配置）、关闭条件独立，按 CONVENTIONS「新开编号」判据另立故事。
  它应建在本故事的真相源之上，不另起一份数据
- 为 46 个包各写一份 Skill 或 `AGENTS.md`——维护成本乘以 46 且必然漂移，与唯一真相源冲突
- 把 `skills/` 塞进主包以外的任何包
- 扩大 `api-surface.mjs` 的扫描粒度（仍是名称 + kind），分级判定不变
- 各包 README 的重写；本故事只在 A 阶段真相源里补关系，不动 README 正文
- 为了让生成器好写而增删任何包的 `exports` 或拆分包
- `apps/` / `modules/` / `examples/` 下的项目

## 验收标准

| #   | 前置条件              | 操作                                                   | 预期结果                                                                                                                                  | 状态 |
| --- | --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | A：真相源已建立       | 在 `packages/` 下新增一个非 private 包但不登记进真相源 | 门禁脚本非零退出，错误信息指出缺失的包名                                                                                                  | ⬜   |
| 2   | A：真相源已建立       | 把某包的 `peerDependencies` 改成与真相源声明不一致     | 门禁非零退出，错误信息同时给出「图中声明」与「package.json 实际」两侧                                                                     | ⬜   |
| 3   | A：真相源已建立       | 让同一互斥组内两个 adapter 互相依赖                    | 门禁非零退出并指明互斥组名                                                                                                                | ⬜   |
| 4   | 病灶 2 的两种写法并存 | 跑门禁                                                 | 把 `@aiao/rxdb` 放在 `dependencies` 的包（含 `rxdb-adapter-wa-sqlite`、`rxdb-react`、`rxdb-vue`）被拦下，peer 写成 `*` 或 `workspace:*` 的同样被拦下；统一为 `peerDependencies` + `workspace:^` 后通过 | ⬜   |
| 5   | A 阶段合并后          | `pnpm nx run-many -t build --projects=tag:js-lib`      | 全部包构建通过，无任何运行时代码变更导致的回归                                                                                            | ⬜   |
| 6   | B：插件已接入         | `pnpm nx build website`                                | 构建输出含 `llms.txt` 与 `llms-full.txt`，前者每个文档分节均有链接与一句话描述                                                            | ⬜   |
| 7   | B：站点已部署         | 请求 `https://rxdb.netlify.app/llms.txt`               | 返回 `text/plain`，头部含分层选型表与一段含完整 import 的最小可运行样例                                                                   | ⬜   |
| 8   | C：主包已加 `skills/` | `npm pack --dry-run` on `packages/rxdb`                | tarball 含 `skills/aiao-rxdb/SKILL.md`；`files` 未加 `"skills"` 时该文件不出现（反向用例）                                                | ⬜   |
| 9   | C：主包已发布形态     | 在空项目装主包后跑 `npx skills-npm` 一类导出工具       | Skill 出现在 `.claude/skills/`，内容与真相源一致                                                                                          | ⬜   |
| 10  | 病灶 3 的两条时序约束 | 构建后读 `dist/**/*.d.ts`                              | `use` / `connect` / `transaction` 的声明上方含标注 ❌ 错误写法的 `@example`                                                               | ⬜   |
| 11  | 本故事 A 阶段合并     | 读 epic-007 愿景段                                     | 愿景已含「公开 API 的对外表达同样有真相源与门禁」一句，且本故事列入其目标清单                                                             | ⬜   |
| 12  | 全部阶段合并          | `pnpm test-all`                                        | 绿；新增脚本的 `*.spec.mjs` 全部基于 `__fixtures__/` 假包，不断言真实 `packages/` 内容                                                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**真相源放哪，plan 阶段二选一**：

- **方案 a：中心文件** `requirements/package-graph.json`。好处是一处可读、门禁实现简单、
  与 `requirements/api-baseline/` 同构；代价是与 `packages/*/package.json` 天然两地，靠 AC#2 的门禁绑定。
- **方案 b：各包 `package.json` 自带字段**（如 `nx.tags` 扩展或自定义键），生成器聚合。
  好处是声明与包同处一地、不会漂移；代价是「互斥组」这类**跨包**事实没有自然归属，仍需一处中心声明。

倾向 a：互斥组与分层本就是跨包事实，强行分散到 46 处反而制造 46 个漂移点。`api-surface.mjs`
的设计取舍里已有同类判断——「唯一真相源与入口同处一地，不会像『另一份 paths 清单』那样各自漂移」，
但那里的单位是**入口**，天然属于单个包；本故事的单位是**包之间的关系**，不属于任何单个包。

**包发现逻辑复用** `api-surface.mjs` 的现成实现（非 private、有 `src/index.ts`），
不新写一套扫描，否则两处对「什么算公开包」的判定会分叉。已定案：关系图的边界是**发布范围**，`rxdb-test` 进图，层级为 tool。

- `@aiao/rxdb-test@0.0.25` 已在 npm 上，`nx.json` 的 `release.projects` 是 `packages/*`。消费者装得到的包就会被问到，图里缺它，等于替它回答「不存在」。
- `listPublicPackages()` 经 `EXCLUDED` 排除 `rxdb-test`、返回 45 个，这是 **API 基线范围**的裁剪（[versioning-policy](../../versioning-policy.md) 把它定为非产品 API），
  不是「是否公开」的判定，保持不变。plan 阶段把包发现拆成「发布范围」与「基线范围」两个出口，共用同一次扫描。
- 边界是 `packages/` 目录，不是 `private` 标记：`apps/dev-rxdb-react`、`apps/dev-rxdb-vue` 的
  `package.json` 同样叫 `@aiao/*` 且未标 `private`，只是不在发布范围内。

**依赖写法**（已定案）：`@aiao/rxdb` 一律进 `peerDependencies`，写 `workspace:^`。

- 发布产物今天对核心包给出三种关系（`npm view` 核对 0.0.25 产物）：`workspace:*` 不论在 `dependencies` 还是 peer 里都被改写成精确版本 `0.0.25`
  （23 个包精确依赖、3 个包精确 peer），`*` 原样发布（14 个包的 peer 没有任何版本约束，哪个版本的核心都算满足）。
- `workspace:^` 发布时改写成 `^<版本>`（pnpm 的改写规则；本仓发布链未实测，A 阶段用 `pnpm pack` 核对产物）。它在 0.0.x 下等于精确版本，
  从 0.1 起是「同一 minor 内的 patch 都兼容」，与 [versioning-policy](../../versioning-policy.md) 的 0.x 口径（minor 可能含破坏性变更）一致。
- 工作区内 peer 写法可行：`rxdb-adapter-encrypted` / `-http` / `-supabase` 今天就只有 peer、没有 devDependencies，
  本地靠 `.npmrc` 的 `auto-install-peers=true` 解析。
- `@aiao/*` 之间其余的 peer 边（各插件、`rxdb-model`、框架绑定被上层 peer 的那一侧）同样统一为 `workspace:^`，理由相同。
  放在 `dependencies` 的兄弟边（`@aiao/utils`、`rxdb-adapter-sqlite-core` 之于各 SQLite 适配器等）照实登记进真相源，
  是否改成 peer 按「消费者会不会直接 import、是否必须单实例」逐条判，plan 阶段列清。
- 影响面：消费者需显式安装核心包。提交标注 `BREAKING CHANGE`（0.x 下的级别换算见 versioning-policy §5），
  并在 `website/docs/migration/v1.md` 留一条迁移说明——这正是病灶 2 的根因值得留档的部分。AC#4 的门禁只认这一种写法。

**Skill 的现实定位**：`agents` 字段与 `skills/` 目录约定尚未定标准
（[skills-npm PROPOSAL](https://github.com/antfu/skills-npm/blob/main/PROPOSAL.md) 仍在提案阶段），
且**没有任何 AI 助手会自动扫 `node_modules`**——Cursor 读 `.cursor/rules`、Claude Code 读 `.claude/skills/`、
Copilot 读 `.github/`，消费者必须先跑一次导出工具。C 阶段因此定位为**低成本期权**，
其价值不构成 A/B 阶段的前置；若约定半年内未获采纳，删掉 `skills/` 目录的成本是一个目录。

**体积预算**：当前 `@aiao/rxdb-plugin-tree@0.0.25` 为 55 文件 / 43.2 kB tarball（`dist` 35 + `src` 17，
测试与 `*.tsbuildinfo` 已由 `files` 负向模式正确排除）。C 阶段只动主包，单份 `SKILL.md` 预算 ≤ 8 kB。
`llms-full.txt` 覆盖 46 包全文，需在 B 阶段确认体积上界并决定是否按目录裁剪。

## 实现文件

| 阶段 | 文件                                                    | 说明                                       |
| ---- | ------------------------------------------------------- | ------------------------------------------ |
| A    | `requirements/package-graph.json`                       | 包关系真相源（若 plan 选方案 a）           |
| A    | `scripts/audit/package-graph.mjs` + `.spec.mjs`         | 漂移门禁，复用 api-surface 的包发现        |
| A    | `packages/*/package.json`                               | `@aiao/rxdb` 统一为 peer + `workspace:^`   |
| A    | `website/docs/migration/v1.md`                          | 核心包改 peer 的迁移说明                   |
| A    | `requirements/epics/epic-007-public-api-gates.md`       | 愿景补一句 + 目标清单加本故事（AC#11）     |
| B    | `website/docusaurus.config.ts` / `website/package.json` | 接入 llms.txt 插件                         |
| B    | `website/src/`                                          | `llms.txt` 头部（由真相源生成）            |
| C    | `packages/rxdb/skills/aiao-rxdb/SKILL.md`               | 主包单份 Skill，正文生成                   |
| C    | `packages/rxdb/package.json`                            | `agents` 字段 + `files` 加 `"skills"`      |
| —    | `packages/rxdb/src/RxDB.ts` 等                          | `use` / `connect` / `transaction` 的 TSDoc |

## References

- [llmstxt.org](https://llmstxt.org/) — llms.txt 标准
- [docusaurus-plugin-llms](https://github.com/rachfop/docusaurus-plugin-llms) — Docusaurus 3 生成器候选
- [@signalwire/docusaurus-plugin-llms-txt](https://github.com/signalwire/docusaurus-plugins/tree/main/packages/docusaurus-plugin-llms-txt) — 同类候选
- [antfu/skills-npm PROPOSAL](https://github.com/antfu/skills-npm/blob/main/PROPOSAL.md) — `agents` 字段提案
- [onmax/npm-agentskills](https://github.com/onmax/npm-agentskills) — 跨助手 Skill 导出工具
- [US-601 子路径入口纳入 API 表面基线](./US-601-subpath-api-surface-baseline.md) — 包发现逻辑与基线格式的来源
