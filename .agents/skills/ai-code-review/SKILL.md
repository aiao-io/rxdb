---
name: ai-code-review
description: 本仓库的持久化代码评审：按项目或分支做全量或增量评审，问题写进 requirements/reviews，可按 ID 修复、复核或提异议，不同模型能接着做。只在用户点名本 skill，或明确要求持久化 / 增量评审、处理已有 RV 问题时使用；普通看 PR、评审文档不用它。
---

# 项目 AI 代码评审

由当前 AI 会话执行，遵守目标路径适用的 AGENTS.md。快照、项目归属、必审清单、覆盖登记和问题 ID 一律用 `node scripts/ai-review/ai-review.mjs <命令>`（下称 `ai-review`），不手算指纹，不手写状态文件。评审标准与严重程度见 [references/rubric.md](references/rubric.md)。

调用写法：Codex 用 `$ai-code-review …`，Claude Code 用 `/ai-code-review …`，中文描述也可以。参数是任务约定，不是命令行程序。

## 操作与范围

| 输入                          | 操作                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `incremental` / 增量（默认）  | 只审从未覆盖或覆盖已失效的单元，有效覆盖直接继承             |
| `full` / 全量                 | 记下开始时间，只认这之后登记的覆盖，整个范围重审             |
| `fix --issue=<ID>`            | 只修这一个问题，及其必要的三框架与测试改动                   |
| `verify --issue=<ID>`         | 只核对这一个问题：修复是否有效、异议是否成立、问题是否还在   |
| `dispute --issue=<ID> <理由>` | 为这一个问题追加有证据的不修理由                             |

- `--project=a,b`：真实 Nx 项目名。默认取 `ai-review affected` 的结果，即当前快照相对默认分支改到的项目；审全仓写 `--project=all`。名字对不上就列出候选，不猜。
- `--range=project`（默认）审所选项目在快照里的全部文件；`--range=branch` 只审 merge base 以来的改动，`--base` 默认 `origin/HEAD`。
- `--branch=<ref>`：审别的分支，读冻结的 git 对象，不动当前工作区。
- `--worktree`：纳入当前检出位的未提交改动，不能与 `--branch` 同时用。默认只审提交快照，未提交改动要在回复里写明已排除。
- `--independent`：只认当前评审者自己登记的覆盖；身份未知时不能用。

```text
ai-code-review incremental
ai-code-review full --project=rxdb
ai-code-review incremental --branch=codex/feature-x --project=rxdb-angular
ai-code-review full --branch=codex/feature-x --project=rxdb --range=branch --base=origin/main
ai-code-review incremental --project=rxdb --worktree
ai-code-review full --project=rxdb --independent
ai-code-review fix --issue=RV-<id>
ai-code-review verify --issue=RV-<id>
ai-code-review dispute --issue=RV-<id> 原调用有上游约束，核对是否误报
```

## 评审流程

全量或增量评审时读 [references/review.md](references/review.md)，按它执行：

1. `ai-review snapshot` 冻结快照，之后的命令都带它给出的 SHA。
2. 没给项目就跑 `ai-review affected`，再跑 `ai-review status` 得到必审清单。
3. 先报告范围：项目、分支与快照、视图、range、待审文件数与行数、可继承的覆盖。待审超过 3 个项目或 200 个文件时，列出计划等用户确认，可以建议改用 `--range=branch` 或缩小项目。
4. 按相关文件分批审。发现问题先写记录，再用 `ai-review cover` 登记这一批实际读过的文件。
5. 重复第 4 步，直到 `status` 显示 `complete`；资源用完就停在批次边界，报告剩余范围。

评审者签名写 `<provider>/<model>`，只用会话里实际看得到的模型 ID（如 `anthropic/claude-opus-5-5`）；看不到就写 `unknown`，不编造，不拿客户端名代替。

## 单问题处理

修复、复核、异议时读 [references/issue-actions.md](references/issue-actions.md)。用 `ai-review find-issue <ID 或前缀>` 定位，多个匹配就列出候选，不任选。状态只按 [CONVENTIONS](../../../requirements/CONVENTIONS.md)「状态定义」一节的转移表改。单问题动作不登记覆盖，也不动其他问题。

## 记录与交接

- 记录描述它所在那棵树的代码：写在被评审快照的检出位，跟着 merge / cherry-pick 走，不按分支另建副本。别的分支没有检出位时，问题只在终端输出，相关文件不登记覆盖。
- 一个问题一个文件：`requirements/reviews/<key>/RV-<id>.md`。所有项目（含应用）的新问题都写在仓库根；`key` 取 `ai-review projects` 输出里的 `key`，ID 用 `ai-review new-id` 生成。模板只有 [review.template.md](../../../requirements/reviews/review.template.md) 一份。应用目录里的旧记录按原 ID 就地处理。
- 证据写成行内代码 `path:line` 并注明快照 SHA，或用带 SHA 的 GitHub 永久链接；不写指向源码的相对链接。
- 每次动作追加事件，写实际执行者与角色，不改写、不删除别人的事件。写前用 `git hash-object` 记下记录的摘要，写入前再核对，变了就重读合并。
- 评审只写记录和覆盖；改业务代码要用户下 fix 指令；提交、推送、PR 评论和额外的模型调用沿用用户现有授权。

## 交付

- 写明操作、项目、分支与快照、视图、range 与 base，以及全量 / 增量 / 独立。
- 覆盖情况：本次新审、按评审者列出的继承、skip 及理由、排除项、剩余文件数与行数。没审完就写明剩余范围；工具失败或证据不足不算通过。
- 先按 AGENTS.md「代码审查」给总评（🟢 好 / 🟡 凑合 / 🔴 垃圾），再列新增问题与处理结果，链接实际记录。待复核的旧问题和范围外线索单独列。
- 没有发现就只在回复里说明覆盖与限制，不生成「无问题」记录。
