import { type IRepository } from '@aiao/rxdb';
import { DestroyRef, InjectionToken, Service, inject } from '@angular/core';

import { DesktopData, keyIs } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { LifecycleSource, browserLifecycle } from '../data/tab-sync';
import type { ActiveTabLease, TabStorage, WindowRecord } from './window-layout-model';
import {
  ACTIVE_TAB_LEASE_VERSION,
  ResumeLayout,
  WINDOW_ACTIVE_PREFIX,
  WINDOW_RESUME_KEY,
  WINDOW_RESUME_VERSION,
  activeTabKey,
  parseActiveTabLease,
  tabSessionId
} from './window-layout-model';

/** 浏览器会话恢复使用的会话存储；取不到时不使用共享的标签页标识。 */
export const TAB_STORAGE = new InjectionToken<TabStorage | null>('TAB_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return sessionStorage;
    } catch {
      return null;
    }
  }
});

/** 浏览器页面生命周期，单测用替身注入。 */
export const BROWSER_SESSION_LIFECYCLE = new InjectionToken<LifecycleSource | undefined>('BROWSER_SESSION_LIFECYCLE', {
  providedIn: 'root',
  factory: browserLifecycle
});

/** 活跃标签页超过这个时间没有心跳，就不再阻挡新的桌面标签页领取恢复权。 */
export const ACTIVE_TAB_LEASE_TTL = 30_000;

/** 活跃标签页心跳间隔。 */
const ACTIVE_TAB_HEARTBEAT = 10_000;

const ALL = { combinator: 'and' as const, rules: [] };

type PreferenceRow = InstanceType<typeof SystemPreference>;
type PreferenceRepository = IRepository<typeof SystemPreference>;

/** 桌面启动时决定恢复来源和是否能更新浏览器会话快照。 */
export interface BrowserSessionRestorePlan {
  readonly available: boolean;
  readonly tabId: string | null;
  readonly resume: unknown | undefined;
  readonly canPublish: boolean;
}

/** 浏览器级最近工作区快照和活跃标签页租约的协调器。 */
@Service({ autoProvided: false })
export class BrowserSessionRestore {
  private readonly data = inject(DesktopData);
  private readonly preferences = inject(Preferences);
  private readonly storage = inject(TAB_STORAGE);
  private readonly lifecycle = inject(BROWSER_SESSION_LIFECYCLE);
  private readonly tabIdValue = this.openTab();
  private readonly destroyRef = inject(DestroyRef);
  private prepared: Promise<BrowserSessionRestorePlan> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private closing = false;
  private closed = false;
  private publishAllowed = false;
  private activeAt = 0;

  /** 本标签页的会话标识；会话存储不可用时为 `null`。 */
  get tabId(): string | null {
    return this.tabIdValue;
  }

  constructor() {
    this.listenLifecycle();
    this.destroyRef.onDestroy(() => {
      clearInterval(this.heartbeat);
      void this.close();
    });
  }

  /** 页面是否已经收到不可恢复的 `pagehide`。 */
  isClosing(): boolean {
    return this.closing;
  }

  /**
   * 登记本标签页并领取一次浏览器恢复权。
   * 当前标签页已有布局时永远优先使用它；没有布局时只有没有其他活跃标签页才会拿到共享快照。
   */
  prepare(hasOwnLayout: boolean): Promise<BrowserSessionRestorePlan> {
    return (this.prepared ??= this.prepareOnce(hasOwnLayout));
  }

  /** 页面重新获得焦点后更新活跃来源，后续保存可以成为最近工作区。 */
  markActive(): void {
    if (!this.prepared || this.closing || this.tabIdValue === null) return;
    this.activeAt = Date.now();
    this.publishAllowed = true;
    void this.enqueue(() => this.touchLease(true));
  }

  /** 保存完整窗口快照；单行偏好更新保证不会出现半条窗口列表。 */
  saveResume(windows: readonly WindowRecord[]): Promise<void> {
    if (!this.prepared || this.tabIdValue === null || !this.publishAllowed) return Promise.resolve();
    return this.enqueue(() => this.writeResume(windows));
  }

  /** 页面关闭时在最后一次快照写入之后释放租约。 */
  close(): Promise<void> {
    if (this.closed || this.tabIdValue === null) return this.queue;
    this.closed = true;
    this.closing = true;
    this.publishAllowed = false;
    clearInterval(this.heartbeat);
    return this.enqueue(() => this.releaseLease());
  }

  private async prepareOnce(hasOwnLayout: boolean): Promise<BrowserSessionRestorePlan> {
    const tabId = this.tabIdValue;
    if (tabId === null) return { available: false, tabId: null, resume: undefined, canPublish: false };
    try {
      await this.preferences.ready;
      const result = await this.data.tabs.exclusive(async () => {
        const repository = await this.data.repository(SystemPreference);
        const rows = (await repository.find({ where: ALL })) as PreferenceRow[];
        const now = Date.now();
        const leases = rows
          .filter(row => row.key.startsWith(WINDOW_ACTIVE_PREFIX))
          .map(row => parseActiveTabLease(row.value))
          .filter((lease): lease is ActiveTabLease => lease !== null && this.isLeaseActive(lease, now));
        const own = leases.find(lease => lease.tabId === tabId);
        const otherActive = leases.some(lease => lease.tabId !== tabId);
        this.activeAt = own?.lastActiveAt ?? now;
        await this.writeLease(repository, {
          version: ACTIVE_TAB_LEASE_VERSION,
          tabId,
          updatedAt: now,
          lastActiveAt: this.activeAt
        });
        this.publishAllowed = hasOwnLayout || !otherActive;
        this.startHeartbeat();
        const resume =
          !hasOwnLayout && !otherActive ? rows.find(row => row.key === WINDOW_RESUME_KEY)?.value : undefined;
        return { resume, canPublish: this.publishAllowed };
      });
      return { available: true, tabId, resume: result.resume, canPublish: result.canPublish };
    } catch {
      return { available: false, tabId: this.tabIdValue, resume: undefined, canPublish: false };
    }
  }

