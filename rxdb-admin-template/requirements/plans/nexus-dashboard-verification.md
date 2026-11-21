# Nexus 参考 Dashboard 三端验收记录

记录日期：2026-11-16。核对代码基线：`c2252b51`。实施进度与剩余任务见 [优化清单](nexus-template-optimization-tasks.md)。

前两阶段记录依据当时的源码与既有日志整理，原始盘点没有重跑应用单测或 E2E；后续实际复验结果按 T01 / T02、T04 / T05 分节追加。记录用于证明 Web 模板行为，不自动关闭 ADMIN-US-003 / 101 / 102。

## 已验证行为与入口

| 行为                                                                 | 实现或测试入口                                                                                                                    | 证据层级       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 三类真实资产统计、总数、空库和快捷跳转                               | [数据契约](../../apps/react/src/app/pages/dashboard-model.ts)、[Dashboard 浏览器场景](../../apps/react-e2e/src/dashboard.spec.ts) | 单测 / 浏览器  |
| 最近五个操作单元、时间与 changeId 排序、事务聚合、撤销及重做失效状态 | [数据契约测试](../../apps/react/src/app/pages/dashboard-model.spec.ts)                                                            | 单测           |
| 当前分支与资产实体过滤、分支变更重查、加载和错误、取消订阅           | [持久化活动查询测试](../../apps/react/src/app/pages/dashboard-activity-source.spec.ts)                                            | 单测           |
| 创建、更新、删除活动及刷新保留                                       | [Dashboard 浏览器场景](../../apps/react-e2e/src/dashboard.spec.ts)                                                                | 浏览器         |
| 英文操作与实体显示名、日期格式、375px 无横向溢出                     | [Dashboard 浏览器场景](../../apps/react-e2e/src/dashboard.spec.ts)                                                                | 浏览器         |
| 空库及有活动数据时 axe 零违规                                        | [工作台无障碍测试](../../apps/react-e2e/src/workbench.a11y.spec.ts)                                                               | 浏览器         |
| 资产 CRUD、搜索、外壳偏好、国际化和备份恢复原路径                    | [共享 E2E 套件](../../apps/react-e2e/src)                                                                                         | 完整浏览器回归 |

三端共用浏览器场景，每端构建并启动自己的生产产物。数据模型、查询模块、相关单测与中英文应用目录已比对一致；框架页面使用各自绑定。

## 执行结果

| 框架    | 应用单测 | 完整 E2E | lint / typecheck / build |
| ------- | -------- | -------- | ------------------------ |
| Angular | 60/60    | 97/97    | 通过                     |
| React   | 63/63    | 97/97    | 通过                     |
| Vue     | 60/60    | 97/97    | 通过                     |

共享 React E2E 工程的 lint 与 typecheck 通过；`git diff --check` 通过。`dashboard-model.ts` 与 `dashboard-activity-source.ts` 的定向覆盖率在三端均为 statements / branches / functions 100%；这不代表整个应用覆盖率为 100%。

核对的本机日志：`/tmp/dashboard-{angular,react,vue}-e2e.log`、`/tmp/dashboard-checks2.log`、`/tmp/dashboard-final-lint.log`、`/tmp/dashboard-e2e-typecheck.log`、`/tmp/dashboard-coverage.log`。这些文件是本地临时证据，未入库；长期复验使用下列命令与已入库测试。

## 复验命令

在仓库根执行，三端 E2E 依次运行，避免本机资源争抢。

```bash
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue rxdb-admin-template-react-e2e -t lint --max-warnings=0 --parallel=1 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue -t typecheck test build --parallel=1 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react-e2e:typecheck --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-angular-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-react-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-vue-e2e:e2e --workers=2 --skipRemoteCache
NX_NO_CLOUD=true pnpm nx run-many -p rxdb-admin-template-angular rxdb-admin-template-react rxdb-admin-template-vue -t test --coverage --coverage.include=src/app/pages/dashboard-model.ts --coverage.include=src/app/pages/dashboard-activity-source.ts --parallel=1 --skipRemoteCache
```

## 实现决策与边界

- 活动源从会话历史改为持久化 `RxDBChange`。会话历史会在刷新后丢失可见记录，不能用于此处的最近活动。
- 查询限定当前分支、`assets` 命名空间及三类资产实体，不展示系统内部日志。
- 实体显示名通过 `rxdb-model` 命名空间翻译，日期复用现有 I18n `formatDate`。
- 首页继续作为连接前入口，打开 Dashboard 才连接数据库；完整回归保留全新工作台恢复备份路径。
- 在 `c2252b51` 基线中先读取所有匹配日志再聚合，尚无大日志量性能验收；后续结果见本记录 T04 / T05 复验及清单 T04。
- 应用构建保留了 CommonJS、大 chunk 和 `lottie-web` 直接 `eval` 告警，依赖构建中亦有 PGlite `eval` 告警；通过构建不表示这些问题已治理，详见清单 T05。
- 新业务实体替换与 Dashboard 专属外壳扩展的完整验收仍需分别对照 ADMIN-US-101 / 102，现有资产数据通过不能替代跨业务证明。

