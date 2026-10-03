---
id: RV-030
title: 非法 HTTP 请求目标能让参考服务进程退出
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P1
baseline: 58b4bbb61efa71d4591cafab6a4c92955a7760dd
---

# RV-030：非法 HTTP 请求目标能让参考服务进程退出

**P1 · 已动态复验 · 待修复**。对象：`apps/dev-rxdb-http-server`。本记录针对实际业务源码，不是评审计划。

## 问题

向隔离启动的参考服务发送一条原始请求：

```http
GET http://[ HTTP/1.1
Host: 127.0.0.1
Connection: close
```

连接无 HTTP 错误响应即断开，Node 打出 `ERR_INVALID_URL` 并退出；后续正常 `GET /v1/meta/version` 变为 `ECONNREFUSED`。不是单次请求被拒绝，而是整个参考后端停止提供服务。

影响限定：CLI 默认只监听本机回环地址，本轮未声称可从公网攻击，也不是 RCE/数据破坏。P1 指一条被 Node HTTP parser 接受、但应用 URL parser 不接受的输入能终止整个服务。

## 源码证据与根因

[server.ts 的 `createDemoServer` / `dispatch`](../../apps/dev-rxdb-http-server/src/server.ts)：

```ts
void dispatch(request, response, () => store, state, options.controlEnabled, actions, subscribers, broadcaster);
```

`dispatch` 在路由开始处执行 `new URL(request.url ?? '/', 'http://127.0.0.1')`；该操作在 `runProtocol` / `runControl` 的 try/catch **之外**。构造失败会拒绝 async dispatch Promise，HTTP 回调既不 await，也没有 rejection handler。当前 Node 26.7.0 下最终导致进程退出。

## 动态复验

- 通过实际 Nx `dev-rxdb-http-server:serve` 启动应用；专用临时 PGlite 数据目录、系统分配后确定的闲置端口，`NODE_ENV=production` 关闭控制接口。
- 正常 metadata 请求先返回 200，说明服务和库已正常启动。
- 通过 Node TCP socket 发出上述 request-target 后，[应用日志](evidence/2026-10-03/server.log) 指向 `dispatch -> new URL` 并打印 `ERR_INVALID_URL`。
- [探针结果](evidence/2026-10-03/http-invalid-target-probe.json) 记录无响应断开与后续健康请求连接拒绝。

可再次运行 [隔离复验脚本](evidence/2026-10-03/reproduce-http-boundaries.mjs)：

```bash
node requirements/reviews/evidence/2026-10-03/reproduce-http-boundaries.mjs
```

脚本只启动隔离实例；最后有意触发该实例退出，不会触碰默认 `.data` 或生产服务。

## 修复方案

把 request-target 解析纳入请求级错误边界，解析失败回应 400；同时为最外层 `dispatch` Promise 提供明确 rejection 收口，未知应用错误应留日志并回应 500，不能终止进程。补独立子进程回归：坏 URL、坏百分号、正常请求、健康探针以及进程仍然存活。不能只用函数级 mock 证明不退出。

## 解决记录

- [ ] 按复验用例保持红，先修根因，再确认绿。
- [ ] 补关联路径回归与适用的三框架/宿主证据。
- [ ] 修复合并后按评审目录规则清理；目前未修改业务实现、未宣称解决。
