import { requireCondition } from '../core/errors.js';

interface TakeoverMessage {
  type: 'request' | 'response';
  id: string;
  accepted?: boolean;
}

export class DesktopOwnership {
  private releaseLock: (() => void) | null = null;
  private lockTask: Promise<void> = Promise.resolve();
  private negotiating = false;
  private readonly channel: BroadcastChannel;
  private readonly replies = new Map<string, (accepted: boolean) => void>();
  owned = false;

  constructor(
    private readonly name: string,
    private readonly prepare: () => Promise<boolean>,
    private readonly changed: () => void = () => undefined
  ) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = event => {
      void this.receive(event.data);
    };
  }

  async acquire(): Promise<boolean> {
    if (this.owned) return true;
    return new Promise((resolve, reject) => {
      this.lockTask = navigator.locks.request(this.name, { ifAvailable: true }, async lock => {
        if (!lock) {
          resolve(false);
          return;
        }
        this.owned = true;
        this.changed();
        const released = new Promise<void>(release => {
          this.releaseLock = release;
        });
        resolve(true);
        await released;
      });
      void this.lockTask.catch(reject);
    });
  }

  async takeover(): Promise<boolean> {
    if (await this.acquire()) return true;
    const id = crypto.randomUUID();
    const accepted = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this.replies.delete(id);
        resolve(false);
      }, 15000);
      this.replies.set(id, value => {
        clearTimeout(timer);
        this.replies.delete(id);
        resolve(value);
      });
      this.channel.postMessage({ type: 'request', id } satisfies TakeoverMessage);
    });
    return accepted && (await this.acquire());
  }

  async release(): Promise<void> {
    this.owned = false;
    this.releaseLock?.();
    this.releaseLock = null;
    await this.lockTask;
    this.changed();
  }

  async dispose(): Promise<void> {
    await this.release();
    for (const reply of this.replies.values()) reply(false);
    this.replies.clear();
    this.channel.close();
  }

  private async receive(value: unknown): Promise<void> {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('type' in value) ||
      !('id' in value) ||
      typeof value.id !== 'string'
    )
      return;
    if (value.type === 'response' && 'accepted' in value) {
      this.replies.get(value.id)?.(value.accepted === true);
      return;
    }
    if (value.type !== 'request' || !this.owned) return;
    const message: TakeoverMessage = { type: 'response', id: value.id, accepted: false };
    if (this.negotiating) {
      this.channel.postMessage(message);
      return;
    }
    this.negotiating = true;
    try {
      message.accepted = await this.prepare();
      if (message.accepted) await this.release();
      this.channel.postMessage(message);
    } finally {
      this.negotiating = false;
    }
  }
}

export function missingCapabilities(): string[] {
  return [
    ['安全上下文（HTTPS 或 localhost）', globalThis.isSecureContext],
    ['OPFS', typeof navigator.storage?.getDirectory === 'function'],
    ['IndexedDB', 'indexedDB' in globalThis],
    ['Web Locks', 'locks' in navigator],
    ['BroadcastChannel', 'BroadcastChannel' in globalThis],
    ['MessageChannel', 'MessageChannel' in globalThis],
    ['Web Components', 'customElements' in globalThis],
    ['Web Crypto', Boolean(globalThis.crypto?.subtle)]
  ]
    .filter(([, available]) => !available)
    .map(([name]) => String(name));
}

export function assertOwnership(ownership: DesktopOwnership): void {
  requireCondition(ownership.owned, 'OWNERSHIP', '此标签页没有桌面写入权');
}
