import type { Audit, CommitSummary } from '../model.js';
import type { CollaborationController } from './controller.js';
import { changeTable } from './diff-table.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import { button, code, element, loading, section, type Perform } from './elements.js';
import { personName, shortId, timeElement } from './format.js';
import { icon } from './icons.js';
import { auditLabel } from './pr-view.js';
import { readOnlyRecords } from './records-view.js';
import { tx } from './translate.js';

/** 共享分支：历史只列共享分支上的提交（即各次合并产生的提交）。 */
const shared = { branch: 'shared' } as const;

/**
 * 「历史与审计」：共享分支的提交历史与审计日志。提交历史按页从服务端读取，新的在上，还有更早的提交时在列表末尾提供加载入口；
 * 第一页读到之前显示占位。每一项的内容都只在它的 details 展开（含恢复为展开）时才生成：提交展开后经控制器按需读取内容，
 * 读到之前显示占位；审计日志展开后逐条列出已加载的事件。
 */
export function historyView(
  controller: CollaborationController,
  perform: Perform,
  disclosures: Disclosures
): HTMLElement {
  const data = controller.snapshot!;
  const view = element('div', '', 'space-y-4');
  const commits = section('共享分支历史', {
    icon: 'history',
    description: '每次合并都在共享分支上形成一个提交；可以从任一版本创建恢复草稿，共享数据与历史都不会被改动'
  });
  const history = controller.commitHistory(shared);
  if (!history) commits.append(loading());
  else {
    const canEdit = data.members.find(m => m.id === controller.user?.id)?.permissions.includes('edit');
    const list = element('div', '', 'divide-y divide-base-300 rounded-box border border-base-300');
    for (const commit of history.commits)
      list.append(commitHistory(controller, perform, disclosures, commit, !!canEdit));
    if (!history.commits.length)
      list.append(element('p', '还没有任何合并', 'px-4 py-6 text-center text-sm text-base-content/70'));
    commits.append(list);
    if (history.hasEarlier)
      commits.append(
        button('加载更早的提交', () => perform(() => controller.loadEarlierCommits(shared)), false, {
          tone: 'ghost',
          size: 'xs'
        })
      );
  }
  view.append(commits, auditTimeline(controller, perform, disclosures));
  return view;
}

/** 审计详情的一行摘要：取最能说明这次操作的几个字段（名称、标题、邮箱、状态、决定、理由），其余在展开的原文里。 */
function auditSummary(event: Audit): string {
  const keys = ['name', 'title', 'email', 'status', 'decision', 'reason'];
  const result = event.details['result'];
  const nested = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {};
  const values = { ...nested, ...event.details };
  return keys
    .filter(key => typeof values[key] === 'string' && values[key] !== '')
    .map(key => String(values[key]))
    .join(' · ');
}

/**
 * 审计日志：标题显示事件总数；展开后才读取最近一窗事件并列成表（读到之前显示占位），还有更早的事件时提供加载入口。
 * 操作者显示成员邮箱，动作显示中文名，详情原文可以逐条展开。
 */
function auditTimeline(controller: CollaborationController, perform: Perform, disclosures: Disclosures) {
  const data = controller.snapshot!;
  const { details, open } = lazyDetails('audit', disclosures);
  details.className = 'group/audit rounded-box border border-base-300 bg-base-100';
  const summary = element(
    'summary',
    '',
    'flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-base-200/60 sm:px-5'
  );
  summary.append(
    icon('chevron-down', 'size-4 -rotate-90 transition group-open/audit:rotate-0'),
    icon('list-checks', 'size-4'),
    element('span', '审计日志', 'font-semibold'),
    element('span', tx('{v0} 条审计事件', { v0: data.auditCount }), 'text-base-content/70', true)
  );
  details.append(summary);
  if (!open) return details;
  const body = element('div', '', 'space-y-3 px-4 pb-4 sm:px-5');
  const events = controller.auditEvents();
  if (!events) {
    body.append(loading());
    details.append(body);
    return details;
  }
  if (controller.hasEarlierAudit())
    body.append(
      button('加载更早的审计事件', () => perform(() => controller.loadEarlierAudit()), false, {
        tone: 'ghost',
        size: 'xs'
      })
    );
  const frame = element('div', '', 'overflow-x-auto rounded-box border border-base-300');
  const table = element('table', '', 'table table-sm');
  const head = element('thead');
  const header = element('tr');
  ['时间', '操作者', '动作', '详情'].forEach(label => header.append(element('th', label)));
  head.append(header);
  const rows = element('tbody');
  for (const event of events) {
    const row = element('tr');
    row.dataset['auditId'] = event.id;
    const at = element('td', '', 'whitespace-nowrap');
    at.append(timeElement(event.at));
    const raw = element('details');
    raw.append(
      element('summary', auditSummary(event) || tx('查看原文'), 'cursor-pointer break-all', true),
      element(
        'pre',
        JSON.stringify(event.details, null, 2),
        'mt-2 max-w-xl overflow-auto rounded-field bg-base-200 p-2 text-xs',
        true
      )
    );
    const detail = element('td');
    detail.append(raw);
    row.append(
      at,
      element('td', personName(data.members, event.actorId, controller.user), 'break-all'),
      element('td', tx(auditLabel(event.action)), 'whitespace-nowrap'),
      detail
    );
    rows.append(row);
  }
  table.append(head, rows);
  frame.append(table);
  body.append(frame);
  details.append(body);
  return details;
}

