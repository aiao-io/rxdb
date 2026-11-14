# 2026-11-14 验收证据

执行环境：Apple M1 Max、macOS/Darwin 27.2.0 arm64、Node 26.12.0、pnpm 12.16.1。各轮源码按报告source记录（涵盖 `0dcdabca`、`d95812da`、`0ccab7cf`、`6ed149a5` 及当时工作区改动）；本轮未执行生产发布。报告里的 ISO 时间为 UTC，本目录日期按 Asia/Shanghai。每份 JSON 保留实际浏览器版本、输入、逐项结果和产物摘要。

## 固定提交的回溯测量

这些测量在 2026-11-14 完成，发生在相关实现之后。它们能复验数值，不能证明“实现前已记录基线”；US-008 #10 与 US-206 #7 的历史流程证据仍需评审。没有把失败样本删除，也没有改变 1.1 倍门槛。

| 证据                                       | 比较对象与方法                                                                                                                               | 结果                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [首次拆分](smoke-benchmark.json)           | `85b86fb3` 单体对 `53a30d96` 首次拆分；各三轮，交替串行、新进程、空上下文、路由禁用缓存；同一份 `85b86fb3` web 与 Orbit 产物，摘要相等。     | 所有检查通过；中位数 110.931s / 122.626s，比例 1.10543，超过门槛。      |
| [独占调度](smoke-benchmark-exclusive.json) | 同一单体对固定 `6859fe56` 的原七组，排除后来新增需求组；web/Orbit 仍逐字节相同，各三轮，方法相同。选组和键集合逐项校验，不改固定提交的脚本。 | 中位数 116.024s / 89.344s，比例 0.77004，数值通过。两个报告不混用样本。 |
| [initial 体积](initial-bytes.json)         | 阶段 A 前 `90d14a18` 正式构建与当前构建；同一生产命令，统计入口脚本的静态依赖闭包与 CSS；原始字节及逐文件 gzip level 9。                     | 只证明打包边界与体积，不据此声称启动更快。具体文件与摘要在报告中。      |

性能命令（在仓库根）：

```bash
pnpm nx run aiao-desktop-e2e:benchmark-smoke --args='--baseline-root=/tmp/aiao-requirements-85b86fb3 --split-root=/tmp/aiao-requirements-53a30d96 --output=<绝对路径>'
pnpm nx run aiao-desktop-e2e:benchmark-smoke --args='--baseline-root=/tmp/aiao-requirements-85b86fb3 --split-root=/tmp/aiao-requirements-6859fe56 --split-groups=shell --split-groups=disk-terminal --split-groups=integrated-app --split-groups=transparent-window --split-groups=game --split-groups=apps --split-groups=persistence --output=<绝对路径>'
pnpm nx run aiao-desktop-e2e:compare-initial --args='--baseline-dist=/tmp/aiao-requirements-90d14a18/dist/aiao-desktop/apps/web/browser --baseline-sha=90d14a18 --current-sha=d95812da+workspace --output=<绝对路径>'
```

固定树由 `git worktree add --detach <目录> <SHA>` 建立。`85b86fb3` 与 `90d14a18` 分别用 `pnpm nx run aiao-desktop-web:build --configuration=production` 正式构建；性能比较的 split 树逐字节复制 `85b86fb3` 的 web 与 `packages/orbit/dist`，不混入不同桌面实现的差异。测量器拒绝 e2e 源码有 diff 的固定树、产物摘要不一致、检查键缺失/增加和未通过项。`fixtures` 耗时单列，不计入性能比较；当前所有新增行为另跑完整冒烟。

## 回归测试与负向门禁

[focus-red.txt](focus-red.txt) 是立即交接焦点回归测试在修复前的失败结果，[focus-green.txt](focus-green.txt) 是修复后的 63 个窗口管理测试通过结果。动画结束后不再抢走期间新打开窗口的焦点。

[coverage-negative.txt](coverage-negative.txt) 记录：

```bash
pnpm nx run aiao-desktop-web:test --args='--exclude=src/app/services/window-manager.spec.ts'
```

总 statements 仍有 97.6%，但 `window-manager.ts` 为 75.15%，低于逐文件 80% 门槛，命令按预期失败，差 4.85 个百分点。没有删除测试或降低门槛；正常全量测试会重新生成覆盖率报告。

## 线上只读核对

[live-entrypoints.json](live-entrypoints.json) 来自 `pnpm nx run aiao-desktop:inspect-live --args='--output=<绝对路径>'`：两个入口均为 200、无重定向、HTML 摘要一致且隔离头完整。

