import json, hashlib, re
from pathlib import Path

root = Path('/Users/jimmy/Documents/aiao/rxdb')
e = root / 'requirements/reviews/evidence/2026-10-05/parallel/local-adapters'
v = e.parent / 'validation'
scope = json.loads((e / 'scope.json').read_text())
observed = json.loads((e / 'validation-observed.json').read_text())['objects']

def src(path, lines):
    return f'`{root / path}:{lines}`'

def row(cid, anchors, conclusion, remaining):
    return (cid, anchors, conclusion, '未核销', remaining)

core = 'packages/rxdb-adapter-sqlite-core/src/'
pg = 'packages/rxdb-adapter-pglite/src/'
enc = 'packages/rxdb-adapter-encrypted/src/'
swm = 'packages/rxdb-adapter-sqlite-wasm/src/'
wa = 'packages/rxdb-adapter-wa-sqlite/src/'
sq = 'packages/rxdb-adapter-sqlite/src/'
ai = 'packages/rxdb-adapter-sqliteai/src/'
mini = 'packages/rxdb-adapter-miniprogram/src/'

rows = {
'rxdb-adapter-sqlite-core': [
 row('C1', src(core+'RxDBAdapterSqliteBase.ts','581–621,1484–1512,1716–1728')+'；'+src(core+'Oo1ClientBase.ts','113–139,180–215,265–305'), 'LA-02/03 两个独立关闭窗口已由主控轻量回归证实：工厂晚到仍缓存，oo1 模块晚到仍 ready。失败重试与普通关闭的已有实现不能反证这两个窗口。', '关闭并发/失败/reconnect/多个 client 完整边界；新回归的 late strict lint/typecheck；真实 Worker/OPFS 资源回收。'),
 row('C2', src(core+'RxDBAdapterSqliteBase.ts','1007–1065,1654–1712')+'；'+src(core+'transaction/SqliteTransactionExecutor.ts','38–67,115–127'), '真实入口统一入队，executor facade 直发事务连接；COMMIT 后监听异常不误发 ROLLBACK，失败 rollback 会失效 client。这里只核实责任分层，不把 update_hook 的定时批处理等同提交屏障。', '触发器安装失败、并发事务、提交/回滚事件及主表/change/working-tree 同一事务的全部契约；当轮 21 skip 单独销项。'),
 row('C3', src(core+'entity/insert_sql.ts','21–28,66–79')+'；'+src(core+'query/find_sql.ts','17–54')+'；'+src(core+'sqlite-core.utils.ts','409–456,646–724'), '插入值参数绑定，标识符用统一 quoting；加密在 SQL 前执行，结果拒绝非字符串信封、任一列解密失败作废整行。排序/关系 SQL 不由这些入口存在即可推断正确。', 'RuleGroup/关系 JOIN 全支路、引号标识符/注入、NULL cursor、BigInt/binary/date、空批次与 PG 同 fixture 比较。'),
 row('C4', src(core+'RxDBAdapterSqliteBase.ts','787–894'), '独占迁移事务内读水位、按当前 active 分支重挂触发器、补唯一约束及水位；失败回滚不可用则丢弃连接。', '多 active 行/旧库/重复迁移/迁移失败完整动态场景；远端分支物化和切分支源码全边界尚未读完。'),
 row('C5', src(core+'fts5/create-fts-table.ts','18–32')+'；'+src(core+'fts5/build-fts-triggers.ts','49–50,69–86')+'；'+src(swm+'SqliteClient.ts','243–250'), '建表固定 FTS5 external-content/rowid；更新守卫 NULL-safe，valueWrapper 只准裸函数名。引擎 capability 与中文查询端必须另证，不能把生成 DDL 当真实支持。', '全部子后端 FTS 实际探针、CJK 短词、更新/删除/backfill、缺插件/缺 FTS 拒绝；trigger 尾部与查询端全量联审。'),
 row('C6', src(core+'backup/restore-sqlite-database.ts','93–105,114–173,190–194')+'；'+src(core+'RxDBAdapterSqliteBase.ts','1515–1560'), '恢复前检查断开状态、独占存储锁、恢复 marker、同引擎 blank database 与必须能力；unsupported 明确报错。LA-02 的关闭窗口不能被“理论有锁”盖过去。', '归档全解析/限额与中途失败清理尚未完整重读；损坏/错目标/旧连接/重试/重连全部持久化门禁。历史 117 pass/21 skip 只属历史。'),
 row('C7', src(core+'desktop/desktop-protocol-primitives.ts','31–47,65–85,122–126'), '已核对 UUID 与 SQL/blob/bindings 尺寸边界的公共零件；字符串形状校验不等于 host 签发会话存在或路径授权通过。', '915/941 行两协议、真实 TS host 与 Rust host 会话/路径/越界整数/大消息/未知 op 对照未全部阅读及执行，必须保留待证。'),
 row('C8', src('packages/rxdb-adapter-sqlite-core/scripts/run-coverage-acceptance.mjs','15–27,52–69')+'；'+src(swm+'src/__tests__/encrypted-bigint-binary.spec.ts'.replace('src/','',1),'1–5'), '验收脚本列 core/wa-sqlite/sqlite/sqlite-wasm/sqliteai 五套、四浏览器 suite、四指标 80% 门槛；普通 test 不等于 acceptance 的 blob/合并验收。未重建 writer lease 或 rowsAffectedConformanceSuite。', 'coverage-acceptance 未执行；合并/测量面完整重读与所有 conformance 调用点（含 Tauri）未穷举；不能用库存旧 coverage 过门槛。'),
],
'rxdb-adapter-pglite': [
 row('C1', src(pg+'query/query_sql.ts','140–153')+'；'+src(pg+'query/query_tree_sql.ts','80–118'), 'NULL 排序按 SQLite 的最小值口径；树递归 where 已明确 children 表别名，RV-045 旧歧义不再报告。', '完整 quoting/类型/JSON/空批次/重复键/关系/cursor 同 fixture 方言比较；本批只见 test-node 10 pass，不能代替浏览器全部查询。'),
 row('C2', src(pg+'notify/notification-batcher.ts','100–136,140–181')+'；'+src(pg+'change-pipeline.ts','23–63,67–108'), 'NOTIFY按 type/table/id 去重，容量和 max-wait 同步判定；handler 同表串行、异表并行，错误走 changeErrors，flush 有 deadline。事件窗口容量不是慢消费者任务总量上界。', '突发/慢消费/乱序/取消/重连/回滚/不活跃分支完整行为及最后状态验证；本轮不追加新候选。'),
 row('C3', src(pg+'system/migrate_system_schema.ts','96–128,183–210,213–294'), '水位/约束/触发器在事务内处理，NOWAIT锁失败 typed error；activeKey补列/唯一约束按 PG 顺序；storage-peer 不冒充已迁移。', '独立 test-node 的 10 pass 只证 Node migration；旧 schema/多 active/失败原子性/切分支后建表还须 browser/current source 全边界。'),
 row('C4', src(pg+'PGliteClient.ts','60–74,90–133,154–185,403–415,548–647'), 'memory 与 idb 默认区分，只有 opfs-ahp 才造 Worker；初始化失败终止 Worker/释放资源；disconnect 先 durability flush，失败仍清理并报 DURABILITY_LOST。', 'worker 中断、并发打开/重试/取消与持久化刷新；生命周期公开参数不同而并发共用 init 的完整契约尚未核销。'),
 row('C5', src(pg+'PGliteClient.ts','471–486')+'；'+src(pg+'backup/pglite-exclusive.ts','23–38'), '快照要求同线程真实 runtime 及内部查询/事务锁；独占区检查 sole holder，非支持档位明确拒绝。内部锁仅保护该 runtime，不宣称跨实例一致。', 'restore-lock/marker/数据目录清理全边界未读完；跨实例/标签页恢复冲突、损坏/取消/半途失败与旧库可用性须当前动态证据；历史 50 pass 不继承。'),
 row('C6', src(pg+'fts/create-fts-table.ts','26–38')+'；'+src(pg+'fts/build-fts-triggers.ts','83–116'), 'PG tsvector/GIN 与 FTS5 机制不同；触发函数按 schema qualify，regconfig先校验。公开 peer/子入口不能从本段 DDL 直接核销。', '中英文搜索同 fixture、索引更新、缺可选 Tree peer、keyring/打包 consumer/全部公开入口与资源审查。'),
 row('C7', src(pg+'PGliteClient.ts','86–87,102–133')+'；'+src('requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt','248–263'), '当轮已结算 test-node 10 pass。未把 Node 迁移/mock residual 当 browser conformance；本次快照未汇入 PG 全浏览器目标结算/summary/final。', '主控后续 browser 全套与四指标同代性/配置排除/skip/真实 idb/OPFS 独立记录；剩余大包结果不预判。'),
],
'rxdb-adapter-encrypted': [
 row('C1', src(core+'sqlite-core.utils.ts','409–456,646–724')+'；'+src(enc+'encrypt-patch.ts','23–44,51–72'), '实体声明列与 change patch 有明确 envelope 边界；NULL 旁路、非字符串实际 row 不可冒充信封。不是整库加密，不能把 adapter plaintext 内存正常行为当落盘漏密。', 'entity/change/working-tree/commit/backup 真实持久化字节与错误/日志扫描尚未穷举；未声明覆盖范围不能外推。'),
 row('C2', src(enc+'crypto.ts','82–93,99–145')+'；'+src(enc+'envelope.ts','126–176,190–206')+'；'+src(enc+'keyring.ts','238–327'), '随机 IV、AES-GCM AAD 与 typed PK/namespace/table/column/kid绑定；解密鉴权失败 typed error，lock在途拒绝并清零。v1 需显式 migration，v2失败不重试v1。没有单元格版本计数，不宣称防同身份旧密文回放。', 'tamper nonce/AAD/错实体字段/重放完整威胁边界与实际后端回归；279单测绿不是全部存储路径证明。'),
 row('C3', src(enc+'keyring.ts','217–231,407–424,509–575')+'；'+src(core+'keyring/sqlite-core-keyring-storage.ts','35–37,65–78')+'；'+src(enc+'__tests__/review-aborted-initial-unlock.spec.ts','48–99'), 'RV-058已重新追当前源：545提交前同步epoch检查，558发布前第二屏障；新回归期待取消后无singleton/A取消后B正常。与原旧红结论相反，不能复报。INSERT OR FAIL 的冲突与其他I/O错误区分。', '所有并发首次开库、损坏/未知KDF、随机源缺失、关闭重连/真实存储冲突全边界；写入已在途再lock只保证不发布内存key，不承诺撤销不可逆提交。'),
 row('C4', src(enc+'serialize.ts','29–69')+'；'+src(enc+'encrypt-patch.ts','29–43,56–70')+'；'+src(core+'sqlite-core.utils.ts','646–724'), 'BigInt要求signed64、binary复制，结构化值JSON；patch只遍历出现的键，NULL不封装，读实际row任一失败整行作废。helper的非字符串patch passthrough不能用于推断row可绕过解密。', '部分更新/undefined/特殊数值/关系字段/混合批写/失败回滚与原实体契约完整比较；序列化全函数与后端全部消费点未读完。'),
 row('C5', src(enc+'validate-encrypted-query.ts','17–36')+'；'+src(core+'query/find_sql.ts','21–39'), 'where/order/group/projection进入共享 metadata 校验；关系resolver明确传入，SQLite group/projection未实现显式拒绝，且加密错误优先。', 'metadata-validation内部347行所有关系/别名/混合RuleGroup/范围/排序/搜索拒绝分支尚未穷举；不能因入口delegate存在即核销完整C。'),
 row('C6', src(swm+'__tests__/encrypted-bigint-binary.spec.ts','1–5')+'；'+src(wa+'__tests__/encrypted-change-log.spec.ts','1–9')+'；'+src(ai+'__tests__/encrypted-bigint-binary.spec.ts','1–5'), '已对照真实 adapter suite 接线，WA 日志 suite 用 persistent factory + file reader，而非仅 wrapper mock。当前279 pass仅本包单测；其它对象的默认档位/skip不能折算所有后端安全。', 'SQLite/PGlite/Electron/Tauri/browser/miniprogram 各真实 CRUD/log/tamper/backup 联审及当前持久化扫描；适用三框架用户链路另证。'),
],
'rxdb-adapter-sqlite': [
 row('C1', src(sq+'sqlite-official-load.utils.ts','43–76')+'；'+src(sq+'create_sqlite_client.ts','26–51'), '加载资源fingerprint一致才复用，global load lock二次检查；factory init失败释放Comlink proxy，不静默忽略函数型远程选项。LA-03 是共享oo1初始化关闭窗口，不能用工厂catch来反证。', '下载失败/能力不足/并发init/重复关闭完整生命周期；late oo1回归与真实 OPFS；错误资源和fallback配置全边界。'),
 row('C2', src(core+'Oo1ClientBase.ts','113–139,180–235,265–305')+'；'+src(core+'execute_oo1_helper.ts','72–127'), '同步oo1通过Promise入口执行；prepare读路径和exec路径责任不同。LA-03轻量回归确认在途load关闭后仍开库/ready。', 'prepare/step/finalize失败、关闭中调用、无行返回与完整Promise错误归属；不同dbName重复init的契约与真实模块生命周期。'),
 row('C3', src(core+'entity/insert_sql.ts','66–79')+'；'+src(core+'RxDBAdapterSqliteBase.ts','1654–1712'), '类型/事务不是本包复制实现，而委托共享core；当前734 pass/13 skip只按配置宿主记账。旧树问题修复状态不反转。', 'BigInt/binary/null/批写/分支过滤/提交事件同 fixture跨后端；13 skip逐项说明，提交时点与rollback完整边界。'),
 row('C4', src(core+'backup/restore-sqlite-database.ts','93–105,142–172')+'；'+src(core+'sqlite-core.utils.ts','646–724'), '实际行拒绝坏信封；恢复要求同引擎blank描述与断开/独占锁。共享逻辑有守卫不等于官方OPFS恢复已经实测。', '坏envelope/备份失败/非空目标/失败原库/页面刷新/持久化恢复；各transport的实际支持档位和版本资源。'),
 row('C5', src(sq+'sqlite-official-load.utils.ts','62–76')+'；'+src(sq+'create_sqlite_client.ts','27–39'), 'WASM/proxy URL配置被传入实际模块加载并参与缓存identity。未读取全部打包文件/pack consumer，所以不宣称exports与资源闭合。', '发布后消费、独立类型、浏览器导入、离线与错资源部署；pack/部署与共享worker构建链路未当前执行。'),
],
'rxdb-adapter-sqlite-wasm': [
 row('C1', src(swm+'sqlite-load.utils.ts','76–121,127–177')+'；'+src(swm+'vfs-storage-loaders.ts','23–38'), '冻结能力表按实际WorkerGlobalScope检查；OPFS主线程拒绝、fs-handle缺root拒绝，不降级。VFS聚合模块一次lazy import加载各预设，不是每个VFS独立懒加载。', '各VFS资源/OPFS不可用/无安全上下文与失败清理完整矩阵；工厂与发布资源consume、声明数据库名称边界。'),
 row('C2', src(swm+'create_sqlite_client.ts','65–77')+'；'+src(core+'create_sqlite_client.ts','159–201,232–241'), '每连接租独立Comlink端口、同Worker只能一个租客，caller/client所有权有区分；init失败释放代理。没有从这些正常释放路径推断worker崩溃能结算在途RPC。', 'Worker死亡/取消后的晚到结果/BigInt/binary异常序列化、订阅释放；明确当前没有已核销的cancel/崩溃完整证据。'),
 row('C3', src(swm+'execute_helper.ts','108–136')+'；'+src(swm+'SqliteClient.ts','182–212,225–262'), 'LA-01当前回归红：第二prepare失败时首条unscoped statement finalize实际0次；WA相应段用整段finally，不可用另一后端绿抵消。本client队列串行、初始化失败有close/aggregate。', '真实WASM busy/可关库后果；所有prepare/step/finalize、并发/回滚/提交通知/已关闭调用；13 skip不能作通过。'),
 row('C4', src(swm+'SqliteClient.ts','243–250,273–335')+'；'+src(core+'create_sqlite_client.ts','153–201'), 'update_hook事件按type/db/table聚合，batch debounce+max timer；Worker端口只租一个client，没有恢复已删writer lease。按数据库分组不自动保证active branch和跨标签可见性。', '真正多标签不同库/同库、分支切换/物化、删除重建、重开与Worker重启；事件branch隔离仍须联审。'),
 row('C5', src(swm+'RxDBAdapterSqlite.ts','34–44')+'；'+src(swm+'__tests__/encrypted-bigint-binary.spec.ts','1–5')+'；'+src(core+'backup/restore-sqlite-database.ts','142–173'), '当前备份只交付主线程memory/idb；Worker/SharedWorker显式unsupported，不是“远程备份已经通过”。其它VFS也拒绝。加密suite接线存在不替代tamper/字节扫描。', '主线程idb刷新/备份传输完整性/坏归档/原库与tamper；worker备份为当前不支持，但拒绝及发布版本资源仍须完整核查。'),
],
'rxdb-adapter-wa-sqlite': [
 row('C1', src(wa+'sqlite-load.utils.ts','67–68,193–241,257–297')+'；'+src(wa+'create_sqlite_client.ts','25–60'), '默认IDBBatchAtomicVFS；async模式来自同一次解析，已知sync/asyncify文件名错配加载前拒绝；函数型远程选项拒绝，能力表冻结，不偷偷换存储档位。', '所有VFS/安全上下文/glue404/WASM版本/真实Worker与SharedWorker组合；vfs_register前后资源失败全部边界。'),
 row('C2', src(wa+'execute_helper.ts','75–88,104–161')+'；'+src(wa+'WaSqliteClientBase.ts','204–246'), '有界SQLITE_BUSY重试；绑定语句的收集/执行被finally覆盖，非绑定也逐条手工finalize，与LA-01形成反证。当前858pass/14skip不能证明每种清理错误都处理完。', '第一个finalize失败仍清理剩余句柄、原始错误归属、取消/BigInt/binary/空结果与真实VFS statement泄漏验证。'),
 row('C3', src(wa+'WaSqliteClientBase.ts','89–110,190–201,249–267,335–361')+'；'+src(core+'create_sqlite_client.ts','153–201'), '客户端identity冲突拒绝；初始化晚到会close迟到connection；关闭尝试数据库和VFS两种资源。Comlink同worker仅一租客，不表示不同realm的同库已证明隔离。', '同/异数据库双标签、worker重启、关闭中事务和真实锁策略；关闭失败重复调用结果完整性尚未核销。'),
 row('C4', src(wa+'__tests__/encrypted-change-log.spec.ts','1–9')+'；'+src(core+'RxDBAdapterSqliteBase.ts','1654–1712'), '复用core事务/变更处理，加密log走persistent suite+readDatabaseFile；没有靠业务后端特例消掉不一致。', '完整conformance/分支物化/事务回滚/事件/tamper，逐一解释14skip；namespace已修历史状态不自动外推其它全部场景。'),
 row('C5', src(wa+'RxDBAdapterSqlite.ts','35–45')+'；'+src(core+'backup/restore-sqlite-database.ts','93–105,142–173'), '备份仅主线程MemoryVFS/MemoryAsyncVFS/IDBBatchAtomicVFS；Worker/SharedWorker与其它VFS拒绝。这是声明支持面收缩，不能伪装全部OPFS持久化能力。', '主线程IDB真实刷新/恢复坏档/失败原库/关闭后独占、二进制传输；Worker拒绝路径与部署资源/发布consumer闭合。'),
],
'rxdb-adapter-sqliteai': [
 row('C1', src(ai+'sqliteai-load.utils.ts','46–78')+'；'+src(ai+'create_sqlite_client.ts','26–49'), '加载fingerprint/global lock/assertOo1Static与官方路径同契约；错误不换其它引擎。当前模块构造成功只证明oo1结构，不证明AI所有扩展。', '网络/资源配对/能力不足/初始化失败重试，以及LA-03共享oo1关闭屏障；不同配置/模块版本实际部署。'),
 row('C2', src(ai+'index.ts','1–18')+'；'+src(ai+'SqliteaiClient.ts','13–20'), '公开入口暴露adapter/client/loader及core通用SQL接口，没有专门AI向量/记忆方法承诺；不能从包名推断能力。', '真实引擎各扩展capability探针、版本差异/缺扩展拒绝；现有suite中的能力skip需要单列，而不是仅构造绿。'),
 row('C3', src(ai+'SqliteaiClient.ts','13–20')+'；'+src(core+'Oo1ClientBase.ts','113–139,180–235,265–305'), '同步/异步/类型/事件均委托Oo1ClientBase；LA-03已在共享层轻量回归证实。本包743pass/10skip与共享层生命周期红并不矛盾。', 'BigInt/binary/null批写回滚/重开跨后端同fixture、statement各失败阶段、真实OPFS关闭；10skip逐项核销。'),
 row('C4', src(ai+'__tests__/encrypted-bigint-binary.spec.ts','1–5')+'；'+src(core+'backup/restore-sqlite-database.ts','142–173')+'；'+src(core+'fts5/create-fts-table.ts','18–32'), '加密类型suite有实际接线；恢复blank按同引擎初始对象描述，不能用“没有任何表”的假设排除sqliteai自建表。搜索必须按capability而非SQL生成存在判断。', '加密log字节/tamper、搜索真实扩展与索引、损坏备份/失败清理/持久化恢复全场景；未执行部分明确记录。'),
 row('C5', src(ai+'index.ts','13–18')+'；'+src(ai+'sqliteai-load.utils.ts','65–78'), 'loader资源配置实际被传入；包公开API边界可见。本次四指标95.65/100/100/95.45只衡量本包配置源码，不覆盖共享core/全部WASM宿主。', 'Angular真实页面初始化、exports/WASM资源复制及pack后consumer、独立types、离线部署错误未当前验证；不能整对象closed。'),
],
'rxdb-adapter-miniprogram': [
 row('C1', src('packages/rxdb-adapter-miniprogram/README.md','3–16')+'；'+src(mini+'host.ts','181–206')+'；'+src(mini+'wechat-file-vfs.ts','620–623,804–810,867–870'), '当前支持面已从原C的单微信扩为微信/抖音/支付宝；原“非微信全拒绝”不能按旧计划照抄。SQL单realm/单连接、rollback journal、约10MB及不承诺fsync/crash-safe仍明示；支付宝随机Worker不等于SQL Worker transport。', '按当前三平台矩阵重新穷举能力/拒绝/第二连接与环境档位；LA-04使支付宝启动阻断，不核销C1；Android尚未验证。'),
 row('C2', src(mini+'subframe-glue.ts','20–25')+'；'+src(mini+'loader.ts','39–70')+'；'+src(mini+'hosts/alipay-wasm.ts','25–31,92–101'), 'LA-04确认当前部署缺陷：glue和精确依赖升级1.4.0，读取器仍只认1.3.1指纹。registry原tgz integrity=lock，安装WASM/glue与发布包逐字节同；不是取证环境被改写。初始化错误经race可见。', '修复后两种读取形态/错资源/glue/WASM配对全回归；文本编码坏UTF-8与sync callback/polyfill尚未全穷举；不盲删指纹或放宽接受旧二进制。'),
 row('C3', src(mini+'runtime-polyfills.ts','63–154,237–253')+'；'+src(mini+'host.ts','136–162')+'；'+src(mini+'hosts/alipay-random.ts','61–121,133–142'), '随机池接管新缓冲/消耗擦零，25%预约补给、3次失败上限，耗尽报cause；支付宝共享Worker通道ID/队列/超时处理。未观察到Math.random降级。', '长时补给/启动失败/耗尽/宿主违约随机源、各宿主真正熵API与调用次数上限的全部场景；Node/mock随机不能证明设备熵来源。'),
 row('C4', src(mini+'wechat-file-vfs.ts','349–369,401–476,486–535,669–791')+'；'+src(mini+'statement-cleanup.ts','17–46'), '单文件/分块store按实际落盘记dirty，短读零填，quota映射SQLITE_FULL并让出回滚余量；close释放连接表；扫尾不抢先finalize FTS内部statement。锁/fdatasync的缺失是明示限制，不谎称crash-safe。', '文件失败/超范围/内存压力/rollback/关库重开完整边界、每平台quota恢复；12个支付宝失败挡住对应宿主场景，不可用其它host绿抵消。'),
 row('C5', src(mini+'__tests__/real-wasm.integration.spec.ts','1–31,68–119')+'；'+src('packages/rxdb-adapter-miniprogram/README.md','9–16'), 'real-wasm套件用Node fs与wechat-shaped注入API，确有写-关-重开，但不是微信DevTools/真机。当前353测试中341pass/12fail只在Node等配置测量面。README旧设备声明不等于本轮重跑。', '三平台DevTools与iOS/Android实机启动/重开CRUD及精确资源指纹分列；历史设备证据新源匹配复核未完成；崩溃恢复仍是明确不承诺。'),
],
}

