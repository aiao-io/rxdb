import { createOrbit, type OrbitInstance, type OrbitObject, type OrbitState } from '@aiao/orbit';
import { isRecord } from '../core/catalog.js';
import { openDatabase, type DesktopDatabase } from '../core/database.js';
import { DesktopError, errorMessage, requireCondition } from '../core/errors.js';
import { checkPermission, grantPermission } from '../core/permissions.js';
import { getRelease, installationFor } from '../core/releases.js';
import type { ResourceReference } from '../core/resource-references.js';
import type { ResourcePriority } from '../core/resource-scheduler.js';
import { readNavigationAction, readNavigationState, type NavigationAction } from '../core/routes.js';
import { createState, validateProfile } from '../core/state.js';
import { DesktopTransfers } from '../core/transfers.js';
import type { AppDefinition, DesktopState, SavedWindow } from '../core/types.js';
import { ApplicationResources } from './application-resources.js';
import { registerBridge } from './bridge.js';
import { prepareClose, type CloseParticipant } from './close.js';
import type { DiagnosticEntry } from './diagnostics.js';
import { Dialogs } from './dialogs.js';
import { activateWorker, waitForActivation } from './offline.js';
import { DesktopOwnership, missingCapabilities } from './ownership.js';
import { Prefetch } from './prefetch.js';
import { Suspension } from './suspension.js';
import {
  activateWindow,
  constrainBounds,
  createWindowModel,
  focusRecent,
  openWindow,
  removeWindow,
  setWindowState,
  switchMode,
  switchWorkspace,
  type WorkArea
} from './windows.js';

export interface AppCommand {
  id: string;
  label: string;
  disabled: boolean;
}
export interface RunningApp {
  id: string;
  definition: AppDefinition;
  resourceVersion: string | null;
  background: Suspension;
  resourceLifetime: AbortController;
  handle: OrbitInstance;
  status: OrbitState;
  dirty: boolean;
  title: string;
  fileId: string | null;
  route: string;
  navigation: { back: boolean; forward: boolean };
  error: string | null;
  commands: AppCommand[];
  mounted: boolean;
}

export class DesktopHost {
  private readonly lifetime = new AbortController();
  private closing = false;
  private cleanupRequested = false;
  private readonly permissionRequests = new Map<string, Promise<void>>();
  private disposed = false;
  private restoring = false;
  private readonly clockTimer: ReturnType<typeof setInterval>;
  private offlineRepair: AbortController | null = null;
  private offlineChannel: MessageChannel | null = null;
  private offlineTimer: ReturnType<typeof setTimeout> | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  readonly resources = new ApplicationResources(
    () => this.registration?.active ?? null,
    this.baseURL(),
    this.lifetime.signal
  );
  readonly prefetch = new Prefetch(
    async (item, signal) => {
      await this.prepareApplication(item.id, { priority: 'background', signal, key: item.key });
      this.refreshOffline();
    },
    () => this.changed(),
    this.lifetime.signal
  );
  resourcesOpen = false;
  collectingResources = false;
  resourceMessage = '';
  readonly changingApplications = new Set<string>();
  readonly transfers = new DesktopTransfers();
  readonly instances = new Map<string, RunningApp>();
  readonly errors: DiagnosticEntry[] = [];
  readonly notifications: {
    id: string;
    instanceId: string;
    appId: string;
    title: string;
    body: string;
    time: number;
  }[] = [];
  readonly listeners = new Set<() => void>();
  readonly dialogs = new Dialogs(() => this.changed());
  readonly runtime = createOrbit({ allowedOrigins: [window.location.origin] });
  readonly ownership = new DesktopOwnership(
    'orbit-desktop-owner',
    () => this.prepareTakeover(),
    () => this.changed()
  );
  readonly model = createWindowModel(/Mac/.test(navigator.platform) ? 'macos' : 'windows');
  state: DesktopState = createState(this.model.mode);
  database: DesktopDatabase | null = null;
  phase: 'loading' | 'ready' | 'spectator' | 'unsupported' | 'error' | 'update-required' = 'loading';
  revision = 0;
  message = '';
  missing: string[] = [];
  offline = !navigator.onLine;
  offlineReady = false;
  preparingOffline = false;
  updateAvailable = false;
  updatingShell = false;
  launcherOpen = false;
  overviewOpen = false;
  notificationsOpen = false;
  clock = new Date();

