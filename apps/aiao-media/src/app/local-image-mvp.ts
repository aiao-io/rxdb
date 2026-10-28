import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  ViewEncapsulation
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, EMPTY, merge, Subscription } from 'rxjs';
import { imageExtension, type ImageMimeType } from '../contracts/image-format';
import type { GenerationJobSummary, ImageAspectRatio } from '../contracts/index';
import {
  productRecordId,
  validateProviderPolicy,
  validatePublishedTemplate,
  validateSyncPayload,
  type ProviderPolicy,
  type PublicWorkPayload
} from '../contracts/product-data.mjs';
import type { LocalMediaStore, LocalWorkSummary, StudioPromptState } from '../local-data/index';
import { libraryWhere, type LocalWorkFilters } from '../local-data/library-query';
import { applyProductProjection, collectProductSnapshot } from '../local-data/product-projection';
import type { ProductRecord } from '../local-data/product-sync-store';
import {
  WorkspaceRegistry,
  type WorkspaceProfile,
  type WorkspaceRegistryState
} from '../local-data/workspace-registry';
import type { WorkspaceRegistryStore } from '../local-data/workspace-registry-store';
import { AdminConsole } from './admin-console';
import { DEFAULT_FREE_PROVIDER, DEFAULT_FREE_PROVIDER_ID, defaultFreeProvider } from './default-provider';
import { imageMvpCatalog } from './image-mvp-catalog';
import {
  generateLocalImage,
  providerBase,
  ProviderFailure,
  publicProvider,
  type LocalProvider
} from './local-provider';
import { ProductClient } from './product-client';
import { ProductWorkspaceController, type ProductWorkspaceState } from './product-workspace';
import { templateState, type PromptTemplate } from './prompts/prompt-catalog';
import { PromptInput } from './prompts/prompt-input';
import { plainPrompt, serializePrompt, type PromptState } from './prompts/prompt-state';
import { StudioDraftSession, type StudioDraftStatus } from './prompts/studio-draft-session';
import {
  readSupabaseAuthConfig,
  SupabaseAuthClient,
  type SupabaseAuthMode,
  type SupabaseAuthState,
  type SupabaseAuthUser
} from './supabase-auth';
import { WorkLibrarySession, type LibraryState, type LibraryWork } from './work-library-session';
import { WorkMetadataSession } from './work-metadata-session';
import { WorkVisibleDirective } from './work-visible.directive';
import { WorkspaceSession } from './workspace-session';

type View = 'discover' | 'studio' | 'library' | 'providers' | 'admin';
type Work = LibraryWork;
type LocalTask = GenerationJobSummary & {
  channel?: 'direct' | 'proxy';
  saved?: boolean;
  acknowledged?: boolean;
};
const paths: Record<View, string> = {
  discover: '/',
  studio: '/create',
  library: '/images',
  providers: '/providers',
  admin: '/admin'
};
const routeView = (path: string): View =>
  path === '/create' ? 'studio'
  : path === '/images' ? 'library'
  : path === '/providers' ? 'providers'
  : path === '/admin' ? 'admin'
  : 'discover';