# 修正 C8 的测试锚点：测试接线是已读的 sqlite-wasm 文件。
rows['rxdb-adapter-sqlite-core'][7] = row('C8', src('packages/rxdb-adapter-sqlite-core/scripts/run-coverage-acceptance.mjs','15–27,52–69')+'；'+src(swm+'__tests__/encrypted-bigint-binary.spec.ts','1–5'), rows['rxdb-adapter-sqlite-core'][7][2], rows['rxdb-adapter-sqlite-core'][7][4])

snapshot_files=[]
for x in scope:
    changed=[]
    for path, old in x['sourceSha256'].items():
        f=root/path; sha=hashlib.sha256(f.read_bytes()).hexdigest() if f.exists() else None
        if sha != old: changed.append({'path':str(f),'scopeSha256':old,'currentSha256':sha})
    snapshot_files.append({'object':x['object'],'scopeTrackedFileCount':x['trackedFileCount'],'changedFromScope':changed})
(e/'closeout-source-fingerprints.json').write_text(json.dumps({'date':'2026-10-05','inventoryIsNotReadEvidence':True,'objects':snapshot_files},ensure_ascii=False,indent=2)+'\n')

marker = '## 2026-10-05：local-adapters 并行实审收束'
modified=[]
for x in scope:
    obj=x['object']; record=root/x['record']; plan=root/x['plan']; data=observed[obj]
    issue_ids = {'rxdb-adapter-sqlite-core':'LA-02/LA-03（轻量回归确认）','rxdb-adapter-sqlite-wasm':'LA-01（轻量回归确认）','rxdb-adapter-miniprogram':'LA-04 / P1（当前源码、来源和当轮加载失败确认）','rxdb-adapter-sqlite':'共享core LA-02/LA-03；不是本包suite红','rxdb-adapter-sqliteai':'共享core LA-02/LA-03；本包743pass不反证共享层窗口'}.get(obj,'未新增确认问题；不是整对象通过')
    test_lines=[a for a in data['tests'].get('observedLogLines',[]) if a['text'].startswith('Tests ')]
    tests = '；'.join(f"{a['text']}（{v / (a['run']+'.txt')}:{a['line']}）" for a in test_lines) or '本次交付快照未见目标完整结算，不预判主控在途结果'
    coverage=data['coverage'];metrics=coverage.get('metrics')
    cv = ('四指标 S/B/F/L = '+ '/'.join(str(metrics[k]) for k in ['statements','branches','functions','lines'])+f"%；summary/final：`{coverage['summary']}` / `{coverage['final']}`。" if metrics else '未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。')
    caveat = '覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。'
    table='| C | 实读源码/实际证据锚点 | 当前结论/可证反证 | 原 C 核销 | 剩余必要验证 |\n| --- | --- | --- | --- | --- |\n'+''.join('| '+' | '.join(r)+' |\n' for r in rows[obj])
    block=f'''{marker}

**execution: partial；整对象未 closed。原 C 全边界核销 0/{len(rows[obj])}。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `{e / 'scope.json'}` 的逐文件 SHA256 为准；收束复核 `{e / 'closeout-source-fingerprints.json'}`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`{e / 'file-inspection.json'}`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `{v / 'all-object-strict-lint-status.json'}` / `{v / 'all-object-typecheck-status.json'}`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：{tests}。
- {cv}{caveat}
- 当前范围内意见：**{issue_ids}**。候选统一写 `{e / 'findings.pending.md'}`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

{table}
### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`{e / 'validation-requests.json'}`；已观察结果：`{e / 'validation-observed.json'}`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
'''
    text=record.read_text()
    if marker in text:text=text.split(marker)[0].rstrip()+'\n'
    notice='> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。\n\n'
    if notice not in text:
        m=re.search(r'^# .+\n',text,re.M)
        if m:text=text[:m.end()]+'\n'+notice+text[m.end():].lstrip('\n')
    record.write_text(text.rstrip()+'\n\n'+block)
    ptext=plan.read_text()
    if marker in ptext:ptext=ptext.split(marker)[0].rstrip()+'\n'
    # 原表的历史状态保持历史，不机械改成“部分执行”。新的表记录具体本轮动作与阻断。
    pblock=f'''{marker}

这部分是**实际执行回填**，不是新增泛计划。原专项表及其旧 RV/旧测试数字属于早期执行快照；当前源与当轮结果见 `{record}`。用户已修历史问题不重新标红。

- execution: in-progress / partial；**原 C 全边界核销 0/{len(rows[obj])}，整对象未 closed**。原第 6 节完成条件保持原文，未满足项不打勾。
- 当轮已结算：{tests}。
- {cv}{caveat}
- 本轮明确意见：{issue_ids}。

{table}

请求/动态日志与阅读记录均由 `{e}` 保留。三个新增回归的 late lint/typecheck、完整测量面/宿主/持久化及发布闭合按实际待证留阻断；主控统一追加后续结果，不在这里预支通过。
'''
    plan.write_text(ptext.rstrip()+'\n\n'+pblock)
    modified.extend([str(plan),str(record)])

