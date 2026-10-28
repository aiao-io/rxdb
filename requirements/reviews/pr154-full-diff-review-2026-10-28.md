# PR #154 全量深度评审（2026-10-28）

- PR：<https://github.com/aiao-io/rxdb/pull/154>
- 分支：`codex/aiao-media-incubation`
- 审查基线：`main = 7bb16a9014095d4003bd059244722013b36867c1`
- 审查版本：`8e0000f900fc6dc5090234987f085bfc82324187`
- merge-base：`7bb16a9014095d4003bd059244722013b36867c1`
- 差异：**310 个文件，42,725 行新增、132 行删除**；完整清单见文末。
- 范围：`git diff main HEAD` 的全部文件。此时 `main` 已合回分支，两点和三点差异相同；报告本身不计入上述快照。

## 结论

**🟡 凑合；发现两个可复现的 P2，建议修复后合并。没有发现有证据支撑的 P0/P1。**

图片生成的未知结果保护、Key 白名单、文件保存 journal、显式账号绑定和 RLS 的主要路径有实现与测试。主要缺口集中在跨功能边界：应用能导出自己不能恢复的备份；离线资源清单遗漏了首页实际使用的一整类图片。普通单测通过不能关闭这两项。

本次只提交评审报告，未修复产品代码。用于复现的临时测试已删除，已有测试源码恢复原始字节。

## F154-01 · [P2] 导出端允许超过 500 张图片，恢复端拒绝同版本备份

**位置与证据。** [`createLocalBackup()`](../../apps/aiao-media/src/app/local-backup.ts)（54–100 行）遍历 `store.list()`，只约束备份字节数；[`readLocalBackup()`](../../apps/aiao-media/src/app/local-backup.ts)（102–116 行）另有数量限制：

```ts
for (const work of await store.list()) {
  // 每张图片均进入 images，导出端没有图片数量限制。
}
// readLocalBackup:
data.images.length > 500;
```

**触发条件。** 本机有 501 张或更多小图，序列化后仍小于 64 MiB；用户点击“导出本机备份”，随后把生成的文件导入当前版本或另一设备。作品库本身没有 500 张限制，现有压力测试也明确支持超过 1,000 条 metadata。

**用户影响。** 导出显示成功，导入却统一报“不支持的备份格式或版本”。用户若在相信备份可恢复后清理浏览器数据，将无法通过产品恢复这些原图。现有文案仅承诺 64 MiB 限制，无法预先识别这种不可恢复文件。

**验证。** 在 `aiao-media-data` 下用 501 个不同合法 UUID、相同小 PNG、有效模型与供应商字段调用真实 `createLocalBackup()`；备份小于 64 MiB。紧接着调用真实 `readLocalBackup(new File([backup], 'backup.json'))`，预期可读的断言失败：

```text
AssertionError: promise rejected "Error: 不支持的备份格式或版本。" instead of resolving
Caused by: readLocalBackup src/app/local-backup.ts:116
```

复现入口为临时 `src/local-data/review-backup.spec.ts`，执行：

```sh
pnpm nx run aiao-media:test \
  --args='src/local-data/review-backup.spec.ts --maxWorkers=1' \
  --skipRemoteCache --output-style=static
```

**建议。** 为导入、导出定义同一份版本契约。如果数量仍限制为 500，导出前就拒绝并说明原因，且提供可恢复的分批方式；如果 64 MiB 才是实际边界，就移除导入独有的数量上限，并验证解析/内存边界。至少补充 500/501 张小图的双向 round-trip 测试，保证每个“导出成功”的文件都能被同版本读取。现有备份用例覆盖字节超限、摘要损坏、重复 ID、中断续导，未覆盖此边界。

## F154-02 · [P2] 离线清单遗漏 `.jpg`，首次离线打开首页丢失六张示例图

**位置与证据。** [`build-offline-assets.mjs` 的 `extensions` / `walk()`](../../apps/aiao-media/scripts/build-offline-assets.mjs)（10–15 行）：

```js
const extensions = new Set(['.js', '.css', '.wasm', '.ico', '.png', '.svg', '.woff', '.woff2']);
```

[`imageMvpCatalog` 的 `base`](../../apps/aiao-media/src/app/image-mvp-catalog.ts)（105 行）恰好将前六张卡片指向：

```ts
image: index < 6 ? `/image-examples/${id}.jpg` : `/prompt-art/${id}.svg`;
```

[`offline-worker.js` 的 fetch 处理器](../../apps/aiao-media/scripts/offline-worker.js)只对 `paths.has(url.pathname)` 的资源命中版本缓存。未进入 manifest 的 JPEG 离线时直接失败；[`LocalImageMvp.templateImageFailed()`](../../apps/aiao-media/src/app/local-image-mvp.ts)将对应图片替换为错误占位。

**触发条件。** 新浏览器先在线访问 `/create` 完成 Service Worker 安装，未访问首页、没有 JPEG 的 HTTP 缓存；随后断网，冷开 `/`。这也是“首次安装之后离线打开四路由”的正常使用方式。

**用户影响。** 首页六张社区参考图全部显示“示例图暂时无法加载，可继续查看提示词”。本机生成作品及 SVG 示例不受此缺陷影响。用户已经得到“离线资源已准备好”，但图片形式的灵感浏览只完成一半。

**验证。** 本次通过 Nx 重新执行生产构建和 `offline-assets`，产物仍有 46 项，以下六项全部缺席：

```text
/image-examples/ceramic.jpg     /image-examples/coffee.jpg
/image-examples/illustration.jpg /image-examples/map.jpg
/image-examples/portrait.jpg    /image-examples/vr.jpg
```

随后在真实 Chromium + 本地生产 Worker + Service Worker 中执行上述路径。在现有 `local-first.spec.ts` 临时追加单条测试，仅此用例执行：

```sh
pnpm nx run aiao-media-e2e:local-first-e2e \
  --args='--grep=review-offline-jpeg' \
  --skipRemoteCache --output-style=static
```

首张卡片的 `img` 可见性断言失败；Playwright 页面快照出现六处上述错误占位文案。测试过程没有请求真实模型，也没有调用公网部署。已有离线 E2E 只确认路由、导航和本机草稿，没有断言灵感图片可解码，因而漏过此问题。

**建议。** 将应用引用的 `.jpg` / `.jpeg` 一并纳入离线资源，并保留现有单资源大小与摘要校验。补一条“从非首页安装，断网后首次打开首页”的回归；断言本地示例图片实际解码成功，不能只检查页面标题或对 manifest 自己做完整性校验。

## 已验证但不作为代码缺陷的边界

