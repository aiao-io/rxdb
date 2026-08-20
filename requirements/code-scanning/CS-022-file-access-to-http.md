---
id: CS-022
number: 22
status: Dismissed
rule: js/file-access-to-http
severity: warning
security_severity: medium
path: scripts/ci/probe-nx-cloud.mjs
line: 86
created: 2026-08-17
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/22
---

# CS-022 Network data written to file / File data in outbound network request

## 规则

- ID：`js/file-access-to-http`
- 名称：File data in outbound network request
- 描述：File data in outbound network request

## 位置

`scripts/ci/probe-nx-cloud.mjs:86`

## 告警

Outbound network request depends on file data.

## 修复方案

**不修 —— 「把文件里的数据发到网络」正是这个脚本存在的意义。**

[probe-nx-cloud.mjs](../../scripts/ci/probe-nx-cloud.mjs) 从 `nx.json` 读出 `nxCloudId`，再拿它去问 Nx Cloud「这个组织还能不能用远程缓存」。读文件 → 发请求这条链路就是它的全部职责，切断它脚本就没了。

`nx.json` 是仓库内受版本控制的文件，`nxCloudId` 本身也不是秘密（它就是用来标识组织的公开 ID）；目的地址是写死的 Nx Cloud API，不由文件内容决定。

**GitHub 上关闭方式**：dismiss reason 选 `won't fix`，备注「脚本的设计意图即为上报 nx.json 中的公开 nxCloudId」。

## 解决记录

- [ ] 修复并合并 → `status: Resolved`
- [x] 或承认风险 → `status: Dismissed`