# 补齐来源结论及已到的 core 轻量动态证据，不新增问题。
f=e/'findings.pending.md';t=f.read_text()
if '### LA-04 发布来源排除环境污染' not in t:
    t+=f'''\n### LA-04 发布来源排除环境污染（当轮只读补证）

`{e / 'alipay-wasm-provenance.json'}` 验证两份 registry 原始 tgz：1.4.0 的 SHA512 integrity 与 pnpm-lock 完全一致，本地 WASM 与 glue 都逐字节匹配 1.4.0 发布包；812876/FNV1627926554 属正确1.4.0二进制。代码旧727646/FNV2641369642恰好匹配1.3.1原始发布包。只在内存读tgz和计算摘要，未安装/改依赖/执行WASM。故本条是**当前仓库升级遗漏导致的部署缺陷**，不是node_modules污染、不是盲猜新指纹。\n'''
if '### LA-02/03 当前主控轻量回归确认' not in t:
    t+=f'''\n### LA-02/03 当前主控轻量回归确认

`{v / 'local-adapters-tests.txt'}:406–443`：两个新增回归均在Chromium中实际红，晚到client/database的close计数实际0（预期1）。本对象1465passed/2failed/21skipped。它们是可控factory/load Promise的**轻量模拟边界证据**，不是OPFS/真Worker持久化资源后果实测。主控统一追加late probes；不另找第五条。\n'''
f.write_text(t)

