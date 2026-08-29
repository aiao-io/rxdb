import type { OpfsRequest, OpfsResponse } from '@aiao/rxdb-devtools-panel/wire';
import type { DevToolsFileChannel } from '../transport';

/** 由用例提供的 OPFS 应答生成器；抛错等价于宿主信道不可用。 */
export type FakeOpfsResponder = (request: Omit<OpfsRequest, 'requestId'>) => OpfsResponse | Promise<OpfsResponse>;

/**
 * 纯内存的 {@link DevToolsFileChannel} 实现。
 *
 * @remarks
 * requestId 由本实现铸造并在返回前**填回**应答里 —— 真实 adapter 用 `withOpfsRequestId`
 * 做同样的配对校验，用例的 responder 因此不必关心 id，也就无从伪造出「id 不匹配却被接受」
 * 这种真实实现拒绝的情形。
 */
export class FakeDevToolsFileChannel implements DevToolsFileChannel {
  private requestSequence = 0;
  private uploadSequence = 0;

  /** 收到的全部请求，按时序记录（含铸造出的 requestId）。 */
  readonly requests: OpfsRequest[] = [];

  constructor(private responder: FakeOpfsResponder = () => ({ requestId: '', result: 'ok' })) {}

  async request(message: Omit<OpfsRequest, 'requestId'>): Promise<OpfsResponse> {
    const requestId = `fake:${++this.requestSequence}`;
    this.requests.push({ ...message, requestId });
    const response = await this.responder(message);
    return { ...response, requestId };
  }

  createUploadId(): string {
    return `fake:upload:${++this.uploadSequence}`;
  }

  /** 替换应答生成器。 */
  respondWith(responder: FakeOpfsResponder): void {
    this.responder = responder;
  }
}
