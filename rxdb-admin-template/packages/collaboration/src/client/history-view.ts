import type { CommitSummary } from '../model.js';
import type { CollaborationController } from './controller.js';
import { changeTable } from './diff-table.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import { button, element, loading, section, type Perform } from './elements.js';
import { readOnlyRecords } from './records-view.js';
import { tx } from './translate.js';

/** 共享分支：历史只列共享分支上的提交（即各次合并产生的提交）。 */
const shared = { branch: 'shared' } as const;

/**
 * 「历史与审计」：审计时间线与共享分支的提交历史。提交历史按页从服务端读取，按时间正序列出，
 * 还有更早的提交时在列表最前面提供加载入口；第一页读到之前显示占位。每一项的内容都只在它的 details 展开
 * （含恢复为展开）时才生成：时间线逐条列出已加载的审计事件，提交展开后经控制器按需读取内容，读到之前显示占位。
 */
export function historyView(
  controller: CollaborationController,
  perform: Perform,
  disclosures: Disclosures
): HTMLElement {
  const data = controller.snapshot!;
  const view = section('历史与审计');
  view.append(auditTimeline(controller, perform, disclosures));
  const history = controller.commitHistory(shared);
  if (!history) {
    view.append(loading());
    return view;
  }
  if (history.hasEarlier)
    view.append(button('加载更早的提交', () => perform(() => controller.loadEarlierCommits(shared))));
  const canEdit = data.members.find(m => m.id === controller.user?.id)?.permissions.includes('edit');
  for (const commit of [...history.commits].reverse())
    view.append(commitHistory(controller, perform, disclosures, commit, !!canEdit));
  return view;
}

/**
 * 审计时间线：标题显示事件总数；展开后才读取最近一窗事件并列出（读到之前显示占位），还有更早的事件时提供加载入口。
 */
function auditTimeline(controller: CollaborationController, perform: Perform, disclosures: Disclosures) {
  const { details, open } = lazyDetails('audit', disclosures);
  details.append(element('summary', tx('{v0} 条审计事件', { v0: controller.snapshot!.auditCount })));
  if (!open) return details;
  const events = controller.auditEvents();
  if (!events) {
    details.append(loading());
    return details;
  }
  if (controller.hasEarlierAudit())
    details.append(button('加载更早的审计事件', () => perform(() => controller.loadEarlierAudit())));
  events.forEach(event =>
    details.append(
      element(
        'p',
        `${new Date(event.at).toLocaleString()} · ${event.actorId} · ${event.action} · ${JSON.stringify(event.details)}`,
        'text-xs break-all'
      )
    )
  );
  return details;
}

/** 提交的第一父在界面上的写法：共享分支根（以及没有父的提交）显示为「空」。 */
function parentText(controller: CollaborationController, commit: CommitSummary): string {
  const parent = commit.parentIds[0];
  return parent === undefined || parent === controller.snapshot?.root ? tx('空') : parent;
}
/**
 * 一个共享提交：摘要与父提交始终显示；展开后才生成内容：该时刻的记录表，以及这个提交自身的字段级变更表
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
  details.append(
    element('summary', `${commit.message} · ${commit.authorId} · ${commit.id}`),
    // 第一父是上一个共享头；第一次合并的第一父是共享分支根，显示为「空」，与没有任何合并时一致
    element('p', tx('父提交：{v0}', { v0: parentText(controller, commit) }), 'text-xs')
  );
  if (open) {
    const content = controller.commitContent(commit.id);
    const schema = controller.schema();
    if (content && schema)
      details.append(readOnlyRecords(content.records, schema), changeTable(content.changes, schema));
    else details.append(loading());
  }
  if (canEdit)
    details.append(
      button('从此版本创建恢复草稿', () =>
        perform(() => controller.restoreVersion(commit.id, tx('恢复 {v0}', { v0: commit.message })))
      )
    );
  return details;
}
