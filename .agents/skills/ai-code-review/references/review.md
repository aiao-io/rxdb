# 全量与增量评审执行

下文 `ai-review` 指 `node scripts/ai-review/ai-review.mjs`，输出都是 JSON。

## 冻结快照

- 当前检出位：`ai-review snapshot`。记下 `commit` 与 `tree`，后续命令都带 `--rev <commit>`。
- 未提交改动：`ai-review snapshot --worktree`，后续命令再加 `--tree <tree>`。
- 别的分支：`ai-review snapshot --rev <ref>`。要写记录，就到 `git worktree list` 里检出了该分支的检出位去运行；没有这样的检出位，问题只在终端输出。
- 内容一律从快照读：`git show <commit 或 tree>:<path>`。提交视图下 `dirty` 为空时，直接读工作区文件也一样；不为空就说明工作区与提交不同，回复里写明这些未提交改动已排除。
- 项目归属读的是快照里的 `project.json`，审别的分支拿到的就是那条分支的项目图。`ai-review projects` 列出项目名、root 和记录目录 `key`。

## 选范围、报计划

1. 没给 `--project` 时，跑 `ai-review affected --rev <commit>`（工作区视图加 `--tree`）。
2. 跑 `ai-review status --rev <commit> --project <a,b>`，分支差异再加 `--range branch --base <ref>`：
   - 全量：加 `--since <开始时间>`，开始前用 `date -u +%Y-%m-%dT%H:%M:%SZ` 取时间；
   - 独立复审：加 `--independent=<签名>`。
3. 用 `required`、`outstanding`、`outstandingLines`、`reviewers`（可继承的覆盖来自谁）和 `excluded` 报告范围。超过 3 个项目或 200 个待审文件时，先列计划等确认。
4. 根项目 `@aiao/source` 的 root 是 `.`，包含 requirements、scripts、workflow 等所有不属于其他项目的文件；选它之前先说明这一点。

## 读与审

- 从 `outstandingPaths` 取一批相关文件，例如同一模块、同一入口及其测试；`--limit` 调整列出的条数。
- 每个单元读完整文件，再按需读上下文：调用者、测试、公共语义变化影响到的消费者、Angular / React / Vue 对应绑定、共享 conformance 套件的全部后端入口。
- `range=branch` 的单元有新旧两侧：用 `git show <mergeBase>:<path>` 读旧版本；删除的文件要核对还有谁在引用它。
- 按 [rubric.md](rubric.md) 判定。需要补读就先补证据，不能只凭 diff 或名称下结论。
- `invalid` 列出的单元以前审过，但上下文变了或引用的记录不见了，照常重审。

## 记录发现

- 新建前先在 `requirements/reviews/<key>/` 里 grep `anchors` 查重。同一棵树里已有同根因的记录，就追加一个发现事件，不另建文件。
- 新问题用 `ai-review new-id` 取 ID，按 [review.template.md](../../../../requirements/reviews/review.template.md) 写到 `requirements/reviews/<key>/RV-<id>.md`（可加 `-<英文 slug>`），`found_*` 字段填本次的快照与范围。
- 跨项目问题归到根因所在项目，受影响的项目写进 `affected_projects`。根因不在本次范围时只在终端说明线索。
- 重审一个文件时，grep 其所属项目记录的 `anchors`，找出涉及它的旧问题：
  - 仍成立的，在终端注明；
  - 已经消失的，列为「待 verify」，不在评审里改状态；
  - 已关闭又复发的，追加 review 事件并重开为 `Open`。

## 登记覆盖

每审完一批就登记，不要攒到最后。输入写成 JSON 文件：

```json
{
  "reviewer": "anthropic/claude-opus-5-5",
  "session": "unknown",
  "units": [
    { "path": "packages/rxdb/src/a.ts", "context": ["packages/rxdb/src/b.ts"], "findings": [] },
    { "path": "packages/rxdb/src/generated.ts", "skip": "生成物，改生成源头" }
  ]
}
```

然后运行 `ai-review cover --rev <commit> --project <a,b> --input <文件>`，范围参数（`--range`、`--base`、`--tree`）与 `status` 保持一致。

- `units` 只写这一批实际读过的文件；`context` 写判断它时依赖的其他文件；`findings` 写它产出或确认仍成立的记录 ID，这些记录必须已经写在工作区。
- 不审的文件写 `skip` 和理由（生成物、纯数据等），结果里会单独列出。不能为了凑完成，把没读的文件登记成已审。
- 脚本会拒绝范围外的路径、不存在的上下文和找不到的记录。

## 覆盖的含义

- 单元按内容标识：评审标准摘要、range、路径、新旧两侧 blob。只要上下文文件的 blob 没变、引用的记录还在，覆盖就有效。
- 与提交历史无关：rebase、force push、base 前移之后，只有内容真正变了的单元要重审；中断后再跑 `status`，得到的就是续跑清单。
- 改了 [rubric.md](rubric.md)，全部覆盖都会失效。
- 默认接续可以继承任何评审者的有效覆盖；来源看 `reviewers`，回复里如实写，不能说成当前模型重新审过。
- 状态存在 `<git common dir>/ai-review/v1/coverage.jsonl`，同一仓库的所有 worktree 共享，只追加、不改写。

## 完成与中断

- `complete: true` 才能说这个范围审完了。多个项目要逐个看 `byProject`，单个项目审完不代表整个请求审完。
- 完成与否和有没有未关闭问题分开说：范围审完了，仍可以有 `Open` 或 `Disputed` 的问题。
- 用户没给预算时，按批次持续执行并报告进度；资源用完就停在批次边界，报告剩余清单，不缩小范围凑出「已完成」。
