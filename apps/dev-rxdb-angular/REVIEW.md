# `dev-rxdb-angular` 代码评审

## 结论

🔴 不通过。OPFS“重命名”会覆盖同名文件或合并同名目录，随后删除源数据；路由回退也无法恢复真实目录状态。这个版本不能把文件管理能力交给用户。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-angular` 下源码、路由、测试和 Nx 配置；153 个文件
- 自动校验：此次仅进行只读代码审查，未单独运行本项目的 `lint`、`test`、`typecheck`、`build`，不能据此判定通过
- 测试现状：15 个 spec/test 文件；缺少 OPFS 重命名冲突和浏览器历史导航的回归测试

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| ANGULAR-001 | P1 | `src/app/pages/opfs/services/opfs.service.ts:295` | `renameEntry()` 通过 `{ create: true }` 直接取得目标句柄。目标文件已存在时会被覆写，目标目录已存在时会被递归合并；复制结束后源条目又被删除。同名重命名还可能操作同一个句柄后把它删掉。一次名字冲突就能造成不可恢复的数据丢失。 | 在任何写入前拒绝空名称、原名称和已存在目标；先复制到唯一临时条目，校验完整性后再提交，失败时清理临时条目且绝不删除源。为文件、嵌套目录、同名和目标冲突补回归测试。 |
| ANGULAR-002 | P2 | `src/app/pages/opfs/opfs.page.ts:203` | 路由参数只在 `initialized` 为 `false` 时读取一次。用户使用浏览器 back/forward 后，URL 已变化但 OPFS 当前目录不变，后续“当前路径写回 URL”的 effect 还可能覆盖用户的历史导航。 | 持续监听路由路径并驱动目录状态，显式区分“路由触发”和“页面内部导航”以避免循环；补 back、forward、直接修改深层 URL 的测试。 |
| ANGULAR-003 | P2 | `src/**/*.ts` | 生产 TypeScript 约 128 行含 `any`，另有 8 处 ESLint 豁免。DOM、OPFS、实体和适配器边界失去静态契约，真实错误被压到运行时，与仓库 strict/零警告要求冲突。 | 为外部输入使用 `unknown` 并收窄，为 OPFS、实体和适配器定义明确类型；逐项删除 ESLint 豁免，禁止用断言或新豁免掩盖错误。 |

## 其余观察 / 测试缺口

- 页面覆盖面不算小，但没有测试“目标已存在时源和目标都不得损坏”这一条最基本的数据完整性契约。
- URL 与目录状态形成双向同步，却没有定义唯一状态源；只测首次进入页面无法发现历史导航问题。
- 当前 `boolean` 返回值只能表达成败，无法区分名称冲突、权限失败和复制中断，UI 很难给出可操作反馈。

## 验收条件

- 文件和目录重命名必须拒绝同名及目标冲突；任意复制/写入失败后，源数据完整且目标无半成品。
- 增加 OPFS 文件、嵌套目录、冲突、失败回滚，以及浏览器 back/forward 的自动化测试。
- 清除生产代码中的 `any` 和 ESLint 豁免，修复后执行 `pnpm nx lint dev-rxdb-angular`、`pnpm nx test dev-rxdb-angular`、`pnpm nx typecheck dev-rxdb-angular`、`pnpm nx build dev-rxdb-angular`。
