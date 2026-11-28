import { reviewRevision } from '../approval.js';
import type {
  CandidateSummary,
  Command,
  Comment,
  PullRequest,
  PullRequestDetail,
  Records,
  Resolution,
  Task,
  Thread
} from '../model.js';
import { mergeRecords } from '../records.js';
import { schemaModel, systemFieldOf } from '../schema.js';
import type { CollaborationController } from './controller.js';
import { diffTable } from './diff-table.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import {
  alert,
  avatar,
  badge,
  button,
  checkbox,
  code,
  element,
  emptyState,
  input,
  loading,
  modal,
  modalActions,
  section,
  select,
  tabList,
  tabPanel,
  textarea,
  valueText,
  type BadgeTone,
  type Perform
} from './elements.js';
import { personName, shortId, timeElement } from './format.js';
import { icon, type IconName } from './icons.js';
import { readOnlyRecords, titleOf } from './records-view.js';
import { readResolution } from './resolution-input.js';
import { tx } from './translate.js';

/** PR 状态在界面上的写法：文字、徽标颜色与图标。 */
export const prStatus: Record<PullRequest['status'], { label: string; tone: BadgeTone; icon: IconName }> = {
  draft: { label: '草稿', tone: 'ghost', icon: 'git-pull-request-draft' },
  review: { label: '待审核', tone: 'primary', icon: 'git-pull-request' },
  closed: { label: '已关闭', tone: 'neutral', icon: 'git-pull-request-closed' },
  merged: { label: '已合并', tone: 'success', icon: 'git-merge' }
};

type DetailTab = 'discussion' | 'commits' | 'changes' | 'checks';
/** PR 的状态操作：请求审核、重开为草稿与关闭。 */
const stateActions = {
  review: { label: '请求审核', icon: 'send' },
  draft: { label: '重开为草稿', icon: 'git-pull-request-draft' },
  closed: { label: '关闭 PR', icon: 'git-pull-request-closed' }
} as const satisfies Record<string, { label: string; icon: IconName }>;
const tabLabels: Record<DetailTab, string> = {
  discussion: '讨论',
  commits: '提交',
  changes: '数据变更',
  checks: '检查'
};
const tabIcons: Record<DetailTab, IconName> = {
  discussion: 'message-square',
  commits: 'git-commit-horizontal',
  changes: 'file-diff',
  checks: 'list-checks'
};

/** 检查清单一项的状态：通过、需要处理、等待中。 */
type CheckState = 'ok' | 'bad' | 'pending';
const checkIcons: Record<CheckState, { name: IconName; color: string }> = {
  ok: { name: 'circle-check', color: 'text-success' },
  bad: { name: 'circle-x', color: 'text-error' },
  pending: { name: 'circle-dot', color: 'text-warning' }
};

/**
 * 「数据 PR」分区：左侧是 PR 列表（新的在上，标题 + 状态），右侧是选中 PR 的详情——标题卡（状态、作者、说明与状态操作）、
 * 讨论 / 提交 / 数据变更 / 检查四个页签，以及常驻的「审核与合并」：候选与检查、各审批阶段的进度、阻塞意见、审核操作与合并。
 */
