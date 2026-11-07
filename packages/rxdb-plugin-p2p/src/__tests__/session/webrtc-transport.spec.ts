import { describe, expect, it } from 'vitest';
import { DEFAULT_P2P_CHUNK_SIZE } from '../../chunking.js';
import { decodeP2PFrame, encodeP2PFrame } from '../../session/frame.js';
import { MAX_FRAME_SIZE, MIN_WEBRTC_MESSAGE_SIZE } from '../../session/limits.js';
import { createWebRTCTransport } from '../../session/webrtc-transport.js';
import { FakeChannel, isSettled, lastFragment, sameBytes } from '../fixtures.js';

describe('WebRTC DataChannel 适配器', () => {
  it('默认块加协议元数据放得进一条 64 KiB 消息，不必分片', async () => {
    const bytes = new Uint8Array(DEFAULT_P2P_CHUNK_SIZE);
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const frame = encodeP2PFrame({
      kind: 'response',
      id: 2 ** 40,
      result: { contentHash: 'f'.repeat(64) },
      payload: bytes
    });
    await transport.send(frame);
    expect(channel.binaryType).toBe('arraybuffer');
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].byteLength).toBeLessThanOrEqual(65536);
    channel.emit('message', channel.sent[0].buffer);
    expect(decodeP2PFrame(await transport.receive())).toMatchObject({ payload: bytes });
    transport.close();
  });

  it('超过消息上限的帧分片发送、按序重组', async () => {
    const frame = Uint8Array.from({ length: 300 * 1024 }, (_, index) => index % 253);
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    await transport.send(frame);
    expect(channel.sent.length).toBeGreaterThan(4);
    expect(channel.sent.every(message => message.byteLength <= 65536)).toBe(true);
    for (const message of channel.sent) channel.emit('message', message.buffer);
    expect(sameBytes(await transport.receive(), frame)).toBe(true);
    transport.close();
  });

  it('消息上限可按 SCTP 协商结果调小', async () => {
    const channel = new FakeChannel();
    channel.maxMessageSize = 16 * 1024;
    const transport = createWebRTCTransport(channel, { maxMessageSize: 16 * 1024 });
    await transport.send(new Uint8Array(40 * 1024));
    expect(channel.sent.every(message => message.byteLength <= 16 * 1024)).toBe(true);
    transport.close();
  });

  it('并发发送的大帧不会互相穿插分片', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const first = new Uint8Array(150 * 1024).fill(1);
    const second = new Uint8Array(150 * 1024).fill(2);
    await Promise.all([transport.send(first), transport.send(second)]);
    for (const message of channel.sent) channel.emit('message', message.buffer);
    expect(sameBytes(await transport.receive(), first)).toBe(true);
    expect(sameBytes(await transport.receive(), second)).toBe(true);
    transport.close();
  });

  it('DataChannel 还在建立时，发送等到 open 再发', async () => {
    const channel = new FakeChannel();
    channel.readyState = 'connecting';
    const transport = createWebRTCTransport(channel);
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    channel.readyState = 'open';
    channel.emit('open');
    await sending;
    expect(channel.sent).toEqual([lastFragment(1)]);
    transport.close();
  });

  it('发送缓冲超过高水位时等 bufferedamountlow 再发', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    channel.bufferedAmount = 4 * 1024 * 1024;
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    channel.bufferedAmount = 0;
    channel.emit('bufferedamountlow');
    await sending;
    expect(channel.sent).toHaveLength(1);
    transport.close();
  });

  it('error 事件保留 RTCError 原因，随后的 close 不覆盖它', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const pending = transport.receive();
    channel.emit('error', new Error('sctp failure'));
    channel.emit('close');
    await expect(pending).rejects.toThrow('sctp failure');
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('sctp failure');
  });

  it('收到非二进制消息或非法分片头即判失败：关闭通道并摘掉监听', async () => {
    for (const data of ['not binary', Uint8Array.from([7, 1]).buffer]) {
      const channel = new FakeChannel();
      const transport = createWebRTCTransport(channel);
      channel.emit('message', data);
      await expect(transport.receive()).rejects.toThrow(/non-binary|fragment/);
      expect(channel.readyState).toBe('closed');
      expect(channel.listenerCount('message')).toBe(0);
    }
  });

  it('空的或短于协议下限的非末片即判失败，不会持续累积分片', async () => {
    for (const message of [Uint8Array.of(0), new Uint8Array(MIN_WEBRTC_MESSAGE_SIZE - 1)]) {
      const channel = new FakeChannel();
      const transport = createWebRTCTransport(channel);
      for (let index = 0; index < 100_000; index += 1) channel.emit('message', message.buffer);
      expect(channel.readyState).toBe('closed');
      expect(channel.listenerCount('message')).toBe(0);
      await expect(transport.receive()).rejects.toThrow('P2P fragment is too small');
    }
  });

  it('连续的非末片超过单帧上限即判失败', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    const more = new Uint8Array(MIN_WEBRTC_MESSAGE_SIZE);
    const fragmentsPerMaxFrame = Math.ceil(MAX_FRAME_SIZE / (MIN_WEBRTC_MESSAGE_SIZE - 1));
    for (let index = 0; index <= fragmentsPerMaxFrame; index += 1) channel.emit('message', more.buffer);
    expect(channel.readyState).toBe('closed');
    await expect(transport.receive()).rejects.toThrow('too large');
  });

  it('按最小消息切片的最大帧可以连收：末片之后分片状态清零', async () => {
    const isFrame = (bytes: Uint8Array, fill: number): boolean =>
      bytes.byteLength === MAX_FRAME_SIZE && bytes.every(byte => byte === fill);
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel, { maxMessageSize: MIN_WEBRTC_MESSAGE_SIZE });
    await transport.send(new Uint8Array(MAX_FRAME_SIZE).fill(1));
    await transport.send(new Uint8Array(MAX_FRAME_SIZE).fill(2));
    expect(channel.sent.every(message => message.byteLength <= MIN_WEBRTC_MESSAGE_SIZE)).toBe(true);
    for (const message of channel.sent.splice(0)) channel.emit('message', message.buffer);
    expect(isFrame(await transport.receive(), 1)).toBe(true);
    expect(isFrame(await transport.receive(), 2)).toBe(true);

    await transport.send(new Uint8Array(MAX_FRAME_SIZE + 1));
    for (const message of channel.sent.splice(0)) channel.emit('message', message.buffer);
    await expect(transport.receive()).rejects.toThrow('too large');
  });

  it('接收 ArrayBuffer 与视图，支持取消和关闭清理', async () => {
    const channel = new FakeChannel();
    const transport = createWebRTCTransport(channel);
    channel.emit('message', lastFragment(7).buffer);
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([7]));
    channel.emit('message', lastFragment(8));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([8]));
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    const closing = transport.receive();
    transport.close();
    await expect(closing).rejects.toThrow('closed');
    expect(channel.readyState).toBe('closed');
  });

  it('创建时已关闭的通道拒绝收发', async () => {
    const channel = new FakeChannel();
    channel.readyState = 'closed';
    const transport = createWebRTCTransport(channel);
    await expect(transport.send(new Uint8Array())).rejects.toThrow('not open');
    await expect(transport.receive()).rejects.toThrow('not open');
  });
});

describe('WebRTC 适配器选项', () => {
  it('消息上限小于协议下限或不是整数即抛 RangeError', () => {
    for (const maxMessageSize of [1, MIN_WEBRTC_MESSAGE_SIZE - 1, 4096.5]) {
      expect(() => createWebRTCTransport(new FakeChannel(), { maxMessageSize })).toThrow(RangeError);
    }
  });
});
