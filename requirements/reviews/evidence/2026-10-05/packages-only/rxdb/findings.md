# PKG-rxdb 本地问题与候选（partial）

仅 packages/rxdb；本地编号待主控去重 RV。确认依据区分源码控制流与动态复现，本轮尚未新增/运行 probe。历史已修不复报。

## PKG-rxdb-001 — P1，源码确认：单个 disconnect(last) 被仓储销毁异常截断，adapter 未关闭

- C1，owner：RxDB 核心生命周期。锚点：packages/rxdb/src/RxDB.ts:1217-1239、1607-1627；packages/rxdb/src/entity/entity-manager.ts:218-252。
- 条件：已连接的最后一个 adapter，其 Repository.destroy() 抛 Error；调用 db.disconnect(name)，不是 destroy()/disconnectAll()。
- 因果：shutdown 已 clear/解绑并最终重抛 managerError；disconnect 在 await shutdown 外没有收集错误，adapter.disconnect() 的 try/finally 在其后，完全跳过。因此缓存仍保留打开 adapter，connected 状态却已清空；重连可复用未释放的宿主句柄。
- 证据边界：源码可达控制流已确认；当轮动态未执行。既有 src/__tests__/review-repository-teardown.spec.ts:43-94 仅通过 destroy()，不能证明单 disconnect 安全。
- 去重：README 已将 RV-039（仓储销毁中断拆卸）标已修并删除报告；此项是同根因的单断连残余路径，请主控挂回 RV-039 补证或按归档策略登记，不另重复历史 destroy 修复。
- 最小改法：单 disconnect 与 disconnectAll 同一错误收集模型，manager/plugin释放错误不能跳过adapter关闭及缓存/名字finally；全部收尾后重抛首错，不吞错误。
- 回归：最后一个单断连仓储抛错仍adapter关闭/缓存清/可重连；非最后一个不拆无关插件；adapter断连同时抛错时仍保首错。先红后修，本任务不修。

## PKG-rxdb-C01 — 候选：并发事务非生命周期事件入队只有栈顶，不带 transactionId

- C4，owner：核心事务/adapter事件合同。已读锚点 RxDB.ts:1374-1381；rxdb.transaction.ts:79-106,133-142；rxdb-events.ts:195-210,318-399。
- BEGIN/COMMIT/ROLLBACK有ID、实体事件无ID；A/B并发BEGIN后来自A的实体事件可能排到B，B回滚丢掉A已提交事实。后续必须读实际executor/adapter派发与现有并发回归，不能仅以类型推断完整事故。
- 判别：A BEGIN→B BEGIN→A写事件→A COMMIT→B ROLLBACK，检查A事件恰好一次且在A提交后发。

## PKG-rxdb-C02 — 候选：local bootstrap await边界没有完整epoch fencing

- C1/C5，owner：核心connect与local adapter宿主。锚点 RxDB.ts:1060-1123。
- 已有断连检查在adapter.connect之后与最终置位；isTableExisted/能力守卫/补表/迁移/贡献bootstrap间多次await没有重判epoch。需判别disconnect期间是否继续写已关闭实例，不以最终connect拒绝证明没有后续写。
- 后续读测试和adapter合同；需要真实宿主的意义与最小mock中断场景分开。

## PKG-rxdb-002 — P2，源码确认：wakeup回调内destroy后退避timer被重新创建

- C1，owner：核心 ReachabilityMonitor。锚点 packages/rxdb/src/network/reachability.ts:230-237,300-311；既有测试 src/__tests__/network/reachability.spec.ts:268-299,315-325。
- 条件/最小场景：离线monitor订阅wakeup$，回调中调用monitor.destroy()（或最后一个watch句柄release）；首timer触发。
- 因果：timer回调先将#timer置undefined，再同步#wakeup$.next()；destroy清掉的是空timer并complete subject，但online仍false；回调返回后310只检查online，重新#scheduleWakeup，不检查#destroyed。此后向已complete subject空发并无限退避续期。last-release同一重入窗口会复活刚停掉的节拍。
- 验证边界：源码控制流已确认，当轮尚未动态运行。现有destroy测试在首tick前调用；last-release测试在advanceTimers返回后调用，均不覆盖next重入窗口。无watch直接订wakeup退避是现有97-157行测试契约，不可笼统用watchers===0改掉它。
- 最小改法：销毁/停止排程采用显式generation/cancelled状态，next返回后重验终态/当前调度代际再续期；至少destroyed必须挡。保留直接订wakeup的既有report退避语义。
- 回归：fake timers下next里destroy后timerCount=0且继续推进无计时器；next里last-release不再发tick；后续watch重新启动；正常离线指数/封顶control保持。先红再修，本任务不改业务。
