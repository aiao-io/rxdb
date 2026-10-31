import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { DevToolsConnectorTransport } from '../connector-transport.js';
import { DevToolsConnector } from '../connector.js';
import type { DevToolsI18nPort } from '../i18n-port.js';
import { createDevToolsV2Message, isDevToolsV2Message } from '../v2/wire.js';
import { createMockRxDB } from './fixtures/mock-rxdb.js';

function connect(capability: 'readonly' | 'full', mutationPolicy: 'allow' | 'omit') {
  const posted: unknown[] = [];
  let receive: (message: unknown) => void = () => undefined;
  const transport: DevToolsConnectorTransport = {
    send: message => posted.push(message),
    subscribe: listener => {
      receive = listener;
      return () => {
        receive = () => undefined;
      };
    },
    createSessionPort: () => undefined,
    closeSessionPort: () => undefined
  };
  const source: DevToolsI18nPort = {
    inspection$: new BehaviorSubject(0),
    inspect: async () => ({ locale: 'en', availableLocales: ['en'], messages: [], missingMessages: [] }),
    clearMissingMessages: vi.fn(async () => undefined)
  };
  const connector = new DevToolsConnector({ capabilities: capability, mutationPolicy, transport });
  const db = createMockRxDB();
  connector.init(db, () => undefined);
  connector.init(db, () => undefined, { i18n: source });
  receive(
    createDevToolsV2Message(
      'PROTOCOL_HELLO',
      { supportedVersions: [2, 1] },
      { sessionId: null, sequence: 1, timestamp: 1, direction: 'panel-to-connector' }
    )
  );
  const offered = posted.filter(isDevToolsV2Message).find(message => message.type === 'HANDSHAKE');
  if (!offered || offered.type !== 'HANDSHAKE') throw new Error('no session offer');
  const sessionId = offered.payload.sessionId;
  receive(
    createDevToolsV2Message(
      'HANDSHAKE_ACK',
      { protocolVersion: 2, sessionId },
      { sessionId, sequence: 2, timestamp: 1, direction: 'panel-to-connector' }
    )
  );
  let sequence = 3;
  const request = (requestId: string, domain: 'database' | 'settings', operation: string, params: unknown) =>
    receive(
      createDevToolsV2Message(
        'REQUEST',
        { requestId, domain, operation, params },
        { sessionId, sequence: sequence++, timestamp: 1, direction: 'panel-to-connector' }
      )
    );
  return { connector, source, posted, request };
}

describe('国际化实际wire授权与兼容', () => {
  it.each([
    { capability: 'readonly' as const, policy: 'allow' as const, canClear: false },
    { capability: 'full' as const, policy: 'omit' as const, canClear: false },
    { capability: 'full' as const, policy: 'allow' as const, canClear: true }
  ])('snapshot能力标志与真实清空门禁一致：$capability/$policy', async ({ capability, policy, canClear }) => {
    const active = connect(capability, policy);
    try {
      active.request('read-i18n', 'database', 'inspect', {});
      await vi.waitFor(() =>
        expect(
          active.posted
            .filter(isDevToolsV2Message)
            .some(frame => frame.type === 'RESPONSE' && frame.payload.requestId === 'read-i18n')
        ).toBe(true)
      );
      const response = active.posted
        .filter(isDevToolsV2Message)
        .find(frame => frame.type === 'RESPONSE' && frame.payload.requestId === 'read-i18n');
      expect(response).toMatchObject({ payload: { result: { i18n: { locale: 'en', canClearMissing: canClear } } } });
      active.request('clear-i18n', 'settings', 'clear', { scope: 'i18n-missing' });
      if (canClear) await vi.waitFor(() => expect(active.source.clearMissingMessages).toHaveBeenCalledTimes(1));
      else {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        expect(active.source.clearMissingMessages).not.toHaveBeenCalled();
      }
    } finally {
      active.connector.disconnect();
    }
  });
  it('新session中旧clear与未知scope都不会触碰国际化清空端口', async () => {
    const active = connect('full', 'allow');
    try {
      active.request('old-clear', 'settings', 'clear', {});
      active.request('unknown-clear', 'settings', 'clear', { scope: 'not-known' });
      await vi.waitFor(() =>
        expect(
          active.posted.filter(isDevToolsV2Message).filter(frame => frame.type === 'ERROR').length
        ).toBeGreaterThanOrEqual(2)
      );
      expect(active.source.clearMissingMessages).not.toHaveBeenCalled();
    } finally {
      active.connector.disconnect();
    }
  });
});
