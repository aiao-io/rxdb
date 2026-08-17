# AI Review 规则与记录

这个目录集中存放**给 AI 做代码 review 用的规则/检查清单**，以及 review 过程中产出的结论记录。

## 用途

- **规则文件**：告诉 AI「review 时看什么、按什么标准判」的 md 文件
- **结论记录**：某次 review 发现的问题 + 根因 + 修复方案，修复后标记解决

## 目录结构

| 文件                                                    | 说明                                                         | 状态   |
| ------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| `README.md`                                             | 本说明与状态约定                                             | —      |
| `review.template.md`                                    | 新建 review 记录的模板                                       | —      |
| [RV-001-desktop-host-runtime-validation-not-enforced.md](./RV-001-desktop-host-runtime-validation-not-enforced.md) | Desktop adapter（Electron / Tauri）发布面问题集（8 项） | Open   |
| [RV-002-desktop-sqlite-任意-sql-可越出应用目录.md](./RV-002-desktop-sqlite-任意-sql-可越出应用目录.md) | Desktop SQLite 任意 SQL 可越出应用目录 | Open   |
| [RV-003-协议握手在建库后执行.md](./RV-003-协议握手在建库后执行.md) | 协议握手在建库后执行 | Open   |
| [RV-004-tauri-会话未绑定窗口.md](./RV-004-tauri-会话未绑定窗口.md) | Tauri 会话未绑定窗口 | Open   |
| [RV-005-tauri-事件订阅未纳入连接握手.md](./RV-005-tauri-事件订阅未纳入连接握手.md) | Tauri 事件订阅未纳入连接握手 | Open   |
| [RV-006-并发-disconnect-提前返回.md](./RV-006-并发-disconnect-提前返回.md) | 并发 `disconnect()` 提前返回 | Open   |

## 状态约定

见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)。

## 工作流

1. AI review 发现问题 → 从 `review.template.md` 复制出 `RV-XXX-描述.md`，`status: Open`
2. 开 PR 修复 → 在 `pr` 字段记录 PR 链接
3. PR 合并、修复完成 → `status: Resolved`，补 `updated` 日期

## 命名规范

见 [../CONVENTIONS.md](../CONVENTIONS.md#命名规范)。`RV-XXX-描述.md`，编号 `RV-001` 起递增。
