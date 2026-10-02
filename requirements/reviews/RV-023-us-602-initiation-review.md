---
id: RV-023
title: US-602 发布产物面向 AI 的可理解性立项评审
status: Open
created: 2026-10-02
updated: 2026-10-02
pr:
---

# Review：US-602 发布产物面向 AI 的可理解性立项评审

RV-019 的 11 条已全部回写进 [US-602](../stories/tooling/US-602-ai-comprehensible-artifacts.md)。本次只回答两件事：**能不能立项**，以及立项前还剩什么硬伤。
桥接版本 `v0.0.26` 已于 2026-10-01 发布，故事里多处以 0.0.25 和「46 个发布包」为前提的断言需要按发布后的事实重验。

## 结论

⚠️ **A1 可立项，前提是先回写 R01～R04 四条 P1。** 价值成立：三条病灶在 npm 上已发布的包里都复现得出（见下表）；
A1 无硬前置。但故事把「仓库里的包」当成「装得到的包」，按现文本交付的 `llms.txt` 会让 AI 推荐 8 个 npm 上 404 的包。

## 已复核成立的前提

| 断言                                                                                                                                          | 复验方式                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/` 下 46 个带 `package.json` 的包，无 private；`rxdb-adapter-desktop/` 无 `package.json`                                             | `node -e` 遍历 `packages/*/package.json`                                                                                                               |
| 源码中 `@aiao/rxdb`：23 个在 `dependencies`，17 个在 `peerDependencies`（`workspace:*` 3 / `*` 14），另有 `code-editor-angular` 的 `>=0.0.26` | 同上，按字段与写法分组计数                                                                                                                             |
| 三框架绑定不对称在**已发布产物**上成立                                                                                                        | `npm view @aiao/rxdb-react@latest`：`dependencies` 含 `"@aiao/rxdb": "0.0.26"`；`@aiao/rxdb-angular@latest`：`peerDependencies` 含 `"@aiao/rxdb": "*"` |
| HTTP 适配器沿 npm 依赖边推不出运行时前置                                                                                                      | `rxdb-adapter-http/package.json` 的 `peerDependencies` 只有 `@aiao/rxdb` 与 `rxjs`；该包 0.0.26 已在 npm                                               |
| `RxDB.use` 的 TSDoc 只写「`init()` 之后注册的插件立即安装」，不区分插件类别                                                                   | `RxDB.use` 的 TSDoc 原文；`#register_system_contribution()`：`if (this.#rxdb_initialized) { throw new Error(...必须在 connect() 之前 use()...`         |
| `RxDB` 上没有 `transaction()`                                                                                                                 | `grep -n "transaction(" packages/rxdb/src/RxDB.ts` 只命中注释                                                                                          |
| `TransactionExecutor` 已有「持有它 = 有权在该事务内执行」判据                                                                                 | `transaction-executor.interface.ts`：`**持有它 = 有权在该事务内执行；未持有 = 必须重新排队。**`                                                        |
| TypeDoc 入口 37 个包，缺的 9 个与故事所列一致                                                                                                 | `website/typedoc.config.cjs` 的 `entryPoints` 与 `packages/` 求差集                                                                                    |
| 站点 `url` 为 `https://docs.aiao.io`；`.npmrc` 开 `auto-install-peers`、关严格 peer                                                           | `docusaurus.config.ts`；`.npmrc`                                                                                                                       |
| Angular 系绑定的 `packageRoot` 是 `dist/{projectRoot}`                                                                                        | `packages/*-angular/project.json` 共 6 处                                                                                                              |
| CI 有完整历史与 tag                                                                                                                           | `ci-template.yml`：`fetch-depth: 0` + `fetch-tags: true`                                                                                               |

## R01（P1）「发布范围」≠「装得到的集合」：12 个包只在 `main` 上

**问题**：故事以「46 个发布包」立论（用户故事陈述、INVEST、B 的「46 包全部进 `llms.txt` 选型索引」），并用「消费者装得到的包就会被问到」论证 `rxdb-test` 进图。但 `npm view` 逐包实测：

- `rxdb-plugin-tree`、`rxdb-plugin-working-tree` 及各自 `-angular` / `-react` / `-vue` 共 **8 个包 404**；
- `rxdb-model` 及三端绑定共 4 个包在 npm 上停在 **0.0.19**（远早于当前 API）；
- `v0.0.26` tag 树里只有 34 个包——与 [release-plan](../release-plan.md) 的「只在 `main` 上存在的 12 个包」一致。

而文档站由 `netlify.toml` 的 `command = "pnpm nx build website"` 从 `main` 构建。照现文本，B 交付的 `llms.txt` 会把 12 个包当作现版本可选项投递，AI 照此给出 `npm i @aiao/rxdb-plugin-tree` 只会 404；`rxdb-model` 更糟——装得上，装到的是 0.0.19 的旧 API。
故事已有「不得把未发布的新写法当作现版本用法投递」一句，但它只管写法、不管包本身，且与「46 包全进索引」直接冲突。

连带失真的证据：

- 病灶 1 的收尾例子「AI 读完 `@aiao/rxdb-plugin-tree` 也答不出…」——消费者今天根本装不到这个包，不是「今天踩得到的症状」。
- 体积预算「`@aiao/rxdb-plugin-tree@0.0.25` 为 55 文件 / 43.2 kB tarball」——npm 上没有这个版本，无法复验。
- 情景矩阵首版的「tree 插件」情景，投递时同样是未发布包。

**根因**：RV-019 定案「关系图边界是发布范围（`packages/*`）」时，桥接版本尚未发布，仓库内容与 npm 内容的差距没被当成一个维度。门禁要的是**完整性**（`packages/*` 全登记），投递要的是**可安装性**，两者被同一个集合承担。

**修复方案**：把两个集合分开写进故事。

- **门禁范围** = `packages/*`（46 个，现定案不变），保证登记完整。
- **投递范围** = 最近一个 `v*` release tag 树里的包（今天 34 个），离线、确定：`git ls-tree <tag> packages/` 即可得出，CI 已有 tag。生成物的版本标识就取这个 tag。不在投递范围的包，B / C 要么不列，要么显式标「未发布（仅 `main`）」，plan 二选一；`rxdb-model` 这类 npm 上有陈旧版本的，不得给出安装命令。
- 病灶 1 的例子换成已发布包；体积预算改用已发布包（如 `@aiao/rxdb-plugin-graph@0.0.26`）重测，或写明是本地 `pnpm pack` 的测量；「tree 插件」情景标注投递时机。
- AC#9 的「46 包都在选型索引里」改为「投递范围内的包都在索引里，范围外的包按定案处理」，并加一条 fixture：未在最近 tag 树里的包不出现安装命令。

## R02（P1）`IRxDBAdapter.transaction()` 不存在，AC#12 的检查对象指错

**问题**：故事三处（病灶 3、In Scope「A1 · TSDoc」、AC#12）把事务入口写成「`IRxDBAdapter.transaction()` 的两个重载」。`IRxDBAdapter`（`rxdb-adapter.ts`）的成员只有 `name` / `connect` / `disconnect` / 版本号等，**没有 `transaction`**；两个重载声明在抽象类 `RxDBAdapterBase` 上：

```ts
abstract transaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>>;
abstract transaction(fun: TransactionFun, transactionLog?: boolean): Promise<unknown>;
```

具体适配器还各自覆写（如 `RxDBAdapterPGlite.transaction`）。`audit:requirements` 没拦住，因为 `transaction` 这个符号在目标文件里确实存在——锚点门禁只验符号在不在，不验它归属哪个类型。

**根因**：沿用了 README 的叫法 `adapter.transaction(...)`，没回到声明处核对归属。

**修复方案**：三处改为 `RxDBAdapterBase.transaction` 的两个重载。AC#12 的预期结果补一句：具体适配器的覆写声明不得带与基类相矛盾的 TSDoc（不带时 TS 语言服务会沿用基类注释）。

## R03（P1）A1 的关闭条件依赖 B / C 的产物，而样例源在 A1 没有运行验收

**问题**：

1. AC#6 归在 A1，预期结果却是「**站点与 Skill** 对应内容随之变化…pack 出的内容与事实源同版」。`llms.txt` 是 B 的交付物，Skill 是 C 的，A1 合并时两者都还不存在，AC#6 在 A1 无法关闭。
2. 样例源是 B / C「载体中样例片段与安装清单的唯一输入」，但唯一跑它的验收是 AC#8——属于 A2，且是工作区外的隔离消费。B / C 只依赖 A1，于是会在样例**从未被执行过**的情况下投递它。

**根因**：RV-019 把阶段 A 拆成 A1 / A2 时，按「谁写文件」分配了 AC，没按「谁的产物存在」分配。

**修复方案**：

- AC#6 拆三份：A1 只验**生成器本身**——对 fixture 连续生成两次字节一致、篡改被 `--check` 检出；「暖缓存后改事实源，website build 随之变化」移到 B；「不手动生成直接 pack，内容与事实源同版」移到 C。
- A1 新增一条 AC：样例源在工作区内用 Node + 离线本地 backend 编译并跑通 `use → adapter → connect → CRUD → disconnect`，进 CI。AC#8 保留，验的是同一份样例在真实 tgz 下也成立。
- 可选：A1 的 TSDoc（AC#12）与事实源、门禁、样例**零耦合**，可以先单独提 PR，不必等门禁写完。

## R04（P1）QueryCache 情景已经有一份手写规则源

**问题**：病灶 1 说组合知识「只存在于根 README 的目录树注释和 46 份分散 README 里」。不完整：`scripts/audit/docs-plugin-surface.mjs` 已把 QueryCache 情景硬编码成门禁：

```js
export const QUERYCACHE_FACTORIES = ['rxDBPluginQueryCache', 'rxDBPluginSync', 'rxDBPluginHistory'];
```

（另有 `QUERYCACHE_PACKAGES` 列出三个包名），并据此扫描 `website/docs/**` 与各包 README。运行期还有第三处真相：`rxdb-plugin-sync` 的插件声明 `inject: ['plugin:history']`。
US-602 的事实源再登记一次「QueryCache 情景必须 `use` history + sync + querycache」，同一条事实就有了三处人工来源——与故事自己的「每种事实只有一个权威来源，不让两份人工清单互校」直接冲突。

**根因**：RV-019 盘点了 `api-surface.mjs` 的包扫描可复用，没盘点 `scripts/audit/` 下已经编码了组合规则的其它门禁。

**修复方案**：

- In Scope「A1 · 语义事实源」补一条：`docs-plugin-surface.mjs` 的 `QUERYCACHE_*` 改为从事实源读取（或反过来，plan 二选一），删掉硬编码。实现文件表加该脚本。
- 门禁加一条规则：情景的「必须 `use` 的插件」集合对插件 `inject` 依赖**闭合**——这样 sync → history 这条边从源码读，事实源只声明情景入口插件，不复制 `inject`。若读 `inject` 需要 AST 成本过高，至少做成两处交叉校验，并在 plan 里写明取舍。
- 病灶 1 措辞写实：已有一处文档门禁编码了其中一个情景，缺的是跨情景、可投递的统一载体。

## R05（P2）证据口径停在 0.0.25，与已发布产物对不上

**问题**：

- 「发布产物今天对核心包给出三种关系（`npm view` 核对 0.0.25 产物）：…23 个包精确依赖、3 个包精确 peer…14 个包的 peer 没有任何版本约束」——23 / 3 / 14 是 `main` 源码的计数，套到 npm 上不成立。`npm view <pkg>@latest` 实测：`dependencies` 精确 `0.0.26` 的 20 个、peer 精确 `0.0.26` 的 3 个、peer 为 `*` 的 6 个，`rxdb-model` 系 3 个钉在 `0.0.19`，8 个 404。
- 「`@aiao/rxdb-test@0.0.25` 已在 npm 上」——现为 0.0.26，结论不变，版本号过期。
- 病灶 3「插件早装」只引 tree README。npm 上能复现同一症状的是 `@aiao/rxdb-plugin-graph`：其 `install()` 调 `this.rxdb.repository('GraphRepository', …)`。带系统贡献的插件今天只有 `rxdb-plugin-working-tree`，同样未发布。
- 技术笔记「`test-all`…不含任何 scripts 审计」——它含 `audit-lazy-backend` 这个 Nx target。结论（新建的 `audit:*` 根脚本不会被自动执行）不变，措辞改为「不调用任何 `audit:*` 根脚本」。

**修复方案**：源码计数与 npm 产物计数分开写，各附复验命令；版本号更新到 0.0.26；病灶 3 主例换成 graph，tree / working-tree 作为「发布后同样适用」附注。

## R06（P2）A2 影响面漏了一份断言真实 manifest 的 spec

**问题**：`scripts/audit/tree-adapter-dependencies.spec.mjs` 直接读真实 `packages/rxdb-adapter-{pglite,sqlite-core,supabase}/package.json`，断言：

```js
assert.equal(pkg.peerDependencies[plugin], 'workspace:*');
```

A2 把 `@aiao/*` 之间所有 peer 统一为 `workspace:^` 后，它必红。实现文件表的 A2 行没有它。

**修复方案**：A2 实现文件表加这一行。它断言的「adapter 对 tree 是 optional peer、生产代码只做类型导入」中，optional peer 那半可以并进 `package-graph` 门禁的规则（与 AC#13「新 spec 不断言真实 `packages/`」同一精神），类型导入那半保留，A2 plan 定。

## 回写清单

| 去向                                     | 内容                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| US-602 用户故事陈述 / 病灶 1 / 病灶 3    | 46 → 门禁范围 46 + 投递范围（最近 tag，今 34）；例子换成已发布包（R01 / R05）                          |
| US-602 In Scope A1 / B / C               | 投递范围定义与版本标识（R01）；`docs-plugin-surface.mjs` 改读事实源、`inject` 闭合规则（R04）          |
| US-602 AC                                | AC#6 拆到 A1 / B / C；新增 A1 样例运行 AC；AC#9 改投递范围；AC#12 改 `RxDBAdapterBase`（R01–R03）      |
| US-602 技术笔记 / 实现文件表             | npm 计数改实测；体积预算重测；`test-all` 措辞；A2 加 `tree-adapter-dependencies.spec.mjs`（R05 / R06） |
| status-overview / roadmap 的 US-602 摘要 | 回写后同步；从「立项池」移入哪个批次由 owner 定                                                        |
