import { alert, avatar, button, dropdown, element, statusDot } from './elements.js';
import { icon } from './icons.js';
import { authSession, type AuthSession } from './session.js';
import { tx, useTranslation, type Translate } from './translate.js';

/** 挂载顶栏账号菜单时的选项；三端应用传入的内容对称。 */
export interface AccountMenuOptions {
  /** 全局登录会话，默认 {@link authSession}。 */
  session?: AuthSession;
  /** 应用的翻译函数，约定同 `mountCollaboration`。 */
  translate?: Translate;
  /** 订阅应用的语言切换，收到通知后重绘；返回取消订阅函数。 */
  subscribeLanguage?: (listener: () => void) => () => void;
  /** 应用内跳转。 */
  navigate: (url: string) => void;
  /** 当前地址（路径 + 查询 + 片段）：未登录时点「登录」，登录后回到这里。 */
  currentUrl: () => string;
  /** 「团队协作」入口的应用内地址，默认 `/collaboration`。 */
  collaborationPath?: string;
}

/**
 * 后台外壳顶栏右侧的账号菜单（全局认证的入口）：未登录时是「登录」，登录后是头像 + 邮箱，展开后有账号信息、「团队协作」与「退出账号」。
 *
 * @remarks
 * 退出经全局会话：先跑登记过的退出前检查（例如团队协作的编辑界面还有没保存的输入），被拒绝时原因显示在菜单里；
 * 退出成功之后由应用的路由把页面带到登录页。点在菜单外或按 Esc 收起菜单。
 * @param host 承载菜单的容器元素（外壳顶栏的扩展位）；卸载时清空。
 * @param options 会话、翻译、跳转与菜单入口。
 * @returns 卸载函数。
 */
export function mountAccount(host: HTMLElement, options: AccountMenuOptions): () => void {
  useTranslation(options.translate);
  const session = options.session ?? authSession();
  let failure = '';
  let disposed = false;
  function render() {
    if (disposed) return;
    const open = host.querySelector<HTMLDetailsElement>('details')?.open ?? false;
    host.replaceChildren(session.user ? menu(open) : signIn());
  }
  function signIn(): HTMLElement {
    return button(
      '登录',
      () => options.navigate(`/login?redirect=${encodeURIComponent(options.currentUrl())}`),
      false,
      { tone: 'ghost', icon: 'log-in' }
    );
  }
  function menu(open: boolean): HTMLElement {
    const email = session.user!.email;
    const { details, summary, panel } = dropdown(
      'btn btn-ghost btn-sm gap-2 text-sm font-medium',
      'div',
      'z-50 w-72 space-y-2 rounded-box border border-base-300 bg-base-100 p-2 text-base-content shadow-lg',
      'end'
    );
    details.setAttribute('data-testid', 'account-menu');
    details.open = open;
    // 可访问名称由内容给出（「账号：」+ 邮箱）：不用 aria-label，免得与头像首字母这样的可见文字对不上
    summary.append(
      element('span', tx('账号：{v0}', { v0: '' }), 'sr-only', true),
      avatar(email, 'xs'),
      element('span', email, 'sr-only lg:not-sr-only lg:inline-block lg:max-w-48 lg:truncate lg:align-middle', true),
      icon('chevron-down', 'size-3.5')
    );
    const identity = element('div', '', 'flex items-center gap-3 px-2 py-2');
    const text = element('div', '', 'min-w-0');
    const status = element('p', '', 'flex items-center gap-1.5 text-xs text-base-content/70');
    status.append(
      statusDot(session.online ? 'success' : 'warning'),
      element('span', session.online ? '已登录' : '离线 · 使用上次验证过的身份')
    );
    text.append(element('p', email, 'truncate text-sm font-medium', true), status);
    identity.append(avatar(email, 'md'), text);
    const list = element('ul', '', 'menu w-full p-0');
    const collaboration = element('li');
    const link = element('button', '');
    link.type = 'button';
    link.append(icon('users'), element('span', '团队协作'));
    link.addEventListener('click', () => {
      details.open = false;
      options.navigate(options.collaborationPath ?? '/collaboration');
    });
    collaboration.append(link);
    list.append(collaboration);
    const logout = element('li');
    const out = element('button', '');
    out.type = 'button';
    out.append(icon('log-out'), element('span', '退出账号'));
    out.addEventListener('click', () => {
      failure = '';
      void session.logout().catch((error: unknown) => {
        failure = error instanceof Error ? error.message : '操作失败';
        render();
      });
    });
    logout.append(out);
    list.append(logout);
    panel.append(identity, element('div', '', 'h-px bg-base-300'), list);
    if (failure) panel.append(alert(failure, 'warning'));
    return details;
  }
  const close = (event: Event) => {
    const details = host.querySelector('details');
    if (details?.open && !(event.target instanceof Node && details.contains(event.target))) details.open = false;
  };
  const escape = (event: KeyboardEvent) => {
    const details = host.querySelector('details');
    if (event.key !== 'Escape' || !details?.open) return;
    details.open = false;
    details.querySelector<HTMLElement>('summary')?.focus();
  };
  host.className = 'contents';
  session.addEventListener('change', render);
  document.addEventListener('click', close);
  host.addEventListener('keydown', escape);
  const unsubscribeLanguage = options.subscribeLanguage?.(render);
  render();
  return () => {
    disposed = true;
    session.removeEventListener('change', render);
    document.removeEventListener('click', close);
    host.removeEventListener('keydown', escape);
    unsubscribeLanguage?.();
    host.replaceChildren();
  };
}
