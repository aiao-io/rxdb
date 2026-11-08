# 分支功能收尾与复验

日期：2026-10-29（Asia/Shanghai）。收尾改动先在 Codex 工作区 `codex/aiao-media-completion`（基线 `b68e40a9`）完成，再原样应用到 `codex/aiao-media-incubation`，进入提交 `bf7212b8`；复验在 PR #154 的工作区重跑。当前合并状态见[状态概览](../status-overview.md#合并状态)。

## 范围核对

12 条故事共 79 条 AC，73 条已有验收证据；[本地交付清单](local-delivery-tasks.md) 17/17、[作品检索清单](library-search-tasks.md) 10/10 均已有实现。此次补齐实现与验收工具的缺口并复验当前源码，不把旧测试数量作为本次结果。

## 本次完成的任务

- [x] 保护套用模板前的已有草稿，包括刷新恢复的正文和未填写的模板字段；取消或模板无效时保留原输入。空参数模板可以进入编辑，未填写时仍阻止生成。
- [x] 修复草稿初始读取失败后的显式恢复，恢复保存和后续外部更新观察；订阅失败不误报保存成功，重新载入期间的新输入保留并提示冲突。
- [x] 真实供应商验收在发送任何生成请求前检查完整计划中的未知尝试；更换发布或 manifest 不解除相同组合的未知锁，同产物成功证据仍可复用。目录级跨进程原子锁覆盖扫描和全部尝试，崩溃残留锁保持阻断，正常退出仅释放本次所有者的锁。
- [x] 离线更新/回退 E2E 在关闭旧页后等待目标版本 Worker 真正激活，再新建导航。
- [x] 新增真实系统输入法验收入口 `aiao-media-e2e:desktop-ime-acceptance` 与纯逻辑检查 `desktop-ime-acceptance-check`（已并入 `aiao-media-e2e:e2e`）。入口用 System Events 向 macOS 简体拼音发送物理按键，覆盖正文/字段输入、组字中途自动保存、粘贴、撤销重做、焦点、布局与刷新恢复；每批按键前核对受测浏览器在前台。按 [D-09](../decisions.md) 尚未实跑。
- [x] 为备份导入辅助函数补注释：`setInputFiles` 不做可操作性检查，改为点击原生输入框，避免导入时控件已被重新禁用。

应用与验收脚本的修复均先新增失败测试再实现：应用新增 8 项回归，验收脚本新增 6 项守卫（含两个真实 Node 子进程争锁、崩溃残留及所有者替换）。输入法入口的纯逻辑测试与入口同批补齐，之后的默认端口调整先红后绿。

## 验证结果

本工作区复跑（Node 26.12.0，`NX_LOAD_DOT_ENV_FILES=false`，远程缓存关闭）：

| 验证入口                                                                                | 结果                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `lint` / `typecheck`（`aiao-media`、`aiao-media-e2e`）                                  | 通过，ESLint `--max-warnings=0`                                                       |
| `aiao-media:test`                                                                       | 36 个文件、705 项通过；需求门禁 0 个错误                                              |
| `aiao-media:coverage --args='--maxWorkers=1'`                                           | 39 个文件、734 项通过；语句 87.30%、分支 80.83%、函数 85.34%、行 95.11%，统计范围不变 |
| `aiao-media-e2e:local-first-e2e`                                                        | 34/34，真实生产静态应用及 SQLite/IndexedDB/OPFS；供应商使用 fixture                   |
| `aiao-media-e2e:offline-update-e2e`                                                     | 通过                                                                                  |
| `aiao-media-e2e:provider-acceptance-fixture`                                            | Images API PNG/MiniMax JPEG 两通道三画幅共 12 组合通过                                |
| `aiao-media-e2e:provider-result-network-fixture`                                        | 9 个真实 Chromium 网络场景通过，不携带凭据、不跟随重定向、不重发                      |
| `aiao-media-e2e:provider-acceptance-check`                                              | 26/26                                                                                 |
| `aiao-media-e2e:desktop-ime-acceptance-check`                                           | 5/5                                                                                   |
| `aiao-media:relay-test` / `auth-config-test` / `script-test` / `production-bundle-test` | 12/12、2/2、29/29、3/3                                                                |

以下只在 Codex 工作区执行（基线 `b68e40a9` 加同一批改动），本工作区未重跑：

| 验证入口                                                     | 结果                                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `nx affected`，基线 `codex/aiao-media-incubation`            | 2 个受影响项目、39 项任务通过；覆盖 lint/typecheck、单元测试、真实浏览器数据测试、构建与 E2E；未改 `packages/*` |
| `aiao-media-e2e:offline-update-e2e --args='--repeat-each=3'` | 连续 3/3 通过                                                                                                   |
| `aiao-media-e2e:public-origin-smoke-fixture`                 | `passed=true`、`fixture=true`，四路由/完整离线资源通过，生成 0 次                                               |
| `aiao-media-e2e:actual-release-update-check`                 | 12/12 脚本守卫通过                                                                                              |
| `aiao-media:deploy-check`                                    | 生产构建、发布审查和 Wrangler dry-run 通过；53 项离线资源、61 个发布文件；公开账号配置为 `null`；未部署         |
| `aiao-media:product-test`                                    | 真实本地工作区幂等/A-B 隔离、DTO/修订/tombstone、模板/任务/用量与管理员授权/撤销/封禁四组检查通过               |
| `aiao-media-e2e:supabase-e2e`                                | 3/3，真实邮箱确认、登录恢复、错误密码、断网和跨标签退出                                                         |
| `aiao-media-e2e:product-e2e`                                 | 8/8，双独立副本、绑定确认、冲突/删除/重扫、元数据同步、后台和账号切换后的迟到响应隔离                           |

Codex 工作区的真实服务使用独立 Compose project `aiao-media-completion-3e0c` 与 55421–55424 端口，测试账号按套件清理，结束后停止该栈并保留数据库卷。

离线套件曾在回退后新导航超时：trace 显示生成、更新和离线回读已完成，但旧页面关闭后立即创建新导航，目标 Worker 尚未激活。现按 `MANIFEST.version` 找到待激活 Worker，关闭旧页后断言 `active.state === 'activated'` 且 `waiting === null` 再导航；90 秒总超时与生产 Worker 均不变。

## 未改变的边界

此次修复与复验没有新增真实供应商生成、生产发布或生产 Supabase 证据，六条未验 AC 的状态不变，继续条件见[状态概览](../status-overview.md#未完成验收与关闭条件)。同日的供应商尝试记录迁移与直连诊断见[供应商补验](provider-acceptance-follow-up.md)。
