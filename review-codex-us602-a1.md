# 代码评审：codex/us602-a1（US-602 A1 + B）对 main 的全量差异

- **评审对象**：`codex/us602-a1` 与 `origin/main` 的全部差异（85 个文件，+6332/-96 行；2 个 commit：`688fd8bb` A1 门禁与事实源、`0d36c054` llms 文档产物发布）
- **评审方法**：逐行通读全部 diff + 10 个独立角度（逐行扫描、删除行为审计、跨文件追踪、语言陷阱、包装/代理、复用、简化、效率、海拔、规范）并行交叉 + 一轮盲扫漏；对 Nx 缓存行为、`git describe` 失败路径做了**隔离工作区的实证测试**（Nx 23.3.0 真实行为）
- **总体评价**：方向正确、工程质量整体在线（门禁在本分支上实际跑通、lint 零警告、事实源与 51 个真实 manifest 一致、TSDoc 与实现吻合、样例真实执行）。但存在 **2 个发布日会引爆的流程性缺陷**（发布后生成物漂移、已发布包删除死锁）和 **1 个部署环境风险**（无 tag 环境 website 构建硬挂，含 Netlify），以及若干缓存输入集与事实源准确性问题。建议修复后再合入。

---

## 高优先级（会在真实流程中炸）

### H1. 发布后生成物必然漂移：`nx release` 之后 main 上的门禁必红，直到人工补救

- 位置：[nx.json:91](nx.json:91)、[scripts/audit/package-graph.mjs:60-76](scripts/audit/package-graph.mjs)
- 生成物（`requirements/generated/package-knowledge.{json,md}`）把 `release.tag` 写进 `version` 字段，digest 也含 tag 与 manifest。`preVersionCommand` 在 **bump 之前**运行（此时最近的 tag 还是旧的，即使加 `--update` 也只会写回旧内容）；Nx 23.3.0 的 release 实现**没有 postVersionCommand**（已查 dist），`requirements/release-plan.md` 对这套生成物只字未提。
- 失败场景：每次 `nx release`（A2 的「迁移发布」就在计划内）打新 tag 后，仓库提交的生成物与最新 tag 不符 → 下一个 PR / main CI 第一次跑 `Package composition knowledge gate` 即红；同一窗口内 Netlify 现场推导的 `llms.txt` 写新 tag、仓库提交的 knowledge 写旧 tag，**两份对外 AI 产物互相矛盾**。
- 建议：把 `nx release` 包成 `pnpm release`（release 后紧跟 `audit:package-graph --update` + commit），或参照 `check-migration-release-gate` 支持 `--release-tag` 参数让发布前就能验证未来状态；并把流程写进 release-plan.md。

### H2. 已发布包从仓库删除 = 门禁死锁，无任何逃生口

- 位置：[scripts/audit/lib/package-graph-validation.mjs:112](scripts/audit/lib/package-graph-validation.mjs:112)、[scripts/audit/lib/package-knowledge.mjs:49](scripts/audit/lib/package-knowledge.mjs:49)
- 删除一个已发布包：删事实 → `buildKnowledge` 抛「发布包未登记」（旧 tag 树里还有它）；留事实删目录 → 「删包残留」。想切新 tag 让旧包从 tag 树消失，又被 `preVersionCommand` 里的**同一道门禁**挡住（Nx 的 `runPreVersionCommand` 无条件执行，失败即 exit 1，无 skip flag，已读 dist 确认）。全仓无 tag 排除清单、无 `deprecated/retiredIn` 字段。
- 失败场景：第一次需要下架包的那天，唯一出路是改写已发布的 git tag 历史或临时改 nx.json 绕门禁——两者都是发布日操作事故。
- 建议：事实 schema 增加「退役登记」（如 `retiredIn: <下一 tag>`，门禁在一个发布周期内同时豁免「删包残留」与「未登记」），并在 release-plan.md 写进标准下架流程。

### H3. `discoverRelease` 在无 tag 环境硬抛：Netlify 部署、Windows CI、浅克隆开发者都会挂

