import { RxDB, RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from './demo-session';
import { Toasts } from './toasts';

const mocks = vi.hoisted(() => ({ getPreparedSession: vi.fn(), switchIdentity: vi.fn() }));

vi.mock('./setup_rxdb_wa-sqlite', () => ({ getPreparedSession: mocks.getPreparedSession }));
vi.mock('./identity-switch', () => ({ switchIdentity: mocks.switchIdentity }));

function setup() {
  mocks.getPreparedSession.mockReturnValue({
    session: { kind: 'visitor', subject: RXDB_ANONYMOUS_SUBJECT, email: null },
    identity: { scope: 'http://localhost:55000', subject: RXDB_ANONYMOUS_SUBJECT },
    client: { auth: { onAuthStateChange: vi.fn() } },
    databaseName: 'dev-rxdb-supabase-visitor'
  });
  TestBed.configureTestingModule({ providers: [{ provide: RxDB, useValue: {} }] });
  return { session: TestBed.inject(DemoSession), toasts: TestBed.inject(Toasts) };
}

describe('DemoSession', () => {
  it('切换身份失败：弹一条错误消息，可以再试', async () => {
    mocks.switchIdentity.mockRejectedValue(new Error('邮箱或口令不对'));
    const { session, toasts } = setup();

    await session.switchTo('alice');

    expect(toasts.list()).toEqual([expect.objectContaining({ kind: 'error', message: '切换身份失败：邮箱或口令不对' })]);
    expect(session.$switching()).toBe(false);
  });
});
