import { checkRecords } from '../checks.js';
import type { Records, SchemaManifest } from '../model.js';
import { adminView } from './admin-view.js';
import { CollaborationController } from './controller.js';
import type { Disclosures } from './disclosure.js';
import { button, element, input, loading, row, section } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { historyView } from './history-view.js';
import { importLimit } from './import-anonymous.js';
import { carriesInvitation, parseInvitationLink } from './invitation-link.js';
import { useLabels, type CollaborationLabels } from './labels.js';
import { loginView, type LoginDraft } from './login-view.js';
import { prepareOfflineShell } from './offline-shell.js';
import { PullRequestView } from './pr-view.js';
import { readOnlyRecords } from './records-view.js';
import { taskView } from './task-view.js';
import { openTeamDatabase, type TeamDatabaseFactory } from './team-database.js';
import type { RenderTeamEditor } from './team-editor.js';
import { tx, useTranslation, type Translate } from './translate.js';
import { UnsavedInput } from './unsaved-input.js';
/** 挂载协作界面时的选项；三端应用传入的内容对称。 */
export interface CollaborationOptions {
  /** 协作 HTTP 接口的路径前缀，默认 `/collaboration-api`（开发与预览服务器把它代理到真实服务端）。 */
  apiBase?: string;
  /** 应用的翻译函数，入参是 `collaboration.<中文原文>` 形式的消息键与占位符取值；不传则直接显示中文原文。 */
  translate?: Translate;
  /** 订阅应用的语言切换，收到通知后重新渲染；返回取消订阅函数，卸载界面时调用。 */
  subscribeLanguage?: (listener: () => void) => () => void;
  /**
   * 读取匿名本机库里属于工作区数据模式清单的全部记录，供「预览匿名数据导入」使用；不传则不显示该入口。
   * `schema` 是当前工作区的清单（决定读哪些实体与字段）。只读取，不修改匿名库。
   */
  importAnonymous?: (schema: SchemaManifest) => Promise<Records>;
  /** 实体与字段在只读面板（共享数据、提交、候选与导入预览）上的标签（中文原文，经词条表翻译）；不传则实体显示实体名、字段显示清单里声明的显示名。 */
  labels?: CollaborationLabels;
  /**
   * 团队库工厂（ADMIN-US-221）：按「用户 × 团队 × 应用」返回尚未初始化的 RxDB，约定见 {@link TeamDatabaseFactory}。
   * 协作包在第一次打开任务时打开它（装上 working-tree 并在空库上启用），切换团队、退出或锁定时关闭。
   */
  createTeamDatabase: TeamDatabaseFactory;
  /** 任务的编辑界面（ADMIN-US-221 AC#4）：应用用模型驱动组件渲染团队库的实体列表与表单，约定见 {@link RenderTeamEditor}。 */
  renderEditor: RenderTeamEditor;
}

/**
 * 三端共享的协作界面，所有用户内容均通过文本节点渲染。
 *
 * @remarks
 * 宿主元素分三块：上方的面板（登录、团队、共享数据、任务状态与动作）与下方的面板（PR、历史、通知、管理）每次变化整块重绘；
 * 中间的编辑区交给应用的 `renderEditor`，在同一个任务打开期间保持不动，不随面板重绘而重建。任务切换、关闭或会话锁定时，
 * 先卸载编辑界面，控制器才切分支或关库。
 *
 * 编辑界面经 `reportDirty` 报告对话框里还没保存的输入（ADMIN-US-205 AC#5）：有的时候任务状态里另起一行标出，离开页面前浏览器提示，
 * 控制器拦下同步、切换与退出；会话失效引起的锁定拦不住，编辑界面随之卸载、输入丢弃，面板上说明这一点。
 * @param host 承载界面的容器元素；卸载时会清空其内容。
 * @param options 团队库工厂、编辑界面，以及接口前缀、翻译与匿名数据导入等可选项。
 * @returns 卸载函数：移除全部监听、卸载编辑界面、离开实时频道、释放控制器并清空容器。
 */
