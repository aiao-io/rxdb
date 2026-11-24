import { RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_ACCOUNTS,
  readSessionIdentity,
  signInAnonymousUser,
  signInDemoAccount,
  signOutToVisitor,
  type SupabaseSessionAuth
} from './supabase-session';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const [ALICE] = DEMO_ACCOUNTS;

interface FakeUser {
  id: string;
  email?: string;
  is_anonymous?: boolean;
}

function authWithSession(user: FakeUser | null): SupabaseSessionAuth {
  return {
    getSession: vi.fn(async () => ({ data: { session: user ? { user } : null }, error: null }))
  } as unknown as SupabaseSessionAuth;
}

function authError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}

describe('readSessionIdentity', () => {
  // 本地库按这个身份命名（US-035）：回答错了，库就开错了
  it('没有会话就是访客：以 anon 身份打开访客的库，不替用户登录', async () => {
    const auth = { ...authWithSession(null), signInAnonymously: vi.fn() } as unknown as SupabaseSessionAuth;

    await expect(readSessionIdentity(auth)).resolves.toEqual({
      kind: 'visitor',
      subject: RXDB_ANONYMOUS_SUBJECT,
      email: null
    });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it('匿名登录的用户：登录身份，subject 是用户 id', async () => {
    await expect(readSessionIdentity(authWithSession({ id: USER_ID, is_anonymous: true }))).resolves.toEqual({
      kind: 'anonymous',
      subject: USER_ID,
      email: null
    });
  });

  it('账号：带上邮箱', async () => {
    await expect(readSessionIdentity(authWithSession({ id: USER_ID, email: ALICE.email }))).resolves.toEqual({
      kind: 'account',
      subject: USER_ID,
      email: ALICE.email
    });
  });

  it('读会话失败时原样抛出，不当成访客', async () => {
    const broken = new Error('storage unavailable');
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: null }, error: broken }))
    } as unknown as SupabaseSessionAuth;

    await expect(readSessionIdentity(auth)).rejects.toBe(broken);
  });
});

describe('signOutToVisitor', () => {
  it('只清本机会话，不吊销账号在别处的登录', async () => {
    const signOut = vi.fn(async () => ({ error: null }));

    await signOutToVisitor({ signOut } as unknown as SupabaseSessionAuth);

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('退出失败时抛出', async () => {
    const failed = new Error('offline');
    const signOut = vi.fn(async () => ({ error: failed }));

    await expect(signOutToVisitor({ signOut } as unknown as SupabaseSessionAuth)).rejects.toBe(failed);
  });
});

describe('signInAnonymousUser', () => {
  it('匿名登录被拒（部署没开匿名登录）时抛出', async () => {
    const refused = new Error('Anonymous sign-ins are disabled');
    const signInAnonymously = vi.fn(async () => ({ data: { user: null, session: null }, error: refused }));

    await expect(signInAnonymousUser({ signInAnonymously } as unknown as SupabaseSessionAuth)).rejects.toBe(refused);
  });
});

describe('signInDemoAccount', () => {
  it('账号已存在：直接登录，不注册、不再加入默认租户', async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const signUp = vi.fn();
    const onSignedUp = vi.fn();
    const auth = { signInWithPassword, signUp } as unknown as SupabaseSessionAuth;

    await signInDemoAccount(auth, ALICE, onSignedUp);

    expect(signInWithPassword).toHaveBeenCalledWith({ email: ALICE.email, password: ALICE.password });
    expect(signUp).not.toHaveBeenCalled();
    expect(onSignedUp).not.toHaveBeenCalled();
  });

  it('第一次用：注册拿到会话，再加入默认租户', async () => {
    const signInWithPassword = vi.fn(async () => ({ data: {}, error: authError('invalid_credentials') }));
    const signUp = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const onSignedUp = vi.fn(async () => undefined);
    const auth = { signInWithPassword, signUp } as unknown as SupabaseSessionAuth;

    await signInDemoAccount(auth, ALICE, onSignedUp);

    expect(signUp).toHaveBeenCalledWith({ email: ALICE.email, password: ALICE.password });
    expect(onSignedUp).toHaveBeenCalledOnce();
  });

  it('登录失败但不是凭据错误（例如网络、限流）：原样抛出，不去注册', async () => {
    const limited = authError('over_request_rate_limit');
    const signUp = vi.fn();
    const auth = {
      signInWithPassword: vi.fn(async () => ({ data: {}, error: limited })),
      signUp
    } as unknown as SupabaseSessionAuth;

    await expect(signInDemoAccount(auth, ALICE, vi.fn())).rejects.toBe(limited);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('注册之后没有会话（部署要求邮箱确认）：报错说明原因，不加入租户', async () => {
    const onSignedUp = vi.fn();
    const auth = {
      signInWithPassword: vi.fn(async () => ({ data: {}, error: authError('invalid_credentials') })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null }))
    } as unknown as SupabaseSessionAuth;

    await expect(signInDemoAccount(auth, ALICE, onSignedUp)).rejects.toThrow(/邮箱确认/);
    expect(onSignedUp).not.toHaveBeenCalled();
  });
});

describe('DEMO_ACCOUNTS', () => {
  it('两个预置账号分属两个租户', () => {
    expect(DEMO_ACCOUNTS.map(account => account.tenantId)).toEqual(['xinghe', 'jiguang']);
  });
});
