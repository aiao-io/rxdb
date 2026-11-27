# 废纸篓重设计

日期：2026-11-20

关联故事：[ADESK-US-110 Finder 文件管理与废纸篓恢复](../stories/desktop/ADESK-US-110-file-management.md)

## 目标

把废纸篓变成 Finder、桌面、Dock 和本地磁盘共用的一条文件生命周期。用户从任何桌面文件入口删除内容时，内容先进入 `~/.Trash`，只有显式确认 Empty Trash 后才永久删除。

交互按 macOS 的核心习惯收敛到以下行为。

- 删除动作立即让原目录消失，文件体和目录树进入 `~/.Trash`。
- Dock 的废纸篓图标根据真实条目显示为空或装满。
- Finder 打开 Trash 时显示条目、数量和 Empty Trash 按钮。
- Empty Trash 需要 alertdialog 确认。Cancel 保留内容，确认后删除元数据和文件体。
- Trash 条目支持 Put Back 和 Restore to Folder。原位置失效时要求用户明确选择目录，冲突时保留两份。
- Finder 和桌面支持 `⌘Backspace` 与 `⌘Delete`。Trash 内的条目不能再次移入 Trash。
- Spotlight 只把用户带到 Trash 视图，永久删除仍从 Finder 的确认入口完成。

## 数据模型与边界

| 层         | 方案                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| 磁盘位置   | `TRASH` 映射到用户主目录下的 `.Trash`                                             |
| 移入       | `FileSystem.moveToTrash` 在独占磁盘锁内选择唯一名称后移动，底层保留 `movedOrigin` |
| 恢复       | `FileSystem.restore` 只允许处理 Trash 顶层条目，自动恢复原目录或接受明确目录      |
| 清倒       | `FileSystem.emptyTrash` 在独占磁盘锁内逐项永久删除，并通过 `changes` 通知同步层   |
| 状态       | `FileSystem.trashFull` 由实时目录树计算，Dock 与 Finder 共用                      |
| 受保护内容 | 系统路径和预装应用由同一保护策略拒绝移入和永久删除                                |
| 同步       | Finder、桌面、Dock、多标签页和终端使用同一活查询及路径变更通知                    |

## 代码切片

- `services/file-system.ts` 负责移入、恢复、清倒和满状态。
- `apps/finder/finder.ts` 与 `finder.html` 提供 Trash 视图、Empty Trash、Put Back、Restore to Folder 和快捷键。
- `components/desktop-surface.ts` 让桌面图标复用 `moveToTrash`。
- `components/dock.ts` 与 `dock.html` 提供满状态图标和确认入口。
- `components/empty-trash-dialog.ts` 提供全局层级的不可逆操作确认。
- `components/overlays/spotlight.ts` 避免绕过确认直接永久删除。
- `apps/e2e/src/groups/file-management.mjs` 验收用户文件的完整生命周期。
- `apps/e2e/src/groups/applications-protection.mjs` 验收预装应用保护与清倒边界。

## 验收切片

| 切片                               | 验收结果                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| 普通文件通过菜单和快捷键进入 Trash | 已通过 `fileManagement.trashShortcutMovesItem` 和文件管理既有移动用例                     |
| Finder 显示 Empty Trash 和数量     | 已通过 `fileManagement.emptyTrashRequiresConfirmation`                                    |
| Cancel 不删除，确认后永久删除      | 已通过 `fileManagement.emptyTrashRequiresConfirmation`                                    |
| Dock 空满图标反映真实内容          | 已通过文件管理组和 `applicationsProtection.trashArtworkReflectsContents`                  |
| Put Back 与 Restore to Folder      | 已通过既有恢复用例                                                                        |
| 受保护应用不能被删除               | 已通过 `applicationsProtection.finderRefusesMoveToTrash`、`emptyTrashCannotRemovePackage` |
| 单测与构建门禁                     | 95 条定向单测、lint、typecheck、正式构建通过                                              |

## 后续边界

永久删除后的数据恢复不属于废纸篓能力。完整备份和存储故障恢复继续由 ADESK-US-111 负责。真实 VoiceOver 播报仍按 ADESK-US-108 的人工验收计划执行。
