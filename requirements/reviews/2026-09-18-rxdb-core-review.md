# RxDB 核心评审 · 2026-09-18

评审对象：`next-0912`，HEAD `fc30f1da`，以及评审时工作区的未提交代码。重点检查 `packages/rxdb` 的查询增量更新、实体关系与待保存状态、连接生命周期，并追踪相关同步调用链。

🔴 截至 HEAD `9c9f1ecc` 仍保留 **2 条可复现问题（#5、#6，均为 P2）**；其余 11 条（含全部 4 条 P1）已随该提交的修复转绿。

本次没有修改生产代码。评审期间工作区出现了额外查询修复，已按最新内容复跑：`review-query.regression.spec.ts` 的 6 条用例全部转绿，对应的页外排序、offset 删除、变更压缩、树计数四类问题已从清单剔除。下列 10 条既有回归与 3 条新增临时复现仍然失败。

**复核更新（2026-09-18 晚）**：`9c9f1ecc` 提交了针对本清单的修复。按该 HEAD 复跑三个审计 spec（16 条用例全部通过）；临时复现 3 条中 #7 已转绿，#5、#6 仍失败（`merge_create.ts` 评审后未再改动）。下方各条目标注了当前状态。

验证记录：

| 验证                                         | 结果                                                    | 边界                                                     |
| -------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm nx run rxdb:test --skipRemoteCache`    | 2048 通过、16 失败，107 个测试文件通过、3 个失败        | 工作区后续查询修复落地前的全包基线，不能当成最新全包结果 |
| 最新工作区定向复跑                           | 6 通过、13 失败，共 4 个文件、19 条用例                 | 覆盖下列全部问题；关闭覆盖率，仅核对行为                 |
| HEAD `9c9f1ecc` 复核                         | 3 个审计 spec 16/16 通过；临时复现 3 条中 #5、#6 仍失败 | 临时复现按报告指引复制进临时 spec 运行后删除；未跑全包   |
| SQL 后端集成测试、三框架测试、lint/typecheck | 本轮未运行                                              | 本报告不声称验证全部适配器和框架组合                     |

原有回归用例位于：

- [生命周期回归](../../packages/rxdb/src/__tests__/review-lifecycle.audit.spec.ts)
- [实体回归](../../packages/rxdb/src/__tests__/entity/review-entity.audit.spec.ts)
- [本轮补充复现源码](./2026-09-18-rxdb-core-probes.spec.ts.txt)

补充复现以文本保存，已从正常测试发现目录移出。把文本复制到 `packages/rxdb/src/__tests__/review-core-probes.temporary.spec.ts` 后，可执行本轮定向命令：

```bash
pnpm nx run rxdb:test --skipRemoteCache --coverage=false review-lifecycle.audit review-entity.audit review-query.regression review-core-probes.temporary
```

1. **[P1] 查询回填会清掉尚未保存的多对多关系修改。（✅ 已修复）**

   位置：[entity-status.ts:427](../../packages/rxdb/src/entity/entity-status.ts#L427)，同样影响 `mergeExternal()` 中的 `#relations.clear()`：回填路径现改为 syncObservableForeignKeys 只同步外键，不再整体清空关系缓存。

   `owner.tags$.add(tag)` 后，在 `save()` 前再查询或回填同一个 owner，即使只回填 `{ id }`，也会清空关系缓存。新建的 junction 从 `getNeedSaveEntities()` 消失；`EntityRelationCache.clear()` 同时清空待删 junction 集合，因此删除意图也没有保留机制。标量字段的 dirty merge 保护不了关系变更。应把待持久化关系操作与可失效的查询缓存分离，回填只能更新已持久化基线。既有用例 `hydration must preserve a pending many-to-many addition until save` 现已通过。

