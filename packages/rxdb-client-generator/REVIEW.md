# `@aiao/rxdb-client-generator` 代码评审

## 结论

🟢 通过。生成代码的 `findOne()` 空值类型已与核心运行时统一为 `null`，生成示例语法也已修正。

## 修复状态（2026-07-15）

- GENERATOR-001 已修复：实体专用与基类 overload 均生成 `Observable<T | null>`，并有生成结果与类型消费编译测试。
- GENERATOR-002 已修复：`find` TSDoc 示例不再包含多余的 `]`。
- `pnpm nx test rxdb-client-generator --skipNxCache` 通过：20 个测试文件、173 个测试。
- 覆盖率：Statements 89.82%、Branches 80.61%、Functions 91.92%、Lines 91.10%。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`packages/rxdb-client-generator` 下源码、CLI、生成器、测试和 Nx 配置；48 个文件，约 8,744 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过
- 测试现状：20 个 spec/test 文件；生成快照与类型消费测试均覆盖 `findOne()` 的 `null` 契约

## 问题

| ID            | 级别 | 位置                                                                                       | 问题与影响                                                             | 建议                                       |
| ------------- | ---- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------ |
| GENERATOR-001 | P1   | `src/generators/RepositoryGeneratorBase.ts`、`src/__tests__/helpers/generated-consumer.ts` | 已修复。具体实体和泛型基类签名都返回 `T                                | null`，类型消费测试要求调用方处理 `null`。 | 保持生成声明与 `EntityBase.findOne()` 契约一致。 |
| GENERATOR-002 | P2   | `src/generators/RepositoryGeneratorBase.ts`                                                | 已修复。生成的 `find` 示例是可直接使用的查询表达式，不再包含多余括号。 | 保留生成结果测试，避免文档示例回退。       |

## 其余观察

- 实体、属性、关系和 namespace 在进入代码生成前都有标识符校验，未发现直接代码注入路径。
- split/single 两种输出都对实体名排序，生成结果具备确定性。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-client-generator`、`pnpm nx typecheck rxdb-client-generator`、`pnpm nx lint rxdb-client-generator`、`pnpm nx build rxdb-client-generator`。
- 生成声明必须与 `@aiao/rxdb` 的 `EntityBase.findOne` 空值契约完全一致。
