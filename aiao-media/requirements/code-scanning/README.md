# Code Scanning 告警跟踪

> 数据源：GitHub CodeQL（[aiao-io/aiao-media → Security → Code scanning](https://github.com/aiao-io/aiao-media/security/code-scanning)）。
> 本目录是**工作集，不是档案库**：只有 GitHub 上还 `open`、或本地处置尚未落地的告警才保留文件，一条告警一个文件。

## 生命周期

GitHub 上显示 `fixed` / `dismissed` 之后，**在下一次同步时删除对应文件**，处置结论写进下方「归档」表。

- 本地文件存在的唯一理由：这条告警还需要动作（修 / dismiss / 等 GitHub 状态翻转）。
- GitHub 已关闭的告警不留本地镜像——历史看归档表，细节看 GitHub 页面。
- 状态取值见 [../CONVENTIONS.md](../CONVENTIONS.md#状态定义)，本地 frontmatter 是跟踪状态，GitHub 是真相源。

## 增量同步流程

每次同步只处理与上次的差异，按 GitHub 告警 `number` 对齐，不重建全量：

1. 拉当前清单（open + closed，靠 `state` 区分）：

   ```bash
   gh api "repos/aiao-io/aiao-media/code-scanning/alerts?per_page=100&tool_name=CodeQL" \
     --jq '.[] | "\(.number)\t\(.state)\t\(.rule.id)\t\(.created_at)"'
   ```

2. 按 `number` 与本地文件对齐：
   - GitHub `open` 且本地无文件 → 按[模板](code-scanning.template.md)建文件。
   - GitHub `open` 且本地有文件 → 无需动作；路径 / 行号变了就更新 frontmatter。
   - GitHub `fixed` / `dismissed` 且本地有文件 → 归档表补一行，然后**删除文件**。
   - 本地有文件但 GitHub 清单里没有该编号 → 直接删除。
3. 更新本文件头部「最近分析」commit 与时间。

**同步时机**：修复 PR 合入 `main`、GitHub 重新分析完成之后；或收到 code scanning 通知时。不用定时跑。

## 判定规则

一条告警值不值得改，先看它落在哪一侧的信任边界：

| 位置                  | 默认处置                                                          |
| :-------------------- | :---------------------------------------------------------------- |
| 对外发布的源码        | **修**。入参由下游使用者提供，我们控制不了，也没资格假设它温和    |
| 仓库内脚本 / 测试夹具 | **仅当同时消掉一个真缺陷时才修**，否则 Dismiss 并写清信任边界理由 |

## 归档

### （暂无）

## 当前工作集

| 文件   | 规则 | 位置 | 状态 |
| :----- | :--- | :--- | :--- |
| （无） |      |      |      |
