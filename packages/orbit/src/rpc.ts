import { aborted, checkName, checkTimeout, destroyed, OrbitError } from './errors.js';
import { copyValue } from './payload.js';
import type { Message } from './protocol.js';
import type { OrbitRequestHandler, OrbitRequestOptions, OrbitValue } from './types.js';

interface Pending {
  resolve(value: OrbitValue): void;
  reject(error: unknown): void;
  cleanup(): void;
}

export class Rpc {
  private readonly handlers = new Map<string, OrbitRequestHandler>();
  private readonly pending = new Map<string, Pending>();
  private readonly incoming = new Map<string, AbortController>();
  private sequence = 0;
  private closed = false;

  constructor(private readonly send: (message: Message) => void) {}

  request(method: string, payload: OrbitValue = null, options: OrbitRequestOptions = {}): Promise<OrbitValue> {
    if (this.closed) return Promise.reject(destroyed());
    if (options.signal?.aborted) return Promise.reject(aborted());
    checkName(method);
    const value = copyValue(payload);
    const timeout = checkTimeout(options.timeout ?? 5000);
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const cancel = (error: OrbitError) => {
        if (!this.pending.delete(id)) return;
        cleanup();
        reject(error);
        this.send({ type: 'cancel', id });
      };
      const abort = () => cancel(aborted());
      const timer = setTimeout(() => cancel(new OrbitError('TIMEOUT', '请求超时')), timeout);
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      };
      this.pending.set(id, { resolve, reject, cleanup });
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        this.send({ type: 'request', id, method, payload: value });
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }

  onRequest(method: string, handler: OrbitRequestHandler): () => void {
    if (this.closed) throw destroyed();
    checkName(method);
    if (this.handlers.has(method)) throw new OrbitError('INVALID_STATE', `请求处理函数重复：${method}`);
    this.handlers.set(method, handler);
    return () => {
      if (this.handlers.get(method) === handler) this.handlers.delete(method);
    };
  }

  receive(message: Message): void {
    if (this.closed) return;
    if (message.type === 'request') {
      void this.handle(message);
      return;
    }
    if (message.type === 'cancel') {
      this.incoming.get(message.id)?.abort();
      return;
    }
    if (message.type !== 'response' && message.type !== 'reject') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    pending.cleanup();
    if (message.type === 'response') pending.resolve(message.value);
    else
      pending.reject(
        new OrbitError(message.code === 'UNKNOWN_METHOD' ? 'UNKNOWN_METHOD' : 'HANDLER_ERROR', message.message)
      );
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(destroyed());
    }
    for (const controller of this.incoming.values()) controller.abort();
    this.pending.clear();
    this.incoming.clear();
    this.handlers.clear();
  }

  private async handle(message: Extract<Message, { type: 'request' }>): Promise<void> {
    if (this.incoming.has(message.id)) return;
    const handler = this.handlers.get(message.method);
    if (!handler) {
      this.send({ type: 'reject', id: message.id, code: 'UNKNOWN_METHOD', message: `未知操作：${message.method}` });
      return;
    }
    const controller = new AbortController();
    this.incoming.set(message.id, controller);
    try {
      const value = copyValue(await handler(message.payload, controller.signal));
      if (!this.closed && !controller.signal.aborted) this.send({ type: 'response', id: message.id, value });
    } catch (error) {
      if (!this.closed && !controller.signal.aborted)
        this.send({
          type: 'reject',
          id: message.id,
          code: 'HANDLER_ERROR',
          message: error instanceof Error ? error.message : '请求处理失败'
        });
    } finally {
      this.incoming.delete(message.id);
    }
  }
}