## 2026-11-16 收尾复验：T01 / T02

本节为在 `b1febf42a` 基线上补测试与文档后实际重新运行的结果，与上文 `c2252b51` 的历史记录区分。

| 框架    | 应用单测 | 完整 E2E | lint / typecheck / build |
| ------- | -------- | -------- | ------------------------ |
| Angular | 60/60    | 99/99    | 通过                     |
| React   | 63/63    | 99/99    | 通过                     |
| Vue     | 60/60    | 99/99    | 通过                     |

新增两个 Dashboard 专属导航场景，97 条增长为 99 条；三端共用测试文件并分别启动各自生产产物。共享 E2E lint 零警告与 typecheck 通过，应用需求门禁与夹具通过。

| ADMIN-US-102 AC   | 直接证据                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 页面扩展和深链 | [三端扩展指南](custom-pages-navigation.md)；dashboard.spec.ts 验证桌面菜单、375px 移动抽屉自动关闭、刷新 `/dashboard` 后继续进入实体和备份页                              |
| #2 外壳状态一致   | dashboard.spec.ts 验证 `Dashboard · 工作台` 标题、概览面包屑、活动页签、Mod+K 菜单结果、资产快捷入口与返回原分类记录                                                      |
| #3 应用偏好扩展   | admin-shell.spec.ts 的搜索每页条数场景验证 20→5 即时生效、加载更多、唯一应用前缀键、刷新仍为 5、重置回 20、再次刷新仍为默认行为；三端 app-config.spec.ts 验证定制前缀隔离 |

[国际化记录](client-i18n-verification.md) 单独对应 ADMIN-US-003 六项 AC，包括本轮新增的模型实际时间格式、原始数据不变、草稿与关系保留及恢复后编辑。两个故事均为 In Review，等待评审、合并和 PR 引用；ADMIN-US-101 尚缺真实新业务输入。

本轮命令沿用上文 lint / typecheck / test / build / e2e，完整浏览器增加 `--output-style=static --reporter=line` 以便记录。未改公共包产品代码，因此未重复此前 Dashboard 模块定向覆盖率；本轮没有新增覆盖率百分比声明。

本地日志：`/tmp/nexus-final-checks.log`、`/tmp/nexus-final-lint.log`（三端应用通过）、`/tmp/nexus-verified-e2e-lint.log`（共享 E2E 修正原有条件判断后零警告）、`/tmp/nexus-verified-e2e-typecheck.log`、`/tmp/nexus-verified-{angular,react,vue}-e2e.log`。首次增强测试的红测与定位修正见国际化记录。CommonJS / 大 chunk / eval 构建告警仍按 T05 跟踪。

## 2026-11-16 性能与体积复验：T04 / T05

本节对应 `b52320402` 之后的实现，上文全量读取与构建体积的描述保留为历史基线。三端现用相同的 SQLite 操作单元聚合、应用覆盖索引与后端动态导入；不改数据库名称、VFS 或连接前恢复入口。

| 框架    | 应用单测 | 完整 E2E（零重试） | lint / typecheck / production build |
| ------- | -------: | -----------------: | ----------------------------------- |
| Angular |    69/69 |              99/99 | 通过                                |
| React   |    72/72 |              99/99 | 通过                                |
| Vue     |    69/69 |              99/99 | 通过                                |

SQL 测试实际执行 SQLite，并与原 JS 归一化结果比较，覆盖 513 条事务、重复但不连续的 transactionId、空 transactionId、同毫秒排序、分支隔离及 2,000 条混合日志；活动源测试覆盖条数不变的撤销、跨标签通知、同轮合并与切分支的迟到结果。索引测试验证重复安装、覆盖索引查询计划及引导事务，防止插件安装等待自己的连接。三端查询、活动源、索引及相关测试共七组文件逐字一致。

公共包 `rxdb-plugin-history` 完整测试 458/458。覆盖率为 statements 97.63%、branches 91.72%、functions 96.55%、lines 98.37%，均高于该包 80% 门槛；纯本地仓库跳过多余计数，Full 同步及实例覆盖启用同步保留原触发规则。

