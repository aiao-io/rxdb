import { DestroyRef, Service, Signal, inject, signal } from '@angular/core';

import { DesktopAppId } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { WindowManager } from './window-manager';

const OPERATION_LOCK = 'aiao-desktop-app-transition';
const CHANNEL = 'aiao-desktop-app-close';
const CANCELLED = 'application-close-cancelled';
export const applicationLeaseName = (id: DesktopAppId): string => `aiao-desktop-app-session:${id}`;

export interface AppWindowLease {
  readonly ready: Promise<void>;
  readonly confirming: Signal<boolean>;
  answer(approved: boolean): void;
  dispose(): void;
}

interface CloseMessage {
  readonly kind: 'prepare' | 'cancel' | 'decline';
  readonly id: DesktopAppId;
  readonly token: string;
}

function closeMessage(raw: unknown): CloseMessage | null {
  const message = raw as Partial<CloseMessage> | null;
  return (
      message &&
        ['prepare', 'cancel', 'decline'].includes(message.kind ?? '') &&
        typeof message.id === 'string' &&
        /^catalog:[a-z][a-z0-9-]{0,63}$/.test(message.id) &&
        typeof message.token === 'string' &&
        message.token.length > 0 &&
        message.token.length <= 80
    ) ?
      (message as CloseMessage)
    : null;
}

/** 远程协议不报告草稿：逐窗口明确确认，全部标签页释放运行租约后才允许修改安装。 */
@Service({ autoProvided: false })
export class ApplicationTransitions {
  private readonly windows = inject(WindowManager);
  private readonly channel = new BroadcastChannel(CHANNEL);
  private readonly leases = new Map<DesktopWindow, AppWindowLease>();
  private readonly outgoing = new Map<string, { controller: AbortController; id: DesktopAppId }>();
  private closed = false;
  private readonly incoming = new Map<string, DesktopAppId>();

  constructor() {
    this.channel.onmessage = event => this.receive(event.data);
    inject(DestroyRef).onDestroy(() => {
      for (const [token, { controller, id }] of this.outgoing) {
        controller.abort(new Error('The initiating desktop tab was closed.'));
        this.send({ kind: 'cancel', id, token });
      }
      this.incoming.clear();
      for (const lease of this.leases.values()) lease.dispose();
      this.closed = true;
      this.channel.close();
    });
  }

  track(win: DesktopWindow): AppWindowLease {
    const confirming = signal(false);
    const controller = new AbortController();
    let resolveReady: () => void = () => undefined;
    let rejectReady: (error: unknown) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    ready.catch(() => undefined);
    let release: () => void = () => undefined;
    const released = new Promise<void>(resolve => {
      release = resolve;
    });
    let answer: ((approved: boolean) => void) | null = null;
    let pending: Promise<boolean> | null = null;
    const lease: AppWindowLease = {
      ready,
      confirming: confirming.asReadonly(),
      answer: approved => {
        const complete = answer;
        answer = null;
        pending = null;
        confirming.set(false);
        complete?.(approved);
      },
      dispose: () => {
        if (!this.leases.delete(win)) return;
        lease.answer(false);
        controller.abort(new Error('The application window was closed.'));
        release();
        closing.unsubscribe();
        win.confirmClose = null;
      }
    };
    const closing = win.beforeClose.subscribe(() => lease.dispose());
    win.confirmClose = () => {
      if (win.state() !== 'ready') return Promise.resolve(true);
      if (pending) return pending;
      this.windows.unminimize(win.id);
      this.windows.focus(win.id);
      confirming.set(true);
      pending = new Promise<boolean>(resolve => {
        answer = resolve;
      });
      return pending;
    };
    this.leases.set(win, lease);
    void navigator.locks
      .request(applicationLeaseName(win.appId), { mode: 'shared', signal: controller.signal }, async () => {
        resolveReady();
        await released;
      })
      .catch(rejectReady);
    return lease;
  }

  async change(ids: readonly DesktopAppId[], action: () => Promise<void>): Promise<boolean> {
    return navigator.locks.request(OPERATION_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) throw new Error('Another application change is already in progress. Try again when it finishes.');
      return this.releaseApps([...new Set(ids)].sort(), action);
    });
  }

  private async releaseApps(ids: readonly DesktopAppId[], action: () => Promise<void>): Promise<boolean> {
    const id = ids[0];
    if (!id) {
      await action();
      return true;
    }
    const controller = new AbortController();
    const token = crypto.randomUUID();
    this.outgoing.set(token, { controller, id });
    const timer = setTimeout(
      () => controller.abort(new Error('Return to the other desktop tabs and close this application, then try again.')),
      60000
    );
    const granted = navigator.locks.request(
      applicationLeaseName(id),
      { mode: 'exclusive', signal: controller.signal },
      async () => {
        clearTimeout(timer);
        this.outgoing.delete(token);
        return this.releaseApps(ids.slice(1), action);
      }
    );
    this.send({ kind: 'prepare', id, token } satisfies CloseMessage);
    void this.prepare({ kind: 'prepare', id, token });
    try {
      return await granted;
    } catch (error) {
      if (controller.signal.reason === CANCELLED) return false;
      throw error;
    } finally {
      clearTimeout(timer);
      this.outgoing.delete(token);
      this.cancel(token);
      this.send({ kind: 'cancel', id, token } satisfies CloseMessage);
    }
  }

  private send(message: CloseMessage): void {
    if (!this.closed) this.channel.postMessage(message);
  }

  private receive(raw: unknown): void {
    const message = closeMessage(raw);
    if (!message) return;
    if (message.kind === 'prepare') {
      void this.prepare(message);
      return;
    }
    if (message.kind === 'cancel') {
      this.cancel(message.token);
      return;
    }
    this.outgoing.get(message.token)?.controller.abort(CANCELLED);
  }

  private async prepare(message: CloseMessage): Promise<void> {
    if (![...this.leases.keys()].some(win => win.appId === message.id)) return;
    this.incoming.set(message.token, message.id);
    const approved = await this.windows.closeApp(message.id);
    if (!this.incoming.delete(message.token) || approved) return;
    this.outgoing.get(message.token)?.controller.abort(CANCELLED);
    this.send({ ...message, kind: 'decline' });
  }

  private cancel(token: string): void {
    const id = this.incoming.get(token);
    this.incoming.delete(token);
    for (const [win, lease] of this.leases) if (win.appId === id) lease.answer(false);
  }
}
