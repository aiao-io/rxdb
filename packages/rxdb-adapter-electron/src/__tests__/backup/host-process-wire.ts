/**
 * 子进程 host 管道的线格式：按 V8 原生的结构化克隆编解码，与 Electron IPC 的语义一致。
 *
 * @remarks
 * Node 的 `serialization: 'advanced'` 把类型化数组当宿主对象编码：只写视图自己的字节，解码出来的视图指向整条消息的
 * 缓冲区。Electron IPC 走 V8 原生的结构化克隆：视图背后的整个 `ArrayBuffer` 一起过去，解码出来独占一个同样大小的
 * buffer。host 按底层 buffer 的大小校验数据块，两种语义给出的结论不同，所以消息先按原生语义编成字节，
 * 再把字节交给 IPC 通道。父子两端都经这里收发，由 `forked-host-process.ts` 与各 host 入口共用。
 */
import { Deserializer, Serializer } from 'node:v8';

/**
 * 按 V8 原生的结构化克隆编码一条消息。
 *
 * @param message - 协议消息
 * @returns 编码后的字节
 */
export const encodeWire = (message: unknown): Uint8Array => {
  // 基类 `Serializer` 不把类型化数组当宿主对象，交给 V8 原生处理；`v8.serialize` 用的 `DefaultSerializer` 会。
  const serializer = new Serializer();
  serializer.writeHeader();
  serializer.writeValue(message);
  return serializer.releaseBuffer();
};

/**
 * 解码 {@link encodeWire} 编出的字节。
 *
 * @param bytes - 编码后的字节
 * @returns 协议消息；其中的类型化数组各自独占一个新分配的 buffer
 */
export const decodeWire = (bytes: Uint8Array): unknown => {
  const deserializer = new Deserializer(bytes);
  deserializer.readHeader();
  return deserializer.readValue();
};

/** 读 host 进程峰值常驻内存的探针请求（US-217 AC#9）；各入口在交给 host 之前先认它。 */
export interface PeakRssProbe {
  readonly probe: 'peakRss';
}

/**
 * 判断一条请求是不是 {@link PeakRssProbe}。
 *
 * @param body - 父进程发来的请求内容
 * @returns 是探针时为 `true`
 */
export const isPeakRssProbe = (body: object): body is PeakRssProbe => 'probe' in body && body.probe === 'peakRss';

/**
 * 本进程自启动以来的峰值常驻内存。
 *
 * @remarks
 * 取的是操作系统记账的 `maxRSS`，JS 堆、WASM 线性内存、原生分配与待回收的垃圾全算在内，三种操作系统上都可用。
 *
 * @returns 字节数
 */
export const peakRssBytes = (): number => process.resourceUsage().maxRSS * 1024;
