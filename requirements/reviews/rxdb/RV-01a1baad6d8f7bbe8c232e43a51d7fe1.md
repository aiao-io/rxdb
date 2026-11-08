---
id: RV-01a1baad6d8f7bbe8c232e43a51d7fe1
title: '旧 disconnect 收尾删除新连接缓存并泄漏已连接适配器'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
anchors:
  - 'packages/rxdb/src/RxDB.ts#disconnect'
affected_projects: []
related_findings:
  - RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f
pr: null
---

# RV-01a1baad6d8f7bbe8c232e43a51d7fe1：旧 disconnect 收尾删除新连接缓存并泄漏已连接适配器

## 问题与影响

本地与远程适配器均已连接，本地插件的旧 install 还在等待时，单点 disconnect(local) 会停在调度等待。另一条 disconnectAll() 可以完成全局停机并允许新连接成功建立；旧 install 随后结算，旧 disconnect 的 finally 却无条件删除同名适配器缓存、清空适配器流名字并复位表集。已连接实例表仍指向新适配器，缓存表却丢了它，后续 getAdapter 又造出另一份未连接实例；最终 destroy 也不关闭真正连接着的那一份。需要并发拆卸与迟到安装的组合，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/RxDB.ts:1324` 至 `packages/rxdb/src/RxDB.ts:1336` 的收尾按名字直接删除 Map 项并撤回名字，没有比较 await 之前捕获的 Promise / 实例或连接纪元。旧异步调用可在新纪元建立之后才运行到这里。

公共 RxDB 入口、隔离适配器替身复现：

1. 连接 local 与 remote；安装只 inject adapter:local 的 scoped 插件，首次 install 等手动 Promise，后续安装立即完成。
2. 启动 disconnect(local)，不等待；随后 await disconnectAll()。
3. await connect(local) 得到 fresh，再连接 remote。新连接已经成功。
4. 结算旧插件 install，等待第一步的旧 disconnect 收尾，再调用 getAdapter(local)。

实际结果：getAdapter 返回值与 fresh 不同，localAdapterSync 仍等于 fresh，本地工厂累计调用 3 次。调用 destroy() 后，fresh 的 disconnect 仍未被调用。两个状态来源相互矛盾并留下未关闭连接，复现没有使用 provider/consumer 插件链。

相关记录 RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f 关注 connect 在拆卸窗口直接返回旧适配器；本记录关注已经成功建立的新连接被旧 finally 清掉，修复需要旧收尾的身份守卫。

## 修复方向

对 await 后的断连收尾加实例 / Promise / 纪元所有权校验；旧调用只能清理自己所属那代缓存、名字与表集。协调局部和全局实际关闭的所有权，避免重复关闭；保留全局停机不等待无限挂起 install 的既有契约。回归必须断言缓存与 localAdapterSync 指向同一新实例，且最终销毁确实关闭它。

## 处理记录

### EV-01a1baad6dbb77daba82e38db4055030：发现

- 时间：2026-11-08T18:21:30+08:00
- 操作：review/full（承接已覆盖文件，补充并发清理发现）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：旧收尾删除新缓存，真实已连接实例最终未被关闭。
- 验证：公共入口复现输出 same=false、localAdapterSyncIsFresh=true、factories=3、freshClosedAfterDestroy=false。核心既有完整测试为 154 文件通过、2,717 用例通过、1 个跳过，未包含此场景。
- 剩余事项：补回归并修复后 verify；未改实现，未将本次补充计为重新全读 RxDB.ts。
