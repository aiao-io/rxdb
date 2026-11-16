# PWA 验收（2026-11-16）

源码基线：`1111da18b600feb05f8c7328a0ee1b15ccc579d1` 加各报告 source.changes 记录的工作区改动。正式构建的 HTML SHA-256、工作区变更清单与每项检查结果保存在 JSON 报告中。本次没有执行提交、合并或发布。PWA 专项报告记录本次 PWA 改动；后续联跑时工作区还含并行进行的 Safari 修改，其清单保留在报告中，联跑结果不代替那些改动的完整验收。

环境：Apple M1 Max、darwin 27.2.0 / arm64、Node v26.12.0、Chromium 158.0.8127.18，无头模式。时间按 Asia/Shanghai（UTC+8）解释；JSON 的 measuredAt 使用 UTC。覆盖范围是正式构建的自动验收，不包含操作系统安装对话框、原生独立窗口启动或物理键盘操作。

本机 pnpm 自动切换到 12.16.1 时出现 ENOEXEC；以下命令均以 `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false NX_NO_CLOUD=true` 为前缀，使用已有 pnpm 执行，未修改包管理器配置。

| 检查 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| TDD 红灯 | `pnpm nx run aiao-desktop-e2e:e2e --group=pwa --parallel=1 --skipRemoteCache`；[原始失败](pwa-red.txt) | 实现前 manifest 返回 404，验收失败。 |
| PWA 专项 | 同上，增加 `--report=/tmp/aiao-desktop-pwa-report.json`；[报告](pwa-smoke.json) | 14 项全部通过，18.83 秒，页面错误为空。 |
| 聚合门禁首次执行 | `pnpm nx run aiao-desktop:verify --parallel=1 --skipRemoteCache --output-style=static`；[完整输出](verify-first.txt) | 命令退出码 1：27 个冒烟组中 26 组通过（包含 PWA），terminal-runtimes 启动时 JSON 解析错误并超时；requirements-check/test 提示路线图漏记新故事。其余检查通过，包括 94 个测试文件、1,353 个 web 单测、逐文件覆盖率门槛、lint、typecheck、build、脚本测试、夹具自检和密钥扫描。 |
| 终端隔离复跑 | `pnpm nx run aiao-desktop-e2e:e2e --group=terminal-runtimes --parallel=1 --skipRemoteCache`；[输出](terminal-runtimes-retry.txt) | 30 项全部通过。未改动终端业务实现，首次失败保留，不据一次复跑断言不存在偶发故障。 |
| PWA 与终端联跑 | `pnpm nx run aiao-desktop-e2e:e2e --group=pwa,terminal-runtimes --report=/tmp/aiao-desktop-pwa-final-report.json --parallel=1 --skipRemoteCache`；[报告](pwa-terminal.json) | 44 项全部通过，两组页面错误均为空。runner 先运行 PWA，再运行独占的终端组，总耗时约 67.61 秒。 |
| 冒烟选择与 lint | `pnpm nx run-many -t test,lint -p aiao-desktop-e2e --parallel=1 --skipRemoteCache`；[输出](e2e-unit-lint.txt) | 56 个单测及 lint 通过。Chromium 专用组在其他引擎默认跳过；显式选择时给出不支持的错误，不伪报通过。 |
| 需求门禁复验 | `pnpm nx run-many -t requirements-check,requirements-test -p aiao-desktop --parallel=1 --skipRemoteCache`；[输出](requirements-final.txt) | 路线图补齐，故事状态、AC、依赖与派生视图同步后复验。 |

首次 verify 失败后，按仓库规则定向复跑失败目标，并增加 PWA / 终端联跑；没有把首次 verify 的退出码记成成功，也没有修改终端实现来规避偶发启动失败。

缓存体积见 [pwa-cache.json](pwa-cache.json)：按本次正式构建的 ngsw.json 中每个 assetGroup 的文件列表，求磁盘文件大小之和；这是未压缩原始字节，不是网络传输量。桌面预缓存 4,722,002 字节；按需资源 108,541,012 字节。该值只描述本次产物，不设不变数量或性能承诺。
