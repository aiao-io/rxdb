---
id: US-019
title: 拒绝重复声明的 URL scheme
status: Done
priority: Medium
epic: epic-005-type-system-evolution
created: 2026-08-17
updated: 2026-08-17
tags: [core, model, metadata, field-type, validation]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 `invalidSchemes` 一个内部函数与其 fixture，不依赖任何未交付工作
- [x] Negotiable: 「拒绝」与「归一化」两种口径已在本文「设计决策」定死，实现细节可议
- [x] Valuable: 关掉一处「文档说 A、代码做 B」的契约漂移，前端不再收到重复协议项
- [x] Estimable: 改动面已逐行核完——1 个函数 + 1 条 fixture + 2 处故事正文
- [x] Small: 单个 PR，无阶段拆分
- [x] Testable: 两条 AC 都有确定的运行时断言，第三条有可执行的扫描命令
-->

# 用户故事：拒绝重复声明的 URL scheme

**作为** 声明 `format: { kind: 'url' }` 的模型作者
**我想要** 大小写重复的 `schemes` 在注册期就被拒绝
**以便** 前端拿到的协议白名单不会出现语义相同的重复项，且声明与文档口径一致

## 背景：这条缺口是怎么活下来的

[US-012](./US-012-field-semantic-metadata.md) 的 format 配置契约对 `schemes` 写了去重要求，但**没有任何一条 AC 断言它**——
AC#12 覆盖的是 scheme 的语法 fixture，AC#27 覆盖的是 `validateFieldValue()` 比对时的大小写无关**匹配**。
两条都已实现且通过，去重则从未落地：`invalidSchemes` 只跑语法正则，
而字段描述 DTO 的产出侧 `formatKey` 把 `format` 原样透传、不改一个字节
（[entity-field.utils.ts:398-400](../../../packages/rxdb/src/entity/entity-field.utils.ts#L398-L400)）：

```ts
const formatKey = (prop: EntityPropertyMetadata): { format?: FieldFormat } => {
  const format = (prop as Record<string, unknown>)['format'];
  return format === undefined ? {} : { format: format as FieldFormat };
};
```

缺口能穿过 US-012 三个阶段的评审，直接原因是 `metadata-validate.ts` 对代码检索**不可见**：
文件里有一个裸 NUL 字节（见 AC#3），grep 与 ripgrep 因此把整个文件判为二进制，
任何针对它的模式匹配都静默返回空结果——不是报错，是「查无此文」。
所以本故事把去重与该字节一并收掉：后者是前者得以长期潜伏的机制性原因。

## 设计决策

### D1：判定为**拒绝**，不做归一化

US-012 正文对同一行为给了两种互斥说法，本故事定死为**拒绝**：

| US-012 位置 | 原说法                                                                 | 处置                 |
| ----------- | ---------------------------------------------------------------------- | -------------------- |
| L511        | 按小写判重、保留首次出现项、原值输出（`['HTTP','http']` → `['HTTP']`） | **改写**为拒绝       |
| L565        | `invalidFormatConfig` 覆盖「scheme 语法及大小写去重非法」              | **保留**，本故事兑现 |

采纳 L565 的三条理由：

1. **铁律「无 fallback 兜底」**。把 `['HTTP','http']` 静默折叠成 `['HTTP']`，是系统替作者修复畸形声明，
   正是该铁律禁止的行为。声明写错就该报错，不该被悄悄改写。
2. **与同层其余配置键一致**。`invalidConfigValue` 里 `currency`、`language`、`timezone`、
   `scale/unit/colorSpace/display` 全部是纯校验、零改写。只给 `schemes` 开一个静默归一化的口子，
   会让「这一层到底会不会改我的声明」变成逐键记忆。
3. **改动面收敛**。拒绝只落在 `invalidSchemes` 内部；归一化则要求
   `describeEntityFields()` 与 `parseEntityFieldsDescriptor()` 用**完全一致**的规则各去重一次，
   否则 US-012 AC#36 的往返断言 `parseEntityFieldsDescriptor(makeEntityFieldsWire())`
   `toStrictEqual` `makeEntityFieldsDescriptor()` 当场断裂，且可能顶动 AC#25 的冻结基线。

### D2：判重口径是 ASCII 小写，与值校验同源

`validateFieldValue()` 比对协议时两侧都走 `toLowerCase()`
（[entity-value.utils.ts:523-524](../../../packages/rxdb/src/entity/entity-value.utils.ts#L523-L524)）：

```ts
const scheme = url.protocol.slice(0, -1).toLowerCase();
const allowed = format.schemes.map(item => item.toLowerCase());
```

判重必须用同一口径，否则会出现「注册期放行、值校验视作同一协议」的错位。
`SCHEME_RE` 已限定 `schemes` 为 ASCII 字符集，`toLowerCase()` 与 `toLowerCase('en-US')` 在此无差异。

### D3：不改变现有功能语义

去重是**观感修复**，不是行为修复。因 D2 的小写比对，`['HTTP','http']` 与 `['HTTP']`
今天放行的 URL 集合完全相同；唯一可观测差异是字段描述 DTO 里协议列了两遍，
前端的协议 chip 会重复渲染。本故事不改变任何 URL 的放行/拒绝结果。

## 范围边界

### In Scope

- `invalidSchemes` 在语法校验通过后追加 ASCII 小写判重，命中报 `invalidFormatConfig`
- `VALUE_SEMANTIC_CASES` 增补对应 fixture
- 修复 `metadata-validate.ts` 的裸 NUL 字节，恢复该文件的代码检索可见性
- 改写 US-012 L511 的归一化表述，消除其与 L565 的矛盾

### Out of Scope

- **不新增 `MetadataValidationRule` 成员**。13 项全集是 US-012 冻结的公开契约，
  重复 scheme 归入既有的 `invalidFormatConfig`，公开 API 表面零变化
- **不做任何归一化**（见 D1），`describeEntityFields()` 与解析器一行不动
- **不改 `validateFieldValue()`**，其大小写无关匹配已由 US-012 AC#27 覆盖并通过
- 不引入 IANA scheme 注册表校验，`SCHEME_RE` 的语法口径维持不变

## 验收标准

| #   | 前置条件                                                      | 操作                                      | 预期结果                                                                                                                                                          | 状态 |
| --- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 属性声明 `format: { kind: 'url', schemes: ['HTTP', 'http'] }` | 调用 `validateEntityMetadata()`           | 恰好一条违规，`rule` 为 `invalidFormatConfig`，`message` 指出重复的 scheme；`MetadataValidationRule` 联合成员数仍为 13                                            | ✅   |
| 2   | 属性声明 `schemes: ['https', 'x-app+v1']`（无重复）           | 调用 `validateEntityMetadata()`           | 零违规；且 `schemes: ['https:']`、`['1http']` 仍按语法报 `invalidFormatConfig`，判重不吞掉语法错误                                                                | ✅   |
| 3   | 仓库全部被 git 跟踪的非二进制文件                             | 逐文件扫描 0x00 字节                      | 源码零命中（`.icns` / `.bmp` 等真二进制除外）；`rg "validateEntityMetadata" packages/rxdb/src/entity/metadata-validate.ts` 返回文本匹配而非 `binary file matches` | ✅   |
| 4   | US-012 正文                                                   | 通读 L511 与 `invalidFormatConfig` 规则行 | 两处对重复 scheme 的说法一致（均为拒绝），不再存在归一化表述                                                                                                      | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

改动落在 `invalidSchemes`（[metadata-validate.ts](../../../packages/rxdb/src/entity/metadata-validate.ts)），
在原有语法分支之后追加判重分支：

```ts
const invalidSchemes = (value: unknown): string | null => {
  if (!Array.isArray(value)) return '必须是字符串数组';
  const bad = value.filter(item => typeof item !== 'string' || !SCHEME_RE.test(item));
  if (bad.length > 0) return `包含非法 scheme ${JSON.stringify(bad)}`;
  const lowered = (value as readonly string[]).map(item => item.toLowerCase());
  const duplicates = [...new Set(lowered.filter((item, index) => lowered.indexOf(item) !== index))];
  return duplicates.length > 0 ? `存在大小写重复的 scheme ${JSON.stringify(duplicates)}` : null;
};
```

判重排在语法校验**之后**：语法非法时 `toLowerCase()` 的结果无意义，
且 US-012 已定死「同一字段的 `format` 最多产出一条错误」，先报语法更具体。
判重写法与同文件的 `validateEnumDeclaration` 同构，两处重复语义保持一致。

NUL 字节位于 `ViolationCollector.add()` 的复合键构造中，源文件里是裸 0x00 而非 `\0` 转义。
改成转义后运行时行为逐字节相同——两者产出同一个字符串——但文件重新变回文本文件。
该字节不影响 tsc、vitest 与 eslint，只影响 grep / ripgrep / GitHub 代码搜索。

## 实现文件

- `packages/rxdb/src/entity/metadata-validate.ts` — `invalidSchemes` 判重；NUL 字节改为 `\0` 转义
- `packages/rxdb/src/__tests__/fixtures/field-format-cases.ts` — `VALUE_SEMANTIC_CASES` 增补重复 scheme 用例
- `requirements/stories/core/US-012-field-semantic-metadata.md` — L511 改写为拒绝口径

## References

- [US-012 扩展字段语义与前端通信契约](./US-012-field-semantic-metadata.md) — 缺口来源，其 L511/L565 的矛盾由本故事消解
