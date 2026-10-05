---
kind: review-execution
object: rxdb-adapter-encrypted
created: 2026-10-03
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
execution: partial
---

# rxdb-adapter-encrypted：实际评审执行记录

> **2026-10-05 基线说明**：下面早期批次的“本轮”指该节自己的历史日期，不指本次并行实审。当前结论以文末「local-adapters 并行实审收束」为准；历史已修 RV 不复报。

**部分执行，暂不作全对象评级。** 已开始入口与门禁阶段；专项语义/真实环境没有全部完成。

## 全范围启动批：入口与实际门禁

本对象已进入全仓执行范围；本节是**入口自动核查＋实际门禁**，不是全部 C 项已经人工深审。

AES-GCM 字段加密 wrapper、versioned envelope、keyring 和查询能力约束。

本批基线 `3b3e449e10c6a587056a2ae947eddfd161834f97`；源码/入口路径与摘要来自 [本轮内容指纹清单](../../evidence/2026-10-03/full-run/entry-inspection.json)。

入口/配置已读取并核对：

- [`packages/rxdb-adapter-encrypted/src/index.ts`](../../../../packages/rxdb-adapter-encrypted/src/index.ts)
- [`packages/rxdb-adapter-encrypted/src/encrypt-patch.ts`](../../../../packages/rxdb-adapter-encrypted/src/encrypt-patch.ts)
- [`packages/rxdb-adapter-encrypted/src/crypto.ts`](../../../../packages/rxdb-adapter-encrypted/src/crypto.ts)
- [`packages/rxdb-adapter-encrypted/src/envelope.ts`](../../../../packages/rxdb-adapter-encrypted/src/envelope.ts)
- [`packages/rxdb-adapter-encrypted/src/keyring.ts`](../../../../packages/rxdb-adapter-encrypted/src/keyring.ts)
- [`packages/rxdb-adapter-encrypted/src/keyring-storage.ts`](../../../../packages/rxdb-adapter-encrypted/src/keyring-storage.ts)
- [`packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts`](../../../../packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts)
- [`packages/rxdb-adapter-encrypted/package.json`](../../../../packages/rxdb-adapter-encrypted/package.json)
- [`packages/rxdb-adapter-encrypted/project.json`](../../../../packages/rxdb-adapter-encrypted/project.json)

| target      | 当前证据                      | 日志                                                         |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| `lint`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/lint.txt)      |
| `typecheck` | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/typecheck.txt) |
| `test`      | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/test.txt)      |
| `build`     | 本轮通过（限定当前配置/平台） | [执行日志](../../evidence/2026-10-03/full-run/build.txt)     |

当前确认意见：本轮基线阶段尚无新增确认问题；不能据此给全对象通过结论。

### 尚未完成的专项

以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：

- [ ] C1 威胁模型与落盘范围：列出 entity/change log/working tree/commit/backup 的敏感数据路径，明确加密不等于历史数据可删除。
- [ ] C2 AES-GCM 与 AAD：审查 IV、AAD/version、实体/字段/主键绑定和解密失败；不自行实现弱随机或验签 fallback。
- [ ] C3 keyring 生命周期：检查持久化、载入、缺键、切换密钥与并发初始化的真实 API；不从测试替身推断安全保证。
- [ ] C4 序列化与 patch：核查部分更新、null/undefined、BigInt/binary/JSON 和关系字段；wrapper 不改变实体原契约。
- [ ] C5 查询能力拒绝：核查 metadata-validation 与 encrypted-query validation，列明排序/范围/搜索/关系的允许边界。
- [ ] C6 跨后端组合：逐后端对照 sqlite-core、PGlite、Electron、Tauri、浏览器、小程序实际测试调用点。

覆盖率/外部宿主/跨框架真实用户链路需独立证据；普通测试日志中的 skip 逐项登记，不折算为通过。

## 2026-10-05：加密初始化取消联审

首次 provider 返回之前 lock 的初始化提交边界确认 RV-058（已修复，见 README 2026-10-05 清理记录）（P2）：内存发布被阻止，废弃 verifier 仍被实际存储，新 B 因此被拒绝。原 Keyring/WebCrypto+native SQLite 接口 **2 failed /1 passed**；最终整包 **275 passed /2 failed**，原 274 条全过。C1/C2/C4/C5 源码与基线已追踪，C3 有确认问题、C6 两实际后端补证；所有完整 C 仍未核销。没有把已有 AEAD/AAD/lockEpoch/singleton 冲突保护漏看成无实现，亦不从 helper 的非字符串 passthrough 推出真实 row 可绕过解密。

[本轮源码/命令与未完成项](../../execution-2026-10-05-encrypted.md) · [最终状态观测](../../evidence/2026-10-05/encrypted/final-observations.json)。encrypted/Electron/PGlite 严格 lint/typecheck 通过，业务未改；sqlite-core 没有伪造本轮独立 lint/整包通过。coverage 关闭，不自动核销 C 专题。

## 2026-10-05：local-adapters 并行实审收束

**execution: partial；整对象未 closed。原 C 全边界核销 0/6。** 这不是把“看过入口/有测试文件/覆盖率达标”当完整深审；未阅读和未测的面在下表明确保留。原完成条件不删、不放宽、不自动打勾。

### 本轮基线与实际验证

