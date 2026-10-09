# e2e-parity（rxdb-model 跨框架对拍共享目录）

三个 e2e 项目（`apps/dev-rxdb-angular-e2e` / `apps/dev-rxdb-react-e2e` /
`apps/dev-rxdb-vue-e2e`）各有一份 `entity-model-parity.spec.ts`，跑同一份 Todo
种子数据下的同一场景（列表渲染、详情、表单字段、查询构建器条件树），把采集到的
原始输出交给本目录归一化成**语义级**结构化快照，再与同一份 checked-in 的
golden（`entity-model-parity.golden.json`）比较。三端都过同一 golden ⇒ 三端两两一致。

## 为什么是语义快照而不是原始 DOM

- Angular 有 `_ngcontent` 等私有属性、三端 DOM 结构本就不同，原始 HTML 无法对齐；
- VTable 画在 canvas 上，行内容只能从 `__vtable__` 的记录与列定义读取；
- 记录 id 是每次运行新生成的 UUID、创建/更新时间随运行变化，属**易失值**，
  在语义层统一替换为占位符（`<uuid>` / `<date>`），列 / 字段的存在性与顺序仍被 golden 锁定。

归一化与 golden 都是**单一实现**（`entity-model-parity.mjs`），不随框架复制；
三端 spec 只保留「怎么读页面」（采集）。三份 spec 副本间只允许一处差异：
Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），React / Vue
从 `@playwright/test` 取。其余内容必须保持同步，改一处改三处。

## 为什么本目录不是 Nx 项目

e2e 的 tsconfig `rootDir` 是自己的项目目录，跨项目 import `.ts` 源码会触发
TS6059 / TS6307（以及 Nx typescript-sync 的项目引用门禁）。以 `.mjs`（实现）+
`.d.mts`（声明，被 tsc 视为纯类型输入）成对放置即可通过三端 typecheck 与 lint；
运行期由 Playwright 直接加载 `.mjs`。

两个实现约束（都是实测踩出来的）：

- **不能用 `import.meta`**：e2e 项目没有 `"type": "module"`，Playwright 会把 spec
  （及其依赖的本模块）按 CJS 转译加载，CJS 产物里 `import.meta` 直接报
  "Cannot use 'import.meta' outside a module"。golden 与本目录的相对位置固定
  （位于三个 e2e 项目 `src/` 的上两级），由调用方传入 spec 文件路径定位。
- **行系列号列**：VTable 的 `_vtable_rowSeries_number` 是引擎内部列（非实体字段），
  归一化时记作匿名列（`null`），仍占据列布局中的位置。

## 更新 golden

场景（种子标题、筛选值、交互步骤）变更时，先改三份 spec，再用其中一个框架跑一遍，
把 `toEqual` 失败 diff 里的实际语义快照核对无误后写回 golden。golden 里出现
占位符之外的易失值（真实时间戳、随机 id）说明归一化漏了字段，先在
`entity-model-parity.mjs` 补映射，而不是把易失值写进 golden。

## 文件

- `entity-model-parity.mjs` — 归一化实现（单一实现）
- `entity-model-parity.d.mts` — 类型契约（与 .mjs 同步维护）
- `entity-model-parity.golden.json` — 唯一 golden 语义快照