# 记录真正新增的自有回归范围，且不把输出段落/盘点伪装成全文件审核完成。
inspection=json.loads((e/'file-inspection.json').read_text())
inspection['note']='记录实际阅读的文件及关注点；readRange为工具请求的源码段落。部分多文件输出曾截断，故整文件/完整C均不据这些ranges打勾；正文锚点只使用实际可见的责任边界。inventory、SHA256扫描不计阅读完成。'
inspection['fullFileCompletionClaim']=False
inspection['fullObjectCompletionClaim']=False
inspection['closedCCount']=0
inspection['entriesAreReadSegmentsNotCompleteFiles']=True
for z in inspection['files']:
    if 'readRange' in z: z['requestedSourceRange']=z.pop('readRange')
    z['wholeFileReviewComplete']=False
inspection['readFileCount']=len({z['path'] for z in inspection['files']})
inspection['selfAddedReviewSpecs']=[str(root/p) for p in [
 'packages/rxdb-adapter-sqlite-wasm/src/__tests__/review-parallel-statement-cleanup.spec.ts',
 'packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-init-disconnect.spec.ts',
 'packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-oo1-init-close.spec.ts']]
(e/'file-inspection.json').write_text(json.dumps(inspection,ensure_ascii=False,indent=2)+'\n')

