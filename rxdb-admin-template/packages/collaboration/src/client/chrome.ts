import type { Presence } from '../model.js';
import type { CollaborationController, WorkspaceEntry } from './controller.js';
import { avatar, button, dropdown, element, iconTile, statusDot, tabList, type Perform, type TabItem } from './elements.js';
import { personName } from './format.js';
import { icon, type IconName } from './icons.js';
import { tx } from './translate.js';

/** 团队协作页登录并选好团队之后的分区，对应顶栏下方的页签。 */
export type CollaborationView = 'workspace' | 'prs' | 'history' | 'notifications' | 'members';

/** 顶栏用到的动作，由挂载方提供。 */
export interface HeaderActions {
  perform: Perform;
  /** 切换到另一个团队（挂载方顺带清掉 PR 的选中状态）。 */
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  /** 打开「接受团队邀请」对话框。 */
  openInvitation: () => void;
}

/**
 * 团队协作的页头：标题与团队切换在左；连接状态、在线成员与刷新在右。账号与退出在后台外壳顶栏的全局账号菜单里。
 * 团队切换与在线成员是 `details` 下拉，展开状态经 `data-disclosure-key` 在整块重绘之间保留。
 */
export function pageHeader(controller: CollaborationController, actions: HeaderActions): HTMLElement {
  const header = element('header', '', 'flex flex-wrap items-center gap-x-4 gap-y-3');
  const brand = element('div', '', 'flex min-w-0 items-center gap-2');
  brand.append(iconTile('users'), element('h1', '团队协作', 'text-lg font-semibold'));
  if (controller.user && controller.snapshot)
    brand.append(element('span', '/', 'text-base-content/70', true), teamSwitcher(controller, actions));
  const tools = element('div', '', 'ms-auto flex flex-wrap items-center gap-2');
  tools.append(connection(controller.online));
  if (controller.snapshot) tools.append(presence(controller));
  if (controller.workspace && controller.online && controller.snapshot)
    tools.append(
      button('刷新团队状态', () => actions.perform(() => controller.refresh()), false, {
        tone: 'ghost',
        icon: 'refresh-cw',
        iconOnly: true
      })
    );
  header.append(brand, tools);
  return header;
}

/**
 * 顶栏下方的分区页签：工作区、数据 PR（进行中的数量）、历史与审计、通知（未读数）与成员与权限（只有成员管理者有）。
 * 计数进入页签的可访问名称（例如「通知 2」）。
 */
export function viewTabs(
  controller: CollaborationController,
  current: CollaborationView,
  choose: (view: CollaborationView, focus: boolean) => void
): HTMLElement {
  const data = controller.snapshot!;
  const open = data.prs.filter(pr => pr.status === 'draft' || pr.status === 'review').length;
  const items: TabItem<CollaborationView>[] = [
    { id: 'workspace', label: '工作区', icon: 'layout-dashboard' },
    { id: 'prs', label: '数据 PR', icon: 'git-pull-request', count: open },
    { id: 'history', label: '历史与审计', icon: 'history' },
    { id: 'notifications', label: '通知', icon: 'bell', count: data.unread, tone: 'primary' }
  ];
  if (canManage(controller)) items.push({ id: 'members', label: '成员与权限', icon: 'shield-check' });
  return tabList('团队协作分区', 'collaboration', items, current, choose);
}

/** 当前用户在当前团队是否有成员管理权限。 */
export function canManage(controller: Pick<CollaborationController, 'snapshot' | 'user'>): boolean {
  return !!controller.snapshot?.members.find(m => m.id === controller.user?.id)?.permissions.includes('manage');
}

/** 连接状态：圆点 + 在线 / 离线，悬停说明各自意味着什么。 */
function connection(online: boolean): HTMLElement {
  const node = element(
    'span',
    '',
    'inline-flex items-center gap-1.5 rounded-full border border-base-300 px-2.5 py-1 text-xs font-medium'
  );
  node.setAttribute('role', 'status');
  node.title = tx(online ? '在线 · 云端操作按当前权限校验' : '离线 · 仅能编辑已解锁的本机任务');
  node.append(
    statusDot(online ? 'success' : 'warning'),
    element('span', online ? '在线' : '离线'),
    // 有操作在进行时（宿主的 aria-busy）显示一个小转圈
    element('span', '', 'loading loading-spinner loading-xs hidden group-aria-busy:inline-block')
  );
  return node;
}

/** 下拉菜单里的一项：菜单样式由 daisyUI 的 `.menu` 负责。 */
function menuButton(
  text: string,
  action: () => void,
  options: { icon?: IconName; literal?: boolean; current?: boolean } = {}
): HTMLLIElement {
  const item = element('li');
  const node = element('button', '', options.current ? 'menu-active' : '');
  node.type = 'button';
  if (options.icon) node.append(icon(options.icon));
  node.append(element('span', text, 'min-w-0 flex-1 truncate text-start', options.literal));
  if (options.current) {
    node.setAttribute('aria-current', 'true');
    node.append(icon('check'));
  }
  node.addEventListener('click', action);
  item.append(node);
  return item;
}

