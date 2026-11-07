import { copyValue, isRecord } from './payload.js';
import type { WujieClientContext, WujieProps, WujieValue } from './types.js';

export const PROTOCOL = 'aiao.wujie:1';
export const CHANNEL_PARAM = '__aiao_wujie';

export type Message =
  | { type: 'ready' | 'disposed' }
  | { type: 'error'; message: string }
  | { type: 'event'; event: string; args: WujieValue[] }
  | { type: 'props'; props: WujieProps }
  | { type: 'visibility'; visible: boolean }
  | { type: 'request'; id: string; method: string; payload: WujieValue }
  | { type: 'response'; id: string; value: WujieValue }
  | { type: 'reject'; id: string; code: string; message: string }
  | { type: 'cancel'; id: string };

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export function readMessage(data: unknown): Message | undefined {
  if (!isRecord(data)) return undefined;
  switch (data['type']) {
    case 'ready':
    case 'disposed':
      return { type: data['type'] };
    case 'error':
      return typeof data['message'] === 'string' ? { type: 'error', message: data['message'] } : undefined;
    case 'visibility':
      return typeof data['visible'] === 'boolean' ? { type: 'visibility', visible: data['visible'] } : undefined;
    case 'props':
      return isRecord(data['props']) ? { type: 'props', props: copyValue(data['props']) as WujieProps } : undefined;
    case 'event':
      return validName(data['event']) && Array.isArray(data['args']) ?
          { type: 'event', event: data['event'], args: copyValue(data['args']) as WujieValue[] }
        : undefined;
    case 'request':
      return validName(data['id']) && validName(data['method']) ?
          { type: 'request', id: data['id'], method: data['method'], payload: copyValue(data['payload']) }
        : undefined;
    case 'response':
      return validName(data['id']) ? { type: 'response', id: data['id'], value: copyValue(data['value']) } : undefined;
    case 'cancel':
      return validName(data['id']) ? { type: 'cancel', id: data['id'] } : undefined;
    case 'reject':
      return validName(data['id']) && typeof data['code'] === 'string' && typeof data['message'] === 'string' ?
          { type: 'reject', id: data['id'], code: data['code'], message: data['message'] }
        : undefined;
    default:
      return undefined;
  }
}

export function readContext(data: unknown): WujieClientContext | undefined {
  if (!isRecord(data) || !validName(data['appId']) || !validName(data['instanceId']) || !validName(data['version']))
    return undefined;
  if (typeof data['url'] !== 'string' || typeof data['visible'] !== 'boolean' || !isRecord(data['props']))
    return undefined;
  return Object.freeze({
    appId: data['appId'],
    instanceId: data['instanceId'],
    version: data['version'],
    url: data['url'],
    visible: data['visible'],
    props: Object.freeze(copyValue(data['props']) as WujieProps)
  });
}