/** 提交的第一父在界面上的写法：共享分支根（以及没有父的提交）显示为「空」。 */
function parentText(controller: CollaborationController, commit: CommitSummary): string {
  const parent = commit.parentIds[0];
  return parent === undefined || parent === controller.snapshot?.root ? tx('空') : shortId(parent);
}
/**
 * 一个共享提交：摘要（消息、作者、时间、短 ID 与父提交）始终显示；展开后才生成内容：该时刻的记录表，以及这个提交自身的字段级变更表
 * （合并提交就是这次合并对共享数据的改动，取自服务端变更表，不再出现在审计详情里）。
 * 恢复按钮总是在：从当前共享版本新建任务，在它的分支上把业务表恢复成这个提交的数据（平台 `restore()`），
 * 差异成为未提交改动；共享头与历史都不动（ADMIN-US-213 AC#4）。
 */
function commitHistory(
  controller: CollaborationController,
  perform: Perform,
  disclosures: Disclosures,
  commit: CommitSummary,
  canEdit: boolean
) {
  const { details, open } = lazyDetails(`shared-commit:${commit.id}`, disclosures);
  details.className = 'group/commit';
  details.dataset['commitId'] = commit.id;
  const summary = element(
    'summary',
    '',
    'flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm hover:bg-base-200/60'
  );
  const text = element('div', '', 'min-w-0 flex-1 space-y-0.5');
  const meta = element('p', '', 'flex flex-wrap items-center gap-x-2 text-xs text-base-content/70');
  meta.append(
    element('span', personName(controller.snapshot?.members ?? [], commit.authorId, controller.user), '', true),
    timeElement(commit.createdAt),
    // 第一父是上一个共享头；第一次合并的第一父是共享分支根，显示为「空」，与没有任何合并时一致
    element('span', tx('父提交：{v0}', { v0: parentText(controller, commit) }), '', true)
  );
  text.append(element('p', commit.message, 'truncate font-medium', true), meta);
  summary.append(
    icon('chevron-down', 'size-4 -rotate-90 transition group-open/commit:rotate-0'),
    icon(commit.kind === 'merge' ? 'git-merge' : 'git-commit-horizontal', 'size-4 text-base-content/70'),
    text,
    code(shortId(commit.id), commit.id)
  );
  details.append(summary);
  const body = element('div', '', 'space-y-3 px-4 pb-4');
  if (open) {
    const content = controller.commitContent(commit.id);
    const schema = controller.schema();
    if (content && schema)
      body.append(
        element('h4', '本次提交的改动', 'text-sm font-semibold'),
        changeTable(content.changes, schema, content.records),
        element('h4', '这个版本的完整数据', 'text-sm font-semibold'),
        readOnlyRecords(content.records, schema)
      );
    else body.append(loading());
  }
  if (canEdit)
    body.append(
      button(
        '从此版本创建恢复草稿',
        () => perform(() => controller.restoreVersion(commit.id, tx('恢复 {v0}', { v0: commit.message }))),
        false,
        { icon: 'undo-2' }
      )
    );
  details.append(body);
  return details;
}
