/** 用例侧的对端进程句柄：派生 `peer.ts`，经 IPC 下指令、收通知。 */
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withinDeadline } from '../shared/deadline.ts';
import type { PeerName } from '../shared/fixtures.ts';
import type { PeerCommand, PeerEvent, PeerReply, PeerRequest, PeerResults } from './protocol.ts';

const PEER_SCRIPT = fileURLToPath(new URL('./peer.ts', import.meta.url));

type EventName = PeerEvent['event'];

interface Waiter<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

/** 一个对端进程。 */
export class PeerProcess {
  readonly #name: PeerName;
  readonly #child: ChildProcess;
  readonly #replies = new Map<number, Waiter<unknown>>();
  readonly #received: PeerEvent[] = [];
  readonly #eventWaiters: Array<{ readonly event: EventName } & Waiter<PeerEvent>> = [];
  #sequence = 0;
  #failure: Error | undefined;

  /**
   * @param name - 设备名，决定对端进程的身份
   * @param flags - 透传给 `peer.ts` 的开关，例如 `--probe`
   */
  constructor(name: PeerName, flags: readonly string[] = []) {
    this.#name = name;
    // 不继承 Playwright worker 的 execArgv（其中有它自己的模块加载器）：对端进程是一个干净的 node。
    this.#child = fork(PEER_SCRIPT, [name, ...flags], { execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    this.#child.on('message', message => this.#receive(message as PeerReply | PeerEvent));
    this.#child.once('exit', code => this.#fail(new Error(`peer ${name} exited with code ${code}`)));
  }

  /** 下一条指令并等结果；对端进程报错、退出，或 IPC 上迟迟没有回复时拒绝。 */
  call<M extends PeerCommand['method']>(command: Extract<PeerCommand, { method: M }>): Promise<PeerResults[M]> {
    if (this.#failure) return Promise.reject(this.#failure);
    const request: PeerRequest = { id: this.#sequence++, command };
    const reply = new Promise<PeerResults[M]>((resolve, reject) => {
      this.#replies.set(request.id, { resolve: value => resolve(value as PeerResults[M]), reject });
      this.#child.send(request);
    });
    return withinDeadline(reply, `peer ${this.#name}: ${command.method}`);
  }

  /** 等下一条指定的通知；在等之前已经到达的也算，迟迟不来时拒绝。 */
  nextEvent<E extends EventName>(event: E): Promise<Extract<PeerEvent, { event: E }>> {
    const index = this.#received.findIndex(item => item.event === event);
    if (index >= 0) return Promise.resolve(this.#received.splice(index, 1)[0] as Extract<PeerEvent, { event: E }>);
    if (this.#failure) return Promise.reject(this.#failure);
    const arrival = new Promise<Extract<PeerEvent, { event: E }>>((resolve, reject) =>
      this.#eventWaiters.push({ event, resolve: value => resolve(value as Extract<PeerEvent, { event: E }>), reject })
    );
    return withinDeadline(arrival, `peer ${this.#name}: event ${event}`);
  }

  /** 结束对端进程；可重复调用。 */
  kill(): void {
    this.#child.kill();
  }

  #receive(message: PeerReply | PeerEvent): void {
    if (message.kind === 'event') return this.#deliver(message);
    const waiter = this.#replies.get(message.id);
    this.#replies.delete(message.id);
    if ('error' in message) waiter?.reject(new Error(message.error));
    else waiter?.resolve(message.result);
  }

  #deliver(event: PeerEvent): void {
    const index = this.#eventWaiters.findIndex(waiter => waiter.event === event.event);
    if (index < 0) {
      this.#received.push(event);
      return;
    }
    this.#eventWaiters.splice(index, 1)[0].resolve(event);
  }

  #fail(error: Error): void {
    this.#failure ??= error;
    for (const waiter of this.#replies.values()) waiter.reject(this.#failure);
    this.#replies.clear();
    for (const waiter of this.#eventWaiters.splice(0)) waiter.reject(this.#failure);
  }
}
