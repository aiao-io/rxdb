import { RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { currentIdentityChoice, describeIdentity, IDENTITY_CHOICES } from './demo-identity';
import { DEMO_ACCOUNTS, type DemoSessionIdentity } from './supabase-session';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const visitor: DemoSessionIdentity = { kind: 'visitor', subject: RXDB_ANONYMOUS_SUBJECT, email: null };
const anonymousUser: DemoSessionIdentity = { kind: 'anonymous', subject: USER_ID, email: null };
const alice: DemoSessionIdentity = { kind: 'account', subject: USER_ID, email: DEMO_ACCOUNTS[0].email };
const stranger: DemoSessionIdentity = { kind: 'account', subject: USER_ID, email: 'someone@example.org' };

describe('IDENTITY_CHOICES', () => {
  it('访客、匿名用户与两个预置账号', () => {
    expect(IDENTITY_CHOICES.map(choice => choice.label)).toEqual([
      '访客（不登录）',
      '匿名用户',
      'Alice（星河零售）',
      'Bob（极光百货）'
    ]);
  });
});

describe('currentIdentityChoice', () => {
  it('按会话认出当前是哪个选项', () => {
    expect(currentIdentityChoice(visitor)).toBe('visitor');
    expect(currentIdentityChoice(anonymousUser)).toBe('anonymous');
    expect(currentIdentityChoice(alice)).toBe('alice');
  });

  it('不是预置账号的登录用户：不对应任何选项', () => {
    expect(currentIdentityChoice(stranger)).toBeNull();
  });
});

describe('describeIdentity', () => {
  it('访客：没有会话，以 anon 读公开数据', () => {
    expect(describeIdentity(visitor)).toEqual({ title: '访客', detail: '未登录 · 以 anon 读公开数据' });
  });

  it('匿名用户：登录身份，数据库角色是 authenticated', () => {
    expect(describeIdentity(anonymousUser)).toEqual({
      title: '匿名用户',
      detail: '匿名登录 · 数据库角色 authenticated'
    });
  });

  it('预置账号：名字与租户', () => {
    expect(describeIdentity(alice)).toEqual({ title: 'Alice', detail: `星河零售 · ${DEMO_ACCOUNTS[0].email}` });
  });

  it('其他账号：邮箱', () => {
    expect(describeIdentity(stranger)).toEqual({ title: 'someone@example.org', detail: '账号' });
  });
});