- **恢复后的日期语义。** 真实 Chromium / RxDB / IndexedDB / OPFS 复现：备份中 `job.createdAt = 2020-01-02T03:04:05.000Z`，恢复后 `LocalImageWork.createdAt` 是恢复当日，因为 [`LocalMediaStore.saveResult()`](../../apps/aiao-media/src/local-data/browser-media.ts)新建实体时未传入旧时间。当前 UI 明确写“按此设备的本机保存时间筛选”，需求也未承诺保留首次保存时间，因此这里仅记录语义；不能把“日期改变”直接判为数据丢失 bug。若未来要求保留原日期，需要单独定义业务时间与本机写入时间及其迁移规则。
- **等待更新时的新导航。** Service Worker 的导航采用 network-first，稳定路径资源采用旧版本 cache-first；本次静态阅读提出了“新版 HTML 与旧版稳定路径资源组合”的候选。但未完成跨实际不同运行时版本的失败复现，故不列为已确认缺陷。现有更新验证覆盖 waiting、关闭旧页面后激活和回退，未验证 waiting 期间刷新/新开页面。
- **真实供应商和生产账号。** 本次没有重发模型请求、切换正式部署或启用生产 Supabase。需求中的“本地账号/管理验收”与“生产服务已上线”仍是不同结论，不能从当前单测或 fixture 推导后者。

## `main` 同步与合并治理

审查前分支为 `95b81811bd2ca891b43a175167f1909069228a95`，相对最新 `main` 落后一个提交。按本次任务追加指令，已通过合并提交 `8e0000f900fc6dc5090234987f085bfc82324187` 同步 `main`。

唯一冲突是 `pnpm-lock.yaml`：Media 的两个 importer 与 `main` 新增 admin 的四个 importer 插入同一位置。合并后逐项将六个 importer 与各自父版本原文比较，均精确保留；冻结锁文件检查通过，没有借合并升级依赖。`main` 的 admin 应用、引擎及需求改动保留。

当前 `git diff main HEAD -- packages` 为零：本 PR 没有待提取的引擎包改动。应用使用自己目录内的 contracts/local-data，不新增共享领域包；[`apps/aiao-media/AGENTS.md`](../../apps/aiao-media/AGENTS.md)及本分支根规则明确该独立 Angular 产品豁免 React/Vue 产品实现，不能据此误报三框架缺失。产品迁入范围及状态依据为应用内独立需求；本报告不替代最终产品范围/合并评审。

## 验证记录与限制

所有任务通过 Nx，运行环境为 Node `26.12.0`、pnpm `12.15.0`；关闭 Nx Cloud、daemon 和 `.env` 自动加载。生产离线构建另外显式使用空的公开 Supabase 配置。没有执行 `pnpm test-all`。

