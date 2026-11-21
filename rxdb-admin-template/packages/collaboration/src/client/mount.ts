import type { Notice, Records, SchemaManifest } from '../model.js';
import { adminView } from './admin-view.js';
import { canManage, pageHeader, viewTabs, type CollaborationView, type HeaderActions } from './chrome.js';
import { CollaborationController, type WorkspaceEntry } from './controller.js';
import type { Disclosures } from './disclosure.js';
import { alert, button, element, emptyState } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { historyView } from './history-view.js';
import { parseInvitationLink } from './invitation-link.js';
import { useLabels, type CollaborationLabels } from './labels.js';
import { notificationsView } from './notifications-view.js';
import { prepareOfflineShell } from './offline-shell.js';
import { PullRequestView } from './pr-view.js';
import { authSession, type AuthSession } from './session.js';
import type { TaskEntry } from './task-ledger.js';
import { taskView, type TaskPrActions } from './task-view.js';
import { openTeamDatabase, type TeamDatabaseFactory } from './team-database.js';
import type { RenderTeamEditor } from './team-editor.js';
import { openInvitationDialog, teamPicker, type TeamPickerActions } from './team-picker.js';
import { tx, useTranslation, type Translate } from './translate.js';
import { UnsavedInput } from './unsaved-input.js';
import { hasPermission, importPreview, noTaskNotice, sharedPanel, tasksPanel } from './workspace-view.js';
/** 挂载协作界面时的选项；三端应用传入的内容对称。 */
export interface CollaborationOptions {
  /** 协作 HTTP 接口的路径前缀，默认 `/collaboration-api`（开发与预览服务器把它代理到真实服务端）。 */
  apiBase?: string;
  /** 应用的全局登录会话，默认 `authSession(apiBase)`；登录与退出在全局登录页与顶栏账号菜单里，团队协作只跟随它的身份。 */
  session?: AuthSession;
  /** 会话失效时页面上「去登录」的去处（应用跳到登录页，并记下回到这里的地址）。 */
  signIn?: () => void;
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

/** 一次重绘里各区域的内容：顶栏、提示、左栏、主栏（编辑区上方与下方），以及编辑区与分区页签是否显示。 */
interface Regions {
  top: HTMLElement[];
  aside: HTMLElement[];
  main: HTMLElement[];
  bottom: HTMLElement[];
  editor: boolean;
  tabs: boolean;
}

/**
 * 三端共享的协作界面，所有用户内容均通过文本节点渲染。
 *
 * @remarks
 * 页面结构：吸顶的顶栏（标题、团队切换、连接状态、在线成员与账号，进入团队后下面是分区页签）、提示条，以及内容区。
 * 未登录时内容区是居中的登录卡片；登录后还没进团队时是团队卡片与接受邀请；进入团队后按页签分为工作区（左栏「我的任务」，
 * 主栏是任务状态条、编辑区与共享数据）、数据 PR、历史与审计、通知与成员与权限。
 *
 * 除编辑区外，各区域每次变化整块重绘；编辑区交给应用的 `renderEditor`，在同一个任务打开期间保持不动，不随面板重绘而重建，
 * 切到其他页签时只隐藏、不卸载。任务切换、关闭或会话锁定时，先卸载编辑界面，控制器才切分支或关库；打开新任务时自动回到工作区。
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
  const apiBase = options.apiBase ?? '/collaboration-api';
  const session = options.session ?? authSession(apiBase);
  const controller = new CollaborationController(
    apiBase,
    scope => openTeamDatabase(options.createTeamDatabase, scope),
    undefined,
    session
  );
  // 编辑界面里还有没保存的输入时，顶栏账号菜单的「退出账号」也被拦下
  const unguard = session.guardLogout(() => controller.ensureSaved());
  const formDrafts = new FormDrafts(host);
  host.addEventListener('input', formDrafts.remember);
  host.addEventListener('change', formDrafts.remember);
  const frame = element('div', '', 'mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-4 pb-6 md:px-6');
  const top = element('div');
  const alerts = element('div', '', 'flex flex-col gap-3 empty:hidden');
  const body = element('div');
  body.id = 'collaboration-panel';
  const aside = element('aside', '', 'flex min-w-0 flex-col gap-4');
  const main = element('div', '', 'flex min-w-0 flex-col gap-4');
  const mainTop = element('div', '', 'flex min-w-0 flex-col gap-4 empty:hidden');
  const editorHost = element('section', '', 'min-w-0 rounded-box border border-base-300 bg-base-100 p-3 sm:p-4');
  const mainBottom = element('div', '', 'flex min-w-0 flex-col gap-4 empty:hidden');
  editorHost.hidden = true;
  main.append(mainTop, editorHost, mainBottom);
  body.append(aside, main);
  frame.append(top, alerts, body);
  host.className = 'collaboration page-host group overflow-auto';
  host.replaceChildren(frame);
  /** 正在显示的编辑界面：任务与分支组成的键，以及应用交回的卸载函数。 */
  let editor: { key: string; dispose: () => void } | undefined;
  let busy = 0;
  let disposed = false;
  /** 进入团队后当前的分区。 */
  let view: CollaborationView = 'workspace';
  /** 这次重绘里编辑区是否该显示（工作区分区、或离线打开的任务）。 */
  let editorVisible = false;
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
  /** 换团队或换上下文：清掉 PR 的选中状态，回到工作区。 */
  const switchContext = (work: () => Promise<void>) =>
    perform(async () => {
      prs.selected = null;
      prs.selectedRecord = null;
      view = 'workspace';
      await work();
    });
  const acceptInvitation = async (link: string) => {
    const invite = parseInvitationLink(link);
    prs.selected = null;
    prs.selectedRecord = null;
    view = 'workspace';
    await controller.acceptInvitation(invite.teamId, invite.appId, invite.id, invite.token);
    history.replaceState(null, '', location.pathname);
    controller.notify('邀请已接受', 'success');
  };
  const pickerActions: TeamPickerActions = {
    perform,
    selectWorkspace: (workspace: WorkspaceEntry) => switchContext(() => controller.selectWorkspace(workspace)),
    openOffline: (entry: TaskEntry) => switchContext(() => controller.openOffline(entry)),
    acceptInvitation
  };
  const headerActions: HeaderActions = {
    perform,
    selectWorkspace: pickerActions.selectWorkspace,
    openInvitation: () => openInvitationDialog(pickerActions)
  };
  const showEditor = () => {
    editorHost.hidden = !editor || !editorVisible;
  };
  /** 编辑界面跟随打开着的任务：任务或分支变了先卸载旧的，再在同一个编辑区里渲染新的；打开新任务时回到工作区。 */
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
    if (!task || !database) {
      showEditor();
      return;
    }
    discardedInput = false;
    view = 'workspace';
    editorVisible = true;
    const container = element('div');
    editorHost.append(container);
    editor = {
      key,
      dispose: options.renderEditor(container, {
        database: database.rxdb,
        task: { id: task.context.taskId, name: task.name },
        reportDirty: unsaved.open()
      })
    };
    showEditor();
    // 团队库打开之后才懒加载的资源（sqlite-wasm 等）也交给离线外壳缓存，离线冷启动才能打开这个任务
    refreshOfflineShell();
  };
  const change = () => {
    syncEditor();
    const active = document.activeElement;
    const typing =
      !!active && host.contains(active) && !editorHost.contains(active) && active.matches('input, select, textarea');
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
  /** 点在下拉之外即收起（团队切换、在线成员）。 */
  const closeMenus = (event: Event) => {
    for (const menu of host.querySelectorAll<HTMLDetailsElement>('details.dropdown[open]'))
      if (!(event.target instanceof Node && menu.contains(event.target))) menu.open = false;
  };
  /** Esc 收起展开着的下拉，焦点回到它的开关上。 */
  const escapeMenus = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    for (const menu of host.querySelectorAll<HTMLDetailsElement>('details.dropdown[open]')) {
      menu.open = false;
      menu.querySelector<HTMLElement>(':scope > summary')?.focus();
    }
  };
  document.addEventListener('click', closeMenus);
  host.addEventListener('keydown', escapeMenus);
  function renderPage() {
    syncEditor();
    if (view === 'members' && !canManage(controller)) view = 'workspace';
    // 在线状态经 Realtime Presence 上报当前查看的 PR 与记录（只在 PR 分区里），只在变化时发送，不调用命令接口
    controller.trackPresence(view === 'prs' ? prs.selected : null, view === 'prs' ? prs.selectedRecord : null);
    formDrafts.rememberDisclosures();
    const disclosure = formDrafts.focusedDisclosure();
    const active = document.activeElement;
    const typed = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const focusLabel = typed && !editorHost.contains(typed) ? typed.getAttribute('aria-label') : null;
    const selection = typed?.selectionStart ?? null;
    const layout = regions();
    top.className =
      layout.tabs ?
        'sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-base-300 bg-base-100/95 px-4 pt-4 backdrop-blur md:-mx-6 md:px-6'
      : 'sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-base-300 bg-base-100/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6';
    top.replaceChildren(...layout.top);
    alerts.replaceChildren(...notices());
    aside.replaceChildren(...layout.aside);
    mainTop.replaceChildren(...layout.main);
    mainBottom.replaceChildren(...layout.bottom);
    aside.hidden = !layout.aside.length;
    body.className =
      layout.aside.length ? 'grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]' : 'flex flex-col gap-4';
    if (layout.tabs) {
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('aria-labelledby', `collaboration-tab-${view}`);
    } else {
      body.removeAttribute('role');
      body.removeAttribute('aria-labelledby');
    }
    editorVisible = layout.editor;
    editorHost.setAttribute('aria-label', tx('编辑任务数据'));
    showEditor();
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
  /** 按登录与团队状态决定各区域的内容。 */
  function regions(): Regions {
    const top = [pageHeader(controller, headerActions)];
    const empty = { aside: [], bottom: [], editor: false, tabs: false };
    if (!controller.user) return { ...empty, top, main: [signedOut()] };
    if (!controller.snapshot) {
      // 离线打开的本机任务：没有团队页，只有任务状态与编辑区
      if (controller.task) return { ...empty, top, main: [taskView(controller, perform, disclosures)], editor: true };
      return { ...empty, top, main: [teamPicker(controller, pickerActions)] };
    }
    top.push(viewTabs(controller, view, chooseView));
    if (view === 'workspace') {
      const read = options.importAnonymous;
      const aside =
        hasPermission(controller, 'edit') ?
          [tasksPanel(controller, perform, read && (() => importPreview(controller, perform, read)))]
        : [];
      const main =
        controller.task ? [taskView(controller, perform, disclosures, taskPr())] : [noTaskNotice(controller)];
      return { top, aside, main, bottom: [sharedPanel(controller)], editor: true, tabs: true };
    }
    const content = {
      prs: () => prs.view(),
      history: () => historyView(controller, perform, disclosures),
      notifications: () => notificationsView(controller, perform, openNotice),
      members: () => adminView(controller, perform)
    }[view]();
    return { ...empty, top, main: [content], tabs: true };
  }
  /** 会话失效或已退出（应用的路由随后会带到登录页）：说明并提供「去登录」。 */
  function signedOut(): HTMLElement {
    const actions =
      options.signIn ? [button('去登录', options.signIn, false, { tone: 'primary', icon: 'log-in' })] : [];
    return emptyState('lock', '登录后使用团队协作', '登录状态已失效或已退出，重新登录后回到这里。', actions);
  }
  function chooseView(next: CollaborationView, focus: boolean) {
    view = next;
    render();
    if (focus) document.getElementById(`collaboration-tab-${next}`)?.focus();
  }
  function dismissMessage() {
    controller.notify('');
    render();
  }
  /** 任务状态条里的 PR 入口：已有进行中的 PR 就去查看，否则在任务有同步过的提交、且有编辑权限时可以创建。 */
  function taskPr(): TaskPrActions {
    const task = controller.task!;
    const data = controller.snapshot!;
    const open = data.prs.find(pr => pr.taskId === task.context.taskId && ['draft', 'review'].includes(pr.status));
    // 任务已有同步到服务端的提交时才可建 PR；远端头还是共享分支根，就是从空分支起步、一次都没同步过
    const ready = task.remoteHead !== data.root && hasPermission(controller, 'edit');
    return {
      openPr: open && { id: open.id, title: open.title },
      showPr: id => {
        prs.show(id);
        view = 'prs';
        render();
      },
      createPr:
        ready ?
          () =>
            prs.openCreate({ id: task.context.taskId, name: task.name, remoteHead: task.remoteHead }, () => {
              view = 'prs';
            })
        : undefined
    };
  }
  /** 点开一条通知：切到 PR 分区并选中它，有讨论线程时打开讨论并定位，否则打开检查。 */
  function openNotice(notice: Notice) {
    prs.show(notice.prId, notice.threadId ? 'discussion' : 'checks');
    prs.focusThread = notice.threadId;
    prs.filter = 'all';
    view = 'prs';
  }
  /** 页头下方的提示：最近一条提示、丢弃输入的说明与待确认的请求。 */
  function notices(): HTMLElement[] {
    const list: HTMLElement[] = [];
    if (controller.user && controller.message)
      list.push(alert(controller.message, controller.messageTone, dismissMessage));
    if (discardedInput) {
      const notice = alert('编辑界面已关闭，其中还没保存的输入已丢弃', 'warning');
      notice.dataset['discardedInput'] = 'true';
      list.push(notice);
    }
    if (controller.user && controller.pending()) list.push(pendingView());
    return list;
  }
  /**
   * 上次未确认的请求：还在自动重试期限内时按原幂等键确认或重试；超过期限后回执可能已被服务端清理，
   * 无法再确认它是否生效，说明原因并由用户选择重新发送或放弃。
   */
  function pendingView() {
    const content = element('div', '', 'flex flex-wrap items-center justify-between gap-3');
    const actions = element('div', '', 'flex flex-wrap gap-2');
    if (!controller.pendingExpired()) {
      content.append(element('p', '上次请求还没有得到确认：可以按原请求确认结果或重试'));
      actions.append(
        button('确认或重试上次请求', () => perform(() => controller.retryPending()), false, {
          tone: 'primary',
          icon: 'refresh-cw'
        })
      );
    } else {
      content.append(element('p', '上次请求已超过回执保留期，无法确认是否已生效，请核对团队状态后重新发送或放弃'));
      actions.append(
        button('重新发送上次请求', () => perform(() => controller.resendPending()), false, { icon: 'send' }),
        button('放弃上次请求', () => perform(async () => controller.discardPending()), false, { tone: 'ghost' })
      );
    }
    content.append(actions);
    return alert(content, 'warning');
  }
  function restoreFocus(label: string, selection: number | null) {
    const candidates = [
      ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[aria-label], textarea[aria-label]')
    ];
    const target = candidates.find(node => node.getAttribute('aria-label') === label && !editorHost.contains(node));
    if (!target) return;
    target.focus({ preventScroll: true });
    // email、number 等类型的输入框不支持选区，调用 setSelectionRange 会抛错
    const selectable =
      target instanceof HTMLTextAreaElement || ['text', 'search', 'password', 'tel', 'url'].includes(target.type);
    if (selection !== null && selectable) target.setSelectionRange(selection, selection);
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
  render();
  const unsubscribeLanguage = options.subscribeLanguage?.(render);
  void perform(() => controller.initialize());
  refreshOfflineShell();
  return () => {
    disposed = true;
    unguard();
    unsubscribeLanguage?.();
    window.removeEventListener('online', connectivity);
    window.removeEventListener('offline', connectivity);
    document.removeEventListener('click', closeMenus);
    host.removeEventListener('keydown', escapeMenus);
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
