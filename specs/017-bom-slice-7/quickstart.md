# Quickstart: epic-009 首轮切片第 7 步（验证记录）

**日期**：2026-10-16 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项                                     | 落点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-524 阶段 B/C（费率与工时）          | `BomActivityType`（(workCenterId, code) 唯一）+ `BomActivityRate`（(workCenterId, activityTypeId, validFrom) 生效段排他唯一索引）；费率按费率日取生效区间最大者、缺费率报缺失不以 0 兜底（AC#3/#4）；`BomWorkCenter` 补 `overheadRate`/`overheadCurrency`；`BomRoutingOperation` 补 `setupTime`/`runTime`/`fixedTime`/`timeUom`（AC#5 一批一次 vs 每件）；时间单位换算走 60 进制 `TIME_UNITS`（s/min/h），量纲不兼容拒绝                                                                                                    |
| US-514 成本卷算（19 个 AC 全关）       | `quantity/cost.ts` 卷算引擎：递归后序 memo + 环检出；材料/加工/制费/副产抵减四项构成与逐层明细树 `CostNodeDetail`；节点键 = 已解析头 + 上下文（precise/imprecise 缓存不串 AC#8）；`unit_cost` 独立 memo 键含 costLotQty（AC#9 变动/固定项）；替代组加权（AC#2）、副产抵减（AC#5）、工时三量 × W_op（AC#15/#16/#18/#19）、十进制 34 位有效 half-even 全程 BigInt（AC#12~#14 换算）、缺成本/缺费率/币种不符报缺失（AC#6/#10）、unresolved/truncated 拒绝（AC#11）；全部读取走事务执行器 query（裸 rawQuery 与事务死锁的教训） |
| US-516 EBOM↔MBOM 映射（22 个 AC 全关） | `resolve/bom-map.ts`：`BomMapScope` + `BomMap`（六态 relation；NULL 规则下沉存储层触发器——check 引用列会让引擎 undefined.type 崩溃）；`saveMapping` 保存校验（两侧类型/组织、范围成员资格头链一跳 BFS、路径相邻与末元素、AC#15 修订边界）；`mappingCoverage` 路径级优先行级兜底、未覆盖报出、失效标记；`mappingGaps` 解析步骤集合比对（祖先变/解析修订变/unresolved/truncated 都点名）；`confirmMapping` 基线整体推进                                                                                                       |
| US-525 阶段 D                          | 种子 D 层（SHEET-ASSY 双图 + scope + split 1:3、MCU-V2/MCU-DIE 下钻、COST-DEMO 故意缺成本、价格/抵减/路线/费率补丁、外壳换版 ECN-2026-016 给 SC-100 追加 HOUSING 行）+ `SCOOTER_GOLDEN_D`（根层子件贡献 39.1204… + HOUSING 节点逐项）+ demo 双图并排 + 覆盖率/缺口面板 + 卷算面板（明细拍平逐层 + 缺成本整体报缺失）+ e2e 第 14~17 条                                                                                                                                                                                       |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 416/416 通过（27 个 spec，新增 bom-cost / bom-map / bom-scooter-d）；覆盖率 94.85% 语句 / 82.58% 分支 / 93.76% 函数 / 96.45% 行
- `dev-rxdb-bom-e2e` — 17/17 全绿（A~D 四阶段 AC）
- `dev-rxdb-bom` + `dev-rxdb-bom-e2e` 的 lint/typecheck/test/build — 34 任务全绿（AC#16 门禁）
- 插件主入口补 bom-map 导出、testing 入口补 D 层装载；`nx sync` 刷新 tsconfig 引用
- affected full — 后台运行中（88 项目，nx reset 后全量）

## 排障记录（第 7 步踩过的坑）

1. **e2e 目标本地缓存键不含 spec**：nx 的 `--skipNxCache` 只断开 Nx Cloud 远程缓存，本地缓存仍命中——spec 改断言后 e2e 反复跑旧代码（语法错误探针证明 playwright 根本没读磁盘文件）。根治：`project.json` 的 e2e 目标 inputs 显式纳入 `{projectRoot}/src/**/*.spec.ts` 与 playwright.config，再 `nx reset`。
2. **卷算根层 material 行的语义**：`amount = 子件 unit_cost × 需求`（含子件的加工/制费/抵减），根层 processing/credits 只含本层——整机加工/制费/抵减断言要看 HOUSING 子节点，不是根层。
3. **给已发布头加行必须走 open 批次 + 批内 ECN**：矩阵只放行「draft ECN」或「released 且 historyBatchNo 指向当前 open 批次」的 ECN——D 层的外壳换版行挂批内新建的 ECN-2026-016（draft 装载 + 发布转移），挂既有 ECN-2026-014 会被拒。
4. **golden 手算的树假设要对着实际装载树写**：初版 golden 把 MCU-DIE 当外购又算 DIE-PART（双重计算）、把 HOUSING 树并进 SC-100 但数据集没挂——修正为「根层子件贡献」口径并把 HOUSING 挂进 SC-100（经 ECN-2026-016 换版语义）。
5. **yield 0.02 的 scrap 产生无限小数**：1/0.98 的 34 位有效数字 half-even 舍入是 golden 的固定值（`39.12040816326530612244897959183674`），测试断言用 decimal kernel 求和、不经 JS number（Number 累加丢精度挂过）。
6. **测试断言金额禁止 `Number()` 累加**：规范十进制串的合计必须走 `decimalAdd`，float 累加会把 `39.12040816326530612244897959183674` 变成 `39.1204081632653`。
7. **解构顺序**：`for (const [index, targetKey] of [['SHEET', 0], ...])` 的 index 是字符串 'SHEET'，`mbomLineIds['SHEET']` = undefined → targetLineId 丢失 → NULL 规则违约（split 两侧必填）。数据集装载的映射段是实体直存（不赋 id，随机 id 无妨——测试按 scopeId 反查）。
8. **给已有头追加行的 `headerOverlays.lines`**：loadHistory 的输入形状是 `{ lineId }`（occurrenceAdds）与 `{ lineNo, ecnInId }`（lines），与数据集内部格式（occurrenceIndex/ecnId）不同——装载函数里转换。
9. **bom-map NULL 规则在存储层触发器**：实体 CHECK 引用 relation 列会让引擎 `undefined.type` 崩溃；SQLite 与 PG 两侧触发器同口径（added 只 source 空、removed 只 target 空、其余四态两侧必填、不允许双 NULL）。
10. **e2e 端口残留**：上次会话的 `nx serve` 占 4311 导致 playwright webServer 起不来——先 kill 再跑。