- 日期：**2026-10-05（Asia/Shanghai）**。源起点以 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/scope.json` 的逐文件 SHA256 为准；收束复核 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/closeout-source-fingerprints.json`。历史 `2026-10-03/04` 结果只作历史，不是本轮基线；用户已修 RV-045/046/050/058 不按旧红复报。
- 实读文件及关注点：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/file-inspection.json`。段落实读不等于整文件读完；清单盘点不等于阅读。未穷举全部受控配置/测试/fixture/构建资源，所以第一条完成条件未满足。
- 主控串行执行。69对象 strict lint/typecheck 的 exit=0、cacheDisabled=true、source drift=[]，证据 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-strict-lint-status.json` / `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/all-object-typecheck-status.json`。本子任务**没有运行 Nx test/build/e2e/coverage、server 或容器**。三个本轮新回归未出现在这两批输入指纹里，不能借旧批次宣称它们已过 late lint/typecheck。
- 本对象已结算证据：Tests 279 passed (279)（/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/validation/local-adapters-tests.txt:306）。
- 未取得该对象当轮同代 summary/final，不引用库存或历史覆盖率。覆盖率只对应原配置 include/exclude、该次执行宿主与已执行项；skip 不折算通过，源码语义与真实持久化需另证。
- 当前范围内意见：**未新增确认问题；不是整对象通过**。候选统一写 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/findings.pending.md`，由主控聚焦、去重、编号；不修改总 RV 台账。

### 逐 C 实际证据与核销表

| C   | 实读源码/实际证据锚点                                                                                                                                                                                                                                                                                                                                                | 当前结论/可证反证                                                                                                                                                                                  | 原 C 核销 | 剩余必要验证                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:409–456,646–724`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:23–44,51–72`                                                                                                                                                   | 实体声明列与 change patch 有明确 envelope 边界；NULL 旁路、非字符串实际 row 不可冒充信封。不是整库加密，不能把 adapter plaintext 内存正常行为当落盘漏密。                                          | 未核销    | entity/change/working-tree/commit/backup 真实持久化字节与错误/日志扫描尚未穷举；未声明覆盖范围不能外推。                             |
| C2  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/crypto.ts:82–93,99–145`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/envelope.ts:126–176,190–206`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/keyring.ts:238–327`                                                                         | 随机 IV、AES-GCM AAD 与 typed PK/namespace/table/column/kid绑定；解密鉴权失败 typed error，lock在途拒绝并清零。v1 需显式 migration，v2失败不重试v1。没有单元格版本计数，不宣称防同身份旧密文回放。 | 未核销    | tamper nonce/AAD/错实体字段/重放完整威胁边界与实际后端回归；279单测绿不是全部存储路径证明。                                          |
| C3  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/keyring.ts:217–231,407–424,509–575`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:35–37,65–78`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/__tests__/review-aborted-initial-unlock.spec.ts:48–99` | RV-058已重新追当前源：545提交前同步epoch检查，558发布前第二屏障；新回归期待取消后无singleton/A取消后B正常。与原旧红结论相反，不能复报。INSERT OR FAIL 的冲突与其他I/O错误区分。                    | 未核销    | 所有并发首次开库、损坏/未知KDF、随机源缺失、关闭重连/真实存储冲突全边界；写入已在途再lock只保证不发布内存key，不承诺撤销不可逆提交。 |
| C4  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/serialize.ts:29–69`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/encrypt-patch.ts:29–43,56–70`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:646–724`                                                                | BigInt要求signed64、binary复制，结构化值JSON；patch只遍历出现的键，NULL不封装，读实际row任一失败整行作废。helper的非字符串patch passthrough不能用于推断row可绕过解密。                             | 未核销    | 部分更新/undefined/特殊数值/关系字段/混合批写/失败回滚与原实体契约完整比较；序列化全函数与后端全部消费点未读完。                     |
| C5  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts:17–36`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts:21–39`                                                                                                                                                           | where/order/group/projection进入共享 metadata 校验；关系resolver明确传入，SQLite group/projection未实现显式拒绝，且加密错误优先。                                                                  | 未核销    | metadata-validation内部347行所有关系/别名/混合RuleGroup/范围/排序/搜索拒绝分支尚未穷举；不能因入口delegate存在即核销完整C。          |
| C6  | `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-wasm/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-wa-sqlite/src/__tests__/encrypted-change-log.spec.ts:1–9`；`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqliteai/src/__tests__/encrypted-bigint-binary.spec.ts:1–5`       | 已对照真实 adapter suite 接线，WA 日志 suite 用 persistent factory + file reader，而非仅 wrapper mock。当前279 pass仅本包单测；其它对象的默认档位/skip不能折算所有后端安全。                       | 未核销    | SQLite/PGlite/Electron/Tauri/browser/miniprogram 各真实 CRUD/log/tamper/backup 联审及当前持久化扫描；适用三框架用户链路另证。        |

### 完成阻断与交接

- 全对象源码/配置/全部测试及打包面尚未全部实审；跨宿主/适用三框架的真实用户链路、持久化刷新、发布 consumer 与各 skip 原因尚未闭环。**0 个整对象完成**，不能以局部通过声明发布就绪。
- 已发送请求：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-requests.json`；已观察结果：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel/local-adapters/validation-observed.json`。不再新增探针或第五个候选。主控后续 late probes/全矩阵结果统一追加；本段不预测在途目标成功，也不把未来补证算入核销。
- 评审结论只限上述证据：有明确问题的局部是 🔴；没有新增问题不代表 🟢。本轮保留 partial，完整评级须原完成条件都满足后再给。