const emptyLibrary = (): LibraryState => ({
  works: [],
  total: null,
  page: 1,
  pageSize: 24,
  loading: false,
  error: null
});
@Component({
  selector: 'app-root',
  imports: [FormsModule, PromptInput, AdminConsole, WorkVisibleDirective],
  templateUrl: './local-image-mvp.html',
  host: { class: 'image-mvp' },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocalImageMvp implements OnInit, OnDestroy {
  private store: LocalMediaStore | null = null;
  private registryStore?: WorkspaceRegistryStore;
  private registry?: WorkspaceRegistry;
  private workspaceSession?: WorkspaceSession<LocalMediaStore>;
  private product?: ProductWorkspaceController;
  private registryState?: WorkspaceRegistryState;
  private rootId = '';
  private transitionCount = 0;
  private attachment = Promise.resolve();
  private workspaceSubscriptions = new Subscription();
  private templateVersions = new Map<string, number>();
  private identityVersion = 0;
  private identitySelection: string | null = null;

  private studio: StudioDraftSession | null = null;
  private readonly lifetime = new AbortController();
  private auth: SupabaseAuthClient | null = null;
  private unsubscribeAuth?: () => void;
  private readonly keys = new Map<string, string>();
  private readonly rememberedKeys = new Map<string, string>();
  private settingsRevision: number | null = null;
  private profileId = '';
  private epoch = 0;
  private disposed = false;
  private dirtyInput = false;
  private readonly subscriptions = new Subscription();
  private library?: WorkLibrarySession;
  private workMetadata?: WorkMetadataSession;
  private libraryFilters: LocalWorkFilters = {};
  private readonly localWorkIds = computed(() => new Set(this.works().map(work => work.jobId)));
  private toastTimer?: ReturnType<typeof setTimeout>;
  private dialogTrigger: HTMLElement | null = null;
  private resultBlob: Blob | null = null;
  readonly resultMimeType = signal<ImageMimeType | null>(null);
  readonly imageExtension = imageExtension;
  readonly workspaceSwitching = signal(false);
  readonly identityBlocked = signal(false);
  readonly sync = signal<ProductWorkspaceState>({
    status: 'local',
    busy: false,
    message: '',
    confirmation: null,
    conflicts: [],
    draftDeleted: false,
    pending: 0
  });
  readonly syncedWorks = signal<PublicWorkPayload[]>([]);
  readonly remoteOnlyWorks = computed(() =>
    this.localWorksKnown() ? this.syncedWorks().filter(work => !this.localWorkIds().has(work.jobId)) : []
  );
  readonly availableProfiles = signal<WorkspaceProfile[]>([]);
  readonly currentProfileId = signal('');
  readonly syncInitialized = signal(false);
  readonly syncReady = signal(false);
  readonly syncLabel = computed(
    () =>
      ({
        local: '仅在本机',
        pending: '有待同步改动',
        syncing: '正在同步…',
        synced: '同步已确认',
        paused: '同步已暂停',
        conflict: '存在待处理冲突',
        failed: '同步未完成'
      })[this.sync().status]
  );
  readonly adminApi = new ProductClient(() => {
    if (!this.auth) throw new Error('账号服务不可用。');
    return this.auth.authorizeProduct();
  });
  readonly view = signal<View>('discover');
  readonly templates = signal(imageMvpCatalog);
  readonly selectedVersion = signal(1);
  readonly catalogMessage = signal('');
  readonly providerPolicyVersion = signal<number | null>(null);
  readonly providerPolicy = signal<ProviderPolicy | null>(null);
  readonly categories = ['全部灵感', '产品海报', '人像头像', '插画绘本', '创意设计'];
  readonly category = signal('全部灵感');
  readonly search = signal('');
  readonly filtered = computed(() => {
    const words = this.search().trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.templates().filter(
      t =>
        (this.category() === '全部灵感' || t.purpose === this.category()) &&
        words.every(w => `${t.title} ${t.prompt} ${t.tags.join(' ')}`.toLocaleLowerCase().includes(w))
    );
  });
  readonly detail = signal<PromptTemplate | null>(null);
  readonly failedTemplateImages = signal(new Set<string>());
  readonly selected = signal<PromptTemplate | null>(null);
  readonly promptState = signal<PromptState>(plainPrompt(''));
  readonly serialized = computed(() => serializePrompt(this.promptState()));
  readonly ratio = signal<ImageAspectRatio>('square');
  readonly ratios: { id: ImageAspectRatio; label: string; shape: string }[] = [
    { id: 'square', label: '正方形', shape: 'shape' },
    { id: 'landscape', label: '横向', shape: 'shape wide' },
    { id: 'portrait', label: '纵向', shape: 'shape tall' }
  ];
  readonly editorReady = signal(false);

  readonly providers = signal<LocalProvider[]>([]);
  readonly providerId = signal('');
  readonly provider = computed(() => this.providers().find(p => p.id === this.providerId()) ?? null);
  readonly providerName = signal('');
  readonly baseUrl = signal('');
  readonly model = signal('');
  readonly apiKey = signal('');
  readonly mode = signal<'direct' | 'proxy'>('direct');
  readonly rememberKey = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly providerBusy = signal(false);
  readonly dataBusy = signal(false);
  readonly dataMessage = signal('');
  readonly storageInfo = signal('');
  readonly offlineReady = signal(false);
  readonly providerMessage = signal('');
  readonly localStatus = signal<'opening' | 'ready' | 'unavailable'>('opening');
  readonly draftStatus = signal<StudioDraftStatus | 'inactive'>('inactive');
  readonly storageMessage = signal('');
  readonly works = signal<LocalWorkSummary[]>([]);
  readonly localWorksKnown = signal(false);
  readonly localWorksError = signal('');
  readonly libraryPage = signal<LibraryState>(emptyLibrary());
  readonly librarySearch = signal('');
  readonly libraryModel = signal('');
  readonly libraryFrom = signal('');
  readonly libraryTo = signal('');
  readonly libraryFilterError = signal('');
  readonly libraryPages = computed(() => Math.max(1, Math.ceil((this.libraryPage().total ?? 0) / 24)));
  readonly history = signal<LocalTask[]>([]);
  readonly job = signal<LocalTask | null>(null);
  readonly resultUrl = signal<string | null>(null);
  readonly saved = signal(false);
  readonly sending = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly feedbackOpen = signal(false);
  readonly authConfigured = signal(false);
  readonly authStatus = signal<SupabaseAuthState['status']>('signed-out');
  readonly authConfigError = signal('');
  readonly authOpen = signal(false);
  readonly authBusy = signal(false);
  readonly authMessage = signal('');
  readonly authEmail = signal('');
  readonly authPassword = signal('');
  readonly authMode = signal<SupabaseAuthMode>('sign-in');
  readonly authUser = signal<SupabaseAuthUser | null>(null);
  readonly inFlight = computed(
    () =>
      this.sending() ||
      this.uncertain() ||
      this.dataBusy() ||
      this.sync().busy ||
      this.workspaceSwitching() ||
      this.identityBlocked()
  );
  readonly settingsBusy = computed(
    () => this.sending() || this.dataBusy() || this.sync().busy || this.workspaceSwitching() || this.identityBlocked()
  );
  readonly canGenerate = computed(
    () =>
      this.localStatus() === 'ready' &&
      this.editorReady() &&
      this.serialized().valid &&
      this.serialized().text.length <= 2000 &&
      Boolean(this.provider()) &&
      !this.inFlight()
  );
  readonly draftMessage = computed(
    () =>
      ({
        inactive: '本机保存不可用',
        loading: '正在恢复本机草稿…',
        ready: '输入会自动保存到本机',
        dirty: '正在保存输入…',
        saving: '正在保存输入…',
        saved: '输入已保存到本机',
        failed: '草稿保存失败，当前输入仍保留',
        conflict: '另一标签页已修改草稿，请选择保留或载入',
        closed: '本机数据已关闭'
      })[this.draftStatus()]
  );

  constructor() {
    afterRenderEffect(() => {
      if (!this.detail() && !this.feedbackOpen() && !this.authOpen()) {
        const trigger = this.dialogTrigger;
        this.dialogTrigger = null;
        if (trigger?.isConnected) trigger.focus();
        return;
      }
      const panel = document.querySelector<HTMLDialogElement>('dialog.modal-panel');
      if (panel && !panel.open) {
        this.dialogTrigger ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.showModal();
      }
    });
  }
  ngOnInit() {
    this.view.set(routeView(location.pathname));
    try {
      const config = readSupabaseAuthConfig();
      if (config) {
        this.auth = new SupabaseAuthClient(config);
        this.authConfigured.set(true);
        void this.loadCatalog();
        this.unsubscribeAuth = this.auth.subscribe(state => {
          this.syncReady.set(false);
          this.authUser.set(state.user);
          this.authStatus.set(state.status);
          this.authMessage.set(state.message);
          this.product?.pause();
          this.identitySelection = null;
          this.refreshProfiles();
          void this.reconcileIdentity();
        });
        void this.restoreAuth();
      }
    } catch {
      this.authConfigError.set('账号服务配置无效，请联系部署方。本机创作仍可继续。');
    }
    void this.openLocal();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/offline-worker.js', {
          scope: '/',
          updateViaCache: 'none'
        })
        .then(registration => registration.update().then(() => registration))
        .then(() => navigator.serviceWorker.ready)
        .then(() => this.offlineReady.set(true))
        .catch(() => undefined);
    }
    void navigator.storage
      ?.estimate()
      .then(info =>
        this.storageInfo.set(
          `本机已用 ${Math.ceil((info.usage ?? 0) / 1024 / 1024)} MiB / 约 ${Math.floor((info.quota ?? 0) / 1024 / 1024)} MiB 可用配额`
        )
      );
  }
  ngOnDestroy() {
    this.disposed = true;
    ++this.epoch;
    this.lifetime.abort();
    this.unsubscribeAuth?.();
    this.auth?.dispose();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.workspaceSession?.close();
    this.product?.close();
    this.studio?.close();
    this.workspaceSubscriptions.unsubscribe();
    this.subscriptions.unsubscribe();
    void this.registryStore?.close();
    this.library?.close();
    this.revokeResult();
    void this.store?.close();
    this.keys.clear();
    this.rememberedKeys.clear();
  }
  @HostListener('window:popstate') onPopState() {
    const next = routeView(location.pathname);
    if (next !== this.view()) this.releaseLibraryPreviews();
    this.view.set(next);
  }
  @HostListener('document:keydown.escape') onEscape() {
    this.detail.set(null);
    this.feedbackOpen.set(false);
    this.closeAuth();
  }
  @HostListener('document:visibilitychange') onVisibility() {
    if (document.visibilityState === 'hidden') void this.studio?.flush();
  }
  navigate(view: View, event?: Event) {
    event?.preventDefault();
    if (view !== this.view()) this.releaseLibraryPreviews();
    if (this.view() !== view) history.pushState(null, '', paths[view]);
    this.view.set(view);
    this.detail.set(null);
    window.scrollTo({ top: 0 });
  }
  openTemplate(template: PromptTemplate, event: Event) {
    this.dialogTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.detail.set(template);
  }
  async restoreAuth() {
    await this.auth?.restore();
  }
  openAuth(event?: Event) {
    if (!this.auth) return;
    event?.preventDefault();
    this.detail.set(null);
    this.feedbackOpen.set(false);
    this.dialogTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.authOpen.set(true);
  }
  closeAuth() {
    this.authOpen.set(false);
    this.authPassword.set('');
  }
  toggleAuthMode() {
    if (this.authBusy()) return;
    this.authMode.update(mode => (mode === 'sign-in' ? 'sign-up' : 'sign-in'));
    this.authPassword.set('');
    this.authMessage.set('');
  }
  async submitAuth() {
    if (!this.auth || this.authBusy()) return;
    this.authBusy.set(true);
    this.authMessage.set('');
    const email = this.authEmail().trim();
    const password = this.authPassword();
    // Remove the password from component state before waiting on the network.
    this.authPassword.set('');
    try {
      if (this.authMode() === 'sign-in') await this.auth.signIn(email, password);
      else await this.auth.signUp(email, password);
      if (!this.disposed && this.authUser()) this.notify('账号已登录');
    } catch (error) {
      if (!this.disposed) this.authMessage.set(error instanceof Error ? error.message : '账号操作失败，请稍后重试。');
    } finally {
      this.authBusy.set(false);
    }
  }
  async signOut() {
    if (!this.auth || this.authBusy()) return;
    this.authBusy.set(true);
    this.authPassword.set('');
    try {
      await this.auth.signOut();
      if (!this.disposed) {
        this.authMessage.set('已退出账号。本机数据保留在当前浏览器。');
        this.notify('已退出账号');
      }
    } catch {
      if (!this.disposed) this.authMessage.set('本机会话已清除，远程退出未确认。请联网后在账号服务检查会话。');
    } finally {
      this.authBusy.set(false);
    }
  }
  @HostListener('window:online')
  @HostListener('window:focus')
  recheckAuth() {
    if (this.authStatus() === 'unverified') void this.restoreAuth();
  }
  editProvider(p?: LocalProvider) {
    this.editingId.set(p?.id ?? null);
    this.providerName.set(p?.name ?? '');
    this.baseUrl.set(p?.baseUrl ?? '');
    this.model.set(p?.model ?? '');
    this.mode.set(p?.mode ?? 'direct');
    this.rememberKey.set(p?.rememberKey ?? false);
    this.apiKey.set(p ? (this.keys.get(p.id) ?? this.rememberedKeys.get(p.id) ?? '') : '');
    this.providerMessage.set('');
  }
  async saveProvider() {
    if (this.providerBusy() || this.settingsBusy()) return;
    this.providerBusy.set(true);
    this.providerMessage.set('');
    try {
      const name = this.providerName().trim(),
        model = this.model().trim(),
        key = this.apiKey().trim();
      if (
        !name ||
        name.length > 80 ||
        !model ||
        !/^[a-zA-Z0-9._:-]{1,128}$/.test(model) ||
        Array.from(model).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
        (key !== '' && !/^[\x21-\x7e]{1,4096}$/.test(key))
      )
        throw new Error('请填写有效的名称、模型和 API Key（可留空）。');
      if (!this.editingId() && this.providers().length >= 30) throw new Error('最多保存 30 个供应商。');
      const p: LocalProvider = {
        id: this.editingId() ?? crypto.randomUUID(),
        name,
        model,
        baseUrl: providerBase(this.baseUrl()),
        mode: this.mode(),
        rememberKey: this.rememberKey() && Boolean(key)
      };
      const seededDefaultOnly =
        !this.editingId() && this.providers().length === 1 && this.providers()[0].id === DEFAULT_FREE_PROVIDER_ID;
      const providers = [
        ...this.providers().filter(x => x.id !== p.id && !(seededDefaultOnly && x.id === DEFAULT_FREE_PROVIDER_ID)),
        p
      ];
      const defaultId = !this.providerId() || seededDefaultOnly ? p.id : this.providerId();
      await this.persistProviders(providers, defaultId, { id: p.id, key: p.rememberKey ? key : null });
      if (key && !p.rememberKey) this.keys.set(p.id, key);
      else this.keys.delete(p.id);
      this.apiKey.set('');
      this.editingId.set(null);
      this.providerMessage.set('供应商已保存到本机。');
      this.notify('供应商已保存');
    } catch (e) {
      this.providerMessage.set(e instanceof Error ? e.message : '保存失败。');
    } finally {
      this.providerBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async chooseProvider(id: string) {
    if (this.settingsBusy() || this.providerBusy()) return;
    this.providerBusy.set(true);
    try {
      await this.persistProviders(this.providers(), id);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '设置失败。');
    } finally {
      this.providerBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async removeProvider(p: LocalProvider) {
    if (this.settingsBusy() || this.providerBusy() || !window.confirm('删除此供应商和本机保存的 Key？已有作品会保留。'))
      return;
    this.providerBusy.set(true);
    try {
      const next = this.providers().filter(x => x.id !== p.id);
      await this.persistProviders(next, this.providerId() === p.id ? (next[0]?.id ?? '') : this.providerId(), {
        id: p.id,
        key: null
      });
      this.keys.delete(p.id);
      if (this.editingId() === p.id) this.editProvider();
    } catch (e) {
      this.providerMessage.set(e instanceof Error ? e.message : '删除失败。');
    } finally {
      this.providerBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async removeKey(p: LocalProvider) {
    if (this.settingsBusy() || this.providerBusy()) return;
    this.providerBusy.set(true);
    try {
      await this.persistProviders(
        this.providers().map(item => (item.id === p.id ? { ...item, rememberKey: false } : item)),
        this.providerId(),
        { id: p.id, key: null }
      );
      this.keys.delete(p.id);
      if (this.editingId() === p.id) {
        this.apiKey.set('');
        this.rememberKey.set(false);
      }
      this.notify('已移除 Key，供应商配置已保留。');
    } catch {
      this.providerMessage.set('移除 Key 未完成，请刷新后重试。');
    } finally {
      this.providerBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async generate() {
    if (!this.canGenerate()) return;
    const provider = this.provider();
    if (!provider) return;
    const key = this.keys.get(provider.id) ?? this.rememberedKeys.get(provider.id) ?? '';
    if (!key) {
      this.editProvider(provider);
      this.navigate('providers');
      this.providerMessage.set('请输入当前会话的 API Key。');
      return;
    }
    this.sending.set(true);
    this.error.set('');
    try {
      await this.checkProviderPolicy(provider);
      await navigator.locks.request(`aiao-local-generation-${this.profileId}`, { ifAvailable: true }, async lock => {
        if (!lock) {
          this.error.set('另一标签页正在生成，请等待并核对结果。');
          return;
        }
        await this.readTasks();
        if (this.uncertain()) return;
        await this.studio?.flush();
        const now = new Date().toISOString();
        let task: LocalTask = {
          id: crypto.randomUUID(),
          channel: provider.mode,
          request: {
            kind: 'image',
            operation: 'text-to-image',
            providerInstanceId: provider.id,
            providerRevision: 1,
            modelId: provider.model,
            prompt: this.serialized().text,
            aspectRatio: this.ratio()
          },
          status: 'processing',
          createdAt: now,
          updatedAt: now,
          delivery: {
            status: 'pending',
            expiresAt: null,
            acknowledgedAt: null
          },
          failure: null
        };
        await this.writeTask(task);
        this.job.set(task);
        this.revokeResult();
        this.saved.set(false);
        const controller = new AbortController();
        const abort = () => controller.abort();
        this.lifetime.signal.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, 180000);
        try {
          const blob = await generateLocalImage(provider, key, task.request.prompt, this.ratio(), controller.signal);
          if (this.disposed) return;
          task = {
            ...task,
            status: 'completed',
            updatedAt: new Date().toISOString(),
            delivery: {
              status: 'available',
              expiresAt: null,
              acknowledgedAt: null
            }
          };
          this.job.set(task);
          this.resultBlob = blob;
          this.resultMimeType.set(blob.type as ImageMimeType);
          this.resultUrl.set(URL.createObjectURL(blob));
          await this.writeTask(task);
          await this.saveResult();
        } catch (e) {
          if (this.disposed) return;
          // A local save/journal failure after receiving a result never causes redispatch.
          if (this.resultBlob) {
            this.storageMessage.set('图片已收到，但本机保存未完成。请先下载，再重试保存。');
            return;
          }
          const rejected = e instanceof ProviderFailure && e.rejected;
          task = {
            ...task,
            status: rejected ? 'failed' : 'needs_review',
            updatedAt: new Date().toISOString()
          };
          this.job.set(task);
          this.uncertain.set(!rejected);
          try {
            await this.writeTask(task);
          } catch {
            this.storageMessage.set('任务记录更新失败；请保留当前页面并核对供应商记录。');
          }
          this.error.set(
            e instanceof ProviderFailure ?
              e.message
            : '连接中断、CORS 限制或响应无效。请到供应商后台核对，系统不会自动重发。'
          );
        } finally {
          clearTimeout(timer);
          this.lifetime.signal.removeEventListener('abort', abort);
        }
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '本机提交记录写入失败，没有重复发送。');
    } finally {
      this.sending.set(false);
      void this.reconcileIdentity();
    }
  }
  async acknowledgeUnknown() {
    const current = this.job();
    if (
      this.sending() ||
      !current ||
      !window.confirm('请先核对供应商用量与结果。继续会解除本机锁定，下一次生成是新的请求，可能再次计费。')
    )
      return;
    try {
      const task = { ...current, acknowledged: true };
      await this.writeTask(task);
      this.uncertain.set(false);
      this.job.set(null);
      this.error.set('');
    } catch {
      this.error.set('无法保存核对记录，请重试。');
    }
  }
  async saveResult() {
    const job = this.job(),
      blob = this.resultBlob,
      store = this.store;
    if (!job || !blob || !store) return;
    const epoch = this.epoch;
    const current = () =>
      !this.disposed &&
      epoch === this.epoch &&
      store === this.store &&
      blob === this.resultBlob &&
      job.id === this.job()?.id;
    try {
      await store.saveResult(job, blob);
      if (!current()) return;
      const task = { ...job, saved: true };
      await this.writeTask(task);
      if (!current()) return;
      this.job.set(task);
      this.saved.set(true);
      this.storageMessage.set('');
    } catch {
      if (current()) this.storageMessage.set('图片已生成，本机保存失败。请先下载，再释放空间并重试保存。');
    }
  }
  onPromptChanged(state: PromptState) {
    this.dirtyInput = true;
    this.promptState.set(state);
    this.studio?.edit(this.draftState());
    this.product?.captureSoon();
  }
  setRatio(ratio: ImageAspectRatio) {
    if (this.inFlight()) return;
    this.ratio.set(ratio);
    this.dirtyInput = true;
    this.studio?.edit(this.draftState());
    this.product?.captureSoon();
  }
  async reloadDraft() {
    await this.studio?.reload();
    await this.reconcileIdentity();
  }
  async overwriteDraft() {
    await this.studio?.keepCurrent();
    await this.reconcileIdentity();
  }
  applyTemplate(template: PromptTemplate) {
    if (this.inFlight()) {
      this.notify('请先等待当前图片任务完成。');
      return;
    }
    if (
      this.dirtyInput &&
      this.serialized().text.trim() &&
      !window.confirm('使用此模板替换当前输入？当前输入会被新的模板覆盖。')
    )
      return;
    this.selected.set(template);
    this.selectedVersion.set(this.templateVersions.get(template.id) ?? 1);
    this.onPromptChanged(templateState(template));
    this.navigate('studio');
  }
  templateImageFailed(id: string) {
    this.failedTemplateImages.update(ids => new Set([...ids, id]));
  }
  newImage() {
    if (this.inFlight()) {
      this.navigate('studio');
      return;
    }
    if (this.serialized().text.trim() && !window.confirm('开始新的创作并清空当前输入？')) return;
    this.job.set(null);
    this.revokeResult();
    this.saved.set(false);
    this.error.set('');
    this.selected.set(null);
    this.onPromptChanged(plainPrompt(''));
    this.navigate('studio');
  }
  async deleteWork(work: Work) {
    if (!this.store || !window.confirm('删除这张本机图片及其记录？下载过的文件不受影响。')) return;
    const epoch = this.epoch,
      store = this.store;
    try {
      await store.delete(work.jobId);
      if (epoch !== this.epoch) return;
      if (this.resultUrl() && !this.resultBlob) this.revokeResult();
      if (this.job()?.id === work.jobId) {
        this.revokeResult();
        this.job.set(null);
        this.saved.set(false);
      }
      this.notify('已删除本机图片。');
    } catch {
      if (epoch === this.epoch) this.storageMessage.set('删除未完成，请刷新后重试。');
    }
  }
  hasLocalCopy(task: LocalTask) {
    return this.works().some(work => work.jobId === task.id && work.status === 'saved');
  }
  async loadWorkInfo(work: Work, event: Event) {
    if (!(event.target as HTMLDetailsElement).open || work.info || !this.store) return;
    const epoch = this.epoch;
    try {
      const info = await this.store.imageInfo(work.jobId);
      if (epoch === this.epoch)
        this.libraryPage.update(page => ({
          ...page,
          works: page.works.map(current => (this.sameWorkFile(current, work) ? { ...current, info } : current))
        }));
    } catch {
      if (epoch === this.epoch && this.libraryPage().works.some(current => this.sameWorkFile(current, work)))
        this.notify('本机无可读取的原图，无法核验文件信息。');
    }
  }
  reuseWork(work: Work) {
    if (this.inFlight()) {
      this.navigate('studio');
      return;
    }
    if (this.serialized().text.trim() && !window.confirm('用这张图片的提示词替换当前输入？')) return;
    this.selected.set(null);
    this.onPromptChanged(plainPrompt(work.prompt));
    this.navigate('studio');
  }
  filterLibrary(event: Event) {
    event.preventDefault();
    const filters = {
      search: this.librarySearch(),
      model: this.libraryModel(),
      from: this.libraryFrom(),
      to: this.libraryTo()
    };
    try {
      libraryWhere(filters);
      this.libraryFilterError.set('');
      this.libraryFilters = filters;
      this.library?.query(filters);
    } catch (error) {
      this.libraryFilterError.set(error instanceof Error ? error.message : '作品筛选条件无效。');
    }
  }
  clearLibraryFilters() {
    this.librarySearch.set('');
    this.libraryModel.set('');
    this.libraryFrom.set('');
    this.libraryTo.set('');
    this.libraryFilterError.set('');
    this.libraryFilters = {};
    this.library?.query({});
  }
  libraryGo(page: number) {
    if (this.libraryPage().loading || page < 1 || page > this.libraryPages()) return;
    this.library?.query({ ...this.libraryFilters, offset: (page - 1) * 24 });
  }
  retryLibrary() {
    this.library?.query({ ...this.libraryFilters, offset: (this.libraryPage().page - 1) * 24 });
    this.workMetadata?.start();
  }
  libraryVisibility(work: Work, visible: boolean) {
    if (this.view() !== 'library' || !this.libraryPage().works.some(item => item.viewKey === work.viewKey)) return;
    this.library?.setVisible(work.jobId, visible);
  }
  retryWork(work: Work) {
    this.library?.retry(work.jobId);
  }
  async exportBackup() {
    if (!this.store || this.inFlight() || this.dataBusy()) return;
    this.dataBusy.set(true);
    this.dataMessage.set('正在校验图片并导出…');
    try {
      await navigator.locks.request(`aiao-local-generation-${this.profileId}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一标签页正在生成，请稍后备份。');
        await this.studio?.flush();
        await this.readTasks();
        const { createLocalBackup } = await import('./local-backup');
        if (!this.store) throw new Error('本机工作区不可用。');
        const blob = await createLocalBackup(this.store, this.providers(), this.providerId(), this.history());
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `aiao-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.dataMessage.set('备份已导出，包含原图、草稿、配置和任务记录，不含 API Key。');
      });
    } catch (e) {
      this.dataMessage.set(e instanceof Error ? e.message : '导出失败，原数据未更改。');
    } finally {
      this.dataBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async importBackup(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.inFlight() || this.dataBusy()) return;
    this.dataBusy.set(true);
    this.dataMessage.set('正在校验备份，原工作区会保留…');
    try {
      const { readLocalBackup } = await import('./local-backup');
      const { backup, files, digest } = await readLocalBackup(file);
      await navigator.locks.request(`aiao-local-generation-${this.profileId}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一标签页正在生成，请稍后导入。');
        await navigator.locks.request('aiao-local-profile-v1', async () => {
          if (localStorage.getItem('aiao-local-profile-v1') !== this.profileId)
            throw new Error('工作区已变化，请刷新后重试。');
          await this.studio?.flush();
          const { LocalMediaStore } = await import('../local-data/index');
          const stagingKey = 'aiao-local-import-staging-v1';
          const previous = JSON.parse(localStorage.getItem(stagingKey) || 'null') as {
            digest: string;
            id: string;
          } | null;
          const nextId =
            (
              previous?.digest === digest &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previous.id) &&
              previous.id !== this.profileId &&
              previous.id !== localStorage.getItem('aiao-local-previous-profile-v1')
            ) ?
              previous.id
            : crypto.randomUUID();
          localStorage.setItem(stagingKey, JSON.stringify({ digest, id: nextId }));
          const next = await LocalMediaStore.open(nextId);
          try {
            // Retry resumes this isolated staging workspace. No current data is overwritten.
            for (let i = 0; i < backup.images.length; i++) await next.saveResult(backup.images[i].job, files[i]);
            const settings = await next.preference('providers-v1');
            await next.savePreference(
              'providers-v1',
              JSON.stringify({
                providers: backup.providers,
                defaultId: backup.defaultId
              }),
              settings?.revision ?? null
            );
            const tasks = await next.preference('tasks-v1');
            const restored = backup.tasks.map(t => ({
              ...t,
              saved: backup.images.some(image => image.job.id === t.id)
            }));
            await next.savePreference('tasks-v1', JSON.stringify(restored), tasks?.revision ?? null);
            if (backup.draft) await next.saveStudioDraft(backup.draft, (await next.studioDraft())?.revision ?? null);
          } finally {
            await next.close();
          }
          localStorage.setItem('aiao-local-previous-profile-v1', this.profileId);
          localStorage.setItem('aiao-local-profile-v1', nextId);
          localStorage.removeItem(stagingKey);
          location.reload();
        });
      });
    } catch (e) {
      this.dataMessage.set(
        e instanceof Error ? e.message : '备份无效或恢复失败。原工作区保留，可重新选择备份继续恢复。'
      );
    } finally {
      this.dataBusy.set(false);
      void this.reconcileIdentity();
    }
  }
  async requestPersistence() {
    try {
      this.dataMessage.set(
        (await navigator.storage.persist()) ?
          '浏览器已允许持久存储。仍建议定期导出备份。'
        : '浏览器暂未允许持久存储，请定期导出备份。'
      );
    } catch {
      this.dataMessage.set('此浏览器不支持申请持久存储，请定期导出备份。');
    }
  }
  @HostListener('window:storage', ['$event']) onWorkspaceChanged(event: StorageEvent) {
    if (event.key !== 'aiao-local-profile-v1' || event.newValue === this.profileId) return;
    void this.followWorkspace(event.newValue).catch(() =>
      this.storageMessage.set('工作区已变化；当前输入尚未保存，请处理后刷新。')
    );
  }
  async enableSync() {
    const product = this.product;
    if (!product || !this.syncReady()) {
      this.authMessage.set('本机工作区尚未就绪，请稍后启用同步。');
      return;
    }
    this.authMessage.set('');
    await product.requestEnable();
  }
  async confirmSync() {
    await this.product?.confirmEnable();
  }
  cancelSync() {
    this.product?.cancelEnable();
  }
  async synchronize() {
    await this.product?.synchronize();
  }
  async rescanSync() {
    if (
      window.confirm('重新扫描此账号的远程记录？本机未上传改动和冲突副本会保留，遇到冲突仍需你选择；不会重新生成图片。')
    )
      await this.product?.synchronize({ rescan: true });
  }
  async reportTasks() {
    if (window.confirm('上报本机任务的状态、模型、供应商标识和用量来源？不包含提示词、图片或 API Key。'))
      await this.product?.reportTasks();
  }
  async deleteSyncedDraft() {
    if (window.confirm('删除同步端草稿？当前本机输入和原图保留，其他设备会收到删除标记。'))
      await this.product?.deleteDraft();
  }
  conflictPreview(record: ProductRecord | null): string {
    if (!record) return '同步端记录暂不可读';
    if (record.deleted) return '已删除';
    if (record.kind === 'draft')
      return serializePrompt(validateSyncPayload('draft', record.payload).state).text || '空草稿';
    if (record.kind === 'provider') {
      const provider = validateSyncPayload('provider', record.payload);
      return `${provider.name} · ${provider.baseUrl} · ${provider.model} · ${provider.mode === 'direct' ? '直连' : '代理'}`;
    }
    return validateSyncPayload('work', record.payload).prompt;
  }
  async resolveSyncConflict(id: string, choice: 'local' | 'remote') {
    await this.product?.resolveConflict(id, choice);
  }
  async selectWorkspace(id: string) {
    if (this.settingsBusy()) return;
    try {
      await this.workspaceSession?.selectLocal(id);
      await this.attachment;
    } catch (error) {
      this.storageMessage.set(error instanceof Error ? error.message : '工作区切换未完成。');
    }
  }
  openFeedback() {
    this.detail.set(null);
    this.closeAuth();
    this.feedbackOpen.set(true);
  }
  async copyFeedback(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.notify('反馈已复制');
    } catch {
      this.notify('复制失败，请手动复制反馈内容。');
    }
  }
  private releaseLibraryPreviews() {
    for (const work of this.libraryPage().works) this.library?.setVisible(work.jobId, false);
  }
  private async checkProviderPolicy(provider: LocalProvider): Promise<void> {
    if (!this.authConfigured()) return;
    const response = await fetch('/api/provider-policies', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: this.lifetime.signal
    });
    if (!response.ok) throw new Error('供应商运行策略暂不可确认，未发送生成请求。');
    const result = (await response.json()) as { policy: unknown };
    if (result.policy === null) {
      this.providerPolicy.set(null);
      this.providerPolicyVersion.set(null);
      return;
    }
    const policy = validateProviderPolicy(
      result.policy && typeof result.policy === 'object' ?
        { version: Reflect.get(result.policy, 'version'), providers: Reflect.get(result.policy, 'providers') }
      : result.policy
    );
    const revision = Reflect.get(result.policy as object, 'revision');
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('运行策略版本无效，未发送生成请求。');
    this.providerPolicy.set(policy);
    this.providerPolicyVersion.set(revision);
    const entry = policy.providers.find(entry => entry.baseUrl === provider.baseUrl);
    const size =
      this.ratio() === 'square' ? '1024x1024'
      : this.ratio() === 'landscape' ? '1536x1024'
      : '1024x1536';
    if (
      !entry?.enabled ||
      !entry[provider.mode] ||
      !entry.models.includes(provider.model) ||
      !entry.sizes.includes(size)
    )
      throw new Error('此供应商、模型、通道或画幅未在当前运行策略中启用，未发送生成请求。');
  }
  private async loadCatalog(): Promise<void> {
    try {
      const response = await fetch('/api/templates', {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: this.lifetime.signal
      });
      if (!response.ok) throw new Error('目录不可用');
      const result = (await response.json()) as { templates: { template: unknown; revision: number }[] };
      if (!Array.isArray(result.templates) || result.templates.length > 200) throw new Error('目录无效');
      const templates = result.templates.map(row => ({
        template: validatePublishedTemplate(row.template),
        revision: row.revision
      }));
      if (templates.some(row => !Number.isSafeInteger(row.revision) || row.revision < 1))
        throw new Error('目录版本无效');
      if (this.disposed) return;
      this.templateVersions = new Map(templates.map(row => [row.template.id, row.revision]));
      const published = new Map(templates.map(row => [row.template.id, row.template]));
      for (const template of imageMvpCatalog) if (!published.has(template.id)) published.set(template.id, template);
      this.templates.set([...published.values()].slice(0, 200));
    } catch {
      if (!this.disposed) this.catalogMessage.set('在线模板暂不可用，显示内置灵感。');
    }
  }
  private notify(text: string) {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
  private async openLocal() {
    try {
      if (!navigator.locks) throw new Error('Web Locks unavailable');
      this.profileId = await navigator.locks.request('aiao-local-profile-v1', () => {
        const key = 'aiao-local-profile-v1';
        const existing = localStorage.getItem(key);
        if (existing && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))
          throw new Error('Invalid local profile');
        const id = existing ?? crypto.randomUUID();
        localStorage.setItem(key, id);
        return id;
      });
      const [{ LocalMediaStore }, { WorkspaceRegistryStore }] = await Promise.all([
        import('../local-data/index'),
        import('../local-data/workspace-registry-store')
      ]);
      this.registryStore = await WorkspaceRegistryStore.open();
      const metadata = this.registryStore;
      this.rootId = await metadata.rootOf(this.profileId);
      const rootId = this.rootId;
      this.registry = new WorkspaceRegistry(rootId, {
        read: () => metadata.read(rootId),
        write: (payload, revision) => metadata.write(rootId, payload, revision),
        exclusive: operation =>
          navigator.locks.request('aiao-local-profile-v1', async () => {
            await this.assertRoot();
            return operation();
          })
      });
      this.registryState = await this.registry.read();
      const selected = this.registryState.profiles.find(profile => profile.id === this.registryState?.selectedId);
      if (!selected) throw new Error('当前工作区未注册。');
      const store = await LocalMediaStore.open(selected.id);
      if (this.disposed) {
        await store.close();
        return;
      }
      this.attachWorkspace(store, selected, true);
      await this.attachment;
      this.workspaceSession = new WorkspaceSession(selected.id, this.registry, {
        checkpoint: () => this.checkpoint(),
        pause: () => this.product?.pause(),
        open: id => LocalMediaStore.open(id),
        discard: store => store.close(),
        activate: (store, profile) => this.attachWorkspace(store, profile),
        selected: state => this.acceptRegistry(state),
        transition: active => {
          this.transitionCount += active ? 1 : -1;
          this.workspaceSwitching.set(this.transitionCount > 0);
        },
        canActivate: profile => this.canActivate(profile)
      });
      if (this.auth) {
        const api = this.adminApi;
        this.product = new ProductWorkspaceController(this.registry, this.workspaceSession, api, {
          profile: () => this.currentProfile(),
          registry: state => {
            this.registryState = state;
            this.refreshProfiles();
          },
          ready: () => this.attachment,
          checkpoint: () => this.checkpoint(),
          busy: () => this.sending() || this.dataBusy() || this.providerBusy() || this.workspaceSwitching(),
          counts: async () => {
            await this.checkpoint();
            const snapshot = await collectProductSnapshot(this.requireStore(), []);
            return {
              drafts: snapshot.entries.filter(entry => entry.kind === 'draft').length,
              providers: snapshot.entries.filter(entry => entry.kind === 'provider').length,
              works: snapshot.entries.filter(entry => entry.kind === 'work').length
            };
          },
          snapshot: records => collectProductSnapshot(this.requireStore(), records),
          project: async (records, blocked, versions, force) => {
            const store = this.requireStore();
            await applyProductProjection(store, records, blocked, versions, force);
            if (store === this.store) await this.readSettings();
          },
          reports: async workspaceId => {
            const tasks = this.history();
            return Promise.all(
              tasks
                .filter(task => ['processing', 'completed', 'failed', 'needs_review'].includes(task.status))
                .map(async task => ({
                  id: await productRecordId(workspaceId, 'work', task.id),
                  taskId: task.id,
                  workspaceId,
                  model: task.request.modelId,
                  providerId: task.request.providerInstanceId,
                  channel: task.channel ?? 'direct',
                  status: task.status as 'processing' | 'completed' | 'failed' | 'needs_review',
                  startedAt: task.createdAt,
                  source: 'application' as const,
                  requestCount: task.status === 'completed' ? 1 : null,
                  providerUnits: null,
                  verifiedCost: null,
                  currency: null
                }))
            );
          }
        });
        this.subscriptions.add(this.product.state$.subscribe(state => this.sync.set(state)));
        this.product.selection();
      }
      await this.acceptRegistry(this.registryState);
      this.subscriptions.add(
        metadata.watch(rootId).subscribe({
          next: payload => {
            if (!payload || this.disposed) return;
            void this.refreshRegistry().catch(() => this.storageMessage.set('本机工作区目录读取失败，当前副本保留。'));
          },
          error: () => this.storageMessage.set('本机工作区目录读取失败，当前副本保留。')
        })
      );
      await this.reconcileIdentity();
      this.localStatus.set('ready');
    } catch (error) {
      this.localStatus.set('unavailable');
      this.storageMessage.set(
        (error as { code?: string })?.code === 'incompatible' ?
          '本机数据版本与此应用不兼容，请更新应用后重试；原数据未更改。'
        : '无法打开本机数据。请使用支持持久存储的现代浏览器，允许站点存储后刷新；原数据未清除。'
      );
    }
  }
  private attachWorkspace(store: LocalMediaStore, profile: WorkspaceProfile, initial = false): void {
    const old = this.store;
    ++this.epoch;
    this.workspaceSubscriptions.unsubscribe();
    this.workspaceSubscriptions = new Subscription();
    this.workMetadata = undefined;
    this.studio?.close();
    this.library?.close();
    this.revokeResult();
    if (this.registryState)
      this.registryState = {
        ...this.registryState,
        selectedId: profile.id,
        profiles: [...this.registryState.profiles.filter(item => item.id !== profile.id), profile]
      };
    this.store = store;
    this.profileId = profile.id;
    this.currentProfileId.set(profile.id);
    this.refreshProfiles();
    this.settingsRevision = null;
    this.keys.clear();
    this.rememberedKeys.clear();
    this.providers.set([]);
    this.providerId.set('');
    this.history.set([]);
    this.works.set([]);
    this.localWorksKnown.set(false);
    this.localWorksError.set('');
    this.libraryPage.set(emptyLibrary());
    this.libraryFilters = {};
    this.librarySearch.set('');
    this.libraryModel.set('');
    this.libraryFrom.set('');
    this.libraryTo.set('');
    this.libraryFilterError.set('');
    this.syncedWorks.set([]);
    this.job.set(null);
    this.saved.set(false);
    this.uncertain.set(false);
    this.error.set('');
    if (!initial) this.editProvider();
    if (!initial) {
      this.dirtyInput = false;
      this.promptState.set(plainPrompt(''));
      this.ratio.set('square');
      this.selected.set(null);
    }
    this.localStatus.set('opening');
    const epoch = this.epoch;
    this.attachment = (async () => {
      await this.readSettings();
      await this.readTasks();
      if (epoch !== this.epoch) return;
      this.studio = new StudioDraftSession(
        store,
        state => {
          if (epoch !== this.epoch) return;
          this.promptState.set(state);
          this.ratio.set(state.aspectRatio ?? 'square');
          this.selected.set(this.templates().find(template => template.id === state.templateId) ?? null);
          this.selectedVersion.set(state.templateVersion ?? 1);
        },
        status => {
          if (epoch === this.epoch) {
            this.draftStatus.set(status);
            if (status === 'saved') this.product?.captureSoon();
          }
        }
      );
      if (this.dirtyInput) this.studio.edit(this.draftState());
      await this.studio.start();
      if (epoch !== this.epoch) return;
      this.library = new WorkLibrarySession(
        store,
        page => {
          if (epoch === this.epoch) {
            this.acceptLibraryPage(page);
          }
        },
        () => {
          if (epoch === this.epoch) this.notify('本机作品暂时无法读取，请重试查询。');
        }
      );
      this.library.start();
      this.watchWorks(store);
      this.watchPreferences(store);
      this.workspaceSubscriptions.add(
        store.syncedWorks$().subscribe({
          next: works => {
            if (epoch === this.epoch) this.syncedWorks.set(works);
          },
          error: () => {
            if (epoch === this.epoch) this.storageMessage.set('同步作品信息暂不可读。');
          }
        })
      );
      if (!initial) this.localStatus.set('ready');
      this.product?.selection();
    })();
    if (old && old !== store) void old.close();
  }
  private requireStore(): LocalMediaStore {
    if (!this.store) throw new Error('本机工作区尚未就绪。');
    return this.store;
  }
  private currentProfile(): WorkspaceProfile | null {
    return this.registryState?.profiles.find(profile => profile.id === this.profileId) ?? null;
  }
  private canActivate(profile: WorkspaceProfile): boolean {
    if (!profile.account || profile.id === this.profileId || this.authStatus() === 'signed-out') return true;
    return (
      this.authStatus() === 'signed-in' &&
      profile.account.userId === this.authUser()?.id &&
      profile.account.projectOrigin === readSupabaseAuthConfig()?.url
    );
  }
  private async checkpoint(): Promise<void> {
    await this.attachment;
    if (this.sending() || this.dataBusy() || this.providerBusy()) throw new Error('当前操作尚未完成，请稍后切换。');
    await this.studio?.checkpoint();
  }
  private async assertRoot(): Promise<void> {
    const selected = localStorage.getItem('aiao-local-profile-v1');
    if (!selected || (await this.registryStore?.rootOf(selected)) !== this.rootId)
      throw new Error('另一窗口已切换工作区组，请保存输入后刷新。');
  }
  private async acceptRegistry(state: WorkspaceRegistryState): Promise<void> {
    this.registryState = state;
    await navigator.locks.request('aiao-local-profile-v1', async () => {
      await this.assertRoot();
      if (state.selectedId === this.profileId) localStorage.setItem('aiao-local-profile-v1', this.profileId);
    });
    this.refreshProfiles();
    this.product?.selection();
  }
  private refreshProfiles(): void {
    const account = this.currentProfile()?.account;
    this.identityBlocked.set(
      this.authStatus() === 'signed-in' &&
        !!account &&
        (account.userId !== this.authUser()?.id || account.projectOrigin !== readSupabaseAuthConfig()?.url)
    );
    this.syncInitialized.set(!!this.currentProfile()?.binding?.initialized);
    this.availableProfiles.set(this.registryState?.profiles.filter(profile => this.canActivate(profile)) ?? []);
  }
  private async refreshRegistry(): Promise<void> {
    if (!this.registry) return;
    const state = await this.registry.read();
    this.registryState = state;
    this.refreshProfiles();
    if (state.selectedId !== this.profileId && !this.transitionCount && !this.sending() && !this.dataBusy()) {
      await this.workspaceSession?.follow();
      await this.attachment;
    }
  }
  private async followWorkspace(id: string | null): Promise<void> {
    if (!id || this.disposed) return;
    this.product?.pause();
    if ((await this.registryStore?.rootOf(id)) === this.rootId) {
      await this.refreshRegistry();
      return;
    }
    await this.checkpoint();
    location.reload();
  }
  private async reconcileIdentity(): Promise<void> {
    if (
      !this.workspaceSession ||
      this.sending() ||
      this.dataBusy() ||
      this.providerBusy() ||
      !['signed-in', 'signed-out'].includes(this.authStatus())
    )
      return;
    const config = this.auth?.config ?? null,
      user = this.authUser();
    const identityKey = `${this.authStatus()}:${config?.url ?? ''}:${user?.id ?? ''}`;
    if (identityKey === this.identitySelection) return;
    const version = ++this.identityVersion;
    try {
      await this.workspaceSession.select(
        this.authStatus() === 'signed-in' && user && config ? { userId: user.id, projectOrigin: config.url } : null
      );
      await this.attachment;
      if (version !== this.identityVersion || this.disposed) return;
      this.identitySelection = identityKey;
      this.refreshProfiles();
      this.syncReady.set(this.product !== undefined);
      if (this.authStatus() === 'signed-in' && this.currentProfile()?.binding?.initialized)
        await this.product?.resume();
    } catch (error) {
      if (version === this.identityVersion)
        this.storageMessage.set(error instanceof Error ? error.message : '账号工作区切换未完成，本机输入保留。');
    }
  }
  private async readSettings() {
    const store = this.store;
    if (!store) return;
    const epoch = this.epoch;
    const bound = !!this.currentProfile()?.binding;
    const [row, credentials] = await Promise.all([
      store.ensurePreference(
        'providers-v1',
        JSON.stringify({
          providers: bound ? [] : [defaultFreeProvider()],
          defaultId: bound ? '' : DEFAULT_FREE_PROVIDER_ID
        })
      ),
      store.preference('provider-keys-v1')
    ]);
    if (epoch !== this.epoch || store !== this.store) return;
    if (!row || row.revision !== this.settingsRevision) {
      const data =
        row ?
          (JSON.parse(row.payload) as {
            providers: LocalProvider[];
            defaultId: string;
          })
        : { providers: [], defaultId: '' };
      if (!Array.isArray(data.providers) || data.providers.length > 30) throw new Error('Invalid providers');
      const providers = (await store.collection('providers')).map(row => publicProvider(JSON.parse(row.payload)));
      if (epoch !== this.epoch || store !== this.store) return;
      const migratedProviders = providers.map(p =>
        (
          p.id === DEFAULT_FREE_PROVIDER_ID &&
          (p.baseUrl === 'https://ai.junflow.cn' || p.baseUrl === 'https://ai.pengdevs.com')
        ) ?
          {
            ...p,
            baseUrl: DEFAULT_FREE_PROVIDER.baseUrl,
            // The built-in provider requires the same-origin relay.
            mode: DEFAULT_FREE_PROVIDER.mode
          }
        : p
      );
      const defaultId =
        migratedProviders.some(p => p.id === data.defaultId) ? data.defaultId : (migratedProviders[0]?.id ?? '');
      const nextProviders = migratedProviders;
      const providersMigrated = migratedProviders.some(
        (p, index) => p.baseUrl !== providers[index]?.baseUrl || p.mode !== providers[index]?.mode
      );
      const nextDefaultId = defaultId || nextProviders[0]?.id || '';
      for (const old of this.providers())
        if (nextProviders.find(provider => provider.id === old.id)?.baseUrl !== old.baseUrl) this.keys.delete(old.id);
      this.providers.set(nextProviders);
      this.providerId.set(nextDefaultId);
      this.settingsRevision = row?.revision ?? null;
      if (providersMigrated || nextDefaultId !== data.defaultId) {
        this.settingsRevision = await store.savePreference(
          'providers-v1',
          JSON.stringify({
            providers: nextProviders,
            defaultId: nextDefaultId
          }),
          row?.revision ?? null
        );
      }
      for (const id of this.keys.keys()) if (!nextProviders.some(p => p.id === id)) this.keys.delete(id);
    }
    const remembered: Record<string, string> = credentials ? JSON.parse(credentials.payload) : {};
    this.rememberedKeys.clear();
    for (const p of this.providers())
      if (p.rememberKey && typeof remembered[p.id] === 'string') this.rememberedKeys.set(p.id, remembered[p.id]);
  }
  private async readTasks() {
    const store = this.store,
      epoch = this.epoch;
    const row = await store?.preference('tasks-v1');
    if (epoch !== this.epoch || store !== this.store) return;
    const tasks =
      store && row ?
        (await store.collection('tasks')).map(row => {
          const task = JSON.parse(row.payload) as Partial<LocalTask>;
          return { ...task, channel: task.channel ?? 'direct' } as LocalTask;
        })
      : [];
    if (epoch !== this.epoch || store !== this.store) return;
    if (!Array.isArray(tasks)) throw new Error('Invalid task journal');
    this.history.set(tasks);
    const unresolved = tasks.find(t => !t.acknowledged && ['processing', 'needs_review'].includes(t.status));
    if (unresolved) {
      this.job.set({ ...unresolved, status: 'needs_review' });
      this.uncertain.set(true);
    } else {
      this.uncertain.set(false);
      const current = this.job();
      if (current && ['processing', 'needs_review'].includes(current.status)) this.job.set(null);
    }
    // The task's old saved flag can outlive a deletion or lag journal recovery.
    // The library compares tasks with readable works instead of trusting it.
  }
  private async writeTask(task: LocalTask) {
    const store = this.store,
      epoch = this.epoch;
    if (!store) throw new Error('本机记录不可用，未发送请求。');
    const row = await store.preference('tasks-v1');
    const tasks: LocalTask[] = row ? JSON.parse(row.payload) : [];
    const next = [task, ...tasks.filter(t => t.id !== task.id)].slice(0, 100);
    await store.savePreferences(
      [{ key: 'tasks-v1', payload: JSON.stringify(next), revision: row?.revision ?? null }],
      true
    );
    if (!this.disposed && epoch === this.epoch && store === this.store) this.history.set(next);
  }
  private async persistProviders(
    providers: LocalProvider[],
    defaultId: string,
    credential?: { id: string; key: string | null }
  ) {
    if (!this.store) throw new Error('请先等待本机存储就绪。');
    const store = this.store,
      epoch = this.epoch;
    const nextProviders = providers.length || this.currentProfile()?.binding ? providers : [defaultFreeProvider()];
    const nextDefaultId = nextProviders.some(p => p.id === defaultId) ? defaultId : (nextProviders[0]?.id ?? '');
    const changes = [
      {
        key: 'providers-v1',
        payload: JSON.stringify({ providers: nextProviders, defaultId: nextDefaultId }),
        revision: this.settingsRevision
      }
    ];
    if (credential) {
      const row = await store.preference('provider-keys-v1');
      const data: Record<string, string> = row ? JSON.parse(row.payload) : {};
      if (credential.key === null) delete data[credential.id];
      else data[credential.id] = credential.key;
      changes.push({ key: 'provider-keys-v1', payload: JSON.stringify(data), revision: row?.revision ?? null });
    }
    const [revision] = await store.savePreferences(changes, true);
    if (epoch !== this.epoch || store !== this.store) return;
    this.settingsRevision = revision;
    this.product?.captureSoon();
    if (credential?.key === null) this.rememberedKeys.delete(credential.id);
    else if (credential) this.rememberedKeys.set(credential.id, credential.key);
    this.providers.set(nextProviders);
    this.providerId.set(nextDefaultId);
  }
  private acceptLibraryPage(page: LibraryState): void {
    const previous = new Map(this.libraryPage().works.map(work => [work.jobId, work]));
    this.libraryPage.set({
      ...page,
      works: page.works.map(work => {
        const before = previous.get(work.jobId);
        return before?.info && this.sameWorkFile(before, work) ? { ...work, info: before.info } : work;
      })
    });
  }
  private watchWorks(store: LocalMediaStore): void {
    const epoch = this.epoch;
    const metadata = new WorkMetadataSession(store, state => {
      if (epoch !== this.epoch) return;
      const changed = this.works() !== state.works;
      this.works.set(state.works);
      this.localWorksKnown.set(state.known);
      this.localWorksError.set(state.error ?? '');
      if (changed && state.known) this.product?.captureSoon();
    });
    this.workMetadata = metadata;
    this.workspaceSubscriptions.add(() => metadata.close());
    metadata.start();
  }
  private sameWorkFile(left: Work, right: Work): boolean {
    return (
      left.viewKey === right.viewKey &&
      left.bytes === right.bytes &&
      left.createdAt === right.createdAt &&
      left.status === right.status
    );
  }
  private watchPreferences(store: LocalMediaStore): void {
    this.workspaceSubscriptions.add(
      merge(store.preference$('providers-v1'), store.preference$('provider-keys-v1'))
        .pipe(
          concatMap(() =>
            this.readSettings().catch(() => this.storageMessage.set('供应商设置读取失败，请刷新后重试。'))
          )
        )
        .subscribe({ error: () => this.storageMessage.set('供应商设置读取失败，请刷新后重试。') })
    );
    this.workspaceSubscriptions.add(
      store
        .preference$('tasks-v1')
        .pipe(
          concatMap(() =>
            this.sending() ? EMPTY : (
              this.readTasks().catch(() => this.storageMessage.set('任务记录读取失败，请刷新后重试。'))
            )
          )
        )
        .subscribe({ error: () => this.storageMessage.set('任务记录读取失败，请刷新后重试。') })
    );
  }
  private revokeResult() {
    const url = this.resultUrl();
    if (url) URL.revokeObjectURL(url);
    this.resultUrl.set(null);
    this.resultBlob = null;
    this.resultMimeType.set(null);
  }
  private draftState(): StudioPromptState {
    const selected = this.selected();
    return {
      ...this.promptState(),
      aspectRatio: this.ratio(),
      ...(selected ? { templateId: selected.id, templateVersion: this.selectedVersion() } : {})
    };
  }
}