[性能记录](dashboard-performance-verification.md) 包含千条、万条、十万条日志的九组逻辑与生产 UI 测量。十万条时向 JS 返回五个完整操作单元，活动流约 0.47–0.49 秒，UI 约 0.83–0.86 秒，UI 堆增量约 1.98–2.44 MiB；无索引旧归档首次补索引约 1.64–1.66 秒连接成本单独列出。数据库内部仍扫描匹配索引，不能把返回五行等同只扫描五行。

[构建记录](bundle-size-verification.md) 包含相同分析构建的静态图、动态入口与浏览器实际请求。首屏 gzip 减少 Angular 26.1 KiB、React 72.1 KiB、Vue 72.6 KiB；Web 专用懒加载审计通过。首页无 WASM，连接 Dashboard 后请求一次；既有 CommonJS、大 chunk 与 eval 告警已归因，未屏蔽、未提高阈值。

应用需求门禁与根需求一致性检查通过；根检查仍有既有 `requirements/domain-research/board-v2-github-projects-style.md` 非阻断叙事告警。ADMIN-US-003 / 102 保持 In Review；ADMIN-US-101 的 T03 仍缺真实业务实体、字段、关联和非 assets 命名空间，未标记完成。

全量 affected 门禁使用以下命令，关闭远程缓存，保留本地缓存，并把 Vitest 文件并发限制为 1；CI 模式下模板浏览器配置使用两个 worker。检查实际进程与 Nx 24 参数解析后确认：脚本已有 `--parallel=4`，追加的 `--parallel=1` 没有覆盖它，实际 Nx 任务并发仍为 4，不能把本轮称作完全串行：

```bash
CI=true CODECOV_TOKEN= NX_NO_CLOUD=true VITEST_MAX_WORKERS=1 pnpm test-all --base=b52320402 --parallel=1
```

首次未限制 Vitest 文件并发时，`rxdb-adapter-electron:test` 的三个 PGlite 恢复场景在包内文件并行执行时达到 60 秒超时，其余 1,395 条通过、8 条跳过。限制 Vitest 文件并发后，Electron 40 个测试文件全部通过，共 1,398 条通过、8 条原有跳过；未提高超时、跳过失败用例或修改 Electron 业务逻辑。原始日志为 `/tmp/nexus-full-gate.log`，串行复验日志为 `/tmp/nexus-full-gate-serial.log`。该次还检出并修正测量脚本的一处 `prefer-const`，最终门禁日志为 `/tmp/nexus-full-gate-final.log`。

完整门禁中的 React 恢复后编辑场景首轮没有等到刷新后的新值，重试通过。原测试保存后只等英文页签消失便刷新，缺少保存完成的正向证据；现增加保存成功提示和列表新值断言，再核对刷新后保留。未放宽持久化断言，也未增加固定等待。共享场景修正后，三端完整浏览器补验显式禁用重试，命令及日志如下：

```bash
CI=true CODECOV_TOKEN= NX_NO_CLOUD=true VITEST_MAX_WORKERS=1 pnpm nx run-many -p rxdb-admin-template-react-e2e rxdb-admin-template-angular-e2e rxdb-admin-template-vue-e2e -t e2e --parallel=1 --workers=2 --retries=0 --reporter=line --output-style=static --skipRemoteCache
```

补验结果：Angular / React / Vue 均 99/99，无失败、无重试。共享 E2E 的三端 lint 使用 `--max-warnings=0` 通过，typecheck 通过。补验日志：`/tmp/nexus-e2e-no-retry.log`、`/tmp/nexus-e2e-final-lint.log`、`/tmp/nexus-e2e-final-typecheck.log`。这条命令只有一个 Nx 并发参数，三端按顺序执行。

全量最终结果：90 个受影响项目及其 48 个依赖任务全部成功，共 394 个任务，耗时 41 分 21 秒；本地缓存命中 241/394（61%）。目标包含 lint、typecheck、test、test-memory、test-browser、build、audit-lazy-backend 与 e2e，未删减目标或排除项目。Electron 独立内存用例 2/2；开发应用 Angular / React / Vue 的完整 E2E 分别为 230/230、225/225、208/208；Electron 浏览器 58 条通过、4 条既有跳过；文档站含 API 文档及三端演示的整站构建成功。Nx 仍因前述首次超时把 `rxdb-adapter-electron:test` 标记为历史 flaky，该任务本次已通过，未使用 Nx Cloud 自动重试。

全量门禁执行期间产品代码保持稳定；最终共享场景的保存同步断言已用上文三端完整 E2E 零重试复验，测量脚本函数整理另以 seed、三端 logic、React UI 冒烟及 lint 零警告复验。定量生产结论仍使用已入库的九组原始测量，不混入冒烟数据。任务完成范围为 T01 / T02 / T04 / T05，T03 保留未完成。
