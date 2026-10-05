# local-adapters：候选发现（2026-10-05）

只登记当前源码；连续 RV 编号及去重由主控完成。本文没有把旧红测试重新当作现存 bug。

## LA-01 / P2：sqlite-wasm 的第二条 prepare 失败会泄漏首条绑定语句

- **状态**：静态确定＋当轮主控轻量回归确认；真实 WASM 关库后果仍待证。不是 RV-045/046/050/058。
- **触发**：`executeHelper(sqlite, db, 'SELECT ?; SELECT * FROM missing_table', [1])`；第一条 prepare 已 yield，第二条 prepare 抛错。
- **当前行锚点**：`packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts:108–129`，`{ unscoped: true }` 在循环中收集，只有枚举正常结束才走 finalize 分支；`135–136` 外层 catch 只包错误。
- **实际源码证据**：锁定上游 `wa-sqlite@2bf1c59d.../src/sqlite-api.js:655–690` 的 `maybeFinalize()` 明确跳过 `options.unscoped`，不会替调用方回收；本包 `SqliteClient.ts:205–212` 直接关库，没有 next-statement 扫尾。另一实现 `rxdb-adapter-wa-sqlite/src/execute_helper.ts:134–149` 已用整段 `try/finally` 覆盖相同 prepare 边界，构成可证反证：不是共有能力完全缺失。
- **影响**：语句句柄/锁未释放，原连接关库可能报 busy；尚未在本轮真实 WASM 上跑出后果，不宣称已实测。
- **最小修法**：收集与运行整个过程进入一个 `try/finally`，在 finally 清理所有已经 yield 的句柄；清理多个句柄时一个 finalize 失败不应跳过其余句柄，并保留原始 prepare 原因。不改业务或依赖。
- **回归**：新建 `packages/rxdb-adapter-sqlite-wasm/src/__tests__/review-parallel-statement-cleanup.spec.ts`，验证第二 prepare 抛错时第一句柄仍调用 finalize。主控再用单一 memory/真实 WASM 验证 malformed tail 后能关库；不需要全矩阵。

## LA-02 / P2：sqlite-core 关闭没有覆盖在途的 client factory

- **状态**：当轮主控轻量回归确认；真实 Worker/OPFS 后果仍待证，主控去重编号。
- **触发**：`connect()` 已进入异步 `createClient()`，WASM/Worker 初始化尚未返回时调用 `disconnect()`；该路径没有任何已入 adapter 查询队列的 SQL。
- **符号/行**：`RxDBAdapterSqliteBase.ts:581–590,599–621,1484–1512`。关闭仅排空 `#change_tasks/#queue` 并关 `#cached_client`，不等待已经存在的 `#client_promise`，随后丢掉 promise；旧 factory 返回后仍在 `1494` 发布 client。`1716–1719` 遇到 disconnected 只是跳过监听器，不负责关迟到的连接。
- **可证反证**：`rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:200–212` 会先等自己的 init promise；`WaSqliteClientBase.ts:190–199,249–254` 会关掉 disconnect 后才完成的连接。但是 core 在工厂 await 的更外层已早退，所以子 client 的这些保护不能替 core 关闭未拿到的实例。
- **影响**：已报告关闭的 adapter 仍持有打开的数据库/Worker，恢复前的旧连接/锁清理条件不可靠；是否影响本机具体持久化锁仍需真实宿主补证。
- **最小修法**：在生命周期层将创建与关闭串行或使用 epoch；关闭必须等待/回收其捕获的在途创建结果，失败只丢弃失败实例，禁止迟到结果重新发布缓存。不仅给子 client 多加 guard。
- **回归**：新增 `packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-init-disconnect.spec.ts`，控制工厂 Promise，验证迟到 client 在关闭完成边界被关一次；当前未运行。后续验证工厂失败、并发两个关闭、断开后重连以及 Comlink ownership。

## LA-03 / P2：oo1 直接客户端在 loadModule 晚到后复活

