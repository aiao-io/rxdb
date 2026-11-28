import { afterEach, describe, expect, it, vi } from 'vitest';
import { showStartupError, startApp } from './startup';

function setup(options: { prepareSession?: () => Promise<void>; bootstrap?: () => Promise<unknown> } = {}) {
  const report = vi.fn();
  const bootstrap = vi.fn(options.bootstrap ?? (() => Promise.resolve()));
  const start = () => startApp({ prepareSession: options.prepareSession, bootstrap, report });
  return { report, bootstrap, start };
}

describe('startApp：启动的两个阶段', () => {
  it('远端模式：读完会话才启动应用，都成功就不报错', async () => {
    const order: string[] = [];
    const { report, start } = setup({
      prepareSession: async () => {
        await new Promise(resolve => setTimeout(resolve));
        order.push('会话');
      },
      bootstrap: () => {
        order.push('启动');
        return Promise.resolve();
      }
    });

    await start();

    expect(order).toEqual(['会话', '启动']);
    expect(report).not.toHaveBeenCalled();
  });

  it('本地模式没有读会话这一步：直接启动应用', async () => {
    const { report, bootstrap, start } = setup();

    await start();

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it('读会话失败：说读不到会话，原始错误一并交出，应用不启动', async () => {
    const cause = new Error('会话已损坏');
    const { report, bootstrap, start } = setup({ prepareSession: () => Promise.reject(cause) });

    await start();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('无法读取 Supabase 会话：会话已损坏。', cause);
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('会话读到了、应用启动失败：说的是应用启动失败，不是读不到会话', async () => {
    const cause = new Error('RxDB 初始化失败');
    const { report, start } = setup({
      prepareSession: () => Promise.resolve(),
      bootstrap: () => Promise.reject(cause)
    });

    await start();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('应用启动失败：RxDB 初始化失败。', cause);
  });

  it('本地模式应用启动失败：根本没读过会话，原因里不提 Supabase', async () => {
    const cause = new Error('OPFS 不可用');
    const { report, start } = setup({ bootstrap: () => Promise.reject(cause) });

    await start();

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('应用启动失败：OPFS 不可用。', cause);
    expect(report.mock.calls[0]?.[0]).not.toContain('Supabase');
  });

  it('启动步骤同步抛错也一样报出来，不会漏成未捕获的异常', async () => {
    const cause = new Error('同步抛出的错误');
    const { report, start } = setup({
      bootstrap: () => {
        throw cause;
      }
    });

    await start();

    expect(report).toHaveBeenCalledWith('应用启动失败：同步抛出的错误。', cause);
  });

  it('Supabase 抛的不是 Error 而是 { message }：取出 message，不显示成 [object Object]', async () => {
    const cause = { message: 'JWT expired', code: 'PGRST301' };
    const { report, start } = setup({ prepareSession: () => Promise.reject(cause) });

    await start();

    expect(report).toHaveBeenCalledWith('无法读取 Supabase 会话：JWT expired。', cause);
  });

  it('取不出任何原因时说未知错误', async () => {
    const { report, start } = setup({ bootstrap: () => Promise.reject(undefined) });

    await start();

    expect(report).toHaveBeenCalledWith('应用启动失败：未知错误。', undefined);
  });
});

describe('showStartupError：把启动失败说给用户', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('整页换成一条 role="alert" 的说明，原始错误留在控制台', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.append(document.createElement('app-root'), document.createElement('footer'));
    const cause = new Error('boom');

    showStartupError('应用启动失败：boom。', cause);

    expect(document.body.children).toHaveLength(1);
    const notice = document.body.children[0]!;
    expect(notice.tagName).toBe('P');
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.textContent).toBe('应用启动失败：boom。');
    expect(logged).toHaveBeenCalledWith(cause);
  });
});