export function mountCollaboration(host: HTMLElement, options: CollaborationOptions): () => void {
  useTranslation(options.translate);
  useLabels(options.labels);
  const controller = new CollaborationController(options.apiBase ?? '/collaboration-api', scope =>
    openTeamDatabase(options.createTeamDatabase, scope)
  );
  const formDrafts = new FormDrafts(host);
  host.addEventListener('input', formDrafts.remember);
  host.addEventListener('change', formDrafts.remember);
  const top = element('div', '', 'space-y-4');
  const editorHost = element('section', '', 'rounded-lg border border-base-300 p-4 space-y-3');
  const bottom = element('div', '', 'space-y-4');
  editorHost.hidden = true;
  host.className = 'collaboration page-host overflow-auto p-4 md:p-6 space-y-4';
  host.replaceChildren(top, editorHost, bottom);
  /** 正在显示的编辑界面：任务与分支组成的键，以及应用交回的卸载函数。 */
  let editor: { key: string; dispose: () => void } | undefined;
  let busy = 0;
  let disposed = false;
  /** 登录表单里还没提交的输入，整块重绘之间保留。 */
  const loginDraft: LoginDraft = { email: '', token: '' };
  const render = () => {
    if (!disposed) renderPage();
  };
  /** 编辑界面里未保存的输入：报告改变状态时同步给控制器（它据此拦下同步与切换）并重绘任务状态。 */
  const unsaved = new UnsavedInput(window, dirty => {
    controller.unsavedInput = dirty;
    render();
  });
  /** 上一个编辑界面卸载时还有没保存的输入、随之丢弃了（会话失效引起的锁定拦不住）：面板上说明，直到再打开一个编辑界面。 */
  let discardedInput = false;
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
  const disclosures: Disclosures = { isOpen: key => formDrafts.isOpen(key), reveal: render };
  const prs = new PullRequestView(controller, perform, render, disclosures);
  /** 编辑界面跟随打开着的任务：任务或分支变了先卸载旧的，再在同一个编辑区里渲染新的；没有任务时隐藏编辑区。 */
  const syncEditor = () => {
    const task = controller.task;
    const database = controller.teamDatabase();
    const key = task && database ? JSON.stringify([database.scope, task.context.taskId, task.branchId]) : '';
    if (editor?.key === key) return;
    // 先作废旧编辑界面的报告入口再卸载它：卸载时实体列表补报的 false 不再触发重绘，重绘会再走到这里
    if (unsaved.close()) discardedInput = true;
    controller.unsavedInput = false;
    editor?.dispose();
    editor = undefined;
    editorHost.replaceChildren();
    editorHost.hidden = !key;
    if (!task || !database) return;
    discardedInput = false;
    const container = element('div');
    editorHost.append(element('h2', '编辑任务数据', 'text-lg font-semibold'), container);
    editor = {
      key,
      dispose: options.renderEditor(container, {
        database: database.rxdb,
        task: { id: task.context.taskId, name: task.name },
        reportDirty: unsaved.open()
      })
    };
    // 团队库打开之后才懒加载的资源（sqlite-wasm 等）也交给离线外壳缓存，离线冷启动才能打开这个任务
    refreshOfflineShell();
  };
  const change = () => {
    syncEditor();
    const active = document.activeElement;
    const typing =
      !!active && (top.contains(active) || bottom.contains(active)) && active.matches('input, select, textarea');
    if (controller.user && !busy && typing) return;
    render();
  };
  controller.addEventListener('change', change);
  const connectivity = () => {
    controller.online = navigator.onLine;
    controller.changed();
    void controller.reconnect().catch(error => controller.failure(error));
  };
  window.addEventListener('online', connectivity);
  window.addEventListener('offline', connectivity);
  function renderPage() {
    syncEditor();
    // 在线状态经 Realtime Presence 上报当前查看的 PR 与记录，只在变化时发送，不调用命令接口
    controller.trackPresence(prs.selected, prs.selectedRecord);
    formDrafts.rememberDisclosures();
    const disclosure = formDrafts.focusedDisclosure();
    const active = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
    const focusLabel = active && !editorHost.contains(active) ? active.getAttribute('aria-label') : null;
    const selection = active?.selectionStart ?? null;
    top.replaceChildren(...topPanels());
    bottom.replaceChildren(...bottomPanels());
    if (prs.focusThread) {
      host.querySelector(`#thread-${CSS.escape(prs.focusThread)}`)?.scrollIntoView({ block: 'center' });
      prs.focusThread = null;
    }
    formDrafts.restore(
      JSON.stringify([
        controller.user?.id,
        controller.workspace?.teamId,
        controller.workspace?.appId,
        controller.task?.context.taskId,
        prs.selected
      ]),
      JSON.stringify([controller.user?.id, controller.workspace?.teamId, controller.workspace?.appId])
    );
    if (focusLabel) restoreFocus(focusLabel, selection);
    if (disclosure) formDrafts.focusDisclosure(disclosure);
  }
  /** 编辑区上方的面板：标题与连接状态、登录或团队选择、待确认请求、共享数据与任务入口、打开着的任务。 */
  function topPanels(): HTMLElement[] {
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
    const status = element(
      'p',
      controller.online ? tx('在线 · 云端操作按当前权限校验') : tx('离线 · 仅能编辑已解锁的本机任务'),
      'text-sm'
    );
    status.setAttribute('role', 'status');
    const panels: HTMLElement[] = [header, status];
    if (controller.message) {
      const alert = element('p', controller.message, 'rounded border border-base-300 p-3');
      alert.setAttribute('role', 'status');
      panels.push(alert);
    }
    if (discardedInput) {
      const notice = element('p', '编辑界面已关闭，其中还没保存的输入已丢弃', 'rounded border border-base-300 p-3');
      notice.setAttribute('role', 'status');
      notice.dataset['discardedInput'] = 'true';
      panels.push(notice);
    }
    if (!controller.user) {
      panels.push(loginView(controller, perform, loginDraft));
      return panels;
    }
    panels.push(workspacesView(), invitationView());
    if (controller.workspace && controller.online)
      panels.push(button('刷新团队状态', () => perform(() => controller.refresh())));
    if (controller.pending()) panels.push(pendingView());
    if (controller.snapshot) panels.push(workspaceView());
    if (controller.task) panels.push(taskView(controller, perform, disclosures));
    return panels;
  }
  /** 编辑区下方的面板：数据 PR、历史与审计、通知与成员管理。 */
  function bottomPanels(): HTMLElement[] {
    if (!controller.user || !controller.snapshot) return [];
    const panels = [prs.view(), historyView(controller, perform, disclosures), notificationsView()];
    if (controller.snapshot.members.find(m => m.id === controller.user?.id)?.permissions.includes('manage'))
      panels.push(adminView(controller, perform));
    return panels;
  }
  function restoreFocus(label: string, selection: number | null) {
    const candidates = [...host.querySelectorAll<HTMLInputElement>('input[aria-label]')];
    const target = candidates.find(node => node.getAttribute('aria-label') === label && !editorHost.contains(node));
    if (!target) return;
    target.focus({ preventScroll: true });
    // email、number 等类型的输入框不支持选区，调用 setSelectionRange 会抛错
    if (selection !== null && ['text', 'search', 'password', 'tel', 'url'].includes(target.type))
      target.setSelectionRange(selection, selection);
  }
  /** 重新把已加载的资源交给离线外壳缓存；进行中标记为未就绪，完成后标回就绪。 */
  function refreshOfflineShell() {
    host.dataset['offlineReady'] = 'false';
    void prepareOfflineShell()
      .then(() => {
        if (!disposed) host.dataset['offlineReady'] = 'true';
      })
      .catch(error => {
        if (!disposed) void controller.failure(error);
      });
  }
  function workspacesView() {
    const view = section('选择团队');
    const switchContext = (work: () => Promise<void>) =>
      perform(async () => {
        prs.selected = null;
        prs.selectedRecord = null;
        await work();
      });
    controller.workspaces.forEach(workspace =>
      view.append(button(workspace.name, () => switchContext(() => controller.selectWorkspace(workspace))))
    );
    controller.offlineDrafts.forEach(entry =>
      view.append(
        button(tx('离线任务：{v0}', { v0: entry.name }), () => switchContext(() => controller.openOffline(entry)))
      )
    );
    if (!controller.workspaces.length && !controller.offlineDrafts.length)
      view.append(element('p', '暂无可访问团队，请接受邀请。登录不会自动成为管理员。'));
    return view;
  }
  /**
   * 上次未确认的请求：还在自动重试期限内时按原幂等键确认或重试；超过期限后回执可能已被服务端清理，
   * 无法再确认它是否生效，说明原因并由用户选择重新发送或放弃。
   */
  function pendingView() {
    if (!controller.pendingExpired())
      return button('确认或重试上次请求', () => perform(() => controller.retryPending()));
    const view = row();
    view.append(
      element('p', '上次请求已超过回执保留期，无法确认是否已生效，请核对团队状态后重新发送或放弃', 'text-sm'),
      button('重新发送上次请求', () => perform(() => controller.resendPending())),
      button('放弃上次请求', () => perform(async () => controller.discardPending()))
    );
    return view;
  }
  function invitationView() {
    const view = element('details');
    view.dataset['disclosureKey'] = 'invitation';
    view.append(element('summary', '接受团队邀请'));
    const link = input('邀请链接', carriesInvitation(location.href) ? location.href : '');
    view.append(link.wrapper);
    view.append(
      button('接受邀请', () =>
        perform(async () => {
          const invite = parseInvitationLink(link.control.value);
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
    const view = section(tx('共享数据 · {v0}', { v0: data.name }));
    const shared = controller.sharedRecords();
    const schema = controller.schema();
    view.append(
      element(
        'p',
        // 头还是共享分支根：还没有任何合并
        tx('共享版本：{v0} · 默认只读', { v0: data.head === data.root ? tx('空分支') : data.head }),
        'text-sm break-all'
      ),
      shared && schema ? readOnlyRecords(shared, schema) : loading()
    );
    const member = data.members.find(m => m.id === controller.user?.id);
    if (!member?.permissions.includes('edit')) return view;
    const name = input('任务名称');
    view.append(
      name.wrapper,
      button('开始修改', () => perform(() => controller.createTask(name.control.value)))
    );
    const tasks = row();
    data.tasks
      .filter(task => task.ownerId === controller.user?.id)
      .forEach(task =>
        tasks.append(button(tx('打开任务：{v0}', { v0: task.name }), () => perform(() => controller.openTask(task.id))))
      );
    if (data.earlier.tasks) tasks.append(button('加载更早的任务', () => perform(() => controller.loadEarlierTasks())));
    view.append(tasks);
    if (options.importAnonymous) view.append(button('预览匿名数据导入', () => perform(importPreview)));
    return view;
  }
  /**
   * 预览匿名数据导入：数量、同 ID 记录与完整性冲突，确认后复制到新任务的工作树（不提交、不上传）。
   * 记录数超过单个提交的变更上限时不能确认：工作树一次提交整棵，超过的同步不上去。
   */
  async function importPreview() {
    const schema = await controller.loadSchema();
    const records = await options.importAnonymous!(schema);
    const shared = await controller.loadSharedRecords();
    const data = controller.snapshot!;
    const count = Object.keys(records).length;
    const dialog = element('dialog', '', 'modal');
    const content = element('div', '', 'modal-box max-w-4xl space-y-4');
    const name = input('导入任务名称', '导入本机资产');
    const collisions = Object.keys(records).filter(id => Object.hasOwn(shared, id));
    const checks = checkRecords(schema, { ...shared, ...records });
    content.append(
      element('p', tx('同 ID 记录：{v0}；完整性或唯一性冲突：{v1}', { v0: collisions.length, v1: checks.length }))
    );
    collisions.forEach(id => content.append(element('p', tx('同 ID 记录将采用本机内容：{v0}', { v0: id }))));
    checks.forEach(check => content.append(element('p', `${check.recordId} / ${check.field}：${tx(check.message)}`)));
    content.append(
      element('h2', tx('将 {v0} 条本机记录复制到 {v1} 的新任务', { v0: count, v1: data.name }), 'font-semibold'),
      element('p', '原匿名库保持原样；导入不会直接同步或修改共享数据。')
    );
    if (count > importLimit)
      content.append(
        element(
          'p',
          tx('本机记录超过单个提交的上限（{v0} 条），请先在本机工作台分批整理后再导入', { v0: importLimit }),
          'text-error'
        )
      );
    content.append(readOnlyRecords(records, schema), name.wrapper);
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    content.append(
      button('取消', close),
      button(
        '确认复制到新任务',
        () => {
          close();
          return perform(() => controller.importRecords(name.control.value, records, schema));
        },
        count > importLimit
      )
    );
    dialog.append(content);
    document.body.append(dialog);
    dialog.showModal();
  }
  function notificationsView() {
    const data = controller.snapshot!;
    const view = section(tx('通知（{v0} 条未读）', { v0: data.unread }));
    if (data.earlier.notices)
      view.append(button('加载更早的通知', () => perform(() => controller.loadEarlierNotices())));
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
              prs.filter = 'all';
            })
        )
      )
    );
    view.append(
      element(
        'p',
        tx('在线成员：{v0}', {
          v0:
            data.presence
              .map(
                p =>
                  `${data.members.find(m => m.id === p.userId)?.email ?? p.userId}${p.prId ? `（PR ${p.prId}）` : ''}${p.recordId ? `（${p.recordId}）` : ''}`
              )
              .join('、') || tx('暂无')
        }),
        'text-sm'
      )
    );
    return view;
  }
  render();
  const unsubscribeLanguage = options.subscribeLanguage?.(render);
  void perform(() => controller.initialize());
  refreshOfflineShell();
  return () => {
    disposed = true;
    unsubscribeLanguage?.();
    window.removeEventListener('online', connectivity);
    window.removeEventListener('offline', connectivity);
    controller.removeEventListener('change', change);
    host.removeEventListener('input', formDrafts.remember);
    host.removeEventListener('change', formDrafts.remember);
    // 撤下离开提示：协作界面整个卸载了，编辑界面随之卸载
    unsaved.close();
    editor?.dispose();
    editor = undefined;
    controller.dispose();
    host.replaceChildren();
  };
}
