---
kind: review-plan
object: rxdb-adapter-desktop
source_root: packages/rxdb-adapter-desktop
created: 2026-10-03
baseline: 2e820521187cbfcd1fe76fb705659fea0a548f0e
execution: complete
---

# rxdb-adapter-desktop：深度评审计划

> 本文件是评审计划，不是问题报告。以下是待核查任务，不代表已发现缺陷、测试已通过或覆盖率已达标。

导航：[全仓总计划](../deep-review-plan.md) · [文档证据约定](../../CONVENTIONS.md) · [确认问题记录模板](../review.template.md)

## 1. 范围与基线

已拆包目录的本地忽略构建残留，不是当前 Git/Nx 有效源码包。

| 项目                | 基线事实                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| 对象类型            | 残留目录                                                                     |
| 源码范围            | `packages/rxdb-adapter-desktop`（仅本机残留，可能不存在于全新 checkout）     |
| Nx 项目             | 无；不得编造目标                                                             |
| npm 名称            | 不适用 / 未声明                                                              |
| 计划基线            | `main@2e820521187cbfcd1fe76fb705659fea0a548f0e`，2026-10-03（Asia/Shanghai） |
| 建议波次 / 优先风险 | W0 / 范围核查（排期依据，不是缺陷结论）                                      |
| 受控文件盘点        | 0 个；测试/共享套件入口 0 个（按文件名，不代表覆盖率）                       |
| 执行状态            | 完成：2026-10-05 残留专项 C1–C3 闭环；不代表桌面业务完成                     |

范围是此对象的**全部 Git 受控源码、配置、测试、fixture、构建/打包文件与资源声明**，不是只看下面的导航入口。受控生成代码需验证生成来源与确定性；忽略的旧产物不作为当前源码证据。基线变化后先复盘 inventory / Nx targets / API，再开始评审。

## 2. 阅读入口（导航，不是全部范围）

此目录没有受版本控制源码入口，不能链接或执行本机旧 `dist`。职责已迁移到：[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)。

## 3. 专项核查与最低复验场景

| 编号 | 专项               | 核查动作                                                                                                    | 最低复验场景 / 证据要求                                                                  | 状态               |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| C1   | 有效范围确认       | 核对 git ls-files、Nx nodes 与目录文件，确认此目录没有 package.json/受版本控制源码。                        | 全新 checkout 不要求存在本地 dist；残留不能算第 51 个有效包，也不能产生虚构 Nx 目标。    | 已核销；见本轮证据 |
| C2   | 旧引用核查         | 全仓搜索旧包名、旧入口与迁移说明，将有效源码职责对应到 Electron、Tauri 和 sqlite-core。                     | 生产 import/exports、共享套件调用、文档迁移命令不意外指向旧 dist；仅历史描述出现要区分。 | 已核销；见本轮证据 |
| C3   | 残留不执行、不复活 | 核查 dist/node_modules/out-tsc 是否影响本地解析或测试；不导入旧产物评审，不恢复 writer lease/已删除 suite。 | 有效包的 consumer/构建不依赖旧目录；清理前确认是可重建产物，本轮不擅自删除。             | 已核销；见本轮证据 |

共同底线：TS strict、禁止 `any` / 隐藏警告、TSDoc 与公开类型一致、简洁且单一职责、避免超过 3 层嵌套；按现有能力核查安全边界、资源释放与显式错误，不增加 fallback 掩盖错误。发现问题后先写失败复验/回归测试，再讨论最小修法，不在本计划中擅自改行为。

## 4. 测试证据与联审边界

按 `.spec / .test / .suite` 的 JS/TS 文件名盘点到 **0** 个受控测试/共享套件文件；该数字不是用例数、通过数或覆盖率。Rust inline tests、生成客户端类型测试和外部 suite 是否运行，需另外核对。

不适用：无当前源码/测试项目，不得拿旧构建产物计算覆盖率。

### 联审边界

此残留目录不属于 Nx nodes；其依赖关系不能从旧本地产物推断。

必须对照的完整链路/语义边界：[`rxdb-adapter-electron`](rxdb-adapter-electron.md)、[`rxdb-adapter-sqlite-core`](rxdb-adapter-sqlite-core.md)、[`rxdb-adapter-tauri`](rxdb-adapter-tauri.md)。

## 5. 执行命令与环境

前置环境：这是本机文件系统范围核查；不做已删除包的业务评审，不执行旧构建产物。

所有命令在仓库根目录执行；这是后续评审的命令计划，本轮没有执行这些业务门禁。

只做只读范围核查，不编造已拆包的 Nx 项目：

```bash
git ls-files packages/rxdb-adapter-desktop
git status --short --ignored packages/rxdb-adapter-desktop
NX_DAEMON=false pnpm nx show projects --json
git grep -n 'rxdb-adapter-desktop' -- packages apps modules scripts requirements
```

`git grep` 零匹配的退出码与执行失败要区分。全新 checkout 可能不存在此目录，这是正常边界；本轮不清理任何忽略产物。

## 6. 完成条件

- [x] Git / Nx / 本机目录三份范围证据一致，明确这是残留而非有效源码包。
- [x] C1–C3 均有源码/配置或命令证据，生产旧引用与历史文字已分开判定。
- [x] Electron / Tauri / sqlite-core 的迁移边界已联审，不执行旧产物、不恢复已删除能力。
- [x] 若发现残留影响解析，按既有问题模板登记复现与影响；没有擅自清理用户文件。

正式结论按总计划的证据与严重度规则登记；证据不足时保留“未验证”，不能因看过源码、跑过 lint 或存在测试文件就给全绿。

## 7. 本轮实际执行记录

[已启动的实际入口核查、门禁、确认意见及未完成项](../results/packages/rxdb-adapter-desktop.md)。启动批为历史；本轮C1–C3已按独立残留证据核销，见下节，非整体门禁自动打勾。

## 2026-10-05：parallel integrations 残留闭环

只读取证完成原 C1–C3 和四项完成条件：[逐 C 证据与结论](../evidence/2026-10-05/parallel/integrations/desktop-closure.json)、[独立执行记录](../results/packages/rxdb-adapter-desktop.md)。有效宿主边界仅联审迁移归属；Electron/Tauri 的业务、安全、发布消费与真实 GUI 门禁仍在各自对象中保留未完成。没有执行旧产物、没有清理文件。
