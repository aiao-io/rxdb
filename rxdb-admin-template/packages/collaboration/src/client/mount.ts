import { tx, useTranslation, type Translate } from './translate.js';
import type { Records } from '../model.js';
import { checkRecords } from '../records.js';
import { adminView } from './admin-view.js';
import { FormDrafts } from './form-drafts.js';
import { CollaborationController } from './controller.js';
import { TaskEditor, readOnlyRecords } from './editor.js';
import { button, element, input, row, section } from './elements.js';
import { prepareOfflineShell } from './offline-shell.js';
import { PullRequestView } from './pr-view.js';
export interface CollaborationOptions {
  apiBase?: string;
  translate?: Translate;
  subscribeLanguage?: (listener: () => void) => () => void;
  importAnonymous?: () => Promise<Records>;
}

/** 三端共享的协作界面，所有用户内容均通过文本节点渲染。 */
export function mountCollaboration(host: HTMLElement, options: CollaborationOptions = {}): () => void {
  useTranslation(options.translate);
  const controller = new CollaborationController(options.apiBase);
  const formDrafts = new FormDrafts(host);
  host.addEventListener('input', formDrafts.remember);
  host.addEventListener('change', formDrafts.remember);
  let busy = 0;
  let disposed = false;
  let emailValue = '';
  let tokenValue = '';
  const render = () => {
    if (!disposed) renderPage();
  };
  const perform = async (work: () => Promise<unknown>) => {
    busy++;
    host.setAttribute('aria-busy', 'true');
    try {
      await work();
    } catch (error) {
      await controller.failure(error);
    } finally {
      busy--;
      host.setAttribute('aria-busy', String(busy > 0));
      render();
    }
  };
  const editor = new TaskEditor(controller, perform, render);
  const prs = new PullRequestView(controller, perform, render);
  const change = () => {
    if (!controller.user) editor.clear();
    if (
      controller.user &&
      !busy &&
      host.contains(document.activeElement) &&
      document.activeElement?.matches('input, select, textarea')
    )
      return;
    render();
  };
  controller.addEventListener('change', change);
  const leave = (event: BeforeUnloadEvent) => {
    if (editor.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', leave);
  const navigate = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!editor.dirty || !link || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dialog = element('dialog', '', 'modal');
    const content = element('div', '', 'modal-box space-y-3');
    content.append(
      element('h2', '离开前保存未保存输入', 'font-semibold'),
      button('留在此页', () => {
        dialog.close();
        dialog.remove();
      }),
      button('保存并离开', () =>
        perform(async () => {
          await editor.save();
          dialog.close();
          dialog.remove();
          location.assign(link.href);
        })
      )
    );
    dialog.append(content);
    document.body.append(dialog);
    dialog.showModal();
  };
  document.addEventListener('click', navigate, true);
  const connectivity = () => {
    controller.online = navigator.onLine;
    controller.changed();
    void controller.refresh().catch(error => controller.failure(error));
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  const sessionId = crypto.randomUUID();
  const heartbeat = window.setInterval(() => {
    if (busy || !controller.user || !controller.workspace || !navigator.onLine || document.hidden) return;
    void controller
      .run({ type: 'presence', sessionId, prId: prs.selected, recordId: prs.selectedRecord, leave: false })
      .catch(error => controller.failure(error));
  }, 15000);
  function renderPage() {
    const active = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
    const focusLabel = active?.getAttribute('aria-label');
    const recordId = active?.dataset['recordId'];
    const selection = active?.selectionStart;
    host.className = 'collaboration page-host overflow-auto p-4 md:p-6 space-y-4';
    host.replaceChildren();
    const header = row();
    header.append(element('h1', '团队协作', 'text-2xl font-semibold'));
    const anonymous = element('a', '匿名本机工作台', 'btn btn-sm btn-ghost');
    anonymous.href = '/';
    header.append(anonymous);
    if (controller.user)
      header.append(
        element('span', controller.user.email),
        button('退出账号', () => perform(() => controller.logout()))
      );
    host.append(header);
    const status = element(
      'p',
      controller.online ? tx('在线 · 云端操作按当前权限校验') : tx('离线 · 仅能编辑已解锁的本机任务'),
      'text-sm'
    );
    status.setAttribute('role', 'status');
    host.append(status);
    if (controller.message) {
      const alert = element('p', controller.message, 'rounded border border-base-300 p-3');
      alert.setAttribute('role', 'status');
      host.append(alert);
    }
    if (!controller.user) {
      host.append(loginView());
      formDrafts.restore('anonymous');
      return;
    }
    host.append(workspacesView(), invitationView());
    if (controller.pending()) host.append(button('确认或重试上次请求', () => perform(() => controller.retryPending())));
    if (controller.snapshot) host.append(workspaceView());
    if (controller.draft) host.append(editor.view());
    if (controller.snapshot) {
      host.append(prs.view(), historyView(), notificationsView());
      if (controller.snapshot.members.find(m => m.id === controller.user?.id)?.permissions.includes('manage'))
        host.append(adminView(controller, perform));
    }
    if (prs.focusThread) {
      host.querySelector(`#thread-${CSS.escape(prs.focusThread)}`)?.scrollIntoView({ block: 'center' });
      prs.focusThread = null;
    }
    formDrafts.restore(JSON.stringify([controller.user?.id, controller.workspace?.teamId, controller.workspace?.appId, controller.draft?.context.taskId, prs.selected]));
    if (focusLabel) restoreFocus(focusLabel, recordId, selection ?? null);
  }
  function restoreFocus(label: string, recordId: string | undefined, selection: number | null) {
    const candidates = host.querySelectorAll<HTMLInputElement>('input[aria-label]');
    const target = [...candidates].find(
      node => node.getAttribute('aria-label') === label && node.dataset['recordId'] === recordId
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    if (selection !== null && ['text', 'search', 'email', 'password', 'tel', 'url'].includes(target.type)) {
      if (['text', 'search', 'password', 'tel', 'url'].includes(target.type))
        target.setSelectionRange(selection, selection);
    }
  }
  function loginView() {
    const view = section('邮箱验证码登录');
    const email = input('邮箱', emailValue, 'email');
    const token = input('验证码', tokenValue);
    email.control.autocomplete = 'email';
    token.control.autocomplete = 'one-time-code';
    email.control.oninput = () => {
      emailValue = email.control.value;
    };
    token.control.oninput = () => {
      tokenValue = token.control.value;
    };
    view.append(
      email.wrapper,
      button('发送验证码', () => perform(() => controller.sendCode(email.control.value)), !controller.online),
      token.wrapper,
      button(
        '登录',
        () => perform(() => controller.verify(email.control.value, token.control.value)),
        !controller.online
      )
    );
    view.append(element('p', '登录不会上传匿名数据。团队草稿在会话确认前保持锁定。', 'text-sm'));
    return view;
  }
  function workspacesView() {
    const view = section('选择团队');
    controller.workspaces.forEach(workspace =>
      view.append(
        button(workspace.name, () =>
          perform(async () => {
            if (editor.dirty) {
              controller.message = '切换前请保存全部输入';
              return;
            }
            editor.clear();
            prs.selected = null;
            prs.selectedRecord = null;
            await controller.selectWorkspace(workspace);
          })
        )
      )
    );
    controller.offlineDrafts.forEach(draft =>
      view.append(button(tx("离线任务：{v0}", { v0: draft.name }), () => perform(() => controller.openOffline(draft))))
    );
    if (!controller.workspaces.length && !controller.offlineDrafts.length)
      view.append(element('p', '暂无可访问团队，请接受邀请。登录不会自动成为管理员。'));
    return view;
  }
  function invitationView() {
    const view = element('details');
    view.append(element('summary', '接受团队邀请'));
    const link = input('邀请链接', new URL(location.href).searchParams.has('join') ? location.href : '');
    view.append(link.wrapper);
    view.append(
      button('接受邀请', () =>
        perform(async () => {
          const value = new URL(link.control.value).searchParams.get('join');
          if (!value) throw new Error('邀请链接格式错误');
          const invite = JSON.parse(value) as { teamId: string; appId: string; id: string; token: string };
          await controller.acceptInvitation(invite.teamId, invite.appId, invite.id, invite.token);
          history.replaceState(null, '', location.pathname);
          controller.message = '邀请已接受';
        })
      )
    );
    return view;
  }
  function workspaceView() {
    const data = controller.snapshot!;
    const view = section(tx("共享数据 · {v0}", { v0: data.name }));
    view.append(
      element('p', tx("共享版本：{v0} · 默认只读", { v0: data.head ?? '空分支' }), 'text-sm break-all'),
      readOnlyRecords(data.records)
    );
    const member = data.members.find(m => m.id === controller.user?.id);
    if (!member?.permissions.includes('edit')) return view;
    const name = input('任务名称');
    view.append(
      name.wrapper,
      button('开始修改', () =>
        perform(async () => {
          if (editor.dirty) throw new Error('先保存当前输入');
          await controller.createTask(name.control.value);
          editor.clear();
        })
      )
    );
    const tasks = row();
    data.tasks
      .filter(task => task.ownerId === controller.user?.id)
      .forEach(task =>
        tasks.append(
          button(tx("打开任务：{v0}", { v0: task.name }), () =>
            perform(async () => {
              if (editor.dirty) throw new Error('先保存当前输入');
              await controller.openTask(task.id);
            })
          )
        )
      );
    view.append(tasks);
    if (options.importAnonymous) view.append(button('预览匿名数据导入', () => perform(importPreview)));
    return view;
  }
  async function importPreview() {
    const records = await options.importAnonymous!();
    const data = controller.snapshot!;
    const dialog = element('dialog', '', 'modal');
    const content = element('div', '', 'modal-box max-w-4xl space-y-4');
    const name = input('导入任务名称', '导入本机资产');
    const collisions = Object.keys(records).filter(id => Object.hasOwn(data.records, id));
    const checks = checkRecords({ ...data.records, ...records });
    content.append(element('p', tx("同 ID 记录：{v0}；完整性或唯一性冲突：{v1}", { v0: collisions.length, v1: checks.length })));
    collisions.forEach(id => content.append(element('p', tx("同 ID 记录将采用本机内容：{v0}", { v0: id }))));
    checks.forEach(check => content.append(element('p', `${check.recordId} / ${check.field}：${check.message}`)));
    content.append(
      element('h2', tx("将 {v0} 条本机记录复制到 {v1} 的新任务", { v0: Object.keys(records).length, v1: data.name }), 'font-semibold'),
      element('p', '原匿名库保持原样；导入不会直接同步或修改共享数据。'),
      readOnlyRecords(records),
      name.wrapper
    );
    content.append(
      button('取消', () => {
        dialog.close();
        dialog.remove();
      }),
      button('确认复制到新任务', () => {
        dialog.close();
        dialog.remove();
        return perform(async () => {
          if (editor.dirty) throw new Error('先保存当前输入');
          await controller.createTask(name.control.value);
          await controller.save({ ...controller.draft!.records, ...records });
          editor.clear();
        });
      })
    );
    dialog.append(content);
    document.body.append(dialog);
    dialog.showModal();
  }
  function historyView() {
    const data = controller.snapshot!;
    const view = section('历史与审计');
    const timeline = element('details');
    timeline.append(element('summary', tx("{v0} 条审计事件", { v0: data.audit.length })));
    data.audit.forEach(event =>
      timeline.append(
        element(
          'p',
          `${new Date(event.at).toLocaleString()} · ${event.actorId} · ${event.action} · ${JSON.stringify(event.details)}`,
          'text-xs break-all'
        )
      )
    );
    view.append(timeline);
    for (const commit of Object.values(data.commits)) {
      const item = element('details');
      item.append(
        element('summary', `${commit.message} · ${commit.authorId} · ${commit.id}`),
        element('p', tx("父提交：{v0}", { v0: commit.parent ?? '空' }), 'text-xs'),
        readOnlyRecords(commit.records)
      );
      if (data.members.find(m => m.id === controller.user?.id)?.permissions.includes('edit'))
        item.append(
          button('从此版本创建恢复草稿', () =>
            perform(async () => {
              if (editor.dirty) throw new Error('先保存当前输入');
              await controller.createTask(tx("恢复 {v0}", { v0: commit.message }));
              await controller.save(commit.records);
              editor.clear();
            })
          )
        );
      view.append(item);
    }
    return view;
  }
  function notificationsView() {
    const data = controller.snapshot!;
    const view = section(tx("通知（{v0} 条未读）", { v0: data.notifications.filter(n => !n.read).length }));
    data.notifications.forEach(notice =>
      view.append(
        button(
          `${notice.read ? tx('已读') : tx('未读')} · ${data.prs.find(pr => pr.id === notice.prId)?.title ?? notice.prId}`,
          () =>
            perform(async () => {
              await controller.run({ type: 'read_notice', id: notice.id });
              prs.selected = notice.prId;
              prs.focusThread = notice.threadId;
              prs.tab = notice.threadId ? 'discussion' : 'checks';
            })
        )
      )
    );
    view.append(
      element(
        'p',
        tx("在线成员：{v0}（45 秒心跳超时）", { v0: data.presence.map(p => `${data.members.find(m => m.id === p.userId)?.email ?? p.userId}${p.prId ? `（PR ${p.prId}）` : ''}`).join('、') || '暂无' }),
        'text-sm'
      )
    );
    return view;
  }
  render();
  const unsubscribeLanguage = options.subscribeLanguage?.(render);
  void perform(() => controller.initialize());
  void prepareOfflineShell()
    .then(() => {
      if (!disposed) host.dataset['offlineReady'] = 'true';
    })
    .catch(error => {
      if (!disposed) void controller.failure(error);
    });
  return () => {
    disposed = true;
    unsubscribeLanguage?.();
    clearInterval(heartbeat);
    document.removeEventListener('click', navigate, true);
    window.removeEventListener('beforeunload', leave);
    window.removeEventListener('online', connectivity);
    window.removeEventListener('offline', connectivity);
    controller.removeEventListener('change', change);
    host.removeEventListener('input', formDrafts.remember);
    host.removeEventListener('change', formDrafts.remember);
    controller.dispose();
    host.replaceChildren();
  };
}