requests=json.loads((e/'validation-requests.json').read_text())
for q in requests:
    args=' '.join(q['args'])
    if 'review-parallel-statement-cleanup.spec.ts' in args:q['reason']='当轮已红：主控 core-plugins-small-adapters-coverage.txt:2182–2207。无需重复全矩阵；主控去重编号与late probes统一补证。'
    if 'review-parallel-init-disconnect.spec.ts' in args or 'review-parallel-oo1-init-close.spec.ts' in args:q['reason']='当轮已红：主控 local-adapters-tests.txt:406–443。轻量可控Promise模拟，不冒充实际Worker/OPFS；主控late probes统一补证。'
    if 'review-aborted-initial-unlock.spec.ts' in args:q['reason']='当前keyring源码已确认RV-058修复，两道epoch屏障；encrypted279pass已结算。旧红不得复报，完整C3其他边界仍未核销。'
(e/'validation-requests.json').write_text(json.dumps(requests,ensure_ascii=False,indent=2)+'\n')

summary={'date':'2026-10-05','objects':[{ 'object':x['object'],'closedC':[],'notClosedC':[r[0] for r in rows[x['object']]],'execution':'partial','objectClosed':False} for x in scope], 'closedObjects':0,'closedC':0,'totalC':sum(len(t) for t in rows.values()),'pendingFindings':['LA-01/P2','LA-02/P2','LA-03/P2','LA-04/P1'],'modifiedReviewDocuments':modified,'newReviewSpecs':inspection['selfAddedReviewSpecs'],'readFileCount':inspection['readFileCount'],'readSegmentCount':len(inspection['files']),'heavyValidationExecutedByAgent':False,'noFurtherProbes':True}
(e/'closeout.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print('review documents written:',len(modified),'C:',summary['totalC'],'fully closed C:',summary['closedC'],'objects:',summary['closedObjects'],'files with read segments:',summary['readFileCount'])
