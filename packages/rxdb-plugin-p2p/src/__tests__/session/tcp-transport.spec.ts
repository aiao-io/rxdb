import { describe, expect, it } from 'vitest';
import { createTcpTransport } from '../../session/tcp-transport.js';
import { FakeSocket, frameHeader, isSettled, sameBytes } from '../fixtures.js';

describe('TCP/TLS 适配器', () => {
  it('处理长度前缀的拆包和粘包', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    await transport.send(new Uint8Array([1, 2]));
    expect(socket.writes[0]).toEqual(new Uint8Array([0, 0, 0, 2, 1, 2]));
    const first = transport.receive();
    socket.emit('data', socket.writes[0].slice(0, 3));
    socket.emit('data', socket.writes[0].slice(3));
    await expect(first).resolves.toEqual(new Uint8Array([1, 2]));
    const second = new Uint8Array([0, 0, 0, 1, 9]);
    socket.emit('data', Uint8Array.from([...second, ...second]));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([9]));
    await expect(transport.receive()).resolves.toEqual(new Uint8Array([9]));
    transport.close();
  });

  it('跨很多次 data 事件到达的大帧完整重组', async () => {
    const payload = Uint8Array.from({ length: 300_000 }, (_, index) => index % 249);
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const packet = Uint8Array.from([...frameHeader(payload.byteLength), ...payload]);
    for (let offset = 0; offset < packet.byteLength; offset += 1000)
      socket.emit('data', packet.slice(offset, offset + 1000));
    expect(sameBytes(await transport.receive(), payload)).toBe(true);
    transport.close();
  });

  it('强制加密并支持取消接收', async () => {
    const plain = new FakeSocket();
    plain.encrypted = false;
    expect(() => createTcpTransport(plain)).toThrow('requires an encrypted TLS socket');
    const transport = createTcpTransport(new FakeSocket());
    const controller = new AbortController();
    const pending = transport.receive(controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    transport.close();
  });

  it('帧头超过协议最大帧立即判失败：销毁 socket，之后到达的数据不再缓冲', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    socket.emit('data', frameHeader(2 * 1024 * 1024));
    await expect(transport.receive()).rejects.toThrow('too large');
    expect(socket.destroyed).toBe(true);
    expect(socket.listenerCount('data')).toBe(0);
    expect(() => socket.emit('error', new Error('ECONNRESET'))).not.toThrow();
  });

  it('close 销毁 socket 并保留 error 监听，晚到的 socket 错误不会变成未处理异常', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const pending = transport.receive();
    transport.close();
    await expect(pending).rejects.toThrow('transport closed');
    expect(socket.destroyed).toBe(true);
    expect(() => socket.emit('error', new Error('ECONNRESET'))).not.toThrow();
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('transport closed');
  });

  it('写缓冲满时 send 等 drain 才完成', async () => {
    const socket = new FakeSocket();
    socket.writeReturns = false;
    const transport = createTcpTransport(socket);
    const sending = transport.send(new Uint8Array([1]));
    expect(await isSettled(sending)).toBe(false);
    socket.emit('drain');
    await sending;
    transport.close();
  });

  it('socket 出错时拒绝等待者和后续发送', async () => {
    const socket = new FakeSocket();
    const transport = createTcpTransport(socket);
    const pending = transport.receive();
    socket.emit('error', new Error('socket error'));
    await expect(pending).rejects.toThrow('socket error');
    await expect(transport.send(new Uint8Array([1]))).rejects.toThrow('socket error');
    expect(socket.destroyed).toBe(true);
  });
});

describe('TCP 适配器发送上限', () => {
  it('超过协议最大帧的发送直接拒绝', async () => {
    const transport = createTcpTransport(new FakeSocket());
    await expect(transport.send(new Uint8Array(2 * 1024 * 1024))).rejects.toThrow('too large');
    transport.close();
  });
});