export class PullRequestView {
  selected: string | null = null;
  selectedRecord: string | null = null;
  filter = 'all';
  tab: DetailTab = 'changes';
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
    const layout = element('div', '', 'grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]');
    const pr = this.controller.snapshot!.prs.find(item => item.id === this.selected);
    layout.append(
      this.list(),
      pr ?
        this.detail(pr)
      : emptyState(
          'git-pull-request',
          '选择一个数据 PR 查看详情',
          '任务同步之后，在任务栏点「创建 PR…」发起；审核通过并通过检查后合并进共享数据。'
        )
    );
    return layout;
  }
  /** 选中一个 PR（通知、新建 PR 之后调用），切到它的「数据变更」或指定页签。 */
  show(prId: string, tab: DetailTab = 'changes'): void {
    this.selected = prId;
    this.selectedRecord = null;
    this.tab = tab;
  }
  /** 打开「创建 PR」对话框：来源是任务的远端版本；创建后选中新 PR。 */
  openCreate(task: { id: string; name: string; remoteHead: string }, created: (id: string) => void): void {
    const { dialog, box, close } = modal('创建数据 PR', {
      icon: 'git-pull-request',
      description: tx('审核来源为远端版本 {v0}；本机未保存、未提交或排队内容不会自动纳入。', {
        v0: shortId(task.remoteHead)
      })
    });
    const title = input('PR 标题', task.name, 'text', { size: 'md' });
    const description = textarea('PR 说明', '', { placeholder: '说明这次改了什么、为什么改' });
    const target = select('目标分支', [{ value: 'shared', label: tx('团队共享分支') }], 'shared', 'md');
    // 失败时对话框不关，原因同时显示在对话框里（页面上的提示被模态层挡住）
    const failure = element('div', '', 'empty:hidden');
    box.append(
      title.wrapper,
      description.wrapper,
      target.wrapper,
      failure,
      modalActions(
        button('取消', close, false, { tone: 'ghost' }),
        button(
          '创建 PR',
          () =>
            this.perform(async () => {
              const id = crypto.randomUUID();
              failure.replaceChildren();
              try {
                await this.controller.run({
                  type: 'pr',
                  id,
                  title: title.control.value,
                  description: description.control.value,
                  target: target.control.value,
                  taskId: task.id
                });
              } catch (error) {
                failure.append(alert(error instanceof Error ? error.message : '操作失败', 'error'));
                throw error;
              }
              close();
              this.show(id);
              created(id);
            }),
          false,
          { tone: 'primary', icon: 'git-pull-request' }
        )
      )
    );
    dialog.showModal();
  }
  /** 成员在界面上的名字（邮箱），不在成员列表里时显示短标识。 */
  private who(id: string | null | undefined): string {
    return personName(this.controller.snapshot?.members ?? [], id, this.controller.user);
  }
  private list(): HTMLElement {
    const data = this.controller.snapshot!;
    const view = section('数据 PR', { icon: 'git-pull-request', description: '任务同步后发起，审核并通过检查后合并' });
    if (!data.prs.length)
      view.append(
        element('p', '还没有数据 PR：任务同步之后，在任务栏点「创建 PR…」发起', 'text-sm text-base-content/70')
      );
    const list = element('ul', '', 'menu w-full gap-1 p-0');
    for (const pr of [...data.prs].reverse()) {
      const status = prStatus[pr.status];
      const node = element('button', '', pr.id === this.selected ? 'menu-active items-start' : 'items-start');
      node.type = 'button';
      if (pr.id === this.selected) node.setAttribute('aria-current', 'true');
      // 可访问名称是「标题 · 状态」：中间的分隔符只给读屏器
      node.append(
        icon(status.icon, 'mt-0.5 size-4'),
        element('span', pr.title, 'min-w-0 flex-1 break-words', true),
        element('span', ' · ', 'sr-only', true),
        badge(status.label, status.tone)
      );
      node.addEventListener('click', () => {
        this.selected = pr.id;
        this.selectedRecord = null;
        this.render();
      });
      const item = element('li');
      item.append(node);
      list.append(item);
    }
    view.append(list);
    if (data.earlier.prs)
      view.append(
        button('加载更早的 PR', () => this.perform(() => this.controller.loadEarlierPrs()), false, {
          tone: 'ghost',
          size: 'xs'
        })
      );
    return view;
  }
  private detail(pr: PullRequest): HTMLElement {
    const view = element('div', '', 'min-w-0 space-y-4');
    view.append(this.header(pr));
    const card = element('section', '', 'rounded-box border border-base-300 bg-base-100');
    const tabs = element('div', '', 'border-b border-base-300 px-2 pt-1');
    tabs.append(
      tabList(
        'PR 详情',
        'pr',
        (Object.keys(tabLabels) as DetailTab[]).map(id => ({ id, label: tabLabels[id], icon: tabIcons[id] })),
        this.tab,
        (id, focus) => {
          this.tab = id;
          this.render();
          if (focus) document.getElementById(`pr-tab-${id}`)?.focus();
        }
      )
    );
    const panel = tabPanel('pr', this.tab, 'space-y-4 p-4 sm:p-5');
    card.append(tabs, panel);
    view.append(card);
    // 候选、审核与讨论是 PR 详情，打开 PR 时才读取；读到之前各页签先显示占位
    const detail = this.controller.prDetail(pr.id);
    if (!detail) {
      panel.append(loading());
      return view;
    }
    if (this.tab === 'discussion') panel.append(this.discussions(pr, detail));
    if (this.tab === 'commits') panel.append(this.commits(pr, detail));
    if (this.tab === 'changes') panel.append(...this.changes(pr, detail));
    if (this.tab === 'checks') panel.append(...this.checks(pr, detail));
    view.append(this.reviewControls(pr, detail));
    return view;
  }
  /** 标题卡：状态、标题、作者与修订、说明，以及状态操作与订阅。 */
  private header(pr: PullRequest): HTMLElement {
    const data = this.controller.snapshot!;
    const user = this.controller.user!;
    const status = prStatus[pr.status];
    const card = element('section', '', 'space-y-3 rounded-box border border-base-300 bg-base-100 p-4 sm:p-5');
    const top = element('div', '', 'flex flex-wrap items-start justify-between gap-3');
    const titles = element('div', '', 'min-w-0 space-y-1.5');
    const line = element('div', '', 'flex flex-wrap items-center gap-2');
    line.append(badge(status.label, status.tone), element('h3', pr.title, 'text-lg font-semibold break-words', true));
    const task = data.tasks.find(item => item.id === pr.taskId);
    titles.append(
      line,
      element(
        'p',
        tx('{v0} 发起 · 修订 {v1} · 目标：{v2} · 来源任务：{v3}', {
          v0: this.who(pr.authorId),
          v1: pr.revision,
          v2: tx('团队共享分支'),
          v3: task?.name ?? shortId(pr.taskId)
        }),
        'text-sm text-base-content/70 break-words',
        true
      )
    );
    const actions = element('div', '', 'flex flex-wrap items-center gap-2');
    const canManage = (pr.authorId === user.id && this.has('edit')) || this.has('merge');
    if (canManage && pr.status !== 'merged')
      actions.append(
        ...(['review', 'draft', 'closed'] as const)
          .filter(next => next !== pr.status)
          .map(next =>
            button(
              stateActions[next].label,
              () => this.run({ type: 'pr_state', prId: pr.id, status: next, expectedRevision: pr.revision }),
              false,
              { tone: next === 'review' ? 'primary' : 'ghost', icon: stateActions[next].icon }
            )
          )
      );
    const subscribed = pr.subscribers.includes(user.id);
    actions.append(
      button(
        subscribed ? '取消订阅' : '订阅通知',
        () => this.run({ type: 'subscribe', prId: pr.id, subscribed: !subscribed }),
        false,
        { tone: 'ghost', icon: 'bell' }
      )
    );
    top.append(titles, actions);
    card.append(top);
    if (pr.description) card.append(element('p', pr.description, 'whitespace-pre-wrap break-words text-sm', true));
    return card;
  }
  /** 「数据变更」页签：三方合并预览（可管理时）、尚无候选时的来源变化，或最终候选相对目标版本的差异。 */
  private changes(pr: PullRequest, detail: PullRequestDetail): HTMLElement[] {
    const parts: HTMLElement[] = [];
    const canManage = (pr.authorId === this.controller.user!.id && this.has('edit')) || this.has('merge');
    if (canManage && !['closed', 'merged'].includes(pr.status)) parts.push(this.previewControls(pr, detail));
    if (!pr.candidateId) {
      const task = this.controller.snapshot!.tasks.find(value => value.id === pr.taskId)!;
      const group = element('div', '', 'space-y-2');
      group.append(
        element('h4', '来源提交变化（尚未形成最终候选）', 'text-sm font-semibold'),
        this.sourceChanges(task)
      );
      parts.push(group);
      return parts;
    }
    parts.push(this.candidateContent(pr, detail));
    return parts;
  }
  /** 「检查」页签：最终候选的完整性与唯一性检查结果；还没有候选时说明检查尚未通过。 */
  private checks(pr: PullRequest, detail: PullRequestDetail): HTMLElement[] {
    if (!pr.candidateId) return [alert('尚未生成最终候选，检查未通过', 'warning')];
    const candidate = detail.candidates[pr.candidateId];
    const parts: HTMLElement[] = [];
    if (!candidate.checks.length && !candidate.conflicts.length) parts.push(alert('检查全部通过', 'success'));
    if (candidate.conflicts.length)
      parts.push(
        alert(
          tx('有 {v0} 处冲突尚未处理：在「数据变更」里选择处理方式后重新生成候选', { v0: candidate.conflicts.length }),
          'error'
        )
      );
    if (candidate.checks.length) {
      const list = element('ul', '', 'space-y-2');
      for (const check of candidate.checks) {
        const item = element(
          'li',
          '',
          'flex items-start gap-2 rounded-box border border-error/40 bg-error/10 px-3 py-2 text-sm'
        );
        item.append(
          icon('circle-x', 'mt-0.5 size-4 text-error'),
          element('span', `${check.recordId} / ${check.field}：${tx(check.message)}`, 'break-all', true)
        );
        list.append(item);
      }
      parts.push(list);
    }
    parts.push(this.recordPicker(pr, detail));
    return parts;
  }
  /** 「提交」页签：按 PR 分页读取来源任务在起点之后的提交，从新到旧列出，末尾可加载更早的提交；之后是历史候选。 */
  private commits(pr: PullRequest, detail: PullRequestDetail) {
    const view = element('div', '', 'space-y-3');
    view.append(element('h4', '提交历史', 'text-sm font-semibold'));
    const branch = { prId: pr.id };
    const history = this.controller.commitHistory(branch);
    if (!history) view.append(loading());
    const list = element('div', '', 'divide-y divide-base-300 rounded-box border border-base-300 empty:hidden');
    for (const commit of history?.commits ?? []) {
      const { details, open } = lazyDetails(`source-commit:${commit.id}`, this.disclosures);
      details.dataset['commitId'] = commit.id;
      details.className = 'group/commit';
      const summary = element(
        'summary',
        '',
        'flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-sm hover:bg-base-200/60'
      );
      summary.append(
        icon('chevron-down', 'size-4 -rotate-90 transition group-open/commit:rotate-0'),
        element('span', commit.message, 'min-w-0 flex-1 truncate font-medium', true),
        element('span', this.who(commit.authorId), 'hidden truncate text-xs text-base-content/70 sm:inline', true),
        code(shortId(commit.id), commit.id)
      );
      details.append(summary);
      const body = element('div', '', 'space-y-3 px-3 pb-3');
      body.append(
        element(
          'p',
          tx('父提交：{v0}', { v0: this.versionText(commit.parentIds[0]) }),
          'text-xs text-base-content/70',
          true
        )
      );
      if (open) body.append(this.commitRecords(commit.id));
      details.append(body);
      list.append(details);
    }
    view.append(list);
    if (history?.hasEarlier)
      view.append(
        button('加载更早的提交', () => this.perform(() => this.controller.loadEarlierCommits(branch)), false, {
          tone: 'ghost',
          size: 'xs'
        })
      );
    view.append(this.candidateHistory(pr, detail));
    return view;
  }
  private candidateHistory(pr: PullRequest, detail: PullRequestDetail) {
    const { details: history, open } = lazyDetails(`candidate-history:${pr.id}`, this.disclosures);
    history.className = 'group/candidates rounded-box border border-base-300';
    const summary = element(
      'summary',
      '',
      'flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-base-200/60'
    );
    summary.append(
      icon('chevron-down', 'size-4 -rotate-90 transition group-open/candidates:rotate-0'),
      element('span', '历史候选与审核')
    );
    history.append(summary);
    if (!open) return history;
    const body = element('div', '', 'space-y-2 px-3 pb-3');
    Object.values(detail.candidates)
      .filter(c => c.prId === pr.id)
      .forEach(c => {
        const { details: item, open: itemOpen } = lazyDetails(`candidate:${c.id}`, this.disclosures);
        item.className = 'rounded-field bg-base-200/60 px-3 py-2';
        item.append(
          element(
            'summary',
            tx('{v0} · 策略 v{v1}', { v0: shortId(c.id), v1: c.policyVersion }),
            'cursor-pointer text-sm',
            true
          )
        );
        if (itemOpen) item.append(this.candidateRecords(c.id));
        detail.reviews
          .filter(r => r.candidateId === c.id)
          .forEach(r =>
            item.append(
              element(
                'p',
                `${this.who(r.reviewerId)} · ${tx(reviewLabel(r.decision))} · ${r.reason}`,
                'text-xs text-base-content/70',
                true
              )
            )
          );
        body.append(item);
      });
    history.append(body);
    return history;
  }
  /** 提交头对应的记录：共享分支根没有记录（不请求）；内容未加载时返回 undefined，并触发加载。 */
  private recordsAt(id: string): Records | undefined {
    return id === this.controller.snapshot?.root ? {} : this.controller.commitContent(id)?.records;
  }
  /** 版本在界面上的写法：共享分支根（以及没有父的提交）显示为「空」，与没有任何合并时一致；其余显示短标识。 */
  private versionText(id: string | undefined): string {
    return id === undefined || id === this.controller.snapshot?.root ? tx('空') : shortId(id);
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
  /** 候选是否仍是当前版本：来源、目标、策略与数据模式都没有变。 */
  private isCurrent(candidate: CandidateSummary, task: Task): boolean {
    const data = this.controller.snapshot!;
    return (
      candidate.source === task.head &&
      candidate.target === data.head &&
      candidate.policyVersion === data.policy.version &&
      candidate.schemaVersion === data.schemaVersion
    );
  }
  private previewControls(pr: PullRequest, detail: PullRequestDetail) {
    const view = section('三方合并预览', {
      icon: 'git-compare',
      level: 3,
      description: '按共同起点、来源与目标三个版本预览合并结果；有冲突时逐项选择处理方式，再生成合并候选并检查'
    });
    view.classList.replace('bg-base-100', 'bg-base-200/40');
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
    const versions = element('p', '', 'flex flex-wrap items-center gap-2 text-xs text-base-content/70');
    versions.append(
      element(
        'span',
        tx('共同起点 B：{v0} · 来源 S：{v1} · 目标 T：{v2}', {
          v0: this.versionText(task.base),
          v1: this.versionText(task.head),
          v2: this.versionText(data.head)
        }),
        'font-mono',
        true
      )
    );
    view.append(versions);
    if (!preview.conflicts.length) view.append(alert('没有冲突：可以直接生成合并候选', 'success'));
    for (const conflict of preview.conflicts) {
      const field = element('article', '', 'space-y-3 rounded-box border border-warning/60 bg-base-100 p-3');
      field.append(
        element(
          'h4',
          tx('冲突：{v0} / {v1}', { v0: conflict.recordId, v1: conflict.field ?? tx('整条记录') }),
          'text-sm font-semibold break-all',
          true
        )
      );
      const values = element('dl', '', 'grid gap-2 text-sm sm:grid-cols-3');
      for (const [label, value] of [
        ['起点', conflict.base],
        ['来源', conflict.source],
        ['目标', conflict.target]
      ] as const) {
        const cell = element('div', '', 'rounded-field bg-base-200 px-3 py-2');
        cell.append(
          element('dt', label, 'text-xs text-base-content/70'),
          element('dd', valueText(value), 'break-all font-mono', true)
        );
        values.append(cell);
      }
      field.append(values);
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
      const choices = element('div', '', 'grid gap-3 sm:grid-cols-2');
      choices.append(choice.wrapper, custom.wrapper);
      field.append(choices);
      view.append(field);
      choice.control.dataset['formKey'] = `resolution:${pr.id}:${task.head}:${data.head}:${conflict.key}`;
      custom.control.dataset['formKey'] = `custom:${pr.id}:${task.head}:${data.head}:${conflict.key}`;
      choice.control.dataset['persistentDraft'] = 'true';
      custom.control.dataset['persistentDraft'] = 'true';
      selections.push(() => readResolution(conflict.key, choice.control.value, custom.control.value));
    }
    view.append(
      button(
        '生成合并候选并检查',
        () =>
          // 选择在 perform 内才读取：非法的自定义值会走统一的报错路径，而不是在点击回调里静默抛出
          this.runLazily(() => ({
            type: 'candidate',
            prId: pr.id,
            expectedRevision: pr.revision,
            resolutions: selections.map(read => read()).filter(value => value !== null)
          })),
        false,
        { tone: 'primary', icon: 'list-checks' }
      )
    );
    return view;
  }
  /** 最终候选的内容：相对目标版本的差异、记录定位与完整数据（展开后才渲染）。 */
  private candidateContent(pr: PullRequest, detail: PullRequestDetail): HTMLElement {
    const candidate = detail.candidates[pr.candidateId!];
    const view = element('div', '', 'space-y-3');
    view.dataset['candidate'] = candidate.id;
    view.append(element('h4', tx('最终合并候选 {v0}', { v0: shortId(candidate.id) }), 'text-sm font-semibold', true));
    const content = this.controller.candidateContent(candidate.id);
    const target = this.recordsAt(candidate.target);
    const schema = this.controller.schema();
    if (content && target && schema)
      view.append(diffTable(target, content.records, schema), this.recordPicker(pr, detail));
    else view.append(loading());
    const { details, open } = lazyDetails(`candidate-records:${candidate.id}`, this.disclosures);
    details.className = 'group/final rounded-box border border-base-300';
    const summary = element(
      'summary',
      '',
      'flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-base-200/60'
    );
    summary.append(
      icon('chevron-down', 'size-4 -rotate-90 transition group-open/final:rotate-0'),
      element('span', '查看最终完整数据')
    );
    details.append(summary);
    if (open) {
      const body = element('div', '', 'px-3 pb-3');
      body.append(content && schema ? readOnlyRecords(content.records, schema) : loading());
      details.append(body);
    }
    view.append(details);
    return view;
  }
  /**
   * 记录定位：选一条记录作为当前查看的位置（在线状态里上报，新评论默认锚定到它）；候选内容到齐之后才出现。
   */
  private recordPicker(pr: PullRequest, detail: PullRequestDetail): HTMLElement {
    const candidate = detail.candidates[pr.candidateId!];
    const content = candidate ? this.controller.candidateContent(candidate.id) : undefined;
    const target = candidate ? this.recordsAt(candidate.target) : undefined;
    const schema = this.controller.schema();
    if (!content || !target || !schema) return loading();
    const model = schemaModel(schema);
    const records = { ...target, ...content.records };
    const picker = select(
      '查看记录',
      [
        { value: '', label: tx('（不指定）') },
        ...Object.entries(records).map(([id, row]) => ({
          value: id,
          label: `${titleOf(model.entity(row.entity), id, row)}（${id}）`
        }))
      ],
      this.selectedRecord ?? ''
    );
    picker.control.dataset['formKey'] = `record:${pr.id}`;
    picker.control.onchange = () => {
      this.selectedRecord = picker.control.value || null;
      this.render();
    };
    const box = element('div', '', 'grid gap-2 sm:max-w-md');
    box.append(picker.wrapper);
    if (this.selectedRecord)
      box.append(
        element(
          'p',
          tx('当前查看记录：{v0}', { v0: this.selectedRecord }),
          'text-xs text-base-content/70 break-all',
          true
        )
      );
    return box;
  }
  /** 「审核与合并」：候选与检查、各审批阶段的进度、阻塞意见、审核操作与合并按钮；不随页签切换而消失。 */
  private reviewControls(pr: PullRequest, detail: PullRequestDetail) {
    const data = this.controller.snapshot!;
    const userId = this.controller.user!.id;
    const candidate = pr.candidateId ? detail.candidates[pr.candidateId] : null;
    const task = data.tasks.find(value => value.id === pr.taskId)!;
    const current = !!candidate && this.isCurrent(candidate, task);
    const view = section('审核与合并', { icon: 'shield-check', level: 3 });
    const checklist = element('ul', '', 'space-y-2 text-sm');
    const item = (state: CheckState, text: string) => {
      const entry = element('li', '', 'flex items-start gap-2');
      entry.append(
        icon(checkIcons[state].name, `mt-0.5 size-4 ${checkIcons[state].color}`),
        element('span', text, 'break-words', true)
      );
      return entry;
    };
    if (candidate) {
      checklist.append(
        item(
          current ? 'ok' : 'bad',
          tx('候选 {v0} · 策略 v{v1} · {v2}', {
            v0: shortId(candidate.id),
            v1: candidate.policyVersion,
            v2: current ? tx('当前版本') : tx('已过期，必须重新生成并审核')
          })
        ),
        item(
          candidate.conflicts.length || candidate.checks.length ? 'bad' : 'ok',
          tx('未解决冲突：{v0} · 检查错误：{v1}', { v0: candidate.conflicts.length, v1: candidate.checks.length })
        )
      );
    } else checklist.append(item('pending', tx('尚未生成最终候选')));
    const governance = detail.governance;
    if (!governance.stages.length) checklist.append(item('ok', tx('免审批：仍要通过检查，且没有冲突与阻塞意见')));
    governance.stages.forEach(stage =>
      checklist.append(
        item(
          stage.complete ? 'ok' : 'pending',
          `${stage.name}：${stage.approved}/${stage.minimum} ${stage.complete ? tx('已满足') : tx('待批准')}`
        )
      )
    );
    view.append(checklist);
    const canReview = this.has('review') && pr.authorId !== userId && pr.status === 'review';
    const canDismiss = this.has('manage') && this.has('review');
    const reason = input('审核或撤销理由', '', 'text', { placeholder: '写给作者与其他审核者' });
    governance.blockers.forEach(blocker => {
      const entry = element(
        'div',
        '',
        'flex flex-wrap items-center justify-between gap-2 rounded-box border border-error/40 bg-error/10 px-3 py-2'
      );
      entry.append(
        element(
          'p',
          tx('要求修改：{v0} — {v1}', { v0: this.who(blocker.reviewerId), v1: blocker.reason }),
          'text-sm break-words',
          true
        )
      );
      if (canDismiss)
        entry.append(
          button(
            '撤销此阻塞意见',
            () =>
              this.run({
                type: 'dismiss',
                prId: pr.id,
                reviewerId: blocker.reviewerId,
                expectedRevision: reviewRevision(detail.reviews, pr.id, blocker.reviewerId),
                reason: reason.control.value
              }),
            false,
            { tone: 'ghost', size: 'xs', icon: 'x' }
          )
        );
      view.append(entry);
    });
    if (canReview || (canDismiss && governance.blockers.length)) {
      const form = element('div', '', 'space-y-3 rounded-box bg-base-200/60 p-3');
      form.append(reason.wrapper);
      if (canReview) form.append(this.reviewActions(pr, detail, reason.control, current));
      view.append(form);
    }
    if (candidate && this.has('merge') && pr.status === 'review')
      view.append(
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
          !current,
          { tone: 'primary', icon: 'git-merge', size: 'md', className: 'w-full sm:w-auto' }
        )
      );
    return view;
  }
  /** 审核者的操作：选择审批阶段后批准当前候选或要求修改。 */
  private reviewActions(pr: PullRequest, detail: PullRequestDetail, reason: HTMLInputElement, current: boolean) {
    const data = this.controller.snapshot!;
    const userId = this.controller.user!.id;
    const candidate = pr.candidateId ? detail.candidates[pr.candidateId] : null;
    const task = data.tasks.find(value => value.id === pr.taskId)!;
    const actions = element('div', '', 'flex flex-wrap items-end gap-2');
    const stage = select(
      '审批阶段',
      data.policy.stages
        .filter(s => !s.reviewers.length || s.reviewers.includes(userId))
        .map(s => ({ value: s.id, label: s.name })),
      data.policy.stages[0]?.id ?? 'review'
    );
    stage.wrapper.classList.add('min-w-40');
    const review = (decision: 'approve' | 'request_changes') =>
      this.run({
        type: 'review',
        prId: pr.id,
        candidateId: current ? candidate!.id : null,
        expectedSource: task.head,
        stageId: stage.control.value || 'review',
        decision,
        reason: reason.value,
        expectedRevision: reviewRevision(detail.reviews, pr.id, userId)
      });
    const noStage = data.policy.stages.length > 0 && !stage.control.value;
    actions.append(
      stage.wrapper,
      button(
        '批准当前候选',
        () => review('approve'),
        !current || !!candidate?.checks.length || !!candidate?.conflicts.length || noStage,
        { tone: 'success', icon: 'check' }
      ),
      button('要求修改', () => review('request_changes'), noStage, { tone: 'warning', icon: 'circle-alert' })
    );
    return actions;
  }
  /** 评论锚定的候选版本：展开时才读取候选内容并渲染该记录。 */
  private anchoredVersion(thread: Thread, candidateId: string, recordId: string) {
    const { details, open } = lazyDetails(`thread-version:${thread.id}`, this.disclosures);
    details.append(element('summary', '查看评论锚定版本', 'cursor-pointer text-xs font-medium text-base-content/70'));
    if (!open) return details;
    const candidate = this.controller.candidateContent(candidateId);
    const schema = this.controller.schema();
    if (!candidate || !schema) {
      details.append(loading());
      return details;
    }
    const record = candidate.records[recordId];
    const body = element('div', '', 'mt-2 space-y-2');
    body.append(
      element(
        'p',
        valueText(thread.field ? record?.fields[thread.field] : record),
        'text-sm font-mono break-all',
        true
      ),
      readOnlyRecords(record ? { [recordId]: record } : {}, schema)
    );
    details.append(body);
    return details;
  }
  /** 讨论的处理历史：展开时才按线程读取审计事件。 */
  private threadHistory(thread: Thread) {
    const { details, open } = lazyDetails(`thread-history:${thread.id}`, this.disclosures);
    details.append(element('summary', '讨论处理历史', 'cursor-pointer text-xs font-medium text-base-content/70'));
    if (!open) return details;
    const events = this.controller.threadEvents(thread.id);
    if (!events) details.append(loading());
    else {
      const list = element('ul', '', 'mt-2 space-y-1 text-xs text-base-content/70');
      events.forEach(event => {
        const entry = element('li', `${this.who(event.actorId)} · ${tx(auditLabel(event.action))} · `, '', true);
        entry.append(timeElement(event.at));
        list.append(entry);
      });
      details.append(list);
    }
    return details;
  }
  /** 一条评论：头像、作者与时间、正文；自己的评论可以展开编辑或删除。 */
  private comment(pr: PullRequest, thread: Thread, comment: Comment): HTMLElement {
    const userId = this.controller.user!.id;
    const name = this.who(comment.authorId);
    const entry = element('li', '', 'flex gap-3');
    entry.dataset['commentId'] = comment.id;
    entry.dataset['authorId'] = comment.authorId;
    const body = element('div', '', 'min-w-0 flex-1 space-y-1');
    const meta = element('p', '', 'flex flex-wrap items-center gap-x-2 text-xs text-base-content/70');
    meta.append(element('span', name, 'font-medium text-base-content', true), timeElement(comment.at));
    body.append(
      meta,
      comment.deleted ?
        element('p', '评论已删除', 'text-sm italic text-base-content/70')
      : element('p', comment.body, 'whitespace-pre-wrap break-words text-sm', true)
    );
    const editable =
      comment.authorId === userId &&
      !comment.deleted &&
      this.has('comment') &&
      !['closed', 'merged'].includes(pr.status);
    if (editable) {
      const editor = element('details', '', 'text-sm');
      editor.dataset['disclosureKey'] = `comment-edit:${comment.id}`;
      editor.append(element('summary', '编辑', 'cursor-pointer text-xs font-medium text-base-content/70'));
      const edit = input('编辑我的评论', comment.body);
      edit.control.dataset['formKey'] = `comment:${comment.id}:${comment.revision}`;
      const actions = element('div', '', 'mt-2 flex flex-wrap items-end gap-2');
      edit.wrapper.classList.add('flex-1');
      actions.append(
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
        button(
          '删除评论',
          () =>
            this.run({
              type: 'edit_comment',
              threadId: thread.id,
              commentId: comment.id,
              body: '',
              deleted: true,
              expectedRevision: comment.revision
            }),
          false,
          { tone: 'ghost', icon: 'trash-2' }
        )
      );
      editor.append(actions);
      body.append(editor);
    }
    entry.append(avatar(name, 'sm'), body);
    return entry;
  }
  private thread(pr: PullRequest, detail: PullRequestDetail, thread: Thread): HTMLElement {
    const box = element('article', '', 'space-y-3 rounded-box border border-base-300 bg-base-100 p-3 sm:p-4');
    box.id = `thread-${thread.id}`;
    const flags = element('div', '', 'flex flex-wrap items-center gap-2');
    if (thread.required) flags.append(badge('必须处理', 'error'));
    flags.append(
      badge(thread.resolved ? '已解决' : '未解决', thread.resolved ? 'success' : 'warning'),
      badge(thread.candidateId === pr.candidateId ? '当前版本' : '历史位置', 'ghost')
    );
    const anchor = [thread.recordId, thread.field].filter(Boolean).join(' / ');
    if (anchor) flags.append(element('span', anchor, 'font-mono text-xs text-base-content/70 break-all', true));
    box.append(flags);
    const comments = element('ul', '', 'space-y-3');
    thread.comments.forEach(comment => comments.append(this.comment(pr, thread, comment)));
    box.append(comments);
    const extras = element('div', '', 'flex flex-wrap gap-x-4 gap-y-1');
    if (thread.candidateId && thread.recordId && detail.candidates[thread.candidateId])
      extras.append(this.anchoredVersion(thread, thread.candidateId, thread.recordId));
    extras.append(this.threadHistory(thread));
    box.append(extras);
    if (this.has('comment') && !['closed', 'merged'].includes(pr.status)) {
      const reply = textarea('回复', '', { placeholder: '回复这条讨论' });
      reply.control.dataset['formKey'] = `reply:${thread.id}`;
      const actions = element('div', '', 'flex flex-wrap justify-end gap-2');
      actions.append(
        button(
          thread.resolved ? '重新打开讨论' : '标记已解决',
          () =>
            this.run({
              type: 'resolve_thread',
              threadId: thread.id,
              resolved: !thread.resolved,
              expectedRevision: thread.revision
            }),
          false,
          { tone: 'ghost', icon: thread.resolved ? 'circle-dot' : 'circle-check' }
        ),
        button(
          '发送回复',
          () => this.run({ type: 'reply', threadId: thread.id, body: reply.control.value, mentions: [] }),
          false,
          { icon: 'send' }
        )
      );
      const form = element('div', '', 'space-y-2 border-t border-base-300 pt-3');
      form.append(reply.wrapper, actions);
      box.append(form);
    }
    return box;
  }
  private discussions(pr: PullRequest, detail: PullRequestDetail) {
    const view = element('div', '', 'space-y-4');
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
    filter.wrapper.classList.add('max-w-xs');
    view.append(filter.wrapper);
    const visible = detail.threads.filter(
      t =>
        t.prId === pr.id &&
        (this.filter !== 'required' || t.required) &&
        (this.filter !== 'open' || !t.resolved) &&
        (this.filter !== 'mine' || t.comments.some(c => c.authorId === userId)) &&
        (this.filter !== 'current' || t.candidateId === pr.candidateId)
    );
    if (!visible.length) view.append(element('p', '没有符合筛选的讨论', 'text-sm text-base-content/70'));
    visible.forEach(thread => view.append(this.thread(pr, detail, thread)));
    if (!this.has('comment') || ['closed', 'merged'].includes(pr.status)) return view;
    const form = section('发表评论', { icon: 'message-square', level: 3 });
    form.classList.replace('bg-base-100', 'bg-base-200/40');
    const body = textarea('新评论', '', { placeholder: '对这个 PR、某条记录或某个字段发表意见' });
    const record = input('记录标识（留空为 PR 讨论）', this.selectedRecord ?? '');
    const field = input('字段名（可选）');
    const required = checkbox('必须处理');
    const mention = select('提及成员', [
      { value: '', label: tx('不提及') },
      ...data.members.map(m => ({ value: m.id, label: m.email }))
    ]);
    const anchors = element('div', '', 'grid gap-3 sm:grid-cols-3');
    anchors.append(record.wrapper, field.wrapper, mention.wrapper);
    const actions = element('div', '', 'flex flex-wrap items-center justify-between gap-3');
    actions.append(
      this.has('review') || this.has('merge') ? required.wrapper : element('span'),
      button(
        '发表评论',
        () =>
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
          }),
        false,
        { tone: 'primary', icon: 'send' }
      )
    );
    form.append(body.wrapper, anchors, actions);
    view.append(form);
    return view;
  }
}

/** 审核决定在界面上的写法。 */
function reviewLabel(decision: string): string {
  return (
    decision === 'approve' ? '批准'
    : decision === 'request_changes' ? '要求修改'
    : decision
  );
}

/** 审计动作（即命令类型）在界面上的写法；不认识的动作原样显示。 */
export const auditLabels: Record<string, string> = {
  bootstrap: '初始化团队',
  invite: '创建邀请',
  revoke_invite: '撤销邀请',
  accept_invite: '接受邀请',
  member: '更新成员权限',
  policy: '更新审批策略',
  schema: '登记数据模式',
  task: '新建任务',
  fork: '另存为新任务',
  upload: '同步提交',
  pr: '创建 PR',
  pr_state: '更改 PR 状态',
  subscribe: '订阅通知',
  candidate: '生成合并候选',
  review: '审核',
  dismiss: '撤销阻塞意见',
  merge: '合并到共享数据',
  thread: '发表评论',
  reply: '回复讨论',
  edit_comment: '编辑评论',
  resolve_thread: '处理讨论',
  read_notice: '阅读通知'
};

/** 审计动作的中文原文（未翻译）。 */
export function auditLabel(action: string): string {
  return auditLabels[action] ?? action;
}
