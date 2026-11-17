import type { CommitContent, CommitSummary } from '../model.js';
import type { CollaborationController } from './controller.js';
import { lazyDetails, type Disclosures } from './disclosure.js';
import { readOnlyRecords, type TaskEditor } from './editor.js';
import { button, element, loading, section, type Perform } from './elements.js';
import { tx } from './translate.js';

/**
 * 「历史与审计」：审计时间线与共享提交历史。每一项的内容都只在它的 details 展开（含恢复为展开）时
 * 才生成：时间线逐条列出已加载的审计事件，提交展开后经控制器按需读取记录，读到之前显示占位。
 */
export function historyView(
  controller: CollaborationController,
  perform: Perform,
  editor: Pick<TaskEditor, 'dirty' | 'clear'>,
  disclosures: Disclosures
): HTMLElement {
  const data = controller.snapshot!;
  const view = section('历史与审计');
  view.append(auditTimeline(controller, perform, disclosures));
  const canEdit = data.members.find(m => m.id === controller.user?.id)?.permissions.includes('edit');
  for (const commit of Object.values(data.commits))
    view.append(commitHistory(controller, perform, editor, disclosures, commit, !!canEdit));
  return view;
}

/** 审计时间线：标题显示事件总数；展开后列出已加载的事件，还有更早的事件时提供加载入口。 */
function auditTimeline(controller: CollaborationController, perform: Perform, disclosures: Disclosures) {
  const { details, open } = lazyDetails('audit', disclosures);
  details.append(element('summary', tx('{v0} 条审计事件', { v0: controller.snapshot!.auditCount })));
  if (!open) return details;
  if (controller.hasEarlierAudit())
    details.append(button('加载更早的审计事件', () => perform(() => controller.loadEarlierAudit())));
  controller
    .auditEvents()
    .forEach(event =>
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

/** 一个共享提交：摘要与父提交始终显示，记录表只在展开后生成；恢复按钮总是在，点击后先等内容加载完成。 */
function commitHistory(
  controller: CollaborationController,
  perform: Perform,
  editor: Pick<TaskEditor, 'dirty' | 'clear'>,
  disclosures: Disclosures,
  commit: CommitSummary,
  canEdit: boolean
) {
  const { details, open } = lazyDetails(`shared-commit:${commit.id}`, disclosures);
  details.append(
    element('summary', `${commit.message} · ${commit.authorId} · ${commit.id}`),
    element('p', tx('父提交：{v0}', { v0: commit.parent ?? tx('空') }), 'text-xs')
  );
  if (open) {
    const content = controller.commitContent(commit.id);
    details.append(content ? readOnlyRecords(content.records) : loading());
  }
  if (canEdit)
    details.append(
      button('从此版本创建恢复草稿', () =>
        perform(async () => {
          if (editor.dirty) throw new Error('先保存当前输入');
          const content: CommitContent = await controller.loadCommit(commit.id);
          await controller.createTask(tx('恢复 {v0}', { v0: commit.message }));
          await controller.save(content.records);
          editor.clear();
        })
      )
    );
  return details;
}
