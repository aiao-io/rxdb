import { describe, expect, it } from 'vitest';

import { failureReason, isWindowFailure } from './web-app-failure';

const orbitError = (code: string, message = '') => Object.assign(new Error(message), { name: 'OrbitError', code });
const app = { name: 'Aiao Code', host: 'vscode.aiao.io', readyTimeout: 60_000 };

describe('集成应用的失败原因', () => {
  it('按 Orbit 错误码给出窗口里显示的原因', () => {
    expect(failureReason(orbitError('LOAD_ERROR'), app)).toBe(
      'vscode.aiao.io didn’t connect. It may be offline, blocked by the browser, or not set up for Aiao Desktop.'
    );
    expect(failureReason(orbitError('TIMEOUT'), app)).toBe('Aiao Code didn’t finish starting within 60 seconds.');
    expect(failureReason(orbitError('APP_ERROR', '工作台挂载失败'), app)).toBe('Aiao Code reported: 工作台挂载失败');
    expect(failureReason(orbitError('NAVIGATION'), app)).toBe('Aiao Code left its page or closed its connection.');
    expect(failureReason(orbitError('FORBIDDEN_ORIGIN', '未授权应用来源'), app)).toBe(
      'Aiao Code couldn’t start: 未授权应用来源'
    );
    expect(failureReason(new TypeError('boom'), app)).toBe('Aiao Code couldn’t start: boom');
  });

  it('只有运行中的失败交给窗口显示，取消与销毁属于关窗口，其余错误照常上报', () => {
    for (const code of ['LOAD_ERROR', 'TIMEOUT', 'APP_ERROR', 'NAVIGATION', 'ABORTED', 'DESTROYED'])
      expect(isWindowFailure(orbitError(code))).toBe(true);
    for (const error of [orbitError('HANDLER_ERROR'), orbitError('INVALID_PAYLOAD'), new Error('x'), 'x'])
      expect(isWindowFailure(error)).toBe(false);
  });
});