  constructor() {
    this.clockTimer = setInterval(() => {
      void this.transfers.size;
      this.clock = new Date();
      if (this.clock.getSeconds() % 30 === 0) this.refreshOffline();
      this.changed();
    }, 1000);
    window.addEventListener('online', this.networkChanged);
    window.addEventListener('offline', this.networkChanged);
    window.addEventListener('beforeunload', this.beforeUnload);
    window.addEventListener('resize', this.resized);
    window.addEventListener('focus', this.offlineChanged);
    window.addEventListener('pointerdown', this.resourceActivity);
    window.addEventListener('keydown', this.resourceActivity);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  changed(): void {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  async start(): Promise<void> {
    this.missing = missingCapabilities();
    if (this.missing.length) {
      this.phase = 'unsupported';
      this.changed();
      return;
    }
    try {
      if (!(await this.ownership.acquire())) {
        this.phase = 'spectator';
        this.changed();
        return;
      }
      await this.loadDesktop();
    } catch (error) {
      this.phase = error instanceof DesktopError && error.code === 'UPDATE_REQUIRED' ? 'update-required' : 'error';
      this.report(error);
    }
  }

  async takeControl(): Promise<void> {
    try {
      if (!(await this.ownership.takeover())) {
        this.message = '当前桌面取消了移交，或尚未完成确认。原页面仍保留控制权。';
        this.changed();
        return;
      }
      await this.loadDesktop();
    } catch (error) {
      this.phase = error instanceof DesktopError && error.code === 'UPDATE_REQUIRED' ? 'update-required' : 'error';
      this.report(error);
    }
  }

  area(): WorkArea {
    return {
      width: Math.max(320, window.innerWidth),
      height: Math.max(
        200,
        window.innerHeight - (this.model.mode === 'macos' ? 110 : 98) - (34 + (14 * this.state.profile.scale) / 100)
      )
    };
  }

  async mutate<T>(operation: (state: DesktopState) => T): Promise<T> {
    requireCondition(this.database && this.ownership.owned, 'OWNERSHIP', '当前标签页没有写入权');
    const result = await this.database.transact(operation);
    const previous = JSON.stringify(this.state.profile);
    this.state = await this.database.read();
    if (previous !== JSON.stringify(this.state.profile)) this.applyProfile();
    this.changed();
    return result;
  }

  async updateProfile(patch: Partial<DesktopState['profile']>): Promise<void> {
    await this.mutate(state => {
      const profile = { ...state.profile, ...patch };
      validateProfile(profile);
      const installed = new Set(state.installations.map(app => app.appId));
      requireCondition(
        [...profile.pinned, ...profile.shortcuts].every(id => installed.has(id)),
        'INVALID',
        '应用尚未安装'
      );
      state.profile = profile;
    });
  }

  launch(appId: string, newInstance = false, fileId: string | null = null, saved?: SavedWindow): RunningApp {
    requireCondition(this.phase === 'ready' && this.ownership.owned, 'OWNERSHIP', '桌面当前不可写');
    requireCondition(!this.changingApplications.has(appId), 'BUSY', '正在切换应用版本，请先完成确认');
    const installation = installationFor(this.state, appId);
    const definition = getRelease(appId, installation.version).definition;
    const resourceVersion =
      installation.resourceVersion ??
      (import.meta.env.DEV ? null : this.resources.find(appId, installation.version).key);
    const candidates = [...this.instances.values()].filter(app => app.definition.id === appId);
    const existing = candidates.find(app => fileId !== null && app.fileId === fileId) ?? candidates.at(-1);
    if (
      existing &&
      (definition.instances === 'single' ||
        (!newInstance && fileId === null) ||
        (!newInstance && existing.fileId === fileId && fileId !== null))
    ) {
      this.reveal(existing.id);
      return existing;
    }
    const id = crypto.randomUUID();
    const props: OrbitObject = { fileId, profile: this.profileValue(), route: saved?.route ?? '' };
    const handle = this.runtime.createApp({
      appId,
      instanceId: id,
      version: definition.version,
      url:
        import.meta.env.DEV ?
          new URL(definition.entry, this.baseURL()).href
        : this.resources.entry({ appId, version: definition.version, key: resourceVersion! }, definition.entry),
      title: definition.name,
      props
    });
    const app: RunningApp = {
      id,
      definition,
      resourceVersion,
      resourceLifetime: new AbortController(),
      background: new Suspension(
        definition.suspension === 1,
        name => handle.request(name),
        () => {
          this.syncVisibility();
          this.changed();
        }
      ),
      handle,
      status: 'created',
      dirty: false,
      title: definition.name,
      fileId,
      route: saved?.route ?? '',
      navigation: { back: false, forward: false },
      error: null,
      commands: [],
      mounted: false
    };
    this.instances.set(id, app);
    const win = openWindow(this.model, id, appId, this.area());
    win.title = definition.name;
    if (saved) {
      win.workspaceId = saved.workspaceId;
      win.bounds = constrainBounds(saved.bounds, this.area());
      win.normalBounds = { ...win.bounds };
      setWindowState(this.model, win.id, saved.state, this.area());
    }
    registerBridge(this, app);
    handle.subscribe(snapshot => {
      app.status = snapshot.state;
      this.syncAppVisibility(app);
      this.changed();
    });
    this.launcherOpen = false;
    this.changed();
    void this.persistSession().catch(error => this.report(error));
    return app;
  }

  async mount(app: RunningApp, container: HTMLElement): Promise<void> {
    if (app.mounted) return;
    app.mounted = true;
    try {
      if (app.resourceVersion)
        await this.resources.prepare(
          {
            appId: app.definition.id,
            version: app.definition.version,
            key: app.resourceVersion
          },
          { signal: app.resourceLifetime.signal }
        );
      if (!this.instances.has(app.id)) return;
      if (app.resourceVersion) await this.bindResource(app.definition.id, app.definition.version, app.resourceVersion);
      if (!this.instances.has(app.id)) return;
      await app.handle.mount(container);
    } catch (error) {
      if (!this.instances.has(app.id)) return;
      app.status = 'failed';
      app.error = errorMessage(error);
      this.errors.push({
        time: new Date().toISOString(),
        appId: app.definition.id,
        version: app.definition.version,
        instanceId: app.id,
        category: app.status === 'failed' ? 'STARTUP_FAILED' : 'RUNTIME_ERROR'
      });
      this.changed();
    }
  }

  reveal(id: string): void {
    const app = this.instances.get(id);
    requireCondition(app, 'NOT_FOUND', '应用实例已退出');
    this.prefetch.activity();
    if (app.background.state === 'suspended' || app.background.state === 'unknown')
      void this.resumeApplication(app).catch(error => this.report(error));
    let win = this.model.windows.find(win => win.instanceId === id);
    if (!win) {
      win = openWindow(this.model, id, app.definition.id, this.area());
      win.title = app.title;
    }
    activateWindow(this.model, win.id);
    this.overviewOpen = false;
    this.launcherOpen = false;
    this.syncVisibility();
    this.changed();
    void this.persistSession().catch(error => this.report(error));
  }

  async windowAction(id: string, action: string): Promise<void> {
    const win = this.model.windows.find(win => win.instanceId === id);
    requireCondition(win, 'NOT_FOUND', '窗口已关闭');
    if (action === 'close') {
      await this.closeInstances([id], { destroy: this.model.mode === 'windows' });
      return;
    }
    requireCondition(
      ['minimized', 'maximized', 'normal', 'left', 'right', 'restore'].includes(action),
      'INVALID',
      '窗口操作无效'
    );
    setWindowState(this.model, win.id, action as 'restore', this.area());
    this.syncVisibility();
    this.changed();
    await this.persistSession();
  }

  async closeInstances(
    ids: string[],
    options: { destroy?: boolean; preserveSession?: boolean } = {}
  ): Promise<boolean> {
    if (this.closing) return false;
    this.closing = true;
    try {
      const participants: CloseParticipant[] = [];
      for (const id of ids) {
        const app = this.instances.get(id);
        if (app) participants.push(await this.closeParticipant(app, options.destroy ?? true));
      }
      const accepted = await prepareClose(
        participants,
        async participant => {
          const app = this.instances.get(participant.id);
          const answer = await this.dialogs.ask({
            title: '保存未保存的更改？',
            message: `${app?.title ?? '文档'} 尚未保存。取消会保留所有相关窗口。`,
            actions: [
              { id: 'save', label: '保存' },
              { id: 'discard', label: '放弃更改', danger: true },
              { id: 'cancel', label: '取消' }
            ]
          });
          return answer.action === 'save' || answer.action === 'discard' ? answer.action : 'cancel';
        },
        async () => {
          if (options.preserveSession) await this.persistSession();
        }
      );
      if (accepted && !options.preserveSession) await this.persistSession();
      this.changed();
      return accepted;
    } finally {
      this.closing = false;
    }
  }

  async navigateApplication(app: RunningApp, action: NavigationAction): Promise<void> {
    requireCondition(
      this.instances.get(app.id) === app && this.ownership.owned,
      'OWNERSHIP',
      '实例已退出或控制权已失效'
    );
    requireCondition(
      app.background.state === 'running' && (app.status === 'ready' || app.status === 'hidden'),
      'NOT_READY',
      '请先恢复并等待应用就绪'
    );
    const state = readNavigationState(await app.handle.request('navigation.navigate', readNavigationAction(action)));
    requireCondition(
      this.instances.get(app.id) === app && this.ownership.owned,
      'OWNERSHIP',
      '导航期间实例已退出或控制权已失效'
    );
    app.route = state.route;
    app.navigation = { back: state.back, forward: state.forward };
    this.changed();
    await this.persistSession();
  }

  async openLocation(app: RunningApp): Promise<void> {
    const answer = await this.dialogs.ask({
      title: `打开位置 · ${app.definition.name}`,
      message: '只在此应用实例内导航。未保存的内容会由应用检查；凭据不能写入可恢复位置。',
      fields: [{ name: 'route', label: '应用位置', value: app.route || '/' }],
      actions: [
        { id: 'open', label: '打开位置' },
        { id: 'cancel', label: '取消' }
      ]
    });
    if (answer.action === 'open') await this.navigateApplication(app, { type: 'push', route: answer.values['route'] });
  }

  async command(id: string, command: string): Promise<void> {
    const app = this.instances.get(id);
    requireCondition(app, 'NOT_FOUND', '应用已退出');
    requireCondition(app.background.state === 'running', 'SUSPENDED', '请先恢复应用');
    await app.handle.request('command', { id: command });
  }

  async authorize(app: RunningApp, capability: string, scope = '*', signal?: AbortSignal): Promise<void> {
    const key = JSON.stringify([app.id, capability, scope]);
    const existing = this.permissionRequests.get(key);
    if (existing) {
      await existing;
      requireCondition(!signal?.aborted, 'CANCELLED', '调用已取消');
      return;
    }
    const request = this.promptPermission(app, capability, scope, signal);
    this.permissionRequests.set(key, request);
    try {
      await request;
    } finally {
      this.permissionRequests.delete(key);
    }
  }

  identity(app: RunningApp) {
    return {
      appId: app.definition.id,
      instanceId: app.id,
      origin: this.baseURL().origin,
      capabilities: [...app.definition.capabilities, ...app.definition.optionalCapabilities]
    };
  }

  notifyFiles(source: string): void {
    for (const app of this.instances.values()) {
      if (app.status !== 'ready' && app.status !== 'hidden') continue;
      app.handle.emit('files.changed');
      if (app.id === source || !app.fileId || !checkPermission(this.state, this.identity(app), 'files', app.fileId))
        continue;
      const file = this.state.files.find(file => file.id === app.fileId);
      app.handle.emit('document.invalidated', {
        reason:
          !file ? 'missing'
          : file.deleted ? 'trashed'
          : 'updated'
      });
    }
  }

  setWorkspace(id: string): void {
    requireCondition(
      this.state.workspaces.some(workspace => workspace.id === id),
      'NOT_FOUND',
      '工作区不存在'
    );
    switchWorkspace(this.model, id);
    this.syncVisibility();
    this.changed();
    void this.persistSession().catch(error => this.report(error));
  }

  async persistSession(): Promise<void> {
    if (!this.database || !this.ownership.owned || this.restoring) return;
    const windows = this.model.windows.slice().sort((a, b) => a.z - b.z);
    const session = windows.map(win => {
      const app = this.instances.get(win.instanceId);
      return {
        appId: win.appId,
        fileId: app?.fileId ?? null,
        route: app?.route ?? '',
        workspaceId: win.workspaceId,
        bounds: { ...win.normalBounds },
        state: win.state
      };
    });
    const activeWindows: Record<string, number | null> = {};
    for (const workspace of this.state.workspaces) {
      const id = workspace.id === this.model.workspaceId ? this.model.activeId : this.model.activeWindows[workspace.id];
      const index = windows.findIndex(
        win => win.id === id && win.workspaceId === workspace.id && win.state !== 'minimized'
      );
      activeWindows[workspace.id] = index < 0 ? null : index;
    }
    const navigation = { workspaceId: this.model.workspaceId, activeWindows };
    await this.mutate(state => {
      state.session = session;
      state.navigation = navigation;
      state.grants = state.grants.filter(grant => grant.instanceId === null || this.instances.has(grant.instanceId));
    });
  }

  setPanel(panel: 'launcher' | 'overview' | 'notifications', value?: boolean): void {
    const key = ({ launcher: 'launcherOpen', overview: 'overviewOpen', notifications: 'notificationsOpen' } as const)[
      panel
    ];
    this[key] = value ?? !this[key];
    this.changed();
  }

  showDesktop(): void {
    this.model.showingDesktop = !this.model.showingDesktop;
    this.syncVisibility();
    this.changed();
  }
  clearMessage(): void {
    this.message = '';
    this.changed();
  }
  focusDesktop(): void {
    this.model.activeId = null;
    this.model.activeWindows[this.model.workspaceId] = null;
    this.launcherOpen = false;
    this.changed();
    void this.persistSession().catch(error => this.report(error));
  }
  selectWindow(id: string): void {
    activateWindow(this.model, id);
    this.changed();
    void this.persistSession().catch(error => this.report(error));
  }
  moveWindowTo(id: string, workspaceId: string): void {
    const win = this.model.windows.find(win => win.id === id);
    requireCondition(
      win && this.state.workspaces.some(workspace => workspace.id === workspaceId),
      'INVALID',
      '窗口或工作区不存在'
    );
    win.workspaceId = workspaceId;
    if (this.model.activeId === win.id && this.model.workspaceId !== workspaceId) focusRecent(this.model);
    this.syncVisibility();
    this.changed();
    void this.persistSession().catch(error => this.report(error));
  }

  shortcut(key: string): boolean {
    if (this.dialogs.current || !this.state.profile.guided) return false;
    const normalized = key.toLowerCase();
    if (normalized === 'k') {
      this.launcherOpen = !this.launcherOpen;
      this.changed();
      return true;
    }
    if (normalized === 'o') {
      this.overviewOpen = !this.overviewOpen;
      this.changed();
      return true;
    }
    const win = this.model.windows.find(win => win.id === this.model.activeId);
    if (!win) return false;
    const actions: Record<string, string> = {
      m: 'minimized',
      f: win.state === 'maximized' ? 'restore' : 'maximized',
      x: 'close'
    };
    if (actions[normalized]) {
      void this.windowAction(win.instanceId, actions[normalized]).catch(error => this.report(error));
      return true;
    }
    const directions: Record<string, [number, number]> = {
      arrowleft: [-24, 0],
      arrowright: [24, 0],
      arrowup: [0, -24],
      arrowdown: [0, 24]
    };
    const direction = directions[normalized];
    if (!direction) return false;
    win.bounds = constrainBounds(
      { ...win.bounds, x: win.bounds.x + direction[0], y: win.bounds.y + direction[1] },
      this.area()
    );
    win.normalBounds = { ...win.bounds };
    this.message = `窗口位置 ${win.bounds.x}, ${win.bounds.y}`;
    this.changed();
    void this.persistSession().catch(error => this.report(error));
    return true;
  }

  report(error: unknown): void {
    this.message = errorMessage(error);
    this.changed();
  }

  async retry(app: RunningApp): Promise<void> {
    const win = this.model.windows.find(item => item.instanceId === app.id);
    const saved =
      win ?
        {
          appId: app.definition.id,
          fileId: app.fileId,
          route: app.route,
          workspaceId: win.workspaceId,
          bounds: { ...win.normalBounds },
          state: win.state
        }
      : undefined;
    if (!(await this.closeInstances([app.id]))) return;
    this.launch(app.definition.id, true, app.fileId, saved);
  }

  syncVisibility(): void {
    for (const app of this.instances.values()) this.syncAppVisibility(app);
  }

  async activateUpdate(): Promise<void> {
    const waiting = this.registration?.waiting;
    if (!waiting || this.updatingShell) return;
    this.updatingShell = true;
    this.changed();
    try {
      if (this.instances.size && !(await this.closeInstances([...this.instances.keys()], { preserveSession: true })))
        return;
      await this.database?.flush();
      await activateWorker(waiting, navigator.serviceWorker, this.lifetime.signal);
      window.location.reload();
    } finally {
      this.updatingShell = false;
      this.changed();
    }
  }

  async checkForUpdate(): Promise<void> {
    requireCondition(this.registration, 'OFFLINE', '离线服务尚未就绪');
    await this.registration.update();
    this.updateAvailable = Boolean(this.registration.waiting);
    this.changed();
  }

  async prepareResources(): Promise<void> {
    if (this.preparingOffline) return;
    this.preparingOffline = true;
    this.changed();
    const controller = new AbortController();
    this.offlineRepair = controller;
    try {
      if (!this.registration?.active) await this.prepareOffline();
      requireCondition(!controller.signal.aborted, 'CANCELLED', '离线准备已取消');
      const worker = this.registration?.active;
      requireCondition(worker, 'OFFLINE', '离线服务尚未就绪，请联网重试');
      const result: unknown = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const cleanup = () => {
          clearTimeout(timer);
          channel.port1.close();
          controller.signal.removeEventListener('abort', cancel);
        };
        const cancel = () => {
          cleanup();
          reject(new Error('CANCELLED: 离线准备已取消'));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('TIMEOUT: 离线资源准备超时，请联网重试'));
        }, 120000);
        controller.signal.addEventListener('abort', cancel, { once: true });
        channel.port1.onmessage = event => {
          cleanup();
          resolve(event.data);
        };
        worker.postMessage({ type: 'prepare' }, [channel.port2]);
      });
      if (isRecord(result) && result['complete'] === true) {
        for (const installation of this.state.installations) await this.prepareApplication(installation.appId);
      }
      this.offlineReady = isRecord(result) && result['complete'] === true;
      requireCondition(
        this.offlineReady,
        'OFFLINE',
        isRecord(result) && typeof result['error'] === 'string' ? result['error'] : '资源未完整准备'
      );
    } finally {
      this.preparingOffline = false;
      this.offlineRepair = null;
      this.changed();
    }
  }

  async prepareApplication(
    appId: string,
    options: { priority?: ResourcePriority; signal?: AbortSignal; key?: string } = {}
  ): Promise<void> {
    if (import.meta.env.DEV) return;
    const expected = structuredClone(installationFor(this.state, appId));
    const key = expected.resourceVersion ?? this.resources.find(appId, expected.version).key;
    requireCondition(!options.key || options.key === key, 'CONFLICT', '预取版本已改变');
    const pin = { appId, version: expected.version, key };
    const release = this.resources.hold(pin);
    try {
      await this.resources.prepare(pin, options);
      requireCondition(!options.signal?.aborted && this.ownership.owned, 'CANCELLED', '资源准备已取消');
      if (expected.resourceVersion !== null) return;
      await this.bindResource(appId, expected.version, key);
    } finally {
      release();
    }
  }

  toggleResources(): void {
    this.resourcesOpen = !this.resourcesOpen;
    this.changed();
  }

  startPrefetch(): void {
    if (import.meta.env.DEV || this.phase !== 'ready' || !this.ownership.owned) return;
    const pinned = this.state.profile.pinned;
    const items = this.state.installations
      .map(item => ({
        id: item.appId,
        key: item.resourceVersion ?? this.resources.find(item.appId, item.version).key
      }))
      .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
    this.prefetch.start(items);
  }

  async suspendApplication(app: RunningApp): Promise<void> {
    requireCondition(
      this.instances.get(app.id) === app && this.ownership.owned,
      'OWNERSHIP',
      '实例已退出或桌面控制权已失效'
    );
    requireCondition(app.status === 'ready' || app.status === 'hidden', 'NOT_READY', '应用尚未就绪');
    await app.background.suspend();
    await this.persistSession();
  }

  async resumeApplication(app: RunningApp): Promise<void> {
    requireCondition(
      this.instances.get(app.id) === app && this.ownership.owned,
      'OWNERSHIP',
      '实例已退出或桌面控制权已失效'
    );
    await app.background.resume();
    this.syncVisibility();
    this.changed();
  }

  async suspendApplications(): Promise<void> {
    const pending: string[] = [];
    for (const app of this.instances.values()) {
      if (app.background.state === 'suspended') continue;
      try {
        await this.suspendApplication(app);
      } catch (error) {
        pending.push(`${app.title}：${errorMessage(error)}`);
      }
    }
    this.message = pending.length ? `以下应用需要处理：${pending.join('；')}` : '应用已按协议挂起，可逐个恢复。';
    this.changed();
  }

  resourceReferences(): ResourceReference[] {
    const references = [...this.resources.references()];
    for (const item of this.state.installations) {
      references.push({
        id: `installed:${item.appId}`,
        key: item.resourceVersion ?? this.resources.find(item.appId, item.version).key
      });
      if (item.previousResourceVersion)
        references.push({ id: `rollback:${item.appId}`, key: item.previousResourceVersion });
    }
    for (const app of this.instances.values())
      if (app.resourceVersion) references.push({ id: `instance:${app.id}`, key: app.resourceVersion });
    return references;
  }

  async cleanupResources(): Promise<void> {
    requireCondition(!import.meta.env.DEV, 'UNSUPPORTED', '请使用正式构建验证资源清理');
    requireCondition(this.ownership.owned && this.phase === 'ready', 'OWNERSHIP', '桌面当前不可写');
    requireCondition(!this.collectingResources && this.changingApplications.size === 0, 'BUSY', '请先完成当前资源操作');
    this.collectingResources = true;
    this.resourceMessage = '';
    this.changed();
    try {
      const removed = await this.resources.prune(this.resourceReferences());
      this.resourceMessage = `清理完成：回收 ${removed.length} 个无引用版本，安装、回退和活实例资源保留。`;
      this.refreshOffline();
    } finally {
      this.collectingResources = false;
      this.changed();
      this.collectIfRequested();
    }
  }

  applicationsChanged(appId: string): void {
    this.prefetch.cancel(appId);
    if (this.prefetch.enabled) this.startPrefetch();
    if (import.meta.env.DEV) return;
    this.cleanupRequested = true;
    this.collectIfRequested();
  }

  baseURL(): URL {
    return new URL(import.meta.env.BASE_URL, window.location.origin);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    clearInterval(this.clockTimer);
    window.removeEventListener('online', this.networkChanged);
    window.removeEventListener('offline', this.networkChanged);
    window.removeEventListener('beforeunload', this.beforeUnload);
    window.removeEventListener('resize', this.resized);
    window.removeEventListener('focus', this.offlineChanged);
    window.removeEventListener('pointerdown', this.resourceActivity);
    window.removeEventListener('keydown', this.resourceActivity);
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    this.offlineChannel?.port1.close();
    this.offlineRepair?.abort();
    this.dialogs.cancelAll();
    for (const id of this.instances.keys()) this.transfers.dispose(id);
    this.runtime.dispose();
    this.instances.clear();
    await this.database?.flush();
    this.database?.close();
    await this.ownership.dispose();
  }

  private readonly networkChanged = () => {
    this.offline = !navigator.onLine;
    this.refreshOffline();
    this.changed();
  };
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (![...this.instances.values()].some(app => app.dirty)) return;
    event.preventDefault();
    event.returnValue = '';
  };
  private readonly resized = () => {
    for (const win of this.model.windows) win.bounds = constrainBounds(win.bounds, this.area());
    this.changed();
  };

  private async promptPermission(
    app: RunningApp,
    capability: string,
    scope: string,
    signal?: AbortSignal
  ): Promise<void> {
    const identity = this.identity(app);
    requireCondition(
      identity.capabilities.some(value => value === capability),
      'DENIED',
      '应用未声明此能力'
    );
    if (checkPermission(this.state, identity, capability, scope)) return;
    const result = await this.dialogs.ask(
      {
        title: '桌面能力授权',
        message: `${app.definition.name}\n来源：${identity.origin}\n能力：${capability}\n范围：${scope === '*' ? '全部相关托管数据' : scope}\n授权只控制桌面服务；应用属于批准的可信代码。`,
        actions: [
          { id: 'once', label: '仅本次允许' },
          { id: 'always', label: '始终允许' },
          { id: 'cancel', label: '拒绝' }
        ]
      },
      signal
    );
    requireCondition(
      !signal?.aborted && this.instances.has(app.id) && ['once', 'always'].includes(result.action),
      'DENIED',
      '用户拒绝授权或调用已取消'
    );
    await this.mutate(state => grantPermission(state, identity, capability, scope, result.action === 'always'));
  }

  private syncAppVisibility(app: RunningApp): void {
    const win = this.model.windows.find(win => win.instanceId === app.id);
    const visible = Boolean(
      app.background.state === 'running' &&
      win &&
      win.state !== 'minimized' &&
      win.workspaceId === this.model.workspaceId &&
      !this.model.showingDesktop
    );
    if (visible && app.status === 'hidden') app.handle.show();
    if (!visible && app.status === 'ready') app.handle.hide();
  }

  private async loadDesktop(): Promise<void> {
    this.database?.close();
    this.database = await openDatabase(() => this.ownership.owned, this.model.mode);
    this.state = await this.database.read();
    this.state.grants = this.state.grants.filter(grant => grant.instanceId === null);
    await this.database.transact(state => {
      state.grants = state.grants.filter(grant => grant.instanceId === null);
    });
    await this.prepareOffline();
    await this.resources.load();
    this.model.mode = this.state.profile.mode;
    this.model.workspaceId = this.state.navigation.workspaceId;
    this.phase = 'ready';
    const saved = [...this.state.session];
    const navigation = structuredClone(this.state.navigation);
    const restored: (string | null)[] = [];
    this.restoring = true;
    try {
      for (const win of saved) {
        try {
          const app = this.launch(win.appId, true, win.fileId, win);
          restored.push(this.model.windows.find(item => item.instanceId === app.id)?.id ?? null);
        } catch (error) {
          restored.push(null);
          this.report(error);
        }
      }
    } finally {
      this.restoring = false;
    }
    this.model.workspaceId = navigation.workspaceId;
    this.model.activeWindows = Object.fromEntries(
      Object.entries(navigation.activeWindows).map(([workspace, index]) => [
        workspace,
        index === null ? null : restored[index]
      ])
    );
    this.model.activeId = this.model.activeWindows[this.model.workspaceId];
    this.syncVisibility();
    this.changed();
    this.refreshOffline();
    this.startPrefetch();
  }

  private collectIfRequested(): void {
    if (
      !this.cleanupRequested ||
      this.collectingResources ||
      this.changingApplications.size > 0 ||
      this.phase !== 'ready' ||
      !this.ownership.owned
    )
      return;
    this.cleanupRequested = false;
    void this.cleanupResources().catch(error => this.report(error));
  }

  private readonly resourceActivity = () => {
    this.prefetch.activity();
  };

  private async bindResource(appId: string, version: string, key: string): Promise<void> {
    if (installationFor(this.state, appId).resourceVersion === key) return;
    await this.mutate(state => {
      const current = installationFor(state, appId);
      requireCondition(
        current.version === version && (current.resourceVersion === null || current.resourceVersion === key),
        'CONFLICT',
        '应用版本已改变'
      );
      current.resourceVersion = key;
    });
  }

  private applyProfile(): void {
    const previous = this.model.mode;
    switchMode(this.model, this.state.profile.mode, this.area());
    if (previous === 'macos' && this.model.mode === 'windows') {
      for (const app of this.instances.values())
        if (!this.model.windows.some(win => win.instanceId === app.id))
          openWindow(this.model, app.id, app.definition.id, this.area());
    }
    for (const app of this.instances.values()) {
      if (app.status === 'failed' || app.status === 'destroyed') continue;
      app.handle.setProps({ fileId: app.fileId, route: app.route, profile: this.profileValue() });
      if (app.status === 'ready' || app.status === 'hidden') app.handle.emit('desktop.changed', this.profileValue());
    }
    this.syncVisibility();
  }

  private profileValue(): OrbitObject {
    return { ...this.state.profile };
  }

  private destroy(app: RunningApp): void {
    app.resourceLifetime.abort();
    this.transfers.dispose(app.id);
    app.handle.destroy();
    this.instances.delete(app.id);
    this.state.grants = this.state.grants.filter(grant => grant.instanceId !== app.id);
    const win = this.model.windows.find(win => win.instanceId === app.id);
    if (win) removeWindow(this.model, win.id);
  }

  private async closeParticipant(app: RunningApp, destroy: boolean): Promise<CloseParticipant> {
    let responsive = app.status === 'ready' || app.status === 'hidden';
    if (app.status === 'ready' || app.status === 'hidden') {
      try {
        const status = await app.handle.request('document.prepareClose');
        if (status && typeof status === 'object' && !Array.isArray(status) && typeof status['dirty'] === 'boolean')
          app.dirty = status['dirty'];
      } catch (error) {
        this.report(error);
        app.dirty = true;
        responsive = false;
      }
    }
    return {
      id: app.id,
      dirty: app.dirty,
      save: async () => {
        try {
          const result = await app.handle.request('document.save');
          return result === true;
        } catch (error) {
          this.report(error);
          return false;
        }
      },
      discard: async () => {
        if (responsive) await app.handle.request('document.discard');
      },
      destroy: () => {
        if (destroy || !responsive) this.destroy(app);
        else {
          const win = this.model.windows.find(win => win.instanceId === app.id);
          if (win) removeWindow(this.model, win.id);
          app.handle.hide();
        }
      }
    };
  }

  private async prepareTakeover(): Promise<boolean> {
    if (!(await this.closeInstances([...this.instances.keys()], { preserveSession: true }))) return false;
    await this.database?.flush();
    this.database?.close();
    this.database = null;
    this.prefetch.stop();
    this.phase = 'spectator';
    return true;
  }

  private async prepareOffline(): Promise<void> {
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
    this.registration = await navigator.serviceWorker.register(new URL('sw.js', this.baseURL()), {
      scope: this.baseURL().pathname
    });
    this.updateAvailable = Boolean(this.registration.waiting);
    const observeInstallation = () => {
      this.registration?.installing?.addEventListener(
        'statechange',
        () => {
          this.updateAvailable = Boolean(this.registration?.waiting);
          this.changed();
        },
        { signal: this.lifetime.signal }
      );
    };
    this.registration.addEventListener('updatefound', observeInstallation, { signal: this.lifetime.signal });
    observeInstallation();
    if (!this.registration.active && this.registration.installing)
      await waitForActivation(this.registration.installing, this.lifetime.signal);
    requireCondition(!this.lifetime.signal.aborted && this.registration.active, 'OFFLINE', '离线服务未能激活');
    this.refreshOffline();
  }

  private offlineChanged = (): void => {
    this.refreshOffline();
  };

  private refreshOffline(): void {
    this.offlineChannel?.port1.close();
    if (this.offlineTimer) clearTimeout(this.offlineTimer);
    const worker = this.registration?.active;
    if (!worker) return;
    const channel = new MessageChannel();
    this.offlineChannel = channel;
    this.offlineTimer = setTimeout(() => {
      this.offlineReady = false;
      channel.port1.close();
      this.offlineChannel = null;
      this.changed();
    }, 5000);
    channel.port1.onmessage = event => {
      if (this.offlineTimer) clearTimeout(this.offlineTimer);
      this.offlineReady =
        this.state.installations.every(item => item.resourceVersion !== null) &&
        isRecord(event.data) &&
        event.data['complete'] === true;
      channel.port1.close();
      this.offlineChannel = null;
      this.changed();
    };
    const releases = this.state.installations
      .filter(item => item.resourceVersion !== null)
      .map(item => ({ appId: item.appId, version: item.version, key: item.resourceVersion }));
    worker.postMessage({ type: 'status', releases }, [channel.port2]);
  }
}
