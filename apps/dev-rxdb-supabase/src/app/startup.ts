import { getErrorMessage } from './error-message';

/** 启动的几步，以及失败时怎么告诉用户：失败按在哪一步说不同的话 */
export interface StartupSteps {
  /** 远端模式（配置了 Supabase）才有：读出浏览器里保存的会话。本地模式不传，根本不碰会话 */
  readonly prepareSession?: () => Promise<void>;
  /** 启动应用：创建 RxDB、挂上根组件 */
  readonly bootstrap: () => Promise<unknown>;
  /** 把失败告诉用户：`message` 是给用户看的一句话，`cause` 是原始错误，留给控制台 */
  readonly report: (message: string, cause: unknown) => void;
}

/**
 * 按顺序启动：有会话这一步就先读会话，再启动应用；某一步失败就报出来，不再往下走。
 *
 * @remarks
 * 配置了 Supabase 时，本地库按会话身份命名，启动前要读出浏览器里保存的会话：没有会话就是访客，
 * 不需要联网，也不会替用户登录。本地模式直接打开默认库，没有读会话这一步。
 *
 * 两步各报各的：读不到会话是「无法读取 Supabase 会话」，应用自己起不来（RxDB 初始化等）是「应用启动失败」。
 * 把后者说成前者会把人引去查一个根本没读过的会话，本地模式尤其如此。
 * 返回的 Promise 不会 reject：失败都交给 `report`。
 */
export async function startApp({ prepareSession, bootstrap, report }: StartupSteps): Promise<void> {
  try {
    await prepareSession?.();
  } catch (error) {
    report(`无法读取 Supabase 会话：${getErrorMessage(error, '未知错误')}。`, error);
    return;
  }
  try {
    await bootstrap();
  } catch (error) {
    report(`应用启动失败：${getErrorMessage(error, '未知错误')}。`, error);
  }
}

/**
 * 启动失败时给用户一句话，而不是一个空白页：整页换成一条 `role="alert"` 的说明，原始错误留在控制台。
 *
 * @param message - 给用户看的一句话
 * @param cause - 原始错误，写进控制台
 */
export function showStartupError(message: string, cause: unknown): void {
  console.error(cause);
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  document.body.replaceChildren(notice);
}
