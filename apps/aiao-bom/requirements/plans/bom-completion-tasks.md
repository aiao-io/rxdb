# BOM 收尾与演示交付任务

日期：2026-11-06。对应 PR：#129。当前范围以根 US-518 与应用故事为准，旧 spec011～024 的 256 项完成记录作为历史基线保留。

- [x] C001 按红绿顺序补齐 US-518 AC#12：SQLite/PGlite 的插件 API、直连 SQL、批量回滚和旧空集合升级兼容；新增 8 条先红，连同既有有效性用例 29/29 通过。
- [x] C002 首页串联首次案例准备与进入核对；连接未完成时禁止清空未知数据，取消或失败保留条件，重复点击只执行一次；首页 19 条单测通过。
- [ ] C003 窄屏选择变化后定位用量依据，返回恢复原行焦点；完成桌面与窄屏单测、首次准备至摘要下载的生产浏览器验收。
- [ ] C004 同步根故事、应用故事、派生视图与验收记录，标明旧“19 条全部 Done”结论的历史基线；未评审、未合并和缺少真实试用证据的故事保持实际状态。
- [ ] C005 完整执行核心插件测试与覆盖率、三端绑定和应用门禁、生产浏览器与受影响全量 Nx 校验，保留失败及最终通过证据。
- [ ] C006 更新并提交 PR #129，定位并修复其失败检查，核对最终提交的远端检查结果；不得降低 benchmark 阈值或伪造冻结基线。
- [ ] C007 取得获准真实样本、人工期望与目标工程师记录后完成 BOM-US-202；当前缺少这些输入，不能以自动化或合成案例替代。

## 已发现的远端失败

PR 当前远端提交 ac7a9172 的 `ci / benchmarks` 失败，继而导致 `ci / gate` 失败。工作树 benchmark 在 AMD EPYC 9V45 / Node 26 画像上，diff 比值 3.046 超过 2.926，restore 比值 14.868 超过 14.447；status、commit、搜索与排序基准通过。需要结合实际热路径与最终提交的 CI 判断，不能把旧头的失败当成新头结果。

## 验收入口

- `pnpm nx run rxdb-plugin-bom:test`
- `pnpm nx run-many --projects=aiao-bom,aiao-bom-e2e,rxdb-plugin-bom-angular,rxdb-plugin-bom-react,rxdb-plugin-bom-vue --targets=lint,typecheck,spec-typecheck,test --parallel=1 --skipRemoteCache --output-style=static`
- `pnpm nx run aiao-bom-e2e:e2e`
- `pnpm nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e --parallel=1 --skipRemoteCache --output-style=static --nxBail`

核心插件完整测试在独立进程执行，未完成前不记为通过。应用与平台的 Done 均以各自需求约定和实际合并状态为准。
