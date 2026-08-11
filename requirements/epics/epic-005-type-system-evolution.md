---
id: epic-005-type-system-evolution
status: In Progress
startDate: 2026-07-30
targetDate: TBD
owner: jimmy
---

# 类型系统演进

## 愿景

扩展 Aiao 的原生值类型和字段语义，同时保证模型声明、前端通信、生成客户端、本地持久化、查询、变更历史、加密和 DevTools 使用同一份无损契约。

## 目标

- [x] `PropertyType` 支持有符号 64 位 bigint 与 Uint8Array binary
- [x] 公共 ID、查询规则、关系和生成客户端完整支持新类型
- [x] SQLite family 与 PGlite CRUD、索引、查询和关系行为一致
- [x] patch / inversePatch、undo / redo、branch 与跨 Tab 无损
- [x] 旧 change 数据通过原子、可重试的内建迁移升级
- [ ] 迁移通过跨 realm/进程 writer lease 与 fencing 可靠排除旧 writer
- [x] 加密与 DevTools 不退化、不泄露、不放宽既有限制
- [x] Supabase 对实际绑定远端的新类型实体 fail-fast
- [ ] 字段元数据区分底层值类型、业务格式、单值/多值和字段来源，并提供版本化前端通信 DTO

## 支持边界

| 能力                        | bigint | binary | 说明                                |
| --------------------------- | ------ | ------ | ----------------------------------- |
| SQLite family / PGlite 本地 | 支持   | 支持   | CRUD、查询、索引、关系和本地 change |
| 本地历史、branch、跨 Tab    | 支持   | 支持   | 统一版本化 codec                    |
| encrypted adapter           | 支持   | 支持   | 保持既有限制                        |
| DevTools                    | 支持   | 支持   | 使用版本化只读展示 envelope         |
| Supabase CRUD / push / pull | 不支持 | 不支持 | 远端绑定实体 connect 时拒绝         |

local-only 新类型实体可以与其他 Supabase 实体共存。任何含 bigint/binary 且配置 Supabase remote 的实体都必须在网络操作前 fail-fast；本 Epic 不承诺新类型的多设备远程同步。

## 依赖顺序

1. US-011 建立类型、ID、查询和生成器契约
2. US-206 落地五个本地 adapter 的持久化、查询和关系
3. US-303 在前两者上实现 change codec、系统迁移和本地协作
4. US-304 在 US-303 基础上发布 writer lease、drain barrier 和 fencing 协议
5. US-804 与 US-903 分别接入加密和 DevTools，可在 US-303 后并行完成

## 发布门禁

以下门禁只覆盖 bigint/binary 发布轨道。六个相关 story 分别跟踪、按依赖顺序实施并单独验收；US-012 不新增物理 PropertyType，不扩大 bigint/binary 的发布门禁。发布检查必须同时满足：

1. US-011 / US-206 / US-303 / US-304 / US-804 / US-903 全部 Done
2. SQLite 四个具体 adapter 与 PGlite 的共享 gate 全绿
3. 旧 SQLite/PGlite 数据库升级、lease drain、stale writer fencing、失败回滚和重试 fixture 全绿
4. public type compatibility、client generator 编译 fixture 与 API surface baseline 全绿
5. encrypted 与 DevTools 回归 gate 全绿
6. 公开文档说明类型值域、binary 可变性、adapter 矩阵、单向迁移和 Supabase 限制

任一条件未满足时，Epic 保持未完成；禁止只发布枚举或依赖未知类型的 TEXT/JSON fallback。

## 故事

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](../stories/core/US-011-property-type-bigint-binary.md) (High)
- ⬜ [US-012 扩展字段语义与前端通信契约](../stories/core/US-012-field-semantic-metadata.md) (High)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](../stories/adapter/US-206-bigint-binary-adapter.md) (High)
- ✅ [US-303 bigint/binary change codec 与系统迁移](../stories/collaboration/US-303-bigint-binary-change-codec.md) (High)
- 🚧 [US-304 跨 realm writer lease 与迁移 fencing](../stories/collaboration/US-304-writer-lease-migration-fencing.md) (High)
- ✅ [US-804 加密字段支持 bigint/binary](../stories/future/US-804-bigint-binary-encryption.md) (High)
- ✅ [US-903 DevTools 展示 bigint/binary](../stories/future/US-903-bigint-binary-devtools.md) (Medium)

## 非目标

- bigint[] / binary[]、任意精度 bigint、decimal
- Blob / ArrayBuffer / Stream 文件 API
- Supabase 存储和远程同步支持
- 自动 down migration 或旧客户端写入已升级数据库
- 新的框架专属 API 或单端 demo