- **状态**：当轮主控轻量回归确认；late strict 门禁与真实宿主后果仍待主控。与 LA-02 是两层独立状态机，不能用只修 core adapter 的方式销掉本条。
- **触发**：直接公共 `SqliteClient.init()` / `SqliteaiClient.init()` 等待模块下载时调用 `disconnect()`。
- **行锚点**：`rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113–139,180–215,265–305`。断开把 init promise 清空并抓取当前尚不存在的 `db`；模块返回后没有 epoch/state 检查，照常 new DB、装 PRAGMA/hook，最后 `129` 无条件 `ready`。
- **结果**：已完成关闭的 client 可再次成功 `execute()`，迟到 DB 未被此次关闭回收。官方 SQLite 与 SQLiteAI 的公开类都继承此实现。
- **反证**：`WaSqliteClientBase.ts:192–199` 会验证当时状态并关迟到连接；`sqlite-wasm SqliteClient.ts:200–212` 等待自己的 init。不是所有后端都缺屏障，也不是用户已修的 RV-058。
- **最小修法**：oo1 生命周期串行或 epoch 屏障；disconnect 等待并清理其对应初始化，不让迟到初始化发布 ready；并发 init/disconnect/reinit 的 Promise 归属必须明确。
- **回归**：`packages/rxdb-adapter-sqlite-core/src/__tests__/review-parallel-oo1-init-close.spec.ts`；控制 load promise，不下载 WASM、不跑 conformance。主控须分别验证修复后关库及已关闭 execute 拒绝。

### LA-01 当轮主控补证已到

`../validation/core-plugins-small-adapters-coverage.txt:2182–2207`：Chromium 执行本回归，`finalize(41)` 实际 **0 次**；本对象 **871 passed / 1 failed / 13 skipped**。本条从静态候选升级为**轻量回归确认**；仍未把 mock 里的句柄泄漏断言冒充真实 WASM busy/持久化实测。该批 exit=1，未取得本对象当轮 coverage summary/final，不能引用旧覆盖率补绿。

## LA-04 / P1：支付宝启动仍认 1.3.1 的 WASM 指纹，当前依赖已锁 1.4.0

- **状态**：当前源码＋当轮主控测试确认；主控去重登记，不改业务。
- **触发**：按当前 README 从精确 `@subframe7536/sqlite-wasm@1.4.0` 复制 WASM 与对应 base64 文本副本，调用支付宝 host 初始化。
- **符号/行**：`packages/rxdb-adapter-miniprogram/src/hosts/alipay-wasm.ts:25–31,51–54,92–101` 硬编码 `{bytes:727646,fnv1a:2641369642}`，注释指向旧 `1.3.1`；`src/subframe-glue.ts:21–24` 与 `package.json` 已选 `1.4.0` 的 glue/二进制。
- **实际证据**：主控新日志 `../validation/core-plugins-small-adapters-coverage.txt:2612–2648,2675–2693`，锁定依赖实读为 `{bytes:812876,fnv1a:1627926554}`，指纹契约回归红；支付宝启动/重开/第二连接等 6 条宿主测试在初始化前全部被同根因卡住，连同 WASM 单测共 **12 failed /341 passed**。
- **只读核对**：本代理读取当前安装的 `1.4.0` `./wasm` 导出，大小 812876，FNV-1a 1627926554，SHA-256 `c9da064df53408dde001cd995811ff224ccc1fe056f4f198e500f4a5615336f2`；根 `patchedDependencies` 没有此包。该核对不是运行 WASM 或设备测试。
- **反证/限定**：没有不安全 fallback，错误是显式 fail-closed；微信/抖音不经支付宝指纹读取器，其 Node/real-wasm 绿不能销掉支付宝启动故障。不是历史红测试，也不是设备未验证本身。
- **最小修法**：将固定指纹与精确升级的二进制/glue 同源更新，最好构建期按精确依赖产出/验证常量；同步升级代码包的原文件与文本副本。不能删核验、不能同时接受两种跨构建 WASM。
- **回归**：既有 `alipay-wasm.spec.ts` 指纹契约与 binary/textCopy 两路径；`alipay-host.spec.ts` 真实 WASM 的启动、重开、quota、第二连接。修复后还须分列模拟器/iOS/Android 实机，不因 Node 回归绿而补齐 C5。

### LA-04 发布来源排除环境污染（当轮只读补证）

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/alipay-wasm-provenance.json` 验证两份 registry 原始 tgz：1.4.0 的 SHA512 integrity 与 pnpm-lock 完全一致，本地 WASM 与 glue 都逐字节匹配 1.4.0 发布包；812876/FNV1627926554 属正确1.4.0二进制。代码旧727646/FNV2641369642恰好匹配1.3.1原始发布包。只在内存读tgz和计算摘要，未安装/改依赖/执行WASM。故本条是**当前仓库升级遗漏导致的部署缺陷**，不是node_modules污染、不是盲猜新指纹。

### LA-02/03 当前主控轻量回归确认

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:406–443`：两个新增回归均在Chromium中实际红，晚到client/database的close计数实际0（预期1）。本对象1465passed/2failed/21skipped。它们是可控factory/load Promise的**轻量模拟边界证据**，不是OPFS/真Worker持久化资源后果实测。主控统一追加late probes；不另找第五条。
