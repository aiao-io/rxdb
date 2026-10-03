import type { ReplayManager, ReplaySessionInfo } from '@aiao/rxdb-plugin-replay';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import ReplayPage from './replay.page';

const session = (id: string): ReplaySessionInfo => ({
  id,
  startedAt: new Date(0),
  lastEventAt: null,
  status: 'recording',
  truncatedCode: null,
  eventCount: 3,
  bytes: 1024
});

/** 开关默认关，构造时不加载录制模块；直接把就绪后的信号摆好。 */
const renderReady = (activeSessionId: string | null) => {
  const fixture = TestBed.createComponent(ReplayPage);
  const page = fixture.componentInstance;
  page.$enabled.set(true);
  page.$replay.set({} as ReplayManager);
  page.$sessions.set([session('active'), session('orphan')]);
  page.$state.set(activeSessionId === null ? { kind: 'idle' } : { kind: 'recording', sessionId: activeSessionId });
  fixture.detectChanges();
  const button = (sessionId: string, testId: string): HTMLButtonElement =>
    fixture.nativeElement.querySelector(`[data-session-id="${sessionId}"] [data-testid="${testId}"]`);
  return { button };
};

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('录制会话列表的操作', () => {
  it('只禁用本页正在录的会话；冲刷失败或上一页没收尾留下的 recording 会话仍可回放、可删除', () => {
    const { button } = renderReady('active');

    expect(button('active', 'replay-select').disabled).toBe(true);
    expect(button('active', 'replay-delete').disabled).toBe(true);
    expect(button('orphan', 'replay-select').disabled).toBe(false);
    expect(button('orphan', 'replay-delete').disabled).toBe(false);
  });

  it('本页没在录时，持久化状态为 recording 的会话全部可操作', () => {
    const { button } = renderReady(null);

    expect(button('active', 'replay-select').disabled).toBe(false);
    expect(button('active', 'replay-delete').disabled).toBe(false);
  });
});
