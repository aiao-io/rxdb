---
name: aiao-rxdb
description: Aiao RxDB（@aiao/rxdb）包选型、槽位组合、插件时序与事务规则，覆盖 {{version}} 发布范围。
license: MIT
---

# Aiao RxDB 组合指南

事实摘要：`{{digest}}`。本文件由事实源、manifest、插件源码与已验证样例生成，只覆盖 {{version}} 投递范围（不含仅在仓库 main 上、未发布的包）。

## 何时使用

- 回答「装哪几个 `@aiao/*` 包、每个配到哪个槽位、按什么顺序组合」；
- 给出最小可运行的 `use → 注册 adapter → await connect → CRUD → disconnect` 初始化代码；
- 核对插件 `use()` 时序与事务内 `await entity.save()` 的禁止规则。

## 选型规则

- 核心一个：`@aiao/rxdb`，列为消费者直接依赖。
- 每个 backend 槽位各选一个 adapter：local 一个、remote 一个（本地 + 远端组合是常态）。
- 插件可叠加；贡献仓储或带系统贡献的插件必须在 `init()`（首次 `connect()`）之前 `use()`。
- 框架绑定按应用框架选一个；shared-impl 与 capability 不占槽位。

## 投递范围安装清单

{{packages}}

## 组合情景

{{scenarios}}

## 时序与事务

- 插件早装：贡献仓储的插件晚于 `init()` `use()` 会按旧注册表初始化；带系统贡献的晚装直接抛错。普通插件晚装合法（立即安装）。
- 事务内禁止 `await entity.save()`：会落回队列并永久挂起。事务内经 `executor.getRepository(...)` 读写，见下方样例。

## Node 离线样例

{{sample}}
