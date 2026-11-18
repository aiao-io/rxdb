import { reviewRevision } from '../approval.js';
import type { Command, PullRequest, PullRequestDetail, Records, Resolution, Task, Thread } from '../model.js';
import { mergeRecords } from '../records.js';
import { systemFieldOf } from '../schema.js';
import type { CollaborationController } from './controller.js';
import { diffTable } from './diff-table.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import { readOnlyRecords } from './records-view.js';
import {
  button,
  checkbox,
  element,
  input,
  loading,
  row,
  section,
  select,
  valueText,
  type Perform
} from './elements.js';
import { readResolution } from './resolution-input.js';
import { tx } from './translate.js';
export class PullRequestView {
  selected: string | null = null;
  selectedRecord: string | null = null;
  filter = 'all';
  tab: 'discussion' | 'commits' | 'changes' | 'checks' = 'changes';
  focusThread: string | null = null;
  /**
   * @param controller 提供团队页、PR 详情与按需读取的内容；内容未加载时同步读取返回 undefined，视图先显示占位。
   * @param perform 统一的执行入口，负责忙碌状态与错误提示。
   * @param render 请求重绘整个页面。
   * @param disclosures 内容较大的 details 的展开状态：只在展开时生成并加载内容。
   */
  constructor(
    private readonly controller: CollaborationController,
    private readonly perform: Perform,
    private readonly render: () => void,
    private readonly disclosures: Disclosures
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
    if (data.earlier.prs)
      list.append(button('加载更早的 PR', () => this.perform(() => this.controller.loadEarlierPrs())));
    view.append(list);
    // 任务已有同步到服务端的提交时才可建 PR；远端头还是共享分支根，就是从空分支起步、一次都没同步过
    if (this.controller.task && this.controller.task.remoteHead !== data.root && this.has('edit')) {
      const title = input('PR 标题', this.controller.task.name);
      const task = this.controller.task;
      const description = input('PR 说明');
      const target = select('目标分支', [{ value: 'shared', label: tx('团队共享分支') }], 'shared');
      view.append(
        element(
          'p',
          tx('审核来源为远端版本 {v0}；本机未保存、未提交或排队内容不会自动纳入。', { v0: task.remoteHead }),
          'text-sm'
        ),
        title.wrapper,
        description.wrapper,
        target.wrapper,
        button('创建 PR', () =>
          this.perform(async () => {
            const id = crypto.randomUUID();
            await this.controller.run({
              type: 'pr',
              id,
              title: title.control.value,
              description: description.control.value,
              target: target.control.value,
              taskId: task.context.taskId
            });
            this.selected = id;
          })
        )
      );
    }
    const pr = data.prs.find(item => item.id === this.selected);
    if (!pr) return view;
    view.append(
      element('h3', pr.title, 'font-semibold', true),
      element('p', pr.description, '', true),
      element('p', tx('目标分支：{v0}', { v0: tx('团队共享分支') })),
      element('p', tx('修订 {v0} · 作者 {v1}', { v0: pr.revision, v1: pr.authorId }), 'text-sm break-all')
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
      const tab = button(labels[id], () => {
        this.tab = id;
        this.render();
      });
      tab.id = `pr-tab-${id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(this.tab === id));
      tab.setAttribute('aria-controls', 'pr-panel');
      tab.tabIndex = this.tab === id ? 0 : -1;
      tab.addEventListener('keydown', event => {
        const order = Object.keys(labels) as (keyof typeof labels)[];
        const position = order.indexOf(id);
        const next =
          event.key === 'ArrowRight' ? (position + 1) % order.length
          : event.key === 'ArrowLeft' ? (position + order.length - 1) % order.length
          : event.key === 'Home' ? 0
          : event.key === 'End' ? order.length - 1
          : -1;
        if (next < 0) return;
        event.preventDefault();
        this.tab = order[next];
        this.render();
        document.getElementById(`pr-tab-${this.tab}`)?.focus();
      });
      tabs.append(tab);
    }
    view.append(tabs);
    const panel = element('div', '', 'space-y-4');
    panel.id = 'pr-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `pr-tab-${this.tab}`);
    // 候选、审核与讨论是 PR 详情，打开 PR 时才读取；读到之前各页签先显示占位
    const detail = this.controller.prDetail(pr.id);
    if (!detail) {
      panel.append(loading());
      view.append(panel);
      return view;
    }
    if (this.tab === 'discussion') panel.append(this.discussions(pr, detail));
    if (this.tab === 'commits') panel.append(this.commits(pr, detail));
    if (this.tab === 'changes' && canManage && !['closed', 'merged'].includes(pr.status))
      panel.append(this.previewControls(pr, detail));
    if (this.tab === 'changes' && !pr.candidateId) {
      const task = data.tasks.find(value => value.id === pr.taskId)!;
      panel.append(element('p', '来源提交变化（尚未形成最终候选）'), this.sourceChanges(task));
    }
    if (['changes', 'checks'].includes(this.tab) && pr.candidateId) panel.append(this.candidate(pr, detail));
    if (this.tab === 'checks' && !pr.candidateId) panel.append(element('p', '尚未生成最终候选，检查未通过'));
    view.append(panel, this.reviewControls(pr, detail));
    return view;
  }
  /** 「提交」页签：按 PR 分页读取来源任务在起点之后的提交，从新到旧列出，末尾可加载更早的提交；之后是历史候选。 */
  private commits(pr: PullRequest, detail: PullRequestDetail) {
    const view = section('提交历史');
    const branch = { prId: pr.id };
    const history = this.controller.commitHistory(branch);
    if (!history) view.append(loading());
    for (const commit of history?.commits ?? []) {
      const { details, open } = lazyDetails(`source-commit:${commit.id}`, this.disclosures);
      details.append(
        element('summary', `${commit.message} · ${commit.authorId} · ${commit.id}`, '', true),
        element('p', tx('父提交：{v0}', { v0: this.versionText(commit.parentIds[0]) }))
      );
      if (open) details.append(this.commitRecords(commit.id));
      view.append(details);
    }
    if (history?.hasEarlier)
      view.append(button('加载更早的提交', () => this.perform(() => this.controller.loadEarlierCommits(branch))));
    view.append(this.candidateHistory(pr, detail));
    return view;
  }
  private candidateHistory(pr: PullRequest, detail: PullRequestDetail) {
    const { details: history, open } = lazyDetails(`candidate-history:${pr.id}`, this.disclosures);
    history.append(element('summary', '历史候选与审核'));
    if (!open) return history;
    Object.values(detail.candidates)
      .filter(c => c.prId === pr.id)
      .forEach(c => {
        const { details: item, open: itemOpen } = lazyDetails(`candidate:${c.id}`, this.disclosures);
        item.append(element('summary', tx('{v0} · 策略 v{v1}', { v0: c.id, v1: c.policyVersion })));
        if (itemOpen) item.append(this.candidateRecords(c.id));
        detail.reviews
          .filter(r => r.candidateId === c.id)
          .forEach(r => item.append(element('p', `${r.reviewerId} · ${r.decision} · ${r.reason}`)));
        history.append(item);
      });
    return history;
  }
  /** 提交头对应的记录：共享分支根没有记录（不请求）；内容未加载时返回 undefined，并触发加载。 */
  private recordsAt(id: string): Records | undefined {
    return id === this.controller.snapshot?.root ? {} : this.controller.commitContent(id)?.records;
  }
  /** 版本在界面上的写法：共享分支根（以及没有父的提交）显示为「空」，与没有任何合并时一致；其余显示提交 ID。 */
  private versionText(id: string | undefined): string {
    return id === undefined || id === this.controller.snapshot?.root ? tx('空') : id;
  }
  private commitRecords(id: string) {
    const commit = this.controller.commitContent(id);
    const schema = this.controller.schema();
    return commit && schema ? readOnlyRecords(commit.records, schema) : loading();
  }
  private candidateRecords(id: string) {
    const candidate = this.controller.candidateContent(id);
    const schema = this.controller.schema();
    return candidate && schema ? readOnlyRecords(candidate.records, schema) : loading();
  }
  /** 来源相对起点的记录差异；两个提交与数据模式都加载完成前先显示占位。 */
  private sourceChanges(task: Task) {
    const before = this.recordsAt(task.base);
    const after = this.recordsAt(task.head);
    const schema = this.controller.schema();
    return before && after && schema ? diffTable(before, after, schema) : loading();
  }
  private run(command: Omit<Command, 'operationId'> | Record<string, unknown>) {
    return this.runLazily(() => command);
  }
  /** 命令在 perform 内才构造，构造过程抛出的错误同样由 perform 统一报告。 */
  private runLazily(command: () => Omit<Command, 'operationId'> | Record<string, unknown>) {
    return this.perform(() => this.controller.run(command()));
  }
  private has(permission: string) {
    return (
      this.controller.snapshot?.members
        .find(member => member.id === this.controller.user?.id)
        ?.permissions.some(item => item === permission) ?? false
    );
  }
  private previewControls(pr: PullRequest, detail: PullRequestDetail) {
    const view = section('三方合并预览');
    const data = this.controller.snapshot!;
    const task = data.tasks.find(t => t.id === pr.taskId)!;
    const source = this.recordsAt(task.head);
    const base = this.recordsAt(task.base);
    const target = this.controller.sharedRecords();
    const schema = this.controller.schema();
    if (!source || !base || !target || !schema) {
      view.append(loading());
      return view;
    }
    const preview = mergeRecords(base, source, target, [], systemFieldOf(schema));
    const selections: (() => Resolution | null)[] = [];
    view.append(
      element(
        'p',
        tx('共同起点 B：{v0} · 来源 S：{v1} · 目标 T：{v2}', {
          v0: this.versionText(task.base),
          v1: this.versionText(task.head),
          v2: this.versionText(data.head)
        }),
        'text-xs break-all'
      )
    );
    for (const conflict of preview.conflicts) {
      const field = section(tx('冲突：{v0} / {v1}', { v0: conflict.recordId, v1: conflict.field ?? tx('整条记录') }));
      field.append(
        element('p', tx('起点：{v0}', { v0: valueText(conflict.base) })),
        element('p', tx('来源：{v0}', { v0: valueText(conflict.source) })),
        element('p', tx('目标：{v0}', { v0: valueText(conflict.target) }))
      );
      const existing =
        pr.candidateId ? detail.candidates[pr.candidateId].resolutions.find(r => r.key === conflict.key) : undefined;
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
      choice.control.dataset['persistentDraft'] = 'true';
      custom.control.dataset['persistentDraft'] = 'true';
      selections.push(() => readResolution(conflict.key, choice.control.value, custom.control.value));
    }
    view.append(
      button('生成合并候选并检查', () =>
        // 选择在 perform 内才读取：非法的自定义值会走统一的报错路径，而不是在点击回调里静默抛出
        this.runLazily(() => ({
          type: 'candidate',
          prId: pr.id,
          expectedRevision: pr.revision,
          resolutions: selections.map(read => read()).filter(value => value !== null)
        }))
      )
    );
    return view;
  }
  private candidate(pr: PullRequest, detail: PullRequestDetail) {
    const data = this.controller.snapshot!;
    const candidate = detail.candidates[pr.candidateId!];
    const view = section('最终合并候选');
    const task = data.tasks.find(t => t.id === pr.taskId)!;
    const current =
      candidate.source === task.head &&
      candidate.target === data.head &&
      candidate.policyVersion === data.policy.version &&
      candidate.schemaVersion === data.schemaVersion;
    view.append(
      element(
        'p',
        tx('候选 {v0} · 策略 v{v1} · {v2}', {
          v0: candidate.id,
          v1: candidate.policyVersion,
          v2: current ? tx('当前版本') : tx('已过期，必须重新生成并审核')
        }),
        'text-sm break-all'
      )
    );
    view.append(
      element(
        'p',
        tx('未解决冲突：{v0} · 检查错误：{v1}', { v0: candidate.conflicts.length, v1: candidate.checks.length })
      )
    );
    if (this.tab === 'checks')
      candidate.checks.forEach(check =>
        view.append(element('p', `${check.recordId} / ${check.field}：${tx(check.message)}`, 'text-error'))
      );
    const content = this.controller.candidateContent(candidate.id);
    const target = this.recordsAt(candidate.target);
    const schema = this.controller.schema();
    if (content && target && schema) {
      if (this.tab === 'changes') view.append(diffTable(target, content.records, schema));
      view.append(this.recordNavigation(target, content.records));
    } else view.append(loading());
    if (this.selectedRecord) view.append(element('p', tx('当前查看记录：{v0}', { v0: this.selectedRecord })));
    const { details, open } = lazyDetails(`candidate-records:${candidate.id}`, this.disclosures);
    details.append(element('summary', '查看最终完整数据'));
    if (open) details.append(content && schema ? readOnlyRecords(content.records, schema) : loading());
    view.append(details);
    const actions = row();
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
  private recordNavigation(target: Records, result: Records) {
    const navigation = row();
    Object.keys({ ...target, ...result }).forEach(id =>
      navigation.append(
        button(tx('查看记录 {v0}', { v0: id }), () => {
          this.selectedRecord = id;
          this.render();
        })
      )
    );
    return navigation;
  }
  private reviewControls(pr: PullRequest, detail: PullRequestDetail) {
    const data = this.controller.snapshot!;
    const candidate = pr.candidateId ? detail.candidates[pr.candidateId] : null;
    const task = data.tasks.find(value => value.id === pr.taskId)!;
    const current =
      candidate &&
      candidate.source === task.head &&
      candidate.target === data.head &&
      candidate.policyVersion === data.policy.version &&
      candidate.schemaVersion === data.schemaVersion;
    const view = section('审核');
    const governance = detail.governance;
    governance.stages.forEach(stage =>
      view.append(
        element(
          'p',
          `${stage.name}：${stage.approved}/${stage.minimum} ${stage.complete ? tx('已满足') : tx('待批准')}`
        )
      )
    );
    const reason = input('审核或撤销理由');
    view.append(reason.wrapper);
    governance.blockers.forEach(blocker => {
      view.append(
        element('p', tx('要求修改：{v0} — {v1}', { v0: blocker.reviewerId, v1: blocker.reason }), 'text-error')
      );
      if (this.has('manage') && this.has('review'))
        view.append(
          button('撤销此阻塞意见', () =>
            this.run({
              type: 'dismiss',
              prId: pr.id,
              reviewerId: blocker.reviewerId,
              expectedRevision: reviewRevision(detail.reviews, pr.id, blocker.reviewerId),
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
          candidateId: current ? candidate!.id : null,
          expectedSource: task.head,
          stageId: stage.control.value || 'review',
          decision,
          reason: reason.control.value,
          expectedRevision: reviewRevision(detail.reviews, pr.id, this.controller.user!.id)
        });
      actions.append(
        button(
          '批准当前候选',
          () => review('approve'),
          !current ||
            !!candidate?.checks.length ||
            !!candidate?.conflicts.length ||
            (data.policy.stages.length > 0 && !stage.control.value)
        ),
        button('要求修改', () => review('request_changes'), data.policy.stages.length > 0 && !stage.control.value)
      );
    }
    view.append(actions);
    return view;
  }
  /** 评论锚定的候选版本：展开时才读取候选内容并渲染该记录。 */
  private anchoredVersion(thread: Thread, candidateId: string, recordId: string) {
    const { details, open } = lazyDetails(`thread-version:${thread.id}`, this.disclosures);
    details.append(element('summary', '查看评论锚定版本'));
    if (!open) return details;
    const candidate = this.controller.candidateContent(candidateId);
    const schema = this.controller.schema();
    if (!candidate || !schema) {
      details.append(loading());
      return details;
    }
    const record = candidate.records[recordId];
    details.append(
      element('p', valueText(thread.field ? record?.fields[thread.field] : record), '', true),
      readOnlyRecords(record ? { [recordId]: record } : {}, schema)
    );
    return details;
  }
  /** 讨论的处理历史：展开时才按线程读取审计事件。 */
  private threadHistory(thread: Thread) {
    const { details, open } = lazyDetails(`thread-history:${thread.id}`, this.disclosures);
    details.append(element('summary', '讨论处理历史'));
    if (!open) return details;
    const events = this.controller.threadEvents(thread.id);
    if (!events) details.append(loading());
    else
      events.forEach(event =>
        details.append(
          element('p', `${new Date(event.at).toLocaleString()} · ${event.actorId} · ${event.action}`, '', true)
        )
      );
    return details;
  }
  private discussions(pr: PullRequest, detail: PullRequestDetail) {
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
    const visible = detail.threads.filter(
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
      box.append(
        element('p', [thread.candidateId, thread.recordId, thread.field].filter(Boolean).join(' / '), 'text-xs')
      );
      if (thread.candidateId && thread.recordId && detail.candidates[thread.candidateId])
        box.append(this.anchoredVersion(thread, thread.candidateId, thread.recordId));
      box.append(this.threadHistory(thread));
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
        edit.control.dataset['formKey'] = `comment:${comment.id}:${comment.revision}`;
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
        reply.control.dataset['formKey'] = `reply:${thread.id}`;
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
    const record = input('记录标识（留空为 PR 讨论）', this.selectedRecord ?? '');
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