2. **[P1] 从数据库读出的多对多关系无法通过 remove 正常解绑。（✅ 已修复）**

   位置：[relation-helper.ts:197](../../packages/rxdb/src/entity/relation-helper.ts#L197)：查询返回的已有 junction 会登记进 relationCache。

   `owner.tags$` 查到 junction 后只取关联 ID，没有把已有 junction 登记到 owner 的关系缓存；`remove(tag)` 却只在该缓存中查 junction。首次读取一个已有关系后调用 remove，待删集合仍为空，后续保存静默不删数据库关联。应登记查询返回的已有 junction，或让解绑直接依据两个外键生成删除意图，不能依赖先前在当前进程调用过 add。既有用例 `hydrated many-to-many relations must be removable after their first query` 现已通过。

3. **[P1] saveMany 丢弃已收集到的关系删除。（✅ 已修复）**

   位置：[entity-manager.ts:400](../../packages/rxdb/src/entity/entity-manager.ts#L400)：saveMany 与单条 save 共用 getNeedRemoveEntities 的收集逻辑。

   即使 junction 已成功进入待删集合，`saveMany([owner])` 仍把 `need_remove_entities` 写死为空数组。相同操作使用 `save(owner)` 会收集删除，批量入口却静默遗漏。应与单条 save 共用增删改集合的构建逻辑，把 `getNeedRemoveEntities(entities)` 纳入同一批次。既有用例 `saveMany must forward pending junction deletion just like save` 现已通过。

4. **[P1] 保留另一适配器连接时，单端重连不会更新持续订阅持有的实例。（✅ 已修复）**

   位置：[RxDB.ts:1011](../../packages/rxdb/src/RxDB.ts#L1011)，关联 [remoteAdapter$ 的实现](../../packages/rxdb/src/RxDB.ts#L362)：重连后 publish_adapter_name 重新发布适配器名，remoteAdapter$ 的去重环节据此换到新实例。

   local、remote 同时连接并持续订阅 `remoteAdapter$`，只断开 remote 再重连：`connect()` 返回新实例，但流仍重放旧实例。单端断连不走 `#shutdown()`，适配器名称 Subject 没有变化；按名称去重的流因此不重新解析实例。依赖这条流的仓储会继续对已关闭连接发请求。应让适配器流跟踪连接实例或连接代次，并在单端断连/重连时更新。既有用例 `只重连一个适配器也应更新持续订阅持有的实例` 现已通过。

5. **[P2] 游标页处理 CREATE 时遗漏 limit。（🔴 仍可复现）**

   位置：[merge_create.ts:107](../../packages/rxdb/src/query/merge_create.ts#L107)：游标分支（after / before 两向）的 limit 截断。

   `findByCursor({ limit: 2, orderBy: [{ field: 'id', sort: 'asc' }] })` 首次返回 `[a,b]`，收到 c 的 CREATE 后直接发射 `[a,b,c]`。该分支过滤游标、排序，却没有任何按 limit 截断；持续插入会让分页结果不断膨胀，`limit: 0` 也无法保持空集。应按查询方向裁剪窗口：正向取前 limit 项，before 取紧邻游标的末尾 limit 项。新增临时复现返回 3 行，预期 2 行。

6. **[P2] 已被 COUNT 快照包含的迟到 CREATE 会重复计数。（🔴 仍可复现）**

   位置：[merge_create.ts:149](../../packages/rxdb/src/query/merge_create.ts#L149)：count 分支的 resultEntityIds 去重。

   SQL 已读到新增行并返回 1，随后这行的批处理 CREATE 才到达，计数会变成 2。`resultEntityIds` 只记录接收过的增量事件，数字型查询结果不会填充已有 ID，所以它无法证明事件是否已包含在当前快照里。SQLite 的变更投递本身有定时批处理，这个到达顺序是允许的。应使用可与快照对齐的事件水位，或者对无可靠基线的 count 变更重查；仅增加 ID 去重集合不足以解决问题。新增临时复现结果 2，预期 1；本轮未跑真实 SQLite 时序集成测试。

7. **[P2] updatedAt 单字段过滤忽略了排序依赖。（✅ 已修复）**

   位置：[QueryManager.ts:405](../../packages/rxdb/src/repository/QueryManager.ts#L405)：单字段过滤同时检查 orderByReferencesField。

   查询只在 `orderBy` 使用 updatedAt、where 没有该字段时，所有只修改 updatedAt 的事件都会被丢弃。例如按时间升序的 `[a,b]`，a 的时间推进到 b 之后，订阅仍保持 `[a,b]`，即使权威结果已经是 `[b,a]`。应把 orderBy、游标等实际依赖也纳入判断，不能以 where 未引用字段推断事件无关。新增临时复现现已返回正确顺序。

8. **[P2] 外部外键回填不会更新已经订阅的关系流。（✅ 已修复）**

   位置：[entity-status.ts:383](../../packages/rxdb/src/entity/entity-status.ts#L383)，关联 [relation-cache.ts:342](../../packages/rxdb/src/entity/relation-cache.ts#L342)：回填经 syncObservableForeignKeys 把新外键同步进既有 observable 条目。

   订阅 `child.parent$` 得到 A 后，经 `createEntityRef` 回填 `parentId=B`，字段已变成 B，既有订阅却仍停在 A。回填直接写 target 绕过 Proxy，然后删除 observable 缓存；删除映射只影响将来的 getter，不会推进已经被持有的 BehaviorSubject。应把变化的外键同步到现有 observable 条目，保留其订阅身份。既有用例 `external FK hydration must update the already-held relation subscription` 现已通过。

9. **[P2] 单值关系流退订后仍永久订阅仓储。（✅ 已修复）**

   位置：[relation-helper.ts:68](../../packages/rxdb/src/entity/relation-helper.ts#L68)：shareReplay 开启 refCount。

   MANY_TO_ONE/ONE_TO_ONE 使用 `shareReplay(1)`，没有引用计数。即使调用方只执行一次 `firstValueFrom(child.parent$)`，底层 repository.get 的 teardown 也不会执行，活查询及实体引用持续驻留。应使用带 refCount 的共享方式，并保证最后一个消费者退出后释放上游。既有用例 `last relation unsubscribe must release the repository subscription` 中释放函数调用次数现已为 1（通过）。

10. **[P2] 同一轮同步执行中的 reset 后编辑丢失 patches$ 通知。（✅ 已修复）**

    位置：[proxy.ts:71](../../packages/rxdb/src/entity/proxy.ts#L71)：排队状态以 scheduledGeneration 对齐，旧代失效不吞新一代通知。

    连续执行 `label='discard'; reset(); label='keep'`：第一次编辑已把 pendingCheck 设为 true，第二次编辑无法重新排队；旧微任务又因 generation 改变直接返回。最终 patch 正确包含 keep，但 patches$ 只收到 reset 的空记录，依赖通知的自动保存或展示无法发现新修改。应让排队状态与 generation 对齐，旧任务失效不能阻止新一代编辑的通知。既有同名边界用例现已通过。

11. **[P2] 可变字面量默认值在实体之间共享引用。（✅ 已修复）**

    位置：[entity.utils.ts:211](../../packages/rxdb/src/entity/entity.utils.ts#L211)：默认值物化经 cloneDefaultValue 复制可变字面量。

    定义 `stringArray` 默认值为 `['initial']` 后创建两个实体，修改第一个实体的数组会同时改变第二个实体和元数据中的默认值。实现只复制 binary，其他可变默认值直接赋同一个对象。应在默认值物化时复制可变静态值，确保每个实体独立。既有用例 `mutable static defaults must be isolated between entity instances` 现已通过。

12. **[P2] 插件安装期间发生断连，旧 connect 仍会成功返回。（✅ 已修复）**

    位置：[RxDB.ts:1033](../../packages/rxdb/src/RxDB.ts#L1033)：插件安装 await 之后的 assert_connect_alive 纪元比对。

    插件 install 返回尚未完成的 Promise 时调用 disconnectAll，关闭适配器后再放行 install，原 connect 会 resolve 已断开的适配器。最后一次连接纪元检查位于 await 插件安装之前，安装之后没有再检查。应在这个 await 返回后、声明连接成功前验证本次连接仍有效，同时保持失效清理按实例/纪元隔离。既有用例现已 rejected（通过）。

13. **[P2] 适配器关闭失败会跳过实例级资源释放，重试也无效。（✅ 已修复）**

    位置：[RxDB.ts:1181](../../packages/rxdb/src/RxDB.ts#L1181)：destroy 的 finally 里释放 syncState 与 reachability。

    destroy 先置终态，再 await disconnectAll；任一 adapter.disconnect 拒绝后，syncState 和 reachability 的 destroy 均未调用。再次调用又因终态直接返回，退避定时器与流资源无法通过正常销毁入口清理。应在 finally 中保证实例级资源释放，保留关闭错误向调用方传播。既有用例中两者调用次数现均为 1（通过）。
