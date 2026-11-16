import { tx } from './translate.js';
import type { Command, PullRequest, Records, Resolution } from '../model.js';
import { canonical, mergeRecords } from '../records.js';
import type { CollaborationController } from './controller.js';
import { readOnlyRecords } from './editor.js';
import { button, checkbox, element, input, row, section, select, valueText, type Perform } from './elements.js';
export class PullRequestView {
  selected: string | null = null;
  selectedRecord: string | null = null;
  filter = 'all';
  tab: 'discussion' | 'commits' | 'changes' | 'checks' = 'changes';
  focusThread: string | null = null;
  constructor(
    private readonly controller: CollaborationController,
    private readonly perform: Perform,
    private readonly render: () => void
  ) {}
  view() {
    const view = section('数据 PR');
    const data = this.controller.snapshot!;
    const user = this.controller.user!;
    const list = row();
    data.prs.forEach(pr =>
      list.append(
        button(`${pr.title} · ${pr.status}`, () => {
          this.selected = pr.id;
          this.selectedRecord = null;
          this.render();
        })
      )
    );
    view.append(list);
    if (this.controller.draft && this.controller.draft.remoteHead && this.has('edit')) {
      const title = input('PR 标题', this.controller.draft.name);
      const task = this.controller.draft;
      view.append(
        element('p', tx("审核来源为远端版本 {v0}；本机未保存、未提交或排队内容不会自动纳入。", { v0: task.remoteHead }), 'text-sm'),
        title.wrapper,
        button('创建 PR', () =>
          this.perform(async () => {
            const id = crypto.randomUUID();
            await this.controller.run({ type: 'pr', id, title: title.control.value, taskId: task.context.taskId });
            this.selected = id;
          })
        )
      );
    }
    const pr = data.prs.find(item => item.id === this.selected);
    if (!pr) return view;
    view.append(
      element('h3', pr.title, 'font-semibold', true),
      element('p', tx("修订 {v0} · 作者 {v1}", { v0: pr.revision, v1: pr.authorId }), 'text-sm break-all')
    );
    const actions = row();
    const canManage = (pr.authorId === user.id && this.has('edit')) || this.has('merge');
    if (canManage && pr.status !== 'merged')
      actions.append(
        ...(['review', 'draft', 'closed'] as const)
          .filter(status => status !== pr.status)
          .map(status =>
            button({ review: '请求审核', draft: '重开为草稿', closed: '关闭 PR' }[status], () =>
              this.run({ type: 'pr_state', prId: pr.id, status, expectedRevision: pr.revision })
            )
          )
      );
    actions.append(
      button(pr.subscribers.includes(user.id) ? tx('取消订阅') : tx('订阅通知'), () =>
        this.run({ type: 'subscribe', prId: pr.id, subscribed: !pr.subscribers.includes(user.id) })
      )
    );
    view.append(actions);
    const tabs = element('div', '', 'tabs tabs-box');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', tx('PR 详情'));
    const labels = { discussion: '讨论', commits: '提交', changes: '数据变更', checks: '检查' } as const;
    for (const id of Object.keys(labels) as (keyof typeof labels)[]) {
      const tab = button(labels[id], () => { this.tab = id; this.render(); });
      tab.id = `pr-tab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(this.tab === id));
      tab.setAttribute('aria-controls', 'pr-panel');
      tabs.append(tab);
    }
    view.append(tabs);
    const panel = element('div', '', 'space-y-4');
    panel.id = 'pr-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `pr-tab-${this.tab}`);
    if (this.tab === 'discussion') panel.append(this.discussions(pr));
    if (this.tab === 'commits') panel.append(this.commits(pr));
    if (this.tab === 'changes' && canManage && !['closed', 'merged'].includes(pr.status)) panel.append(this.previewControls(pr));
    if (this.tab === 'changes' && !pr.candidateId) {
      const task = data.tasks.find(value => value.id === pr.taskId)!;
      panel.append(element('p', '来源提交变化（尚未形成最终候选）'), diffTable(task.base ? data.commits[task.base].records : {}, task.head ? data.commits[task.head].records : {}));
    }
    if (['changes', 'checks'].includes(this.tab) && pr.candidateId) panel.append(this.candidate(pr));
    if (this.tab === 'checks' && !pr.candidateId) panel.append(element('p', '尚未生成最终候选，检查未通过'));
    view.append(panel);
    return view;
  }
  private commits(pr: PullRequest) {
    const data = this.controller.snapshot!;
    const view = section('提交历史');
    const task = data.tasks.find(value => value.id === pr.taskId)!;
    let head = task.head;
    while (head && head !== task.base) {
      const commit = data.commits[head];
      const item = element('details');
      item.append(element('summary', `${commit.message} · ${commit.authorId} · ${commit.id}`, '', true));
      item.append(element('p', tx('父提交：{v0}', { v0: commit.parent ?? tx('空') })), readOnlyRecords(commit.records));
      view.append(item);
      head = commit.parent;
    }
    const history = element('details');
    history.append(element('summary', '历史候选与审核'));
    Object.values(data.candidates)
      .filter(c => c.prId === pr.id)
      .forEach(c => {
        const item = element('details');
        item.append(element('summary', tx("{v0} · 策略 v{v1}", { v0: c.id, v1: c.policyVersion })), readOnlyRecords(c.records));
        data.reviews
          .filter(r => r.candidateId === c.id)
          .forEach(r => item.append(element('p', `${r.reviewerId} · ${r.decision} · ${r.reason}`)));
        history.append(item);
      });
    view.append(history);
    return view;
  }
  private run(command: Omit<Command, 'operationId'> | Record<string, unknown>) {
    return this.perform(() => this.controller.run(command));
  }
  private has(permission: string) {
    return (
      this.controller.snapshot?.members
        .find(member => member.id === this.controller.user?.id)
        ?.permissions.some(item => item === permission) ?? false
    );
  }
  private previewControls(pr: PullRequest) {
    const view = section('三方合并预览');
    const data = this.controller.snapshot!;
    const task = data.tasks.find(t => t.id === pr.taskId)!;
    const source = task.head ? data.commits[task.head].records : {};
    const base = task.base ? data.commits[task.base].records : {};
    const preview = mergeRecords(base, source, data.records, []);
    const selections: (() => Resolution | null)[] = [];
    view.append(
      element(
        'p',
        tx("共同起点 B：{v0} · 来源 S：{v1} · 目标 T：{v2}", { v0: task.base ?? '空', v1: task.head ?? '空', v2: data.head ?? '空' }),
        'text-xs break-all'
      )
    );
    for (const conflict of preview.conflicts) {
      const field = section(tx("冲突：{v0} / {v1}", { v0: conflict.recordId, v1: conflict.field ?? '整条记录' }));
      field.append(
        element('p', tx("起点：{v0}", { v0: valueText(conflict.base) })),
        element('p', tx("来源：{v0}", { v0: valueText(conflict.source) })),
        element('p', tx("目标：{v0}", { v0: valueText(conflict.target) }))
      );
      const existing =
        pr.candidateId ? data.candidates[pr.candidateId].resolutions.find(r => r.key === conflict.key) : undefined;
      const choice = select(
        '冲突处理',
        [
          { value: '', label: tx('待处理') },
          { value: 'source', label: tx('采用来源') },
          { value: 'target', label: tx('保留目标') },
          { value: 'custom', label: tx('自定义') }
        ],
        existing?.choice ?? ''
      );
      const custom = input(
        '自定义结果（JSON 值）',
        existing?.choice === 'custom' ? JSON.stringify(existing.value) : ''
      );
      field.append(choice.wrapper, custom.wrapper);
      view.append(field);
      choice.control.dataset['formKey'] = `resolution:${pr.id}:${task.head}:${data.head}:${conflict.key}`;
      custom.control.dataset['formKey'] = `custom:${pr.id}:${task.head}:${data.head}:${conflict.key}`;
      selections.push(() =>
        choice.control.value ?
          {
            key: conflict.key,
            choice: choice.control.value as Resolution['choice'],
            ...(choice.control.value === 'custom' ? { value: JSON.parse(custom.control.value) } : {})
          }
        : null
      );
    }
    view.append(
      button('生成合并候选并检查', () =>
        this.run({
          type: 'candidate',
          prId: pr.id,
          expectedRevision: pr.revision,
          resolutions: selections.map(read => read()).filter(value => value !== null)
        })
      )
    );
    return view;
  }
  private candidate(pr: PullRequest) {
    const data = this.controller.snapshot!;
    const candidate = data.candidates[pr.candidateId!];
    const view = section('最终合并候选');
    const task = data.tasks.find(t => t.id === pr.taskId)!;
    const current =
      candidate.source === task.head &&
      candidate.target === data.head &&
      candidate.policyVersion === data.policy.version && candidate.schemaVersion === data.schemaVersion;
    view.append(
      element(
        'p',
        tx("候选 {v0} · 策略 v{v1} · {v2}", { v0: candidate.id, v1: candidate.policyVersion, v2: current ? tx('当前版本') : tx('已过期，必须重新生成并审核') }),
        'text-sm break-all'
      )
    );
    view.append(element('p', tx("未解决冲突：{v0} · 检查错误：{v1}", { v0: candidate.conflicts.length, v1: candidate.checks.length })));
    if (this.tab === 'checks') candidate.checks.forEach(check =>
      view.append(element('p', `${check.recordId} / ${check.field}：${tx(check.message)}`, 'text-error'))
    );
    const target = candidate.target ? data.commits[candidate.target].records : {};
    if (this.tab === 'changes') view.append(diffTable(target, candidate.records));
    const recordNavigation = row();
    Object.keys({ ...target, ...candidate.records }).forEach(id =>
      recordNavigation.append(
        button(tx("查看记录 {v0}", { v0: id }), () => {
          this.selectedRecord = id;
          this.render();
        })
      )
    );
    view.append(recordNavigation);
    if (this.selectedRecord) view.append(element('p', tx("当前查看记录：{v0}", { v0: this.selectedRecord })));
    const details = element('details');
    details.append(element('summary', '查看最终完整数据'), readOnlyRecords(candidate.records));
    view.append(details);
    const governance = data.governance.find(g => g.prId === pr.id);
    governance?.stages.forEach(stage =>
      view.append(
        element('p', `${stage.name}：${stage.approved}/${stage.minimum} ${stage.complete ? tx('已满足') : tx('待批准')}`)
      )
    );
    const reason = input('审核或撤销理由');
    view.append(reason.wrapper);
    governance?.blockers.forEach(blocker => {
      view.append(element('p', tx("要求修改：{v0} — {v1}", { v0: blocker.reviewerId, v1: blocker.reason }), 'text-error'));
      if (this.has('manage') && this.has('review'))
        view.append(
          button('撤销此阻塞意见', () =>
            this.run({
              type: 'dismiss',
              prId: pr.id,
              reviewerId: blocker.reviewerId,
              expectedRevision: this.reviewRevision(pr.id, blocker.reviewerId),
              reason: reason.control.value
            })
          )
        );
    });
    const actions = row();
    if (this.has('review') && pr.authorId !== this.controller.user!.id && pr.status === 'review') {
      const stage = select(
        '审批阶段',
        data.policy.stages
          .filter(s => !s.reviewers.length || s.reviewers.includes(this.controller.user!.id))
          .map(s => ({ value: s.id, label: s.name })),
        data.policy.stages[0]?.id ?? 'review'
      );
      actions.append(stage.wrapper);
      const review = (decision: 'approve' | 'request_changes') =>
        this.run({
          type: 'review',
          prId: pr.id,
          candidateId: candidate.id,
          stageId: stage.control.value || 'review',
          decision,
          reason: reason.control.value,
          expectedRevision: this.reviewRevision(pr.id, this.controller.user!.id)
        });
      actions.append(
        button(
          '批准当前候选',
          () => review('approve'),
          !current ||
            !!candidate.checks.length ||
            !!candidate.conflicts.length ||
            (data.policy.stages.length > 0 && !stage.control.value)
        ),
        button('要求修改', () => review('request_changes'), !current)
      );
    }
    if (this.has('merge') && pr.status === 'review')
      actions.append(
        button(
          '合并到共享数据',
          () =>
            this.run({
              type: 'merge',
              prId: pr.id,
              candidateId: candidate.id,
              expectedSource: candidate.source,
              expectedTarget: candidate.target
            }),
          !current
        )
      );
    view.append(actions);
    return view;
  }
  private reviewRevision(prId: string, userId: string) {
    return this.controller
      .snapshot!.reviews.filter(
        r => r.prId === prId && (r.decision === 'dismiss' ? r.dismissedReviewerId === userId : r.reviewerId === userId)
      )
      .reduce((n, r) => Math.max(n, r.revision), 0);
  }
  private discussions(pr: PullRequest) {
    const view = section('讨论');
    const data = this.controller.snapshot!;
    const userId = this.controller.user!.id;
    const filter = select(
      '讨论筛选',
      [
        { value: 'all', label: tx('全部') },
        { value: 'required', label: tx('必须处理') },
        { value: 'open', label: tx('未解决') },
        { value: 'mine', label: tx('我参与的') },
        { value: 'current', label: tx('当前版本') }
      ],
      this.filter
    );
    filter.control.onchange = () => {
      this.filter = filter.control.value;
      this.render();
    };
    view.append(filter.wrapper);
    const visible = data.threads.filter(
      t =>
        t.prId === pr.id &&
        (this.filter !== 'required' || t.required) &&
        (this.filter !== 'open' || !t.resolved) &&
        (this.filter !== 'mine' || t.comments.some(c => c.authorId === userId)) &&
        (this.filter !== 'current' || t.candidateId === pr.candidateId)
    );
    visible.forEach(thread => {
      const box = section(
        `${thread.required ? tx('必须处理 · ') : ''}${thread.resolved ? tx('已解决') : tx('未解决')} · ${thread.candidateId === pr.candidateId ? tx('当前版本') : tx('历史位置')}`
      );
      box.id = `thread-${thread.id}`;
      box.append(element('p', [thread.recordId, thread.field].filter(Boolean).join(' / '), 'text-xs'));
      thread.comments.forEach(comment => {
        box.append(element('p', `${comment.authorId}：${comment.deleted ? tx('评论已删除') : comment.body}`));
        if (
          comment.authorId !== userId ||
          comment.deleted ||
          !this.has('comment') ||
          ['closed', 'merged'].includes(pr.status)
        )
          return;
        const edit = input('编辑我的评论', comment.body);
        box.append(
          edit.wrapper,
          button('保存评论', () =>
            this.run({
              type: 'edit_comment',
              threadId: thread.id,
              commentId: comment.id,
              body: edit.control.value,
              deleted: false,
              expectedRevision: comment.revision
            })
          ),
          button('删除评论', () =>
            this.run({
              type: 'edit_comment',
              threadId: thread.id,
              commentId: comment.id,
              body: '',
              deleted: true,
              expectedRevision: comment.revision
            })
          )
        );
      });
      if (this.has('comment') && !['closed', 'merged'].includes(pr.status)) {
        const reply = input('回复');
        box.append(
          reply.wrapper,
          button('发送回复', () =>
            this.run({ type: 'reply', threadId: thread.id, body: reply.control.value, mentions: [] })
          ),
          button(thread.resolved ? tx('重新打开讨论') : tx('标记已解决'), () =>
            this.run({
              type: 'resolve_thread',
              threadId: thread.id,
              resolved: !thread.resolved,
              expectedRevision: thread.revision
            })
          )
        );
      }
      view.append(box);
    });
    if (!this.has('comment') || ['closed', 'merged'].includes(pr.status)) return view;
    const body = input('新评论');
    const record = input('记录标识（留空为 PR 讨论）');
    const field = input('字段名（可选）');
    const required = checkbox('必须处理');
    const mention = select('提及成员', [
      { value: '', label: tx('不提及') },
      ...data.members.map(m => ({ value: m.id, label: m.email }))
    ]);
    view.append(body.wrapper, record.wrapper, field.wrapper, mention.wrapper);
    if (this.has('review') || this.has('merge')) view.append(required.wrapper);
    view.append(
      button('发表评论', () =>
        this.run({
          type: 'thread',
          id: crypto.randomUUID(),
          prId: pr.id,
          candidateId: pr.candidateId,
          recordId: record.control.value || null,
          field: field.control.value || null,
          body: body.control.value,
          required: required.control.checked,
          mentions: mention.control.value ? [mention.control.value] : []
        })
      )
    );
    return view;
  }
}
function appendDiff(
  table: HTMLTableElement,
  id: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  kind: string
) {
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonical(before[field]) === canonical(after[field])) continue;
    const tr = element('tr');
    [kind, id, field, valueText(before[field]), valueText(after[field])].forEach(text => tr.append(element('td', text)));
    table.append(tr);
  }
}

function diffTable(before: Records, after: Records): HTMLTableElement {
  const table = element('table', '', 'table table-sm');
  const head = element('thead'); const labels = element('tr');
  ['变更类型', '记录', '字段', '合并前', '合并后'].forEach(label => labels.append(element('th', label)));
  head.append(labels); table.append(head);
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const kind = !before[id] ? tx('新增') : !after[id] ? tx('删除') : tx('修改');
    appendDiff(table, id, before[id]?.fields ?? {}, after[id]?.fields ?? {}, kind);
  }
  return table;
}
