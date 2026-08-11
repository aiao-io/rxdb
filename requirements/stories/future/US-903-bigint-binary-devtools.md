---
id: US-903
title: DevTools 展示 bigint/binary
status: Done
priority: Medium
epic: epic-005-type-system-evolution
created: 2026-07-31
updated: 2026-07-31
tags: [devtools, serialization, bigint, binary]
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-011 和 US-303 的类型与 change codec
- [x] Negotiable: 面板渲染样式可以调整，wire envelope 必须版本化
- [x] Valuable: 新类型不会导致 DevTools 请求或事件序列化失败
- [x] Estimable: 改动集中在 DevTools connector/serializer 和面板展示
- [x] Small: 不修改持久化、迁移、同步和加密算法
- [x] Testable: 文档、事件、冲突和脱敏输出均有确定表示
-->

# 用户故事：DevTools 展示 bigint/binary

## 作为/我想要/以便

**作为** 使用 RxDB DevTools 的开发者
**我想要** 检查 bigint/binary 字段和 change
**以便** 文档、事件和冲突不会因 JSON 序列化限制而消失

## DevTools wire 表示

DevTools connector 输出版本化、只读展示 envelope：

```ts
type DevToolsBigIntValue = { $rxdb: 1; type: 'bigint'; value: string };
type DevToolsBinaryValue = { $rxdb: 1; type: 'binary'; encoding: 'base64url'; value: string; byteLength: number };
```

该表示只用于 DevTools wire/display，不作为实体写回或 change 存储格式。

## 范围边界

### In Scope

- QUERY_ENTITY、EVENT、history/branch 和 conflict payload 使用统一 DevTools serializer
- bigint 使用精确十进制字符串，binary 使用 base64url 与 byteLength
- serializer 不修改原实体、patch 或 Uint8Array
- 加密字段必须先脱敏，再进行新类型序列化
- 面板明确区分 bigint、number、binary 和普通 object
- 未知 DevTools envelope 版本显示 unsupported，不猜测解码

### Out of Scope

- 从 DevTools 编辑或写回 bigint/binary
- change 存储 codec、数据库迁移与远程同步
- binary 文件预览、下载、十六进制编辑器或大文件流式传输

## 验收标准

| #   | 前置条件                                 | 操作                       | 预期结果                                              | 状态 |
| --- | ---------------------------------------- | -------------------------- | ----------------------------------------------------- | ---- |
| 1   | 文档含超安全 bigint                      | QUERY_ENTITY               | 返回 bigint envelope，十进制值无精度下降              | ✅   |
| 2   | 文档含 binary `[0, 255]`                 | QUERY_ENTITY               | 返回 base64url envelope，byteLength 为 2              | ✅   |
| 3   | change patch/inversePatch 含新类型       | 接收 EVENT/history payload | 所有位置使用同一 wire 表示，不出现 `Cannot serialize` | ✅   |
| 4   | conflict 两侧含新类型                    | 查看冲突                   | local/remote 值均可展示且类型明确                     | ✅   |
| 5   | bigint `1n`、number `1` 和 binary object | 面板渲染                   | 三者视觉与类型标签可区分                              | ✅   |
| 6   | encrypted bigint/binary 字段             | 获取文档或事件             | 值保持 `[encrypted]`，serializer 不泄露明文或长度     | ✅   |
| 7   | serializer 接收 Uint8Array subarray      | 序列化                     | 只编码当前视图，且不修改源数组                        | ✅   |
| 8   | payload 含未知 DevTools envelope 版本    | 面板解析                   | 显示 unsupported 状态，不按已知类型渲染               | ✅   |
| 9   | 既有 Date、JSON、循环引用与脱敏 fixture  | 运行回归测试               | 现有 DevTools 行为不变                                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- 禁止用裸 `JSON.parse(JSON.stringify(value))` 处理 connector payload
- DevTools envelope 必须带版本，字段名变化视为 wire contract 变化
- 脱敏先于序列化，任何错误路径都不得回退发送原值
- base64url 只服务展示传输，不改变 binary 的公开运行时类型

## 实现文件

- `packages/rxdb-devtools/src/serializer.ts` — 版本化 DevTools 值表示
- `packages/rxdb-devtools/src/connector.ts` — 文档、事件与冲突统一入口
- `packages/rxdb-devtools/src/__tests__/` — wire、脱敏与回归测试
- `apps/rxdb-devtools-extension/` — 类型标签和 unsupported 状态展示

## References

- [US-902 DevTools 面板](US-902-devtools-panel.md)
- [US-303 change codec 与系统迁移](../collaboration/US-303-bigint-binary-change-codec.md)