[pages-metadata.json](pages-metadata.json) 保留固定 wrangler 4.158.0 的只读 project/deployment list 命令与本项目结果：自定义域名已绑定，最新生产部署是 `d650c06f-2ad5-4c8c-9345-a5b8a30be1e9`，Cloudflare 记录 Source 为 `bcfaa45`。该字段不能单独证明当时没有工作区修改；本轮没有执行发布或回滚，也没有替用户登录 GitHub。

## 本机输入的边界

GPU 与浏览器协议按键不等于真实物理键盘。VoiceOver 验收按[操作清单](../../../apps/e2e/VOICEOVER.md)逐步保留实际播报；无障碍树或空白模板不能当成已执行。历史 GPU 探索曾因 Chrome 未在前台而报 `WrongDocumentError`；脚本已显式 bringToFront，并在 macOS 激活 Chrome。最终三轮和失败探索的结论分开记录。

## 2026-11-14 后续验收与诊断

- [动画中还原：红](animation-restore-red.json)与[绿](animation-restore-green.json)：在最小化动画中途暂停，再从Dock用键盘还原。修复前失败，修复后三组并发全部通过；原有焦点交接单测红绿记录一并保留。
- [文件面板定向诊断](host-filesystem-debug.json)：单组通过；三组并发结果在上述绿报告。初始焦点与退出覆盖确认后的焦点均等待到位，不在超时后继续误操作。
- [覆盖率正例](coverage-positive.txt)：复用CI test lane的coverage参数，经Nx运行，91个测试文件、1338个用例通过；[负例](coverage-negative.txt)按预期被逐文件门槛拦截。本轮未触发远端CI。
- [发布演练](deploy-dry-run.txt)：97个文件、13.2MB与隔离头检查通过，只打印将执行的命令，没有上传。
- [真实旧生产升级（含用户文件正文）](upgrade-production-file-body.json)：固定部署d650c06f建库并通过终端复制创建用户文件，读回正文后关闭旧页，在同一HTTPS Origin供应当前本地产物，再从桌面打开同一文件逐字比较。文件正文、目录、外观、备忘录及schema记录5项均通过。原[四项报告](upgrade-production.json)不包含文件体断言，保留其原始口径；没有发布或改变线上静态资源。
- [真实线上Aiao Code](aiao-code-online.json)与[本地当前构建配合线上Aiao Code复测](aiao-code-current-final.json)：真实入口、终端与重开检查均通过，桌面与应用无页面错误。
- [用户真实Chrome中的同站对照](domain-same-site.md)：唯一验收项目与已有GitHub登录一致，测试后恢复原项目；没有执行登录或OAuth。
- [双域名文件验收最终复测](domain-storage-final.json)：真实终端复制创建用户文件并读回正文，新地址无用户文件、文件夹与备忘录；返回旧地址后正文、文件夹、备忘录和设置完整。两个HTTPS入口无重定向，9项通过，无页面错误。[抽取共享helper前的通过报告](domain-storage.json)也保留。旧线上构建的[TextEdit覆盖失败](domain-storage-old-save-failure.json)和[终端写入失败](domain-storage-terminal-write-failure.json)均报告Storage file meta not found；复制路径通过不代表该旧部署缺陷已修。

早期冒烟与Aiao Code报告从子目录使用相对pathspec，changes字段可能为空；该字段不证明当时工作区干净。已修为顶层pathspec，之后报告按真实git状态记录；旧报告不回写，执行SHA、产物摘要和本目录workspace说明一起复核。

Firefox首次完整复测没有清单外失败；第二轮发现shell-interaction的greenButtonRestores失败。原[第二轮](firefox-2.json)保留；检查从固定600ms等待改为观察动画完成状态，几何容差仍为3px。[定向第一轮](firefox-zoom-1.json)、[第二轮](firefox-zoom-2.json)均通过。不能写成原两轮没有出现不稳定项。

最终GPU复测记录：[第一轮](saltline-gpu-final-1.json)、[第二轮](saltline-gpu-final-2.json)、[第三轮](saltline-gpu-final-3.json)，Chrome 157.0.8103.52、M1 Max ANGLE Metal，12项全部通过。到达标题画面3740/3247/3241ms，帧率89.3/89.9/86.7FPS。该组测于窗口还原修复之后、启动台搜索修复之前；各报告保留其实际产物摘要。
