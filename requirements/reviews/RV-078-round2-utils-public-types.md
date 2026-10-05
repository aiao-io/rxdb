---
id: RV-078
title: utils 发布声明依赖未声明的环境类型，严格独立消费者失败
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
---

# RV-078：utils 发布声明依赖未声明的环境类型，严格独立消费者失败

## 问题

**P2，独立消费/公开路径已复验，待修。** 真实published tar消费者 strict且skipLibCheck=false导入公共库时，utils声明使用NodeJS.Timeout并直接导入ms.StringValue。ms2.1.3不自带声明，utils发布manifest未声明@types/ms，工作区全局类型掩盖缺口；浏览器型未启Node环境还报NodeJS命名空间缺失。

## 根因与边界

[源锚点](../../packages/utils/package.json)：dependencies；dist/async/nextMacroTask.d.ts:14；dist/date/msTimeToMilliseconds.d.ts:1,6。这份记录只覆盖实测分支，不将类型环境或夹具故障泛化为全部框架失效。

## 实际复验

真实独立tar安装，无源路径或工作区node_modules软链。裸严格编译有TS7016(ms)、TS2503(NodeJS)；显式追加Node环境与@types/ms后同一包/消费代码通过，补环境不算声明自包含通过。NodeJS部分属于环境适用范围，ms缺类型依赖为确定发布类型闭合缺口。

[原始证据](evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation-bare.json)；[显式环境的正反类型对照](evidence/2026-10-05/parallel-round2/validation/isolated-consumer-validation.json)。运行的是当前发布根真实tar，不是源码alias；代码/测试输入与同批验证清单保存，旧错配环境日志保留但不作为此条新缺陷依据。

## 修复方向与回归

让公开类型依赖在包依赖/接口层闭合，ms类型显式随发布可解析；为跨平台定时器给可移植的显式返回类型，或说明真正要求的环境类型。不能用skipLibCheck/any/ambient兜底声明清零；分别复验NodeNext与Bundler/浏览器类型环境。

## 解决记录

- [x] 原场景、公开合同与对应失败/正常对照核对并登记。
- [ ] 实现修复与范围内回归；助手本轮不改业务/依赖或自动提交。
