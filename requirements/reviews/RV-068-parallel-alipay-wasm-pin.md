---
id: RV-068
title: 支付宝 WASM 指纹仍对应旧版本，当前精确依赖启动被拒绝
status: Open
severity: P1
created: 2026-10-05
updated: 2026-10-05
baseline: 44de1138b4d396fc45d6e76ab60476c40fef2223
---

# RV-068：支付宝 WASM 指纹仍对应旧版本，当前精确依赖启动被拒绝

## 问题与影响

**P1，当前源码/复验确认，待修。** 读取器固定预期1.3.1的727646字节/FNV2641369642，而当前package/glue精确使用1.4.0，实读WASM为812876字节/FNV1627926554。按README复制同版本binary/text副本也被显式拒绝，支付宝启动主要路径不可用。

## 根因与锚点

[实际源码](../../packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.ts)：25–31、51–54、92–101；subframe-glue.ts 21–24。根因及反证详见 [子任务取证说明](evidence/2026-10-05/parallel/local-adapters/findings.pending.md)。所有行号属于本批阅读版本，后续变更须复核，不以旧源码行号冒充新提交。

## 复验与范围

既有真实WASM宿主与指纹契约共12 failed /341 passed。只读依赖核对见 local-adapters/findings.pending.md：SHA-256 c9da064df53408dde001cd995811ff224ccc1fe056f4f198e500f4a5615336f2。这是当前源/锁定依赖不一致，不是单纯没有设备；微信/抖音不经此读取器，不能外推三宿主全坏。未测试支付宝真实设备。

[复验入口](../../packages/rxdb-adapter-miniprogram/src/__tests__/alipay-wasm.spec.ts) / [本轮原始日志](evidence/2026-10-05/parallel/validation/core-plugins-small-adapters-coverage.txt)；聚焦续验见 [新增探针集中日志](evidence/2026-10-05/parallel/validation/new-parallel-probes.txt)（只在实际完成后使用其状态，不预判通过）。测试没有删除/skip改绿；失败的门禁保留为失败，coverage缺失不补历史绿。

## 最小修复方向与回归

把固定指纹与精确WASM/glue版本同源更新或生成，并同步代码包binary/text副本；不能删除校验、接受跨构建混用或吞掉错误。回归binary/text、初始化/重开/配额/第二连接，实机证据单独登记。

## 解决记录

- [x] 当前源锚点及本轮失败证据登记，影响限于上述实测/明确接缝。
- [ ] 修复实现并补原正常契约、失败/关闭回归；本次只评审，不改业务。