/** 关掉下拉（点了其中一项之后），重绘时也保持关闭。 */
function closeDropdown(node: HTMLElement): void {
  const details = node.closest('details');
  if (details) details.open = false;
}

/** 团队切换：当前团队名 + 下拉，列出可访问的团队与「接受团队邀请…」。 */
function teamSwitcher(controller: CollaborationController, actions: HeaderActions): HTMLElement {
  const current = controller.workspace;
  const { details, summary, panel: menu } = dropdown(
    'btn btn-ghost btn-sm gap-1.5 text-sm font-medium',
    'ul',
    'menu z-30 w-72 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg'
  );
  details.dataset['disclosureKey'] = 'team-switcher';
  details.setAttribute('data-testid', 'team-switcher');
  const label = current?.name ?? tx('选择团队');
  summary.setAttribute('aria-label', tx('切换团队：{v0}', { v0: label }));
  summary.append(element('span', label, 'max-w-48 truncate', true), icon('chevron-down', 'size-3.5'));
  menu.append(element('li', '团队', 'menu-title text-base-content/70'));
  for (const workspace of controller.workspaces) {
    const same = workspace.teamId === current?.teamId && workspace.appId === current?.appId;
    const item = menuButton(
      workspace.name,
      () => {
        closeDropdown(summary);
        void actions.selectWorkspace(workspace);
      },
      { icon: 'users', literal: true, current: same }
    );
    menu.append(item);
  }
  const divider = element('li', '', 'my-1 h-px bg-base-300');
  divider.setAttribute('aria-hidden', 'true');
  menu.append(
    divider,
    menuButton(
      '接受团队邀请…',
      () => {
        closeDropdown(summary);
        actions.openInvitation();
      },
      { icon: 'user-plus' }
    )
  );
  return details;
}

/** 每个成员一项：同一成员开了多个页面时取正在查看某个 PR 或记录的那个会话。 */
function onlineMembers(sessions: readonly Presence[]): Presence[] {
  const people = new Map<string, Presence>();
  for (const session of sessions) {
    const known = people.get(session.userId);
    if (!known || (!known.prId && !known.recordId)) people.set(session.userId, session);
  }
  return [...people.values()];
}

/** 在线成员：头像叠放 + 人数；展开后列出每个人与其正在查看的 PR 或记录（Realtime Presence，只作协作提示）。 */
function presence(controller: CollaborationController): HTMLElement {
  const data = controller.snapshot!;
  const people = onlineMembers(data.presence);
  const nameOf = (id: string) => personName(data.members, id, controller.user);
  const { details, summary, panel } = dropdown(
    'btn btn-ghost btn-sm gap-2 text-sm font-medium',
    'div',
    'z-30 w-80 space-y-2 rounded-box border border-base-300 bg-base-100 p-3 shadow-lg',
    'end'
  );
  details.dataset['disclosureKey'] = 'presence';
  const stack = element('span', '', 'flex -space-x-1.5');
  people.slice(0, 3).forEach(person => stack.append(avatar(nameOf(person.userId), 'xs')));
  summary.append(stack, element('span', tx('{v0} 人在线', { v0: people.length }), '', true));
  panel.setAttribute('data-testid', 'presence');
  panel.append(element('p', '在线成员', 'px-1 text-xs font-semibold text-base-content/70'));
  const list = element('ul', '', 'space-y-1');
  for (const person of people) {
    const item = element('li', '', 'flex items-center gap-2 rounded-field px-1 py-1');
    item.dataset['userId'] = person.userId;
    const text = element('div', '', 'min-w-0 text-sm');
    const name = element('p', nameOf(person.userId), 'truncate font-medium', true);
    if (person.userId === controller.user?.id) name.append(document.createTextNode(tx('（你）')));
    text.append(name, element('p', location(controller, person), 'truncate text-xs text-base-content/70', true));
    item.append(avatar(nameOf(person.userId), 'sm'), text);
    list.append(item);
  }
  if (!people.length) list.append(element('li', '暂无成员在线', 'px-1 text-sm text-base-content/70'));
  panel.append(list);
  return details;
}

/** 在线成员正在查看的位置：PR（显示标题）、记录，或只是在线。 */
function location(controller: CollaborationController, person: Presence): string {
  const pr = person.prId ? controller.snapshot?.prs.find(item => item.id === person.prId) : undefined;
  if (person.prId) return tx('正在查看 PR：{v0}', { v0: pr?.title ?? person.prId });
  if (person.recordId) return tx('正在查看记录：{v0}', { v0: person.recordId });
  return tx('在线');
}
