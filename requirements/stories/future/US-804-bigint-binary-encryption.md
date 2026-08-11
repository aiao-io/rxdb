---
id: US-804
title: 加密字段支持 bigint/binary
status: Done
priority: High
epic: epic-005-type-system-evolution
created: 2026-07-31
updated: 2026-08-01
tags: [encryption, adapter, bigint, binary]
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-011、US-206 和 US-303 的类型与 change 契约
- [x] Negotiable: envelope 内部编码可以调整
- [x] Valuable: 新类型不会绕过或破坏既有字段加密能力
- [x] Estimable: 改动集中在 encrypted adapter 和共享加密 fixture
- [x] Small: 不包含 schema migration、远程同步和 DevTools
- [x] Testable: 精确值、字节、AAD、历史和限制均可验收
-->

# 用户故事：加密字段支持 bigint/binary

## 作为/我想要/以便

**作为** 使用本地字段加密的开发者
**我想要** 加密 bigint/binary 字段
**以便** 解密后仍得到原始运行时类型，并继续使用既有安全限制

## 范围边界

### In Scope

- `serializeForEnvelope` 对 bigint 使用有符号十进制编码并校验 64 位范围
- binary 加密只处理当前 Uint8Array 视图并复制明文字节
- `deserializeFromEnvelope` 分别恢复 JS bigint / Uint8Array
- bigint primary 实体上的其他加密字段使用稳定、无歧义的 AAD
- encrypted primary / unique / sortable / index / query 禁止规则保持不变
- save/read、undo/redo 和 branch change 中的解密类型一致
- 五个本地 adapter 通过共享 encrypted fixture

### Out of Scope

- 允许直接查询、排序或索引加密新类型
- Supabase 新类型加密与远程同步
- 密钥轮换协议变更、算法变更或 envelope 大版本升级
- bigint[]、binary[] 和内嵌新类型

## 验收标准

| #   | 前置条件                                   | 操作                            | 预期结果                                    | 状态 |
| --- | ------------------------------------------ | ------------------------------- | ------------------------------------------- | ---- |
| 1   | encrypted bigint 为 64 位上下界            | save/read                       | 解密后严格等于原 bigint                     | ✅   |
| 2   | encrypted bigint 超出 64 位或传入 number   | save                            | 加密前抛 TypeError                          | ✅   |
| 3   | encrypted binary 含零字节和 `0xff`         | save/read                       | 解密后为独立 Uint8Array，字节完全一致       | ✅   |
| 4   | encrypted binary 使用 subarray             | save/read                       | 只加密当前视图范围                          | ✅   |
| 5   | 保存后修改原 binary 输入                   | 再次读取                        | 已加密明文不随外部引用变化                  | ✅   |
| 6   | bigint primary 实体含普通 encrypted 字段   | save/read                       | AAD 稳定，解密成功                          | ✅   |
| 7   | string `1` 与 bigint `1n` 分属不同主键模型 | 构造 AAD                        | AAD 身份编码包含类型，不依赖裸 `String(id)` | ✅   |
| 8   | encrypted 新类型参与主键、索引、排序或查询 | 初始化或查询                    | 按既有规则 fail-fast                        | ✅   |
| 9   | encrypted bigint/binary                    | save、undo、redo、branch switch | 每一步恢复正确类型与值                      | ✅   |
| 10  | 密文、tag 或类型标签被篡改                 | read                            | 认证失败，不返回部分或退化值                | ✅   |
| 11  | 既有加密 PropertyType fixture              | 运行共享回归套件                | 密文格式和用户可见行为无回归                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- bigint 不得经过 JSON number 或 `Number()`
- binary 明文不能与调用方共享可变 backing buffer
- AAD 只要求稳定且无歧义，不要求可逆或暴露主键明文
- 禁止为新类型放宽既有 encrypted 查询限制

## 实现文件

- `packages/rxdb-adapter-encrypted/src/` — envelope 序列化、反序列化与 AAD
- `packages/rxdb-adapter-encrypted/src/__tests__/` — 类型、安全和篡改测试
- `packages/rxdb-test/src/testing/` — 跨 adapter encrypted fixture

## References

- [US-803 本地数据加密](US-803-local-encryption.md)
- [US-303 change codec 与系统迁移](../collaboration/US-303-bigint-binary-change-codec.md)