- 位置：[scripts/audit/lib/package-discovery.mjs:32](scripts/audit/lib/package-discovery.mjs:32)、[website/scripts/generate-llms.mjs:212](website/scripts/generate-llms.mjs:212)、[.github/workflows/ci-windows.yml:73](.github/workflows/ci-windows.yml:73)
- `git describe --tags` 失败即抛 `release tag 发现失败`。已核实三个无 tag 环境都会走到它：
  1. **Netlify**：克隆不带 tags（[官方论坛](https://answers.netlify.com/t/git-tags-during-build/16756/16)记录 tags 可用性取决于构建缓存状态、需自行 fetch），而 `netlify.toml` 的 build 命令就是 `pnpm nx build website`，postBuild 钩子必调 `generateLlms` → `discoverRelease`；
  2. **Windows CI**（`ci-windows.yml`）：checkout 只有 `filter: tree:0` 无 `fetch-tags`，`run-many -t build` 无项目过滤、包含 website:build——下一次手动触发即红；
  3. 任何 `--depth=1` 浅克隆的贡献者跑 `pnpm nx build website` 原地失败。
- 而 CI 的 Linux 流水线刻意 `--exclude=website`，**没有任何一条 CI 覆盖 website:build**——story 自己也写着「待部署后线上 smoke」。
- 建议：发布版本已有确定性来源（`requirements/generated/package-knowledge.json` 的 `version` 字段），构建期读提交产物而非探测环境，`git describe` 只作回退；或至少给 netlify.toml / ci-windows.yml 补 `git fetch --tags`。

---

## 中优先级（缓存正确性 / CI 接线）

### M1. `aiKnowledge` 的 runtime 输入在无 tag 环境**静默降级**，缓存键本地与 CI 永久分裂

- 位置：[nx.json:41](nx.json:41)、[.github/workflows/ci-template.yml:73](.github/workflows/ci-template.yml:73)、[.github/workflows/ci-template.yml:510-512](.github/workflows/ci-template.yml)
- 实证（隔离 Nx 23.3.0 工作区）：runtime 输入命令失败时 Nx **不报错、不告警**，静默哈希空输出；命令输出变化会正确失效缓存。CI 全局 `NX_DAEMON: false`，且只有 setup job 的 checkout 开了 `fetch-tags: true`——build 等其余 job（`filter: tree:0`）里 `git describe` 恒失败。于是「新 tag 失效缓存」这个设计意图（FR-005 / plan Decision 5）**恰好只在有 tag 的环境成立**：本地哈希含 tag 值、CI build job 哈希含失败哨兵，同一目标两套键，主分支写的缓存条目与开发者机器永不互命。
- 建议：用确定性来源（提交的 generated JSON 的 `version` 字段，或 CI 注入 `NX_RELEASE_VERSION`）替代环境探测。

### M2. `test-scripts` 缓存输入集不完整：改了 spec 实际读取的文件仍命中旧缓存报绿

- 位置：[project.json:25-31](project.json)（`test-scripts` target，`cache: true`）
- 原 `node --test` 脚本无缓存、总是真跑；改为 nx target 后 inputs 只有 `scripts/**/*` + `requirements/package-graph.json`。但已逐一确认至少 10 个 spec 读取这两者之外的真实仓库文件：`api-surface.spec.mjs` 读 `requirements/api-baseline/rxdb.json`；`check-migration-release-gate.spec.mjs` 读 `packages/rxdb/src/system/migration.ts` / `change-codec.ts` / `requirements/migration-release.json`；`wa-sqlite-integrity.spec.mjs` 读 `pnpm-lock.yaml`；`working-tree-*.spec.mjs` 扫 `packages/**`；`coverage-artifacts.spec.mjs` 读 `.github/workflows/ci-template.yml`；`test-all-log.spec.mjs` 读根 `package.json`。
- 失败场景：改 schema 版本常量或 trusted-callsite 注册表（这类回归测试存在的全部意义）后跑 `pnpm test-scripts`，哈希不变 → 陈旧绿灯。仓库在 `packages/rxdb/project.json` 里已经注释过同类坑（「改表格措辞会命中旧缓存报绿」），这里原样重犯了一遍。
- 建议：要么补全 inputs（最省事是把 spec 读取的真实文件逐项加进去），要么对该 target 设 `cache: false`（与 `audit-api-surface` 等同类门禁的既有先例一致）。

### M3. `audit-package-graph` 门禁 `cache: true`，但 tag **树内容**不进哈希；且 `git describe` 会命中 prerelease tag

- 位置：[project.json:35-39](project.json)、[nx.json:41](nx.json:41)、[scripts/audit/lib/package-discovery.mjs:25-29](scripts/audit/lib/package-discovery.mjs)
- 两个独立缺陷：(a) inputs 只哈希 tag **名字**（runtime 输入输出），`discoverRelease` 实际读的 `git ls-tree` / `git show` 标签树内容完全不参与哈希。仓库自己的 CI 注释写明「tag 可以被强推」——强推/重打同名 tag 后缓存命中，门禁对旧标签内容保持绿。仓库对同类「读了 inputs 之外状态」的门禁（api-surface、requirements、docs-plugins）刻意用 `cache: false`，这里违反了自己的先例。(b) `--match 'v[0-9]*'` 匹配 `v0.0.27-rc.1` 这类 prerelease（`--abbrev=0` 原样返回），一旦切过 RC tag，投递知识整个钉在 RC 上，`llms.txt` 会生成 `@^0.0.27-rc.1` 这类把 0.x 消费者锁死到 RC 的安装指令，且字节门禁不会拦（它会「正确地」重新生成）。
- 建议：`cache: false`（或把 tag 树摘要纳入 inputs）；match 模式收紧为 `v[0-9]*.[0-9]*.[0-9]*`。

### M4. `verify:ai-example` 违反 setup job「秒级、不依赖任何构建产物」的书面契约

- 位置：[.github/workflows/ci-template.yml:211-212](.github/workflows/ci-template.yml) vs [ci-template.yml:188](.github/workflows/ci-template.yml) 契约注释；[project.json:41-59](project.json)
- 该步骤对应 target 声明 `dependsOn: build`（rxdb / pglite / history 三个包）+ `pnpm pack` + 严格 tsc 编译 + 运行样例。setup job 没有 nx-cache-restore 步骤，冷跑时这三个构建每次 CI 全量重做，塞进 15 分钟超时、且被所有下游 job `needs` 的 setup 关键路径。同批加入的 `audit-package-graph`（只读 git/manifest）符合契约，只有这一步破坏。
- 建议：把 ai-example 移到 build 之后的 job（如 extras），或让 setup 恢复 Nx 缓存后再跑。

### M5. `lint-ai-artifacts` 是死 target：本分支新增的全部审计脚本在 CI 上从未被 lint

- 位置：[project.json:83-94](project.json)
- CI 的 lint job 项目集靠 `--withTarget=lint` 采集，根项目 `@aiao/source` 没有 `lint` target 进不了集合；`pnpm test-all` 同样只跑 `lint`。全仓唯一引用 `lint-ai-artifacts` 的地方是 quickstart 里的手工命令。本地实测这些文件 eslint 零警告，但「零 ESLint 警告」铁律靠的是 CI 执行，不是靠作者自觉——这个 target 让规则形同未设，且撞上 ci-template 自己的铁则「一个看着在跑、其实什么都不查的门禁，比没有更糟」。
- 建议：给 `@aiao/source` 加一个 `lint` target 委托到同一条 eslint 命令，或把该命令并入某个已进 CI 集合的 target。

### M6. 事实源 hosts 与真实运行面三处矛盾：投递给 AI 的知识自我冲突

- 位置：[requirements/package-graph.json:431](requirements/package-graph.json)（rxdb-taro）、[:439](requirements/package-graph.json)（rxdb-test）、[:52](requirements/package-graph.json)（rxdb-adapter-encrypted）
- 逐条核实：(a) `rxdb-taro` 登记 hosts `["node"]`，但其 `./runtime` 入口 docstring 明写「跑在小程序逻辑层，不引任何 Node 模块」——AI 会按 hosts 拒绝该入口用于小程序；(b) `rxdb-test` 登记 `["node"]`，但三端 demo 与 e2e 直接 `import { ENTITIES } from '@aiao/rxdb-test/entities'` 打进浏览器 bundle；(c) `encrypted` 登记 `["browser","node"]`，但 `sqlite-core`（hosts 含 miniprogram/electron/tauri）硬依赖它、miniprogram adapter 复用 sqlite-core——AI 会得出「miniprogram/桌面栈不支持加密」而该栈的必装包却依赖它。这正是本故事要消灭的「互相漂移的文档」，只是搬进了新的事实源。
- 建议：修正三处 hosts（或给 schema 加「多入口分别登记宿主」的表达），并加一条「事实 hosts 覆盖依赖闭包」的校验规则。

### M7. 交付知识混用「标签 manifest」与「HEAD 插件源码/样例」，版本声明与实际内容可能不符

- 位置：[scripts/audit/lib/package-knowledge.mjs:50-53](scripts/audit/lib/package-knowledge.mjs)、[scripts/audit/lib/package-plugins.mjs:44](scripts/audit/lib/package-plugins.mjs)
- `delivery.packages` 的 version/依赖边来自标签树，但插件 id/factory/inject 经 `readPlugin` 从**工作树**源码读取，样例执行与打包的也是 HEAD 代码；安装指令却钉死 `@^<标签>`（0.x 的 caret 等价精确版本）。实测 v0.0.26..HEAD 在 rxdb 相关包有约 3 万行增删。当前样例用到的 API 恰好都存在于 v0.0.26，无实际断裂；但架构上没有约束——插件改 factory 名或样例用上标签之后才有的 API 时，llms.txt 会声称「发布版本 vX」却描述 HEAD 的接口。
- 建议：生成投递知识时插件 AST 也从标签树读取（与 manifest 同源），或至少在 knowledge 里标注「工作树插件元数据」。

---

## 低优先级（潜伏缺陷，机制已确认、当前未触发）

### L1. 样例 import 与 install.json 无交叉校验，可生成缺依赖的安装指令

- 位置：[scripts/audit/lib/package-knowledge.mjs:54-61](scripts/audit/lib/package-knowledge.mjs)
- 校验只有「install.json ⊆ release.packages」一个方向。`ai-example` 在临时目录靠 workspace 链接编译 main.ts，所有包都能解析——给样例加一个 import 而不同步 install.json 时门禁全绿，生成物却教 AI 用户装一套缺依赖的清单。今天三个 import 恰好都在清单里纯属巧合。

### L2. `scanPackages` 对缺 `name` 的 package.json 崩溃（相对旧 `listPublicPackages` 的健壮性回归）

- 位置：[scripts/audit/lib/package-discovery.mjs:12-15](scripts/audit/lib/package-discovery.mjs)
- 已实证：`packages/*` 下放一个缺 `name` 字段的 package.json（实验性目录的常见 WIP 状态），`a.name.localeCompare` 抛 `TypeError: Cannot read properties of undefined`，整个 `audit:api-surface` / `audit-package-graph` 崩掉且不指明是哪个目录。旧代码按目录名列出、根本不读 `name`。建议解析后对缺 name 的 manifest 报带路径的明确错误。

### L3. `readSiteUrl` / homepage 的 URL 解析三缺陷

- 位置：[website/scripts/generate-llms.mjs:45-51](website/scripts/generate-llms.mjs)
- (a) 正则 `\burl\s*:` 取文件中**第一个**匹配——注释里 `// url: 'https://old.example.com'` 这类常见写法会静默把所有 llms 链接指到旧域名，且测试只覆盖合成配置；(b) `new URL(homepage)` 对相对 homepage（npm 允许任意字符串）直接抛 `TypeError: Invalid URL`，炸掉整个 website build 且报错不含包名；(c) 返回 `url.origin` 静默丢弃 Docusaurus `url` 的子路径前缀，子路径托管的站点全部链接错误。当前配置恰好是单处 `url:` + 绝对 homepage + 根路径托管，三条都潜伏。

### L4. `ai-entry-docs` 的 declarations Map 重名静默覆盖

- 位置：[scripts/audit/ai-entry-docs.mjs:9-10](scripts/audit/ai-entry-docs.mjs)
- 同名声明跨 `.d.ts` 出现时排序靠后的文件静默覆盖前者（已核实 rxdb dist 里 `RuleIn` 等 6 个接口就在两个文件各声明一次）。当前被审计的 4 个名字恰好唯一。若重构产生双声明（class+namespace 合并、bundler 重复产出），影子声明可让门禁假红或**假绿**（真实声明丢了文档而影子带旧文档时照常通过）。

### L5. JSDoc 代码块抽取脆弱，合法文档改动即可击穿门禁且报错无法定位

- 位置：[scripts/audit/ai-example.mjs:25-33](scripts/audit/ai-example.mjs)
- 非贪婪 ``` 匹配止于第一个围栏：示例内出现嵌套代码块即截断；`line.replace(/^\s*\* ?/, '')` 会把示例中真正以 `* ` 开头的行剥错；围栏从 ```ts 改成 ```typescript 会静默丢块后以 `blocks.length !== 4` 硬失败。都是「文档本身合法、门禁却红」的场景。

### L6. 插件链渲染用 ` → ` 伪造不存在的注入顺序

- 位置：[scripts/audit/lib/package-knowledge.mjs:102](scripts/audit/lib/package-knowledge.mjs)、[website/scripts/generate-llms.mjs:75-79](website/scripts/generate-llms.mjs)
- `http-querycache` 渲染为 `rxDBPluginHistory → rxDBPluginQueryCache → rxDBPluginSync`——这是**按名字排序**的插件列表，事实里只有 sync `inject: plugin:history`，queryCache 与两者无注入边。AI 按箭头推断初始化顺序（「history 必须在 queryCache 前」）会固化错误心智模型，与 US-602 目标直接冲突。建议按注入拓扑（或直接并列列表）渲染。

### L7. AC#12 的「覆写 TSDoc 不带矛盾」标 ✅，但没有任何实现校验它

- 位置：[requirements/stories/tooling/US-602-ai-comprehensible-artifacts.md:215](requirements/stories/tooling/US-602-ai-comprehensible-artifacts.md) vs [scripts/audit/ai-entry-docs.mjs:23-25](scripts/audit/ai-entry-docs.mjs)
- 门禁只检查 `RxDBAdapterLocalBase` 的两个重载，从不读 `RxDBAdapterPGlite` / wa-sqlite 等覆写的 TSDoc。任一适配器覆写加上与基类矛盾的注释，门禁照绿——标 ✅ 的验收项实际是空头。

### L8. 两个 `transaction` 重载强制各带一份完整 64 行 JSDoc，且门禁不校验两份一致

- 位置：[packages/rxdb/src/rxdb-adapter.ts:556-620](packages/rxdb/src/rxdb-adapter.ts)、[scripts/audit/ai-entry-docs.mjs:23-32](scripts/audit/ai-entry-docs.mjs)
- 重复是门禁强制的（两个重载各自必须含全部短语 + 各自两个代码块），不是疏忽；但门禁只查「存在」不查「相等」——两份副本可在门禁全绿的情况下静默漂移，AI 从 `.d.ts` 读到的两个重载给出两套说法，恰是本故事要消灭的失真。建议门禁按重载组检查（短语并集 + 一份代码块），源码保留一份权威文档。

### L9. 其余潜伏项（合并记录）

- `readPlugin` 的包含检查 `relative(...).startsWith('..')` 误分类：`plugin.source: '.'` 时返回空串通过检查后对目录 readFileSync 抛裸 EISDIR；包内合法目录名 `..foo/` 被误判越界（[package-plugins.mjs:44-46](scripts/audit/lib/package-plugins.mjs)）。
- `constant()` 不支持 re-export barrel（`export * from './constants.js'`）与无 `.js` 后缀的 specifier，报错指向无关位置（[package-plugins.mjs:25-38](scripts/audit/lib/package-plugins.mjs)）。
- `readPlugin` 跟随传递导入时无 `..` 越界检查——插件从 `src/` 之外导入常量会逃出 aiKnowledge 的 glob，Nx 缓存把改动视为无关（当前 10 个插件全部同级导入，潜伏）。
- pglite 新用例未带同文件其余 5 个用例统一的 `}, 30000)` 超时，冷 runner 上吃 vitest 默认 5s 假红；且其队列探针在将来队列拓扑变化时会挂死而非失败（[transaction-executor.spec.ts:99](packages/rxdb-adapter-pglite/src/__tests__/transaction-executor.spec.ts)）。
- `ai-example` 的严格编译针对 workspace 链接的 dist，而非刚打包的 tgz——tgz 声明只用于 4 个具名符号的文档检查；`files` 回归导致声明被排除出 tgz 时门禁照绿（[ai-example.mjs:46](scripts/audit/ai-example.mjs)）。
- `buildKnowledge`/`queryCacheRequirements` 丢弃二次推导的 `.errors`，正确性依赖「这些函数永久纯函数」这个无断言的不变式（当前不可触发）。

---

## 结构 / 复用 / 效率 / 规范（按类汇总）

### 缓存过度失效（浪费重跑）

- **`rxdb:build` 挂了 `aiKnowledge` inputs，但构建不消费其中任何文件**（[packages/rxdb/project.json:31-33](packages/rxdb/project.json)）。改一句包事实/模板/打新 tag 都让核心包全量重建、产物逐字节不变；且暗示了一个不存在的依赖，后人会当真。已核实真正需要 aiKnowledge 的只有 audit-package-graph / website:build / ai-example。
- **`ai-example` 的显式源码树 inputs 冗余**（[project.json:44-50](project.json)）：`dependsOn` 的任务哈希已流入下游哈希（实证确认），显式列出四棵完整源码树（含全部 spec）只会让改一行测试就重跑 pack+编译+执行。注：曾怀疑缺 `rxdb-adapter-encrypted/**` 输入，经实证否证——encrypted 是 pglite 的声明依赖，其构建哈希经 `^build` → `dependsOn` 链传递覆盖。

### 重复实现与双入口

- 根 [project.json:62-82](project.json) 新增的 `audit-requirements` / `audit-api-surface` / `audit-docs-plugins` 三个 target 与 package.json 脚本是同一命令的逐字副本，且**无任何调用方**（CI 与脚本全部直调 node）；同族里 `audit:package-graph` / `verify:ai-example` 走的是「npm 脚本委托 nx」的单入口模式。建议三选一收口。
- 「哪些 packages/ 目录算公开包」现在有三份口径：新 `scanPackages`、`package-runtime-conditions.mjs` 的 `auditPackages`、`requirements-consistency.mjs` 的 `checkPackageCounts`；`stableJson` 与 api-surface 的 `serialize` 是两套稳定序列化；`collectMarkdownFiles` 是第三个 Markdown walker（各自排除规则不同）；`stripFrontMatter` 与 `parseFrontmatter` 是两份 frontmatter 认知；`ai-example.mjs` 绕过同目录已导出的 `readKnowledgeInput` 重读样例源与 tsconfig。
- `aiKnowledge` 里的 `git describe` 命令串与 `discoverRelease` 硬编码复制：改 match 模式只改一处时，缓存键仍按旧命令计算，按新 tag 重算才会报的「发布包未登记」被静默吞掉。

### 重复计算（实测数据）

- `discoverRelease` 每次调用 spawn **70 个 git 子进程**（1 describe + 1 ls-tree + 34×ls-tree + 34×show），实测 ~1.0s，占门禁运行 1.27s 的 80%。可用 1 次 `git ls-tree -r` + `git cat-file --batch` 降到 3 个进程。
- 一次 `audit:package-graph` 运行里 `auditPackageGraph` 跑 2 遍、插件 AST 解析 3 遍（main 一遍 + buildKnowledge 内部审计一遍 + collectPlugins 一遍）；`readPlugin` 每个插件源读文件 2 遍。同参纯函数重算，建议抽 `computeGraph()` 一次求解、处处复用。

### 规范（CLAUDE.md / AGENTS.md）

- **新脚本导出零 TSDoc**：[scripts/audit/ai-entry-docs.mjs:5](scripts/audit/ai-entry-docs.mjs)、lib 下 4 个文件、`package-graph.mjs`、`website/scripts/generate-llms.mjs` 的全部导出均无 JSDoc 且无文件头注释块——违反「新包/新导出必须补齐 TSDoc」，且与同目录既有脚本（api-surface.mjs 等）的惯例不符；6 个新脚本 + generate-llms 未进 `scripts/README.md` 的索引表。
- **缩进超限**：[scripts/audit/lib/package-discovery.mjs:41-50](scripts/audit/lib/package-discovery.mjs) 的三元 else 分支字段缩进 14 空格（7 层），违反「<3 层缩进」铁律，是新增代码中唯一超限处。
- **文档表格漂移**：[requirements/status-overview.md:27-31](requirements/status-overview.md) 标题与汇总表都写「进行中（2 条）」，但「进行中」表格只有 US-211 一行，缺 US-602——`requirements-consistency` 门禁只查计数与索引、不查该表格，故门禁绿而内容漂移。
- **短语快照式 TSDoc 门禁**（[ai-entry-docs.mjs:21-36](scripts/audit/ai-entry-docs.mjs)）：把「普通插件/立即安装/仓储/系统贡献/排队」等逐字短语写死为通过条件，任何措辞润色必红 CI。深层守卫（4 个示例代码块真实编译执行）已经存在，短语层可收敛为结构断言。
- `generate-llms` 的 `FALLBACK_PATHS['binding']` 是死条目（binding 必有 framework，走专属分支）；`ROLE_LABELS`/`FALLBACK_PATHS`/`roles` Set 是同一 9 角色的三份平行枚举。
- `generatorSources` 只被 digest 消费、无测试覆盖其参与摘要，且 `lib/package-*.mjs` glob 会让未来新增的 `lib/ai-*.mjs` 静默掉出摘要。

---

## 已核查、确认无问题的项

- 门禁在本分支上实际跑通：`node scripts/audit/package-graph.mjs --check` 绿（51 包 / 34 发布包 / 9 情景）；新增脚本 eslint 零警告（本地实测）。
- `RxDB.use` / `connect` / `transaction` 的新 TSDoc 与实现逐条吻合（晚装系统贡献确实抛错、首次 connect 同步 init、普通插件晚装立即安装）。
- `scanPackages` 与旧 `listPublicPackages` 的过滤链等价（EXCLUDED 先于 manifest 解析，行为无回归）；`docs-plugin-surface` 的 QueryCache 包/工厂集合与旧硬编码常量内容、顺序一致。
- `lazy-chunk-vite-plugin.ts` 的类型改动纯编译期，运行时不变；pglite/rxdb project.json 的输入改动是严格超集，无失效被移除。
- `.gitattributes` 钉 LF，`checkGenerated` 字节比对无 CRLF 假漂移风险；`--update` 经 Nx CLI 参数转发参与哈希，不会被旧缓存吞掉。
- 事实源 51 个条目与真实 manifest 一一对应、无 private 包混入；`netlify.toml` 的 Content-Type 头与既有特定路径优先的惯例一致；`.prettierignore` 豁免由字节门禁兜底。
- 新 pglite 事务用例在当前队列拓扑下确定性成立（save 与事务共用同一 AsyncQueueExecutor）；`resolveScenario` 的 inject 闭包、delivery 过滤、`packageInfo` 的空值防护顺序均正确。

---

## 合并前建议动作（按优先级）

1. **H1/H2**：定案发布流改造（`pnpm release` 包装或 `--release-tag` 参数）与退役登记机制，写入 release-plan.md——这是下一次发版和下架第一个包时的硬阻塞。
2. **H3**：给 Netlify 构建命令加 `git fetch --tags || true`（或让生成器读已提交的 version），并给 ci-windows.yml 的 checkout 补 `fetch-tags: true`；部署后立即补 AC#10 线上 smoke。
3. **M2/M3**：`test-scripts` 补全 inputs 或 `cache: false`；`audit-package-graph` 改 `cache: false`（与同类门禁先例一致），收紧 tag match 模式排除 prerelease。
4. **M4/M5**：把 `verify:ai-example` 移出 setup（或先恢复 Nx 缓存）；给 `@aiao/source` 补 `lint` target 让新脚本真正进 CI lint。
5. **M6**：修正 rxdb-taro / rxdb-test / encrypted 三处 hosts，并加「hosts 覆盖依赖闭包」校验。
6. 其余低危与结构项可随后续 PR 渐进处理；至少把 L7（AC#12 空头验收）在故事里改回 ⬜ 或补上实现。
