import { RxDB, RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from './demo-session';
import { Toasts } from './toasts';

const mocks = vi.hoisted(() => ({ getPreparedSession: vi.fn(), switchIdentity: vi.fn() }));

vi.mock('./setup_rxdb_wa-sqlite', () => ({ getPreparedSession: mocks.getPreparedSession }));
vi.mock('./identity-switch', () => ({ switchIdentity: mocks.switchIdentity }));

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

function setup() {
  const listeners: AuthListener[] = [];
  mocks.getPreparedSession.mockReturnValue({
    session: { kind: 'visitor', subject: RXDB_ANONYMOUS_SUBJECT, email: null },
    identity: { scope: 'http://localhost:55000', subject: RXDB_ANONYMOUS_SUBJECT },
    client: { auth: { onAuthStateChange: vi.fn((listener: AuthListener) => listeners.push(listener)) } },
    databaseName: 'dev-rxdb-supabase-visitor'
  });
  TestBed.configureTestingModule({ providers: [{ provide: RxDB, useValue: {} }] });
  /** 浏览器里的会话换成了另一个用户（Supabase 的 auth 事件） */
  const signedInAs = (userId: string) => listeners.forEach(listener => listener('SIGNED_IN', { user: { id: userId } }));
  return { session: TestBed.inject(DemoSession), toasts: TestBed.inject(Toasts), signedInAs };
}

describe('DemoSession', () => {
  it('切换身份失败：弹一条错误消息，可以再试', async () => {
    mocks.switchIdentity.mockRejectedValue(new Error('邮箱或口令不对'));
    const { session, toasts } = setup();

    await session.switchTo('alice');

    expect(toasts.list()).toEqual([
      expect.objectContaining({ kind: 'error', message: '切换身份失败：邮箱或口令不对' })
    ]);
    expect(session.$switching()).toBe(false);
    // 没登录上：会话还是原来的身份，不提示重新加载
    expect(session.$sessionMoved()).toBe(false);
  });

  it('登录成功、加入租户失败：会话已经换了，切换失败之后照样提示重新加载', async () => {
    const { session, toasts, signedInAs } = setup();
    mocks.switchIdentity.mockImplementation(async () => {
      // 注册并登录成功（会话换成 alice），随后加入租户失败
      signedInAs('alice-id');
      throw new Error('加入租户失败');
    });

    await session.switchTo('alice');

    expect(toasts.list()).toEqual([expect.objectContaining({ kind: 'error', message: '切换身份失败：加入租户失败' })]);
    expect(session.$switching()).toBe(false);
    expect(session.$sessionMoved()).toBe(true);
  });
});
