// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNAL_PAYLOAD_LENGTH,
  parseClientMessage,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
  type SignalingPeer
} from './signaling-protocol';

const PEER: SignalingPeer = {
  key: 'instance-b',
  principal: 'user-b',
  userName: 'b@example.com',
  deviceId: 'device-b',
  deviceName: 'Laptop'
};

const text = (value: unknown): string => JSON.stringify(value);

describe('parseClientMessage', () => {
  it.each<ClientMessage>([
    { type: 'hello', accessToken: 'token', deviceId: 'device-a', instanceId: 'instance-a' },
    { type: 'connect', to: 'instance-b' },
    { type: 'signal', to: 'instance-b', connectionId: 'c-1', kind: 'offer', payload: '{"sdp":"v=0"}' }
  ])('accepts $type', message => {
    expect(parseClientMessage(text(message))).toEqual(message);
  });

  it.each([
    ['not json', '{'],
    ['an array', '[]'],
    ['an unknown type', text({ type: 'ping' })],
    ['an empty token', text({ type: 'hello', accessToken: '', deviceId: 'd', instanceId: 'i' })],
    ['a missing target', text({ type: 'connect' })],
    ['an unknown signal kind', text({ type: 'signal', to: 'b', connectionId: 'c', kind: 'bye', payload: '' })],
    ['a non-string payload', text({ type: 'signal', to: 'b', connectionId: 'c', kind: 'ice', payload: {} })]
  ])('rejects %s', (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it('rejects an oversized signal payload', () => {
    const payload = 'x'.repeat(MAX_SIGNAL_PAYLOAD_LENGTH + 1);

    expect(parseClientMessage(text({ type: 'signal', to: 'b', connectionId: 'c', kind: 'offer', payload }))).toBeNull();
  });
});

describe('parseServerMessage', () => {
  it.each<ServerMessage>([
    { type: 'welcome', self: PEER, peers: [PEER], ticketKey: { kty: 'OKP', crv: 'Ed25519', x: 'abc' } },
    { type: 'presence', peers: [] },
    { type: 'connection', connectionId: 'c-1', role: 'initiator', peer: PEER, ticket: 'a.b' },
    { type: 'signal', from: 'instance-b', connectionId: 'c-1', kind: 'answer', payload: '{}' },
    { type: 'error', code: 'peer_unavailable', message: 'gone' }
  ])('accepts $type', message => {
    expect(parseServerMessage(text(message))).toEqual(message);
  });

  it.each([
    ['a peer without device', text({ type: 'presence', peers: [{ ...PEER, deviceId: '' }] })],
    ['an unknown role', text({ type: 'connection', connectionId: 'c', role: 'observer', peer: PEER, ticket: 't' })],
    ['an unknown error code', text({ type: 'error', code: 'teapot', message: '' })],
    ['a welcome without key', text({ type: 'welcome', self: PEER, peers: [] })]
  ])('rejects %s', (_label, raw) => {
    expect(parseServerMessage(raw)).toBeNull();
  });
});