| 验证                                                                                                                   | 本次结果                                             | 可以说明的范围                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts`                                                      | 通过                                                 | 合并后的锁文件可接受；六 importer 另做原文对照  |
| `pnpm nx run-many -t lint typecheck -p aiao-media aiao-media-e2e --parallel=1 --output-style=static --skipRemoteCache` | 4 个目标及 18 个依赖任务通过                         | 应用和 e2e 的静态质量/类型；不能代替用户流程    |
| `pnpm nx run aiao-media:test --parallel=1 --output-style=static --skipRemoteCache`                                     | **36 文件、688 测试通过**                            | UI/data 既有单测                                |
| 上述 `test` 依赖的 `script-test`                                                                                       | **29/29 通过**                                       | relay、产品 API、迁移契约、构建配置及导入资源等 |
| 上述 `test` 依赖的 `requirements-check`                                                                                | 自测 **17/17**；560 链接审计通过                     | 应用需求结构/引用；不证明真实供应商或生产验收   |
| 临时备份 501 图 round-trip                                                                                             | 失败，已定位 F154-01                                 | 特意补的缺陷探针，不是既有基线套件失败          |
| 临时真实浏览器恢复日期探针                                                                                             | 确认恢复日期变为本机写入日                           | 属上述时间语义观察，不计入缺陷数量              |
| 临时离线 JPEG E2E                                                                                                      | 失败，已定位 F154-02；依赖生产构建及离线资源任务通过 | 真实本地页面/缓存行为；不是全量 E2E             |
| `git diff --check`（合并时包括暂存区）                                                                                 | 通过                                                 | 无冲突标记/空白错误                             |

未重新跑全部浏览器套件、Docker Supabase 账号/复制/后台的完整端到端套件、历史 0.0.26 升级、正式 origin 更新/回退、真实系统 IME 或移动真机。本次没有重新生成覆盖率，因此不声称本次覆盖率已达 80%。报告中既有验收材料按历史证据阅读，不冒充本次执行结果。

## 全量文件覆盖台账

下表覆盖冻结快照的全部 310 个差异文件；`A/M` 为 Git 状态，新增/删除为行数，二进制显示 `binary`。所有应用运行时、服务端、SQL、构建及验证工具均纳入静态审查；测试按断言和对应功能边界核对。文档核对范围/状态/链接及证据边界，生成内容核对来源，图片按资源路径、清单和导入校验核对。本报告不进行设计截图逐像素验收。

| 分类                       |  文件数 |
| -------------------------- | ------: |
| 工作区/CI/依赖与配置       |      32 |
| 需求与说明文档             |      64 |
| 测试与fixture              |      62 |
| 服务端/迁移/部署与验证脚本 |      43 |
| 应用运行时TS/JS            |      53 |
| 二进制资源                 |      34 |
| 界面与静态素材             |      19 |
| 设计原型代码               |       3 |
| **合计**                   | **310** |

### 工作区/CI/依赖与配置

| 文件                                                                                                                             | 状态 | 新增 / 删除 | 审查方式或结论            |
| -------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------: | ------------------------- |
| [.github/workflows/aiao-media.yml](../../.github/workflows/aiao-media.yml)                                                       | A    |      90 / 0 | 依赖/目标/隔离/工作流核对 |
| [.github/workflows/ci-template.yml](../../.github/workflows/ci-template.yml)                                                     | M    |       1 / 0 | 依赖/目标/隔离/工作流核对 |
| [.gitignore](../../.gitignore)                                                                                                   | M    |       4 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/eslint.config.mjs](../../apps/aiao-media-e2e/eslint.config.mjs)                                             | A    |       2 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/library.config.ts](../../apps/aiao-media-e2e/library.config.ts)                                             | A    |      16 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/local-first.config.ts](../../apps/aiao-media-e2e/local-first.config.ts)                                     | A    |      25 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/local-product.config.ts](../../apps/aiao-media-e2e/local-product.config.ts)                                 | A    |       3 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/offline-update.config.ts](../../apps/aiao-media-e2e/offline-update.config.ts)                               | A    |      15 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/package.json](../../apps/aiao-media-e2e/package.json)                                                       | A    |       9 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/project.json](../../apps/aiao-media-e2e/project.json)                                                       | A    |     171 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/supabase-local.config.ts](../../apps/aiao-media-e2e/supabase-local.config.ts)                               | A    |      26 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/tsconfig.json](../../apps/aiao-media-e2e/tsconfig.json)                                                     | A    |      27 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media-e2e/upgrade.config.ts](../../apps/aiao-media-e2e/upgrade.config.ts)                                             | A    |       8 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/.env.example](../../apps/aiao-media/.env.example)                                                               | A    |      25 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/.gitignore](../../apps/aiao-media/.gitignore)                                                                   | A    |      14 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/.postcssrc.json](../../apps/aiao-media/.postcssrc.json)                                                         | A    |       5 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/eslint.config.mjs](../../apps/aiao-media/eslint.config.mjs)                                                     | A    |      36 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/infra/supabase/.env.example](../../apps/aiao-media/infra/supabase/.env.example)                                 | A    |      14 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/infra/supabase/docker-compose.yml](../../apps/aiao-media/infra/supabase/docker-compose.yml)                     | A    |     236 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/infra/supabase/kong.template.yml](../../apps/aiao-media/infra/supabase/kong.template.yml)                       | A    |      92 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/package.json](../../apps/aiao-media/package.json)                                                               | A    |      36 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/project.json](../../apps/aiao-media/project.json)                                                               | A    |     455 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/public/_headers](../../apps/aiao-media/public/_headers)                                                         | A    |      11 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/public/image-examples/REFERENCE-LICENSE.txt](../../apps/aiao-media/public/image-examples/REFERENCE-LICENSE.txt) | A    |      32 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/public/image-examples/sources.json](../../apps/aiao-media/public/image-examples/sources.json)                   | A    |      50 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/tsconfig.app.json](../../apps/aiao-media/tsconfig.app.json)                                                     | A    |      45 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/tsconfig.json](../../apps/aiao-media/tsconfig.json)                                                             | A    |      41 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/tsconfig.spec.json](../../apps/aiao-media/tsconfig.spec.json)                                                   | A    |      43 / 0 | 依赖/目标/隔离/工作流核对 |
| [apps/aiao-media/vite.config.mts](../../apps/aiao-media/vite.config.mts)                                                         | A    |      55 / 0 | 依赖/目标/隔离/工作流核对 |
| [eslint.config.mjs](../../eslint.config.mjs)                                                                                     | M    |      13 / 0 | 依赖/目标/隔离/工作流核对 |
| [pnpm-lock.yaml](../../pnpm-lock.yaml)                                                                                           | M    |   856 / 132 | 依赖/目标/隔离/工作流核对 |
| [pnpm-workspace.yaml](../../pnpm-workspace.yaml)                                                                                 | M    |       1 / 0 | 依赖/目标/隔离/工作流核对 |

### 需求与说明文档

| 文件                                                                                                                                                                                       | 状态 | 新增 / 删除 | 审查方式或结论          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------: | ----------------------- |
| [AGENTS.md](../../AGENTS.md)                                                                                                                                                               | M    |       4 / 0 | 范围/证据/状态/引用核对 |
| [README.md](../../README.md)                                                                                                                                                               | M    |       4 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/AGENTS.md](../../apps/aiao-media/AGENTS.md)                                                                                                                               | A    |      10 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/README.md](../../apps/aiao-media/README.md)                                                                                                                               | A    |     104 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/deploy/local-first-pages.md](../../apps/aiao-media/deploy/local-first-pages.md)                                                                                           | A    |     136 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/direct-provider-probe/README.md](../../apps/aiao-media/direct-provider-probe/README.md)                                                                                   | A    |      49 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/public/image-examples/SOURCES.md](../../apps/aiao-media/public/image-examples/SOURCES.md)                                                                                 | A    |      55 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/CONVENTIONS.md](../../apps/aiao-media/requirements/CONVENTIONS.md)                                                                                           | A    |     149 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/README.md](../../apps/aiao-media/requirements/README.md)                                                                                                     | A    |      95 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/capability-matrix.md](../../apps/aiao-media/requirements/capability-matrix.md)                                                                               | A    |      27 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/code-scanning/README.md](../../apps/aiao-media/requirements/code-scanning/README.md)                                                                         | A    |      51 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/code-scanning/code-scanning.template.md](../../apps/aiao-media/requirements/code-scanning/code-scanning.template.md)                                         | A    |      42 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/decisions.md](../../apps/aiao-media/requirements/decisions.md)                                                                                               | A    |      39 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/README.md](../../apps/aiao-media/requirements/design/image-mvp/README.md)                                                                   | A    |      60 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/assets/REFERENCE-LICENSE.txt](../../apps/aiao-media/requirements/design/image-mvp/assets/REFERENCE-LICENSE.txt)                             | A    |      32 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/assets/SOURCES.md](../../apps/aiao-media/requirements/design/image-mvp/assets/SOURCES.md)                                                   | A    |      55 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/assets/sources.json](../../apps/aiao-media/requirements/design/image-mvp/assets/sources.json)                                               | A    |      50 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/README.md](../../apps/aiao-media/requirements/design/image-mvp/implementation/README.md)                                     | A    |      12 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/design/image-mvp/live-provider/README.md](../../apps/aiao-media/requirements/design/image-mvp/live-provider/README.md)                                       | A    |      12 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/epics/MEDIA-EPIC-001.md](../../apps/aiao-media/requirements/epics/MEDIA-EPIC-001.md)                                                                         | A    |      34 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/epics/MEDIA-EPIC-002.md](../../apps/aiao-media/requirements/epics/MEDIA-EPIC-002.md)                                                                         | A    |      39 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/epics/MEDIA-EPIC-003.md](../../apps/aiao-media/requirements/epics/MEDIA-EPIC-003.md)                                                                         | A    |      38 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/epics/MEDIA-EPIC-004.md](../../apps/aiao-media/requirements/epics/MEDIA-EPIC-004.md)                                                                         | A    |      34 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/epics/epic.template.md](../../apps/aiao-media/requirements/epics/epic.template.md)                                                                           | A    |      27 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/README.md](../../apps/aiao-media/requirements/plans/README.md)                                                                                         | A    |      27 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/account-workspace-binding.md](../../apps/aiao-media/requirements/plans/account-workspace-binding.md)                                                   | A    |      86 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/business-admin.md](../../apps/aiao-media/requirements/plans/business-admin.md)                                                                         | A    |      59 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/image-mvp-live-verification.json](../../apps/aiao-media/requirements/plans/image-mvp-live-verification.json)                                           | A    |      65 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/image-mvp-verification.md](../../apps/aiao-media/requirements/plans/image-mvp-verification.md)                                                         | A    |      79 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/jpeg-delivery-verification.md](../../apps/aiao-media/requirements/plans/jpeg-delivery-verification.md)                                                 | A    |      55 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/library-search-tasks.md](../../apps/aiao-media/requirements/plans/library-search-tasks.md)                                                             | A    |      53 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/local-delivery-tasks.md](../../apps/aiao-media/requirements/plans/local-delivery-tasks.md)                                                             | A    |      35 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/local-delivery-verification.md](../../apps/aiao-media/requirements/plans/local-delivery-verification.md)                                               | A    |      74 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/local-first-app-verification.md](../../apps/aiao-media/requirements/plans/local-first-app-verification.md)                                             | A    |      74 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/local-first-direct-probe-verification.md](../../apps/aiao-media/requirements/plans/local-first-direct-probe-verification.md)                           | A    |      66 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/local-reliability-verification.md](../../apps/aiao-media/requirements/plans/local-reliability-verification.md)                                         | A    |      48 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/provider-acceptance-follow-up.md](../../apps/aiao-media/requirements/plans/provider-acceptance-follow-up.md)                                           | A    |     121 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/public-delivery-verification.md](../../apps/aiao-media/requirements/plans/public-delivery-verification.md)                                             | A    |     121 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/release-completion-tasks.md](../../apps/aiao-media/requirements/plans/release-completion-tasks.md)                                                     | A    |      95 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/roadmap-before-image-mvp.md](../../apps/aiao-media/requirements/plans/roadmap-before-image-mvp.md)                                                     | A    |     100 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/rxdb-import-verification.md](../../apps/aiao-media/requirements/plans/rxdb-import-verification.md)                                                     | A    |      45 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/rxdb-product-incubation.md](../../apps/aiao-media/requirements/plans/rxdb-product-incubation.md)                                                       | A    |     235 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/source-import.json](../../apps/aiao-media/requirements/plans/source-import.json)                                                                       | A    |    1390 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/plans/supabase-account-verification.md](../../apps/aiao-media/requirements/plans/supabase-account-verification.md)                                           | A    |      60 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/reviews/README.md](../../apps/aiao-media/requirements/reviews/README.md)                                                                                     | A    |      34 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/reviews/review.template.md](../../apps/aiao-media/requirements/reviews/review.template.md)                                                                   | A    |      27 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/roadmap.md](../../apps/aiao-media/requirements/roadmap.md)                                                                                                   | A    |      40 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/status-overview.md](../../apps/aiao-media/requirements/status-overview.md)                                                                                   | A    |      65 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/account/MEDIA-US-201-sessions.md](../../apps/aiao-media/requirements/stories/account/MEDIA-US-201-sessions.md)                                       | A    |      87 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/account/MEDIA-US-202-library.md](../../apps/aiao-media/requirements/stories/account/MEDIA-US-202-library.md)                                         | A    |      76 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/account/MEDIA-US-203-business-admin.md](../../apps/aiao-media/requirements/stories/account/MEDIA-US-203-business-admin.md)                           | A    |      82 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/account/MEDIA-US-204-library-search.md](../../apps/aiao-media/requirements/stories/account/MEDIA-US-204-library-search.md)                           | A    |      86 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/generation/MEDIA-US-102-image-generation.md](../../apps/aiao-media/requirements/stories/generation/MEDIA-US-102-image-generation.md)                 | A    |      85 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/generation/MEDIA-US-105-provider-management.md](../../apps/aiao-media/requirements/stories/generation/MEDIA-US-105-provider-management.md)           | A    |      85 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/generation/MEDIA-US-106-prompt-gallery.md](../../apps/aiao-media/requirements/stories/generation/MEDIA-US-106-prompt-gallery.md)                     | A    |      82 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/generation/MEDIA-US-107-mobile-verification.md](../../apps/aiao-media/requirements/stories/generation/MEDIA-US-107-mobile-verification.md)           | A    |      67 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/local-first/MEDIA-US-301-browser-persistence.md](../../apps/aiao-media/requirements/stories/local-first/MEDIA-US-301-browser-persistence.md)         | A    |      88 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/local-first/MEDIA-US-302-draft-sync.md](../../apps/aiao-media/requirements/stories/local-first/MEDIA-US-302-draft-sync.md)                           | A    |      89 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/local-first/local-first-studio.md](../../apps/aiao-media/requirements/stories/local-first/local-first-studio.md)                                     | A    |      25 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/platform/MEDIA-US-001-nx-workspace.md](../../apps/aiao-media/requirements/stories/platform/MEDIA-US-001-nx-workspace.md)                             | A    |      57 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md](../../apps/aiao-media/requirements/stories/platform/MEDIA-US-004-cloudflare-edge-deployment.md) | A    |      71 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/stories/story.template.md](../../apps/aiao-media/requirements/stories/story.template.md)                                                                     | A    |      53 / 0 | 范围/证据/状态/引用核对 |
| [apps/aiao-media/requirements/verification-report.md](../../apps/aiao-media/requirements/verification-report.md)                                                                           | A    |     170 / 0 | 范围/证据/状态/引用核对 |
| [requirements/README.md](../../requirements/README.md)                                                                                                                                     | M    |       4 / 0 | 范围/证据/状态/引用核对 |

### 测试与fixture

| 文件                                                                                                                                         | 状态 | 新增 / 删除 | 审查方式或结论                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------: | ---------------------------------------- |
| [apps/aiao-media-e2e/scripts/actual-release-update-fixture.mjs](../../apps/aiao-media-e2e/scripts/actual-release-update-fixture.mjs)         | A    |      29 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/actual-release-update-live.test.mjs](../../apps/aiao-media-e2e/scripts/actual-release-update-live.test.mjs)     | A    |     216 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/actual-release-update.test.mjs](../../apps/aiao-media-e2e/scripts/actual-release-update.test.mjs)               | A    |     157 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/fixtures/actual-release-process.mjs](../../apps/aiao-media-e2e/scripts/fixtures/actual-release-process.mjs)     | A    |      29 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/provider-acceptance-fixture.mjs](../../apps/aiao-media-e2e/scripts/provider-acceptance-fixture.mjs)             | A    |     267 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/provider-acceptance.test.mjs](../../apps/aiao-media-e2e/scripts/provider-acceptance.test.mjs)                   | A    |     447 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/provider-result-network-fixture.mjs](../../apps/aiao-media-e2e/scripts/provider-result-network-fixture.mjs)     | A    |     122 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/scripts/public-origin-smoke.test.mjs](../../apps/aiao-media-e2e/scripts/public-origin-smoke.test.mjs)                   | A    |      72 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/library.spec.ts](../../apps/aiao-media-e2e/src/library.spec.ts)                                                     | A    |     349 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/local-first.spec.ts](../../apps/aiao-media-e2e/src/local-first.spec.ts)                                             | A    |     369 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/local-reliability.spec.ts](../../apps/aiao-media-e2e/src/local-reliability.spec.ts)                                 | A    |     452 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/offline-update.spec.ts](../../apps/aiao-media-e2e/src/offline-update.spec.ts)                                       | A    |      63 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/product-local.spec.mts](../../apps/aiao-media-e2e/src/product-local.spec.mts)                                       | A    |     433 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/supabase-auth.spec.ts](../../apps/aiao-media-e2e/src/supabase-auth.spec.ts)                                         | A    |     177 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/supabase-local.spec.mts](../../apps/aiao-media-e2e/src/supabase-local.spec.mts)                                     | A    |     185 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media-e2e/src/upgrade.spec.ts](../../apps/aiao-media-e2e/src/upgrade.spec.ts)                                                     | A    |      70 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/build-production-supabase-bundle.test.mjs](../../apps/aiao-media/scripts/build-production-supabase-bundle.test.mjs) | A    |      89 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/build-supabase-config.test.mjs](../../apps/aiao-media/scripts/build-supabase-config.test.mjs)                       | A    |      72 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/check-requirements.test.mjs](../../apps/aiao-media/scripts/check-requirements.test.mjs)                             | A    |     360 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/direct-provider-probe.test.mjs](../../apps/aiao-media/scripts/direct-provider-probe.test.mjs)                       | A    |     252 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/local-first-worker.test.mjs](../../apps/aiao-media/scripts/local-first-worker.test.mjs)                             | A    |     336 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/migration.test.mjs](../../apps/aiao-media/scripts/migration.test.mjs)                                               | A    |      53 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/product-api.test.mjs](../../apps/aiao-media/scripts/product-api.test.mjs)                                           | A    |     242 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/scripts/product-sync-contract.test.mjs](../../apps/aiao-media/scripts/product-sync-contract.test.mjs)                       | A    |     113 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/admin-console.spec.ts](../../apps/aiao-media/src/app/admin-console.spec.ts)                                         | A    |     262 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/local-image-mvp.behavior.spec.ts](../../apps/aiao-media/src/app/local-image-mvp.behavior.spec.ts)                   | A    |    1364 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/local-image-mvp.spec.ts](../../apps/aiao-media/src/app/local-image-mvp.spec.ts)                                     | A    |     130 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/local-provider.spec.ts](../../apps/aiao-media/src/app/local-provider.spec.ts)                                       | A    |     477 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/product-client.spec.ts](../../apps/aiao-media/src/app/product-client.spec.ts)                                       | A    |     140 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/product-workspace.spec.ts](../../apps/aiao-media/src/app/product-workspace.spec.ts)                                 | A    |     434 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/prompts/prompt-assets.spec.ts](../../apps/aiao-media/src/app/prompts/prompt-assets.spec.ts)                         | A    |      59 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/prompts/prompt-focus.spec.ts](../../apps/aiao-media/src/app/prompts/prompt-focus.spec.ts)                           | A    |      48 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/prompts/prompt-input.spec.ts](../../apps/aiao-media/src/app/prompts/prompt-input.spec.ts)                           | A    |     191 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/prompts/prompt-state.spec.ts](../../apps/aiao-media/src/app/prompts/prompt-state.spec.ts)                           | A    |     110 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/prompts/studio-draft-session.spec.ts](../../apps/aiao-media/src/app/prompts/studio-draft-session.spec.ts)           | A    |     280 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/supabase-auth.spec.ts](../../apps/aiao-media/src/app/supabase-auth.spec.ts)                                         | A    |     300 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/work-library-session.spec.ts](../../apps/aiao-media/src/app/work-library-session.spec.ts)                           | A    |     307 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/work-metadata-session.spec.ts](../../apps/aiao-media/src/app/work-metadata-session.spec.ts)                         | A    |     115 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/work-visible.directive.spec.ts](../../apps/aiao-media/src/app/work-visible.directive.spec.ts)                       | A    |      89 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/app/workspace-session.spec.ts](../../apps/aiao-media/src/app/workspace-session.spec.ts)                                 | A    |     135 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/audio-validation.spec.ts](../../apps/aiao-media/src/contracts/audio-validation.spec.ts)                       | A    |     145 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/draft-sync-validation.spec.ts](../../apps/aiao-media/src/contracts/draft-sync-validation.spec.ts)             | A    |     239 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/generation-validation.spec.ts](../../apps/aiao-media/src/contracts/generation-validation.spec.ts)             | A    |     165 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/image-format.spec.ts](../../apps/aiao-media/src/contracts/image-format.spec.ts)                               | A    |     140 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/index.spec.ts](../../apps/aiao-media/src/contracts/index.spec.ts)                                             | A    |       9 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/product-data.spec.ts](../../apps/aiao-media/src/contracts/product-data.spec.ts)                               | A    |     110 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/contracts/video-validation.spec.ts](../../apps/aiao-media/src/contracts/video-validation.spec.ts)                       | A    |     132 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/audio-submissions.spec.ts](../../apps/aiao-media/src/local-data/audio-submissions.spec.ts)                   | A    |      84 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/browser-media.browser.test.ts](../../apps/aiao-media/src/local-data/browser-media.browser.test.ts)           | A    |     627 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/browser-media.spec.ts](../../apps/aiao-media/src/local-data/browser-media.spec.ts)                           | A    |     387 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/draft-notebook.spec.ts](../../apps/aiao-media/src/local-data/draft-notebook.spec.ts)                         | A    |     335 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/image-mvp.spec.ts](../../apps/aiao-media/src/local-data/image-mvp.spec.ts)                                   | A    |      91 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/image-submissions.spec.ts](../../apps/aiao-media/src/local-data/image-submissions.spec.ts)                   | A    |     184 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/library-query.browser.test.ts](../../apps/aiao-media/src/local-data/library-query.browser.test.ts)           | A    |     246 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/library-query.spec.ts](../../apps/aiao-media/src/local-data/library-query.spec.ts)                           | A    |      92 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/local-collections.spec.ts](../../apps/aiao-media/src/local-data/local-collections.spec.ts)                   | A    |      60 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/local-repository.spec.ts](../../apps/aiao-media/src/local-data/local-repository.spec.ts)                     | A    |      68 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/media-result.spec.ts](../../apps/aiao-media/src/local-data/media-result.spec.ts)                             | A    |     141 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/report-batches.spec.ts](../../apps/aiao-media/src/local-data/report-batches.spec.ts)                         | A    |      11 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/studio-draft.spec.ts](../../apps/aiao-media/src/local-data/studio-draft.spec.ts)                             | A    |      76 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/video-submissions.spec.ts](../../apps/aiao-media/src/local-data/video-submissions.spec.ts)                   | A    |      83 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |
| [apps/aiao-media/src/local-data/workspace-registry.spec.ts](../../apps/aiao-media/src/local-data/workspace-registry.spec.ts)                 | A    |     130 / 0 | 断言及覆盖边界静态核对；实际执行见验证表 |

### 服务端/迁移/部署与验证脚本

| 文件                                                                                                                                                           | 状态 | 新增 / 删除 | 审查方式或结论                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------: | ------------------------------- |
| [apps/aiao-media-e2e/scripts/actual-release-update-live.mjs](../../apps/aiao-media-e2e/scripts/actual-release-update-live.mjs)                                 | A    |     296 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media-e2e/scripts/actual-release-update.mjs](../../apps/aiao-media-e2e/scripts/actual-release-update.mjs)                                           | A    |     436 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media-e2e/scripts/provider-acceptance.mjs](../../apps/aiao-media-e2e/scripts/provider-acceptance.mjs)                                               | A    |     525 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media-e2e/scripts/provider-fetch-capture.mjs](../../apps/aiao-media-e2e/scripts/provider-fetch-capture.mjs)                                         | A    |     114 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media-e2e/scripts/provider-result-network.mjs](../../apps/aiao-media-e2e/scripts/provider-result-network.mjs)                                       | A    |     111 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media-e2e/scripts/public-origin-smoke.mjs](../../apps/aiao-media-e2e/scripts/public-origin-smoke.mjs)                                               | A    |     418 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/admin-api.mjs](../../apps/aiao-media/deploy/admin-api.mjs)                                                                             | A    |     130 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/local-first-worker.mjs](../../apps/aiao-media/deploy/local-first-worker.mjs)                                                           | A    |     437 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/product-content.mjs](../../apps/aiao-media/deploy/product-content.mjs)                                                                 | A    |      70 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/product-http.mjs](../../apps/aiao-media/deploy/product-http.mjs)                                                                       | A    |     132 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/product-reports.mjs](../../apps/aiao-media/deploy/product-reports.mjs)                                                                 | A    |      77 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/deploy/wrangler.json](../../apps/aiao-media/deploy/wrangler.json)                                                                             | A    |      26 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/direct-provider-probe/_headers](../../apps/aiao-media/direct-provider-probe/_headers)                                                         | A    |       5 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/direct-provider-probe/index.html](../../apps/aiao-media/direct-provider-probe/index.html)                                                     | A    |     117 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/direct-provider-probe/main.js](../../apps/aiao-media/direct-provider-probe/main.js)                                                           | A    |     270 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/direct-provider-probe/styles.css](../../apps/aiao-media/direct-provider-probe/styles.css)                                                     | A    |     324 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/init/realtime.sql](../../apps/aiao-media/infra/supabase/init/realtime.sql)                                                     | A    |       2 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/init/roles.sql](../../apps/aiao-media/infra/supabase/init/roles.sql)                                                           | A    |       6 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/001-local-account-checks.sql](../../apps/aiao-media/infra/supabase/migrations/001-local-account-checks.sql)         | A    |      27 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/002-product-workspaces.sql](../../apps/aiao-media/infra/supabase/migrations/002-product-workspaces.sql)             | A    |     181 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/003-rxdb-product-permissions.sql](../../apps/aiao-media/infra/supabase/migrations/003-rxdb-product-permissions.sql) | A    |      29 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/004-admin-foundation.sql](../../apps/aiao-media/infra/supabase/migrations/004-admin-foundation.sql)                 | A    |      66 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/005-product-content.sql](../../apps/aiao-media/infra/supabase/migrations/005-product-content.sql)                   | A    |     180 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/006-trusted-membership.sql](../../apps/aiao-media/infra/supabase/migrations/006-trusted-membership.sql)             | A    |      30 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/infra/supabase/migrations/007-jpeg-work-metadata.sql](../../apps/aiao-media/infra/supabase/migrations/007-jpeg-work-metadata.sql)             | A    |      19 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/admin-membership.mjs](../../apps/aiao-media/scripts/admin-membership.mjs)                                                             | A    |      37 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/build-offline-assets.mjs](../../apps/aiao-media/scripts/build-offline-assets.mjs)                                                     | A    |      49 / 0 | F154-02；产物及真实离线E2E证实  |
| [apps/aiao-media/scripts/build-production-supabase-bundle.mjs](../../apps/aiao-media/scripts/build-production-supabase-bundle.mjs)                             | A    |     147 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/build-prompt-assets.mjs](../../apps/aiao-media/scripts/build-prompt-assets.mjs)                                                       | A    |      25 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/build-supabase-config.mjs](../../apps/aiao-media/scripts/build-supabase-config.mjs)                                                   | A    |      33 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/check-local-first-release.mjs](../../apps/aiao-media/scripts/check-local-first-release.mjs)                                           | A    |      91 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/check-requirements.mjs](../../apps/aiao-media/scripts/check-requirements.mjs)                                                         | A    |     328 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/deploy-local-first.mjs](../../apps/aiao-media/scripts/deploy-local-first.mjs)                                                         | A    |      65 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/direct-provider-probe-live.mjs](../../apps/aiao-media/scripts/direct-provider-probe-live.mjs)                                         | A    |     157 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/direct-provider-probe.mjs](../../apps/aiao-media/scripts/direct-provider-probe.mjs)                                                   | A    |      79 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/offline-update-server.mjs](../../apps/aiao-media/scripts/offline-update-server.mjs)                                                   | A    |      72 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/offline-worker.js](../../apps/aiao-media/scripts/offline-worker.js)                                                                   | A    |      59 / 0 | F154-02关联调用链               |
| [apps/aiao-media/scripts/prepare-rxdb-assets.mjs](../../apps/aiao-media/scripts/prepare-rxdb-assets.mjs)                                                       | A    |      11 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/supabase-local.d.mts](../../apps/aiao-media/scripts/supabase-local.d.mts)                                                             | A    |      10 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/supabase-local.mjs](../../apps/aiao-media/scripts/supabase-local.mjs)                                                                 | A    |     212 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/test-product-local.mjs](../../apps/aiao-media/scripts/test-product-local.mjs)                                                         | A    |     316 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/test-supabase-local.d.mts](../../apps/aiao-media/scripts/test-supabase-local.d.mts)                                                   | A    |       1 / 0 | 权限/协议/资源/执行边界静态核对 |
| [apps/aiao-media/scripts/test-supabase-local.mjs](../../apps/aiao-media/scripts/test-supabase-local.mjs)                                                       | A    |     225 / 0 | 权限/协议/资源/执行边界静态核对 |

### 应用运行时TS/JS

| 文件                                                                                                                                         | 状态 | 新增 / 删除 | 审查方式或结论                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------: | --------------------------------- |
| [apps/aiao-media-e2e/src/local-first.helpers.ts](../../apps/aiao-media-e2e/src/local-first.helpers.ts)                                       | A    |      68 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/admin-console.ts](../../apps/aiao-media/src/app/admin-console.ts)                                                   | A    |     337 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/app.config.ts](../../apps/aiao-media/src/app/app.config.ts)                                                         | A    |      16 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/app.routes.ts](../../apps/aiao-media/src/app/app.routes.ts)                                                         | A    |       3 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/default-provider.ts](../../apps/aiao-media/src/app/default-provider.ts)                                             | A    |      23 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/image-mvp-catalog.ts](../../apps/aiao-media/src/app/image-mvp-catalog.ts)                                           | A    |     143 / 0 | F154-02关联调用链                 |
| [apps/aiao-media/src/app/local-backup.ts](../../apps/aiao-media/src/app/local-backup.ts)                                                     | A    |     158 / 0 | F154-01；真实round-trip探针失败   |
| [apps/aiao-media/src/app/local-image-mvp.ts](../../apps/aiao-media/src/app/local-image-mvp.ts)                                               | A    |    1622 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/local-provider.ts](../../apps/aiao-media/src/app/local-provider.ts)                                                 | A    |     206 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/product-client.ts](../../apps/aiao-media/src/app/product-client.ts)                                                 | A    |      95 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/product-workspace.ts](../../apps/aiao-media/src/app/product-workspace.ts)                                           | A    |     414 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/catalog-data.ts](../../apps/aiao-media/src/app/prompts/catalog-data.ts)                                     | A    |     276 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-assets.ts](../../apps/aiao-media/src/app/prompts/prompt-assets.ts)                                   | A    |      57 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-catalog.ts](../../apps/aiao-media/src/app/prompts/prompt-catalog.ts)                                 | A    |      96 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-editor-runtime.ts](../../apps/aiao-media/src/app/prompts/prompt-editor-runtime.ts)                   | A    |       9 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-focus.ts](../../apps/aiao-media/src/app/prompts/prompt-focus.ts)                                     | A    |       9 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-input.ts](../../apps/aiao-media/src/app/prompts/prompt-input.ts)                                     | A    |     279 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/prompt-state.ts](../../apps/aiao-media/src/app/prompts/prompt-state.ts)                                     | A    |     121 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/prompts/studio-draft-session.ts](../../apps/aiao-media/src/app/prompts/studio-draft-session.ts)                     | A    |     190 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/supabase-auth-config.ts](../../apps/aiao-media/src/app/supabase-auth-config.ts)                                     | A    |      39 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/supabase-auth.ts](../../apps/aiao-media/src/app/supabase-auth.ts)                                                   | A    |     293 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/work-library-session.ts](../../apps/aiao-media/src/app/work-library-session.ts)                                     | A    |     271 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/work-metadata-session.ts](../../apps/aiao-media/src/app/work-metadata-session.ts)                                   | A    |      63 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/work-visible.directive.ts](../../apps/aiao-media/src/app/work-visible.directive.ts)                                 | A    |      34 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/app/workspace-session.ts](../../apps/aiao-media/src/app/workspace-session.ts)                                           | A    |     122 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/draft-sync-validation.ts](../../apps/aiao-media/src/contracts/draft-sync-validation.ts)                       | A    |     206 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/draft-sync.ts](../../apps/aiao-media/src/contracts/draft-sync.ts)                                             | A    |      71 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/generation-jobs.ts](../../apps/aiao-media/src/contracts/generation-jobs.ts)                                   | A    |     190 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/generation-validation.ts](../../apps/aiao-media/src/contracts/generation-validation.ts)                       | A    |     438 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/image-format.ts](../../apps/aiao-media/src/contracts/image-format.ts)                                         | A    |      77 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/image-provider-protocol.ts](../../apps/aiao-media/src/contracts/image-provider-protocol.ts)                   | A    |      22 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/index.ts](../../apps/aiao-media/src/contracts/index.ts)                                                       | A    |     104 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/product-data.d.mts](../../apps/aiao-media/src/contracts/product-data.d.mts)                                   | A    |      68 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/contracts/product-data.mjs](../../apps/aiao-media/src/contracts/product-data.mjs)                                       | A    |     246 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/audio-submissions.ts](../../apps/aiao-media/src/local-data/audio-submissions.ts)                             | A    |     102 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/browser-media.ts](../../apps/aiao-media/src/local-data/browser-media.ts)                                     | A    |    2060 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/draft-notebook.ts](../../apps/aiao-media/src/local-data/draft-notebook.ts)                                   | A    |     335 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/image-submissions.ts](../../apps/aiao-media/src/local-data/image-submissions.ts)                             | A    |     300 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/index.ts](../../apps/aiao-media/src/local-data/index.ts)                                                     | A    |      56 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/library-query-timezone.fixture.mjs](../../apps/aiao-media/src/local-data/library-query-timezone.fixture.mjs) | A    |       5 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/library-query.ts](../../apps/aiao-media/src/local-data/library-query.ts)                                     | A    |      62 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/local-collections.ts](../../apps/aiao-media/src/local-data/local-collections.ts)                             | A    |     187 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/local-repository.ts](../../apps/aiao-media/src/local-data/local-repository.ts)                               | A    |      73 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/media-result.ts](../../apps/aiao-media/src/local-data/media-result.ts)                                       | A    |     160 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/product-projection.ts](../../apps/aiao-media/src/local-data/product-projection.ts)                           | A    |     123 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/product-sync-store.ts](../../apps/aiao-media/src/local-data/product-sync-store.ts)                           | A    |     710 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/report-batches.ts](../../apps/aiao-media/src/local-data/report-batches.ts)                                   | A    |       6 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/studio-draft.ts](../../apps/aiao-media/src/local-data/studio-draft.ts)                                       | A    |     158 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/video-submissions.ts](../../apps/aiao-media/src/local-data/video-submissions.ts)                             | A    |     102 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/workspace-registry-store.ts](../../apps/aiao-media/src/local-data/workspace-registry-store.ts)               | A    |     132 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/local-data/workspace-registry.ts](../../apps/aiao-media/src/local-data/workspace-registry.ts)                           | A    |     221 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/main.ts](../../apps/aiao-media/src/main.ts)                                                                             | A    |       5 / 0 | 数据流/状态/错误/生命周期静态核对 |
| [apps/aiao-media/src/test-setup.ts](../../apps/aiao-media/src/test-setup.ts)                                                                 | A    |       7 / 0 | 数据流/状态/错误/生命周期静态核对 |

### 二进制资源

| 文件                                                                                                                                                                                       | 状态 | 新增 / 删除 | 审查方式或结论                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------: | ----------------------------------- |
| [apps/aiao-media/public/favicon.ico](../../apps/aiao-media/public/favicon.ico)                                                                                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/ceramic.jpg](../../apps/aiao-media/public/image-examples/ceramic.jpg)                                                                               | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/coffee.jpg](../../apps/aiao-media/public/image-examples/coffee.jpg)                                                                                 | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/illustration.jpg](../../apps/aiao-media/public/image-examples/illustration.jpg)                                                                     | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/map.jpg](../../apps/aiao-media/public/image-examples/map.jpg)                                                                                       | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/portrait.jpg](../../apps/aiao-media/public/image-examples/portrait.jpg)                                                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/public/image-examples/vr.jpg](../../apps/aiao-media/public/image-examples/vr.jpg)                                                                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/00-overview.png](../../apps/aiao-media/requirements/design/image-mvp/00-overview.png)                                                       | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/01-discover.png](../../apps/aiao-media/requirements/design/image-mvp/01-discover.png)                                                       | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/02-studio.png](../../apps/aiao-media/requirements/design/image-mvp/02-studio.png)                                                           | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/03-library.png](../../apps/aiao-media/requirements/design/image-mvp/03-library.png)                                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/04-loading.png](../../apps/aiao-media/requirements/design/image-mvp/04-loading.png)                                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/05-error.png](../../apps/aiao-media/requirements/design/image-mvp/05-error.png)                                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/06-storage-error.png](../../apps/aiao-media/requirements/design/image-mvp/06-storage-error.png)                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/07-empty.png](../../apps/aiao-media/requirements/design/image-mvp/07-empty.png)                                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/08-unknown.png](../../apps/aiao-media/requirements/design/image-mvp/08-unknown.png)                                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/09-mobile-discover.png](../../apps/aiao-media/requirements/design/image-mvp/09-mobile-discover.png)                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/10-mobile-studio.png](../../apps/aiao-media/requirements/design/image-mvp/10-mobile-studio.png)                                             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/11-mobile-library.png](../../apps/aiao-media/requirements/design/image-mvp/11-mobile-library.png)                                           | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/ceramic.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/ceramic.jpg)                                                 | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/coffee.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/coffee.jpg)                                                   | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/illustration.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/illustration.jpg)                                       | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/map.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/map.jpg)                                                         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/portrait.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/portrait.jpg)                                               | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/assets/vr.jpg](../../apps/aiao-media/requirements/design/image-mvp/assets/vr.jpg)                                                           | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/01-discover-desktop.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/01-discover-desktop.png)         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/02-create-desktop.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/02-create-desktop.png)             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/03-images-desktop.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/03-images-desktop.png)             | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/04-create-mobile.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/04-create-mobile.png)               | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/04-discover-mobile.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/04-discover-mobile.png)           | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/implementation/04-images-mobile.png](../../apps/aiao-media/requirements/design/image-mvp/implementation/04-images-mobile.png)               | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/live-provider/01-create-landscape.webp](../../apps/aiao-media/requirements/design/image-mvp/live-provider/01-create-landscape.webp)         | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/live-provider/02-create-portrait.webp](../../apps/aiao-media/requirements/design/image-mvp/live-provider/02-create-portrait.webp)           | A    |      binary | 资源路径/清单；导入字节保全测试通过 |
| [apps/aiao-media/requirements/design/image-mvp/live-provider/03-library-after-reload.webp](../../apps/aiao-media/requirements/design/image-mvp/live-provider/03-library-after-reload.webp) | A    |      binary | 资源路径/清单；导入字节保全测试通过 |

### 界面与静态素材

| 文件                                                                                                                     | 状态 | 新增 / 删除 | 审查方式或结论         |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | ----------: | ---------------------- |
| [apps/aiao-media/public/prompt-art/alpine-dawn.svg](../../apps/aiao-media/public/prompt-art/alpine-dawn.svg)             | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/botanical-poster.svg](../../apps/aiao-media/public/prompt-art/botanical-poster.svg)   | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/ceramic-still.svg](../../apps/aiao-media/public/prompt-art/ceramic-still.svg)         | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/coastline.svg](../../apps/aiao-media/public/prompt-art/coastline.svg)                 | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/coffee-launch.svg](../../apps/aiao-media/public/prompt-art/coffee-launch.svg)         | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/festival-poster.svg](../../apps/aiao-media/public/prompt-art/festival-poster.svg)     | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/minimal-perfume.svg](../../apps/aiao-media/public/prompt-art/minimal-perfume.svg)     | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/night-city.svg](../../apps/aiao-media/public/prompt-art/night-city.svg)               | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/product-reference.svg](../../apps/aiao-media/public/prompt-art/product-reference.svg) | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/quiet-portrait.svg](../../apps/aiao-media/public/prompt-art/quiet-portrait.svg)       | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/reading-portrait.svg](../../apps/aiao-media/public/prompt-art/reading-portrait.svg)   | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/public/prompt-art/structured-poster.svg](../../apps/aiao-media/public/prompt-art/structured-poster.svg) | A    |       1 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/app/admin-console.css](../../apps/aiao-media/src/app/admin-console.css)                             | A    |      59 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/app/admin-console.html](../../apps/aiao-media/src/app/admin-console.html)                           | A    |     274 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/app/local-image-mvp.html](../../apps/aiao-media/src/app/local-image-mvp.html)                       | A    |     936 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/app/prompts/prompt-input.css](../../apps/aiao-media/src/app/prompts/prompt-input.css)               | A    |      78 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/image-mvp.css](../../apps/aiao-media/src/image-mvp.css)                                             | A    |    1675 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/index.html](../../apps/aiao-media/src/index.html)                                                   | A    |      14 / 0 | 绑定/交互/资源引用核对 |
| [apps/aiao-media/src/styles.css](../../apps/aiao-media/src/styles.css)                                                   | A    |      12 / 0 | 绑定/交互/资源引用核对 |

### 设计原型代码

| 文件                                                                                                                           | 状态 | 新增 / 删除 | 审查方式或结论                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------: | ------------------------------------ |
| [apps/aiao-media/requirements/design/image-mvp/index.html](../../apps/aiao-media/requirements/design/image-mvp/index.html)     | A    |      64 / 0 | 静态交互/转义/来源；不进入产品bundle |
| [apps/aiao-media/requirements/design/image-mvp/prototype.js](../../apps/aiao-media/requirements/design/image-mvp/prototype.js) | A    |     348 / 0 | 静态交互/转义/来源；不进入产品bundle |
| [apps/aiao-media/requirements/design/image-mvp/styles.css](../../apps/aiao-media/requirements/design/image-mvp/styles.css)     | A    |    1312 / 0 | 静态交互/转义/来源；不进入产品bundle |