  private listenLifecycle(): void {
    const source = this.lifecycle;
    if (!source) return;
    const onFocus = (): void => this.markActive();
    const onVisibility = (): void => {
      if (source.visibilityState === 'visible') this.markActive();
    };
    const onPageShow = (): void => this.markActive();
    const onPageHide = (event: { readonly persisted?: boolean }): void => {
      if (!event.persisted) this.closing = true;
    };
    source.addEventListener('focus', onFocus);
    source.addEventListener('visibilitychange', onVisibility);
    source.addEventListener('pageshow', onPageShow);
    source.addEventListener('pagehide', onPageHide);
    this.destroyRef.onDestroy(() => {
      source.removeEventListener('focus', onFocus);
      source.removeEventListener('visibilitychange', onVisibility);
      source.removeEventListener('pageshow', onPageShow);
      source.removeEventListener('pagehide', onPageHide);
    });
  }

  private startHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => void this.enqueue(() => this.touchLease(false)), ACTIVE_TAB_HEARTBEAT);
  }

  private touchLease(active: boolean): Promise<void> {
    const tabId = this.tabIdValue;
    if (tabId === null || this.closed) return Promise.resolve();
    return this.data.tabs.exclusive(async () => {
      const repository = await this.data.repository(SystemPreference);
      const now = Date.now();
      const [row] = await repository.find({ where: keyIs(activeTabKey(tabId)), limit: 1 });
      const current = row ? parseActiveTabLease(row.value) : null;
      const lease: ActiveTabLease = {
        version: ACTIVE_TAB_LEASE_VERSION,
        tabId,
        updatedAt: now,
        lastActiveAt: active ? now : (current?.lastActiveAt ?? this.activeAt)
      };
      await this.writeLease(repository, lease);
      if (active) this.activeAt = lease.lastActiveAt;
    });
  }

  private async writeResume(windows: readonly WindowRecord[]): Promise<void> {
    const tabId = this.tabIdValue;
    if (tabId === null) return;
    await this.data.tabs.exclusive(async () => {
      const repository = await this.data.repository(SystemPreference);
      const rows = (await repository.find({ where: ALL })) as PreferenceRow[];
      const now = Date.now();
      const leases = rows
        .filter(row => row.key.startsWith(WINDOW_ACTIVE_PREFIX))
        .map(row => parseActiveTabLease(row.value))
        .filter((lease): lease is ActiveTabLease => lease !== null && this.isLeaseActive(lease, now));
      const winner = [...leases].sort(compareLeases).at(-1);
      if (winner && winner.tabId !== tabId) return;
      const existing = rows.find(row => row.key === WINDOW_RESUME_KEY)?.value;
      if (isResumeNewer(existing, this.activeAt, tabId)) return;
      const resume: ResumeLayout = {
        version: WINDOW_RESUME_VERSION,
        updatedAt: now,
        activeAt: this.activeAt,
        sourceTabId: tabId,
        windows
      };
      await this.writePreference(repository, WINDOW_RESUME_KEY, resume);
      this.data.tabs.notify('preferences');
    });
  }

  private releaseLease(): Promise<void> {
    const tabId = this.tabIdValue;
    if (tabId === null) return Promise.resolve();
    return this.data.tabs.exclusive(async () => {
      const repository = await this.data.repository(SystemPreference);
      const [row] = await repository.find({ where: keyIs(activeTabKey(tabId)), limit: 1 });
      if (!row) return;
      const current = parseActiveTabLease(row.value);
      if (!current) return;
      await this.writeLease(repository, { ...current, updatedAt: Date.now(), released: true });
      this.data.tabs.notify('preferences');
    });
  }

  private writeLease(repository: PreferenceRepository, lease: ActiveTabLease): Promise<void> {
    return this.writePreference(repository, activeTabKey(lease.tabId), lease);
  }

  private async writePreference(repository: PreferenceRepository, key: string, value: unknown): Promise<void> {
    const [existing] = await repository.find({ where: keyIs(key), limit: 1 });
    if (existing) await repository.update(existing, { value });
    else await repository.create(this.data.instantiate(SystemPreference, { key, value }));
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private openTab(): string | null {
    if (!this.storage) return null;
    try {
      return tabSessionId(this.storage);
    } catch {
      return null;
    }
  }

  private isLeaseActive(lease: ActiveTabLease, now: number): boolean {
    return !lease.released && now - lease.updatedAt <= ACTIVE_TAB_LEASE_TTL;
  }
}

function compareLeases(a: ActiveTabLease, b: ActiveTabLease): number {
  return a.lastActiveAt - b.lastActiveAt || a.tabId.localeCompare(b.tabId);
}

function isResumeNewer(raw: unknown, activeAt: number, tabId: string): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const version = value['version'];
  if (typeof version === 'number' && Number.isFinite(version) && version > WINDOW_RESUME_VERSION) return true;
  if (version !== WINDOW_RESUME_VERSION) return false;
  const existingAt = value['activeAt'];
  const existingTab = value['sourceTabId'];
  return (
    typeof existingAt === 'number' &&
    Number.isFinite(existingAt) &&
    (existingAt > activeAt || (existingAt === activeAt && typeof existingTab === 'string' && existingTab > tabId))
  );
}
