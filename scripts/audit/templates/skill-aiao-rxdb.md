---
name: aiao-rxdb
description: Aiao RxDB（@aiao/rxdb）包选型、槽位组合、插件时序与事务规则，覆盖 {{version}} 发布范围。
license: MIT
---

# Aiao RxDB 组合指南

事实摘要：`{{digest}}`。由事实源、manifest、插件源码与已验证样例生成，仅列 {{version}} 已发布包。

## 何时使用

用于选包、槽位和插件组合，以及初始化、CRUD 和事务代码。

## 选型规则

- 核心 `@aiao/rxdb` 必须是消费者直接依赖。
- local、remote 各选一个 backend adapter，可组合本地与远端。
- 框架绑定按应用选一个；shared-impl、capability 不占槽位。

## 投递范围安装清单

{{packages}}

## 组合情景

{{scenarios}}

## 时序与事务

- 插件可叠加。贡献仓储或系统贡献的插件必须在 `init()`（首次 `connect()`）前 `use()`；晚装时前者按旧注册表初始化，后者抛错。普通插件可晚装，立即安装。
- 事务内禁止 `await entity.save()`：会落回队列并永久挂起。事务内经 `executor.getRepository(...)` 读写，见下方样例。

## Node 离线样例

{{sample}}
