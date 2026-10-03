---
id: RV-031
title: metadata 接口未验证 JSON 对象形状，null 返回 500、数组被接受
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
---

# RV-031：metadata 接口未验证 JSON 对象形状，null 返回 500、数组被接受

**P2 · 已动态复验 · 待修复**。对象：`apps/dev-rxdb-http-server`。本记录针对实际业务源码，不是评审计划。

## 问题

对正常启动的隔离服务执行 `POST /v1/recipes/metadata`：

| body          | 预期             | 实际                                                    |
| ------------- | ---------------- | ------------------------------------------------------- |
| `{"limit":1}` | 正常查询         | 200，1 行                                               |
| `null`        | 400 请求格式错误 | 500，`Cannot read properties of null (reading 'limit')` |
| `[]`          | 400 请求格式错误 | 200，被当成空参数查询，返回种子 metadata                |

`null` / 数组是合法 JSON，但不是本协议端点要求的参数对象。这里是请求边界的格式处理缺陷，不把参考服务明确放宽的演示鉴权冒充安全漏洞。

## 源码证据与根因

- [server.ts `handleMetadata`](../../apps/dev-rxdb-http-server/src/server.ts) 把 `await readJsonBody(request)` 直接断言为 `Record<string, unknown>`，随后读取 `body['limit']`，没有检查非空、object、非数组。
- [http-utils.ts `readJsonBody`](../../apps/dev-rxdb-http-server/src/http-utils.ts) 的公开返回类型是 `Promise<unknown>`；JSON parse 成功不代表对象结构正确。
- [recipes-repository.ts `readObject`](../../apps/dev-rxdb-http-server/src/recipes-repository.ts) 已在 create/update/by-ids 等入口做了非空对象校验；metadata 路径没有复用相同边界。

## 动态复验

[实际请求结果](evidence/2026-10-03/http-body-probes.json) 留存 HTTP 状态与响应节选。应用是通过真实 Nx serve 启动的 Node＋PGlite 服务，不是 handler mock。

同轮还检查了超过 1 MiB 的 body，实际正确返回 413；**没有将大 body 路径报告为连接重置/离线错误**。

```bash
node requirements/reviews/evidence/2026-10-03/reproduce-http-boundaries.mjs
```

## 修复方案

在请求边界统一取得“已验证的 JSON 对象”，或让 metadata 使用与其它写入口同一对象验证器；不要靠 TS 断言。补 null、数组、标量、空对象、缺省 limit/offset、非法字段类型、正确查询及 413 的端点级回归，错误格式统一返回 400。

## 解决记录

- [ ] 按复验用例保持红，先修根因，再确认绿。
- [ ] 补关联路径回归与适用的三框架/宿主证据。
- [ ] 修复合并后按评审目录规则清理；目前未修改业务实现、未宣称解决。
