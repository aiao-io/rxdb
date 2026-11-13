import type { GenerationJobSummary, ImageAspectRatio } from '@aiao-media/api-contracts';
import {
  createRelayTaskToken,
  imageExtension,
  productRecordId,
  validateProviderPolicy,
  validatePublishedTemplate,
  validateSyncPayload,
  type ImageMimeType,
  type ProviderPolicy,
  type PublicWorkPayload
} from '@aiao-media/api-contracts';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, EMPTY, merge, Subscription } from 'rxjs';
import { ImageSyncController } from '../local-data/image-sync';
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
import {
  apiEndpoint,
  initialProfile,
  interceptDownload,
  nativeBackend,
  persistNativeProfile,
  saveDownload
} from '../platform/local-backend';
import { SyncTargetSettings } from './account/sync-target-settings';
import {
  consumeBackupSelection,
  readBackupSelection,
  readBackupWorkspaces,
  rememberBackupSelection,
  rememberBackupWorkspace,
  type BackupWorkspace
} from './backup-workspaces';
import { CreditsPanel } from './credits-panel';
import { DEFAULT_FREE_PROVIDER, DEFAULT_FREE_PROVIDER_ID, defaultFreeProvider } from './default-provider';
import {
  cardSizeOptions,
  clearDisplayPreferences,
  contentAlignOptions,
  defaultDisplayPreferences,
  displayStorageKey,
  feedColumnMin,
  isDefaultDisplay,
  libraryCardMin,
  maxColumns,
  pageMaxWidth,
  pageWidthOptions,
  readDisplayPreferences,
  saveDisplayPreferences,
  type DisplayPreferences
} from './display-preferences';
import { ElementWidthDirective } from './element-width.directive';
import { imageMvpCatalog } from './image-mvp-catalog';
import { transitionImage } from './image-view-transition';
import { authorInitial, columnCount, coverRatio, distribute } from './inspiration-feed';
import {
  generateLocalImage,
  providerBase,
  ProviderFailure,
  publicProvider,
  type LocalProvider
} from './local-provider';
import { ProductClient } from './product-client';
import { ProductWorkspaceController, type ProductWorkspaceState } from './product-workspace';
import { applyIssue, templateState, type PromptTemplate } from './prompts/prompt-catalog';
import { PromptInput } from './prompts/prompt-input';
import { plainPrompt, serializePrompt, type PromptState } from './prompts/prompt-state';
import { StudioDraftSession, type StudioDraftStatus } from './prompts/studio-draft-session';
import { deleteRelayTask, relayTickets, runRelayTask, type RelayTicket } from './relay-task-client';
import {
  readSupabaseAuthConfig,
  SupabaseAuthClient,
  type SupabaseAuthMode,
  type SupabaseAuthState,
  type SupabaseAuthUser
} from './supabase-auth';
import {
  readSyncTarget,
  saveSyncTarget,
  verifyImageSyncTarget,
  verifySyncTarget,
  type SyncTarget
} from './sync-target';
import { WorkLibrarySession, type LibraryState, type LibraryWork } from './work-library-session';
import { WorkMetadataSession } from './work-metadata-session';
import { WorkVisibleDirective } from './work-visible.directive';
import { WorkspaceSession } from './workspace-session';

type View = 'discover' | 'studio' | 'library' | 'providers';
type SettingsTab = 'providers' | 'sync' | 'data' | 'display';
type Work = LibraryWork;
type WorkViewer = { work: Work; image: { url: string; mimeType: ImageMimeType } | null; failed: boolean };
interface ImageDownloadState {
  status: 'loading' | 'saved' | 'failed';
  message: string;
}
type LocalTask = GenerationJobSummary & {
  channel?: 'direct' | 'proxy' | 'platform';
  saved?: boolean;
  acknowledged?: boolean;
};
const paths: Record<View, string> = {
  discover: '/',
  studio: '/create',
  library: '/images',
  providers: '/providers'
};
const routeView = (path: string): View =>
  path === '/create' ? 'studio'
  : path === '/images' ? 'library'
  : path === '/providers' ? 'providers'
  : 'discover';
// Settings sections are in-page tabs; the hash only deep-links a tab and never adds a route.
const settingsTabs: { id: SettingsTab; label: string }[] = [
  { id: 'providers', label: '供应商' },
  { id: 'sync', label: '同步' },
  { id: 'data', label: '本机数据' },
  { id: 'display', label: '显示' }
];
const hashTab = (hash: string): SettingsTab =>
  hash === '#sync' ? 'sync'
  : hash === '#data' ? 'data'
  : hash === '#display' ? 'display'
  : 'providers';
const displaySessionOnly = '无法写入当前浏览器的存储，显示设置仅在本次打开期间生效。';
const ratioSizes: Record<ImageAspectRatio, string> = {
  square: '1024 × 1024',
  landscape: '1536 × 1024',
  portrait: '1024 × 1536'
};
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
/** Local display time; an unparsable stored value is shown verbatim instead of throwing. */
function formatTime(value: string | undefined, format: Intl.DateTimeFormat): string {
  const time = Date.parse(value ?? '');
  return Number.isNaN(time) ? (value ?? '') : format.format(time);
}
function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
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
  imports: [
    FormsModule,
    NgTemplateOutlet,
    PromptInput,
    WorkVisibleDirective,
    ElementWidthDirective,
    SyncTargetSettings,
    CreditsPanel
  ],
  templateUrl: './local-image-mvp.html',
  host: {
    class: 'image-mvp',
    '[attr.data-page-width]': 'display().pageWidth',
    '[attr.data-align]': 'display().align',
    '[style.--page-max]': 'pageMaxStyle()',
    '[style.--library-card-min]': 'libraryCardMinStyle()',
    '[style.--library-columns]': 'libraryColumnsStyle()',
    '(window:storage)': 'onStorage($event); onWorkspaceChanged($event)'
  },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocalImageMvp implements OnInit, OnDestroy {
  private store: LocalMediaStore | null = null;
  private registryStore?: WorkspaceRegistryStore;
  private registry?: WorkspaceRegistry;
  private workspaceSession?: WorkspaceSession<LocalMediaStore>;
  private product?: ProductWorkspaceController;
  /** 图片传输的作用域：同步目标、项目账号或本机工作区一变就中止，旧传输的迟到结果不进入新目标。 */
  private imageSyncScope = new AbortController();
  private readonly imageDownloads = signal<ReadonlyMap<string, ImageDownloadState>>(new Map());
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
  private readonly backupWorkspaceHistory = signal<BackupWorkspace[]>([]);
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
  /** Device-only relay tickets from the last journal read, keyed by task id. */
  private tickets: Record<string, RelayTicket> = {};
  private relayResuming: string | null = null;
  private releasing = false;
  private releaseAgain = false;
  private readonly injector = inject(Injector);
  private readonly promptInput = viewChild(PromptInput);
  private elapsedTimer?: ReturnType<typeof setInterval>;
  private releaseViewerImage?: () => void;
  private viewerPageTarget: { page: number; index: number } | null = null;
  private viewerGeneration = 0;
  private readonly filtersApplied = signal(false);
  readonly resultMimeType = signal<ImageMimeType | null>(null);
  readonly imageExtension = imageExtension;
  readonly formatBytes = formatBytes;
  readonly coverRatio = coverRatio;
  readonly authorInitial = authorInitial;
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
  readonly nativeMode = nativeBackend;
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
  /** 这台设备的排版偏好；先于首屏读取，页面一开始就按用户选的宽度和卡片大小排版。 */
  readonly display = signal<DisplayPreferences>(readDisplayPreferences(localStorage));
  readonly displayMessage = signal('');
  readonly displayIsDefault = computed(() => isDefaultDisplay(this.display()));
  readonly defaults = defaultDisplayPreferences;
  readonly pageWidthOptions = pageWidthOptions;
  readonly cardSizeOptions = cardSizeOptions;
  readonly contentAlignOptions = contentAlignOptions;
  /** 内容区最大宽度；「铺满窗口」不设上限，返回 null 让样式移除该变量。 */
  readonly pageMaxStyle = computed(() => {
    const max = pageMaxWidth(this.display().pageWidth);
    return max === null ? null : `${max}px`;
  });
  readonly libraryCardMinStyle = computed(() => `${libraryCardMin(this.display().cardSize)}px`);
  readonly libraryColumnsStyle = computed(() => String(maxColumns(this.display().cardSize)));
  /** 瀑布流容器的内容宽度；量到之前为 0，不渲染任何列。 */
  readonly feedWidth = signal(0);
  readonly feedColumns = computed(() =>
    this.feedWidth() ?
      distribute(
        this.filtered(),
        columnCount(this.feedWidth(), feedColumnMin(this.display().cardSize), maxColumns(this.display().cardSize))
      )
    : []
  );
  readonly detail = signal<PromptTemplate | null>(null);
  readonly failedTemplateImages = signal(new Set<string>());
  readonly selected = signal<PromptTemplate | null>(null);
  readonly promptState = signal<PromptState>(plainPrompt(''));
  readonly serialized = computed(() => serializePrompt(this.promptState()));
  readonly ratio = signal<ImageAspectRatio>('square');
  readonly ratios: { id: ImageAspectRatio; label: string; hint: string; shape: string }[] = [
    { id: 'square', label: '正方形', hint: '1:1', shape: 'shape' },
    { id: 'landscape', label: '横向', hint: '3:2', shape: 'shape wide' },
    { id: 'portrait', label: '纵向', hint: '2:3', shape: 'shape tall' }
  ];
  readonly editorReady = signal(false);
  readonly settingsTabs = settingsTabs;
  readonly settingsTab = signal<SettingsTab>('providers');
  /** Providers with a usable key this session, remembered or not; the key values stay in private maps. */
  readonly keyIds = signal<ReadonlySet<string>>(new Set());
  readonly providerHasKey = computed(() => this.keyIds().has(this.providerId()));
  readonly keyPrompt = signal<LocalProvider | null>(null);
  readonly keyDraft = signal('');
  readonly keyRemember = signal(false);
  readonly keyPromptMessage = signal('');
  readonly viewer = signal<WorkViewer | null>(null);
  readonly viewerPosition = signal(0);
  readonly viewerTotal = signal(0);
  readonly viewerPaging = signal(false);
  readonly viewerMessage = signal('');
  readonly viewerOriginal = signal(false);
  readonly deletingWork = signal<string | null>(null);
  readonly deleteError = signal('');
  readonly deleteErrorWork = signal<string | null>(null);
  readonly viewerIndex = computed(() => {
    const current = this.viewer();
    return current ? this.libraryPage().works.findIndex(work => work.jobId === current.work.jobId) : -1;
  });
  /** The page copy carries file details loaded after the viewer opened. */
  readonly viewerWork = computed(() => {
    const current = this.viewer();
    return current && (this.libraryPage().works.find(work => work.jobId === current.work.jobId) ?? current.work);
  });
  readonly elapsedSeconds = signal(0);
  readonly elapsedLabel = computed(() => {
    const seconds = this.elapsedSeconds();
    return seconds < 60 ?
        `${seconds} 秒`
      : `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
  });
  readonly filtersOpen = signal(false);

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
  readonly backupWorkspaces = computed(() =>
    this.backupWorkspaceHistory().filter(workspace => workspace.id !== this.currentProfileId())
  );
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
  readonly advancedFilterCount = computed(
    () => [this.libraryModel(), this.libraryFrom(), this.libraryTo()].filter(value => value.trim()).length
  );
  readonly filtersActive = computed(
    () => this.filtersApplied() || Boolean(this.librarySearch().trim()) || this.advancedFilterCount() > 0
  );
  readonly history = signal<LocalTask[]>([]);
  readonly job = signal<LocalTask | null>(null);
  readonly resultUrl = signal<string | null>(null);
  readonly saved = signal(false);
  readonly sending = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly feedbackOpen = signal(false);
  readonly targetKind = signal<SyncTarget['kind']>('disconnected');
  readonly targetMessage = signal('');
  readonly targetBusy = signal(false);
  readonly syncPaused = signal(false);
  readonly lastSyncedAt = signal('');
  readonly remoteQuota = signal('');
  readonly imageSyncEnabled = signal(false);
  readonly imageSyncBusy = signal(false);
  readonly imageUploads = signal(0);
  readonly syncActive = computed(() => this.sync().busy || this.imageSyncBusy() || this.imageUploads() > 0);
  readonly imageSyncMessage = signal('');
  readonly imageSyncProgress = signal('');
  readonly platformAvailable = signal(false);
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
      // A relay task keeps running on the server while this page waits for the tab that resumes it.
      this.job()?.status === 'processing' ||
      this.providerBusy() ||
      this.dataBusy() ||
      this.sync().busy ||
      this.workspaceSwitching() ||
      this.identityBlocked()
  );
  readonly settingsBusy = computed(
    () =>
      this.sending() ||
      this.providerBusy() ||
      this.dataBusy() ||
      this.sync().busy ||
      this.workspaceSwitching() ||
      this.identityBlocked()
  );
  readonly working = computed(
    () => this.sending() || this.job()?.status === 'queued' || this.job()?.status === 'processing'
  );
  /** Failed and uncertain requests explain their error inside the result panel. */
  readonly panelError = computed(() => this.uncertain() || this.job()?.status === 'failed');
  readonly resultState = computed(() =>
    this.saved() ? 'saved'
    : this.resultUrl() ? 'unsaved'
    : this.working() ? 'working'
    : this.uncertain() ? 'review'
    : this.job()?.status === 'failed' ? 'failed'
    : 'idle'
  );
  readonly resultLabel = computed(
    () =>
      ({
        saved: '已保存到本机',
        unsaved: '已生成，等待本机保存',
        working: '正在创作',
        review: '待核对供应商记录',
        failed: '未生成',
        idle: '等待你的想法'
      })[this.resultState()]
  );
  readonly resultSize = computed(() => {
    const request = this.job()?.request,
      mimeType = this.resultMimeType();
    return [
      request?.kind === 'image' && request.aspectRatio ? ratioSizes[request.aspectRatio] : '',
      mimeType === 'image/png' ? 'PNG'
      : mimeType ? 'JPEG'
      : ''
    ]
      .filter(Boolean)
      .join(' · ');
  });
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
      if (!this.detail() && !this.feedbackOpen() && !this.authOpen() && !this.keyPrompt() && !this.viewer()) {
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
    this.settingsTab.set(hashTab(location.hash));
    try {
      const platform = readSupabaseAuthConfig();
      this.platformAvailable.set(platform !== null);
      this.configureTarget(readSyncTarget(localStorage, platform));
    } catch {
      this.authConfigError.set('账号服务配置无效，请联系部署方。本机创作仍可继续。');
    }
    void this.openLocal();
    if (!nativeBackend && 'serviceWorker' in navigator) {
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
    if (nativeBackend) this.storageInfo.set('SQLite 数据库与原图保存在原生应用数据目录，可用空间由系统文件系统决定');
    else
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
    this.resetImageSync();
    this.stopElapsed();
    this.closeViewer();
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
    this.closeViewer();
    if (next === 'providers') this.settingsTab.set(hashTab(location.hash));
  }
  @HostListener('document:keydown.escape', ['$event']) onEscape(event?: Event) {
    if (this.detail()) event?.preventDefault();
    this.closeTemplate();
    this.feedbackOpen.set(false);
    this.closeAuth();
    this.closeKeyPrompt();
    this.closeViewer();
  }
  @HostListener('document:visibilitychange') onVisibility() {
    if (document.visibilityState === 'hidden') void this.studio?.flush();
  }
  /** 其他标签页改了排版偏好（或清空了站点数据）时，本页跟着更新。 */
  onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === null || event.key === displayStorageKey))
      this.display.set(readDisplayPreferences(localStorage));
  }
  navigate(view: View, event?: Event) {
    if (
      event instanceof MouseEvent &&
      (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    )
      return;
    event?.preventDefault();
    if (view !== this.view()) this.releaseLibraryPreviews();
    if (this.view() !== view) {
      history.pushState(null, '', paths[view]);
      this.settingsTab.set('providers');
    }
    this.view.set(view);
    this.detail.set(null);
    this.closeViewer();
    window.scrollTo({ top: 0 });
    if (view === 'studio') {
      afterNextRender(
        () => {
          if (this.view() === 'studio' && !this.workspaceSwitching() && !this.identityBlocked())
            this.promptInput()?.focus();
        },
        { injector: this.injector }
      );
    }
    return true;
  }
  openSettings(tab: SettingsTab, event?: Event) {
    if (this.navigate('providers', event) !== true) return;
    this.selectSettingsTab(tab);
  }
  selectSettingsTab(tab: SettingsTab) {
    this.settingsTab.set(tab);
    history.replaceState(null, '', tab === 'providers' ? paths.providers : `${paths.providers}#${tab}`);
  }
  /** Arrow keys, Home and End move between tabs with automatic activation. */
  moveSettingsTab(event: KeyboardEvent) {
    const ids = settingsTabs.map(tab => tab.id);
    const index = ids.indexOf(this.settingsTab());
    const next =
      event.key === 'ArrowRight' ? ids[(index + 1) % ids.length]
      : event.key === 'ArrowLeft' ? ids[(index + ids.length - 1) % ids.length]
      : event.key === 'Home' ? ids[0]
      : event.key === 'End' ? ids[ids.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    this.selectSettingsTab(next);
    document.getElementById(`settings-tab-${next}`)?.focus();
  }
  openTemplate(template: PromptTemplate, event: Event) {
    const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.transitionTemplate(template, trigger);
  }
  closeTemplate() {
    if (this.detail()) this.transitionTemplate(null, this.dialogTrigger);
  }
  /** 容器被隐藏时宽度为 0，保持原有分列，恢复显示后再按真实宽度重排。 */
  feedWidthChange(width: number) {
    if (width > 0) this.feedWidth.set(width);
  }
  /** 调整排版偏好：立即生效并保存在此浏览器；保存失败时本次打开期间仍按新选择排版。 */
  setDisplay(change: Partial<DisplayPreferences>) {
    const next = { ...this.display(), ...change };
    this.display.set(next);
    try {
      saveDisplayPreferences(localStorage, next);
      this.displayMessage.set('');
    } catch {
      this.displayMessage.set(displaySessionOnly);
    }
  }
  resetDisplay() {
    this.display.set({ ...defaultDisplayPreferences });
    try {
      clearDisplayPreferences(localStorage);
      this.displayMessage.set('');
    } catch {
      this.displayMessage.set(displaySessionOnly);
    }
    this.notify('已恢复默认显示设置');
  }
  resetGallery() {
    this.search.set('');
    this.category.set('全部灵感');
  }
  async changeSyncTarget(kind: SyncTarget['kind']) {
    if (this.settingsBusy() || this.targetBusy()) return;
    this.targetBusy.set(true);
    this.targetMessage.set('');
    try {
      const config = kind === 'platform' ? readSupabaseAuthConfig() : null;
      if (kind === 'platform' && !config) throw new Error('平台账号服务尚未启用，请稍后重试。');
      if (kind === 'disconnected' && !window.confirm('断开平台同步？本机和云端内容保留，之后可重新登录并开启同步。'))
        return;
      await this.checkpoint();
      const target: SyncTarget = config ? { kind: 'platform', config } : { kind: 'disconnected', config: null };
      saveSyncTarget(localStorage, target);
      this.configureTarget(target);
      await this.reconcileIdentity();
      this.targetMessage.set(
        kind === 'disconnected' ? '已断开同步；本机和云端数据保留。' : '注册或登录平台账号后即可开启跨设备同步。'
      );
      if (kind === 'platform') this.openAuth();
    } catch (error) {
      this.targetMessage.set(error instanceof Error ? error.message : '平台同步连接失败，本机数据保留。');
    } finally {
      this.targetBusy.set(false);
    }
  }
  stopSync() {
    this.product?.pause();
    this.resetImageSync();
    this.imageSyncEnabled.set(false);
    this.imageSyncMessage.set('');
    this.syncPaused.set(true);
    localStorage.setItem(this.syncPauseKey(), '1');
    this.authMessage.set('同步已停止。本机内容保留，远端数据未删除。');
    this.notify('同步已停止，本机内容保留。');
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
        this.authMessage.set(
          nativeBackend ? '已退出账号。本机数据保留在此应用目录。' : '已退出账号。本机数据保留在当前浏览器。'
        );
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
  /** Fills the form and focuses the field the user came for; focusing also scrolls a stacked form into view. */
  startEditProvider(p?: LocalProvider) {
    this.editProvider(p);
    afterNextRender(() => document.getElementById(p ? 'provider-key' : 'provider-name')?.focus(), {
      injector: this.injector
    });
  }
  openProviderSettings(provider = this.provider()) {
    this.openSettings('providers');
    this.startEditProvider(provider ?? undefined);
  }
  closeKeyPrompt() {
    this.keyPrompt.set(null);
    this.keyDraft.set('');
    this.keyPromptMessage.set('');
  }
  manageKeyInSettings() {
    const provider = this.keyPrompt();
    this.closeKeyPrompt();
    this.openProviderSettings(provider);
  }
  /** Stores the key exactly like the settings form, then continues the generation the user asked for. */
  async submitKey() {
    const provider = this.keyPrompt(),
      key = this.keyDraft().trim();
    if (!provider || this.providerBusy() || this.settingsBusy()) return;
    if (!/^[\x21-\x7e]{1,4096}$/.test(key)) {
      this.keyPromptMessage.set('请填写有效的 API Key。');
      return;
    }
    const remember = !nativeBackend && this.keyRemember();
    this.providerBusy.set(true);
    this.keyPromptMessage.set('');
    try {
      await this.persistProviders(
        this.providers().map(item => (item.id === provider.id ? { ...item, rememberKey: remember } : item)),
        this.providerId(),
        { id: provider.id, key: remember ? key : null }
      );
      if (remember) this.keys.delete(provider.id);
      else this.keys.set(provider.id, key);
      this.syncKeyIds();
    } catch (e) {
      this.keyPromptMessage.set(e instanceof Error ? e.message : '保存 Key 未完成，请重试。');
      return;
    } finally {
      this.providerBusy.set(false);
    }
    this.closeKeyPrompt();
    await this.generate();
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
        rememberKey: !nativeBackend && this.rememberKey() && Boolean(key)
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
      this.syncKeyIds();
      this.editProvider();
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
    const previousId = this.providerId();
    this.providerBusy.set(true);
    this.providerId.set(id);
    this.error.set('');
    try {
      await this.persistProviders(this.providers(), id);
    } catch (e) {
      this.providerId.set(previousId);
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
      this.syncKeyIds();
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
      this.syncKeyIds();
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
      // Ask in place so the prompt, ratio and scroll position stay where the user left them.
      this.keyRemember.set(false);
      this.keyPromptMessage.set('');
      this.keyPrompt.set(provider);
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
        if (this.uncertain() || this.job()?.status === 'processing') return;
        await this.studio?.flush();
        const now = new Date().toISOString();
        const task: LocalTask = {
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
        // Relay mode keeps a device-only ticket so a reload can find the server task again.
        const ticket: RelayTicket | null =
          provider.mode === 'proxy' ?
            { token: createRelayTaskToken(), accepted: false, baseUrl: providerBase(provider.baseUrl) }
          : null;
        await this.writeTask(task, ticket);
        const ratio = this.ratio();
        await this.runTask(
          task,
          signal =>
            ticket ?
              runRelayTask({
                id: task.id,
                ticket,
                ratio,
                signal,
                dispatch: { provider, key, prompt: task.request.prompt },
                accepted: () => this.acceptRelay(task.id, ticket)
              })
            : generateLocalImage(provider, key, task.request.prompt, ratio, signal),
          // A relay task has its own server deadline; only a direct request is bounded by this page.
          ticket ? null : 180000
        );
      });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : '本机提交记录写入失败，没有重复发送。');
    } finally {
      this.sending.set(false);
      this.stopElapsed();
      if (this.resultUrl() || this.panelError()) this.revealResult();
      void this.reconcileIdentity();
      this.releaseRelay();
    }
  }
  async acknowledgeUnknown() {
    const current = this.job();
    if (
      this.settingsBusy() ||
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
    if (!job || !blob || !store || this.sync().busy) return;
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
      void this.syncSavedImage(task);
    } catch {
      if (current()) this.storageMessage.set('图片已生成，本机保存失败。请先下载，再释放空间并重试保存。');
    }
  }
  onPromptChanged(state: PromptState) {
    this.dirtyInput = true;
    if (this.selected()?.fields?.length && !state.fields.length) this.selected.set(null);
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
    if (this.settingsBusy()) return;
    await this.studio?.reload();
    await this.reconcileIdentity();
  }
  async overwriteDraft() {
    if (this.settingsBusy()) return;
    await this.studio?.keepCurrent();
    await this.reconcileIdentity();
  }
  applyTemplate(template: PromptTemplate) {
    if (this.inFlight()) {
      this.notify('请先等待当前图片任务完成。');
      return;
    }
    const issue = applyIssue(template, false);
    if (issue) {
      this.notify(issue);
      return;
    }
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
  async deleteWork(work: Work): Promise<boolean> {
    if (!this.store || this.deletingWork()) return false;
    if (this.inFlight()) {
      this.deleteErrorWork.set(work.jobId);
      this.deleteError.set('当前任务处理期间，删除暂不可用，请稍后重试。');
      return false;
    }
    if (!window.confirm(`删除本机图片「${work.prompt.slice(0, 80)}」及其记录？下载过的文件不受影响。`)) return false;
    this.deletingWork.set(work.jobId);
    this.deleteError.set('');
    this.deleteErrorWork.set(null);
    const epoch = this.epoch,
      store = this.store;
    try {
      await store.delete(work.jobId);
      if (epoch !== this.epoch) return false;
      this.imageDownloads.update(current => new Map([...current].filter(([key]) => !key.startsWith(`${work.jobId}:`))));
      if (this.resultUrl() && !this.resultBlob) this.revokeResult();
      if (this.job()?.id === work.jobId) {
        this.revokeResult();
        this.job.set(null);
        this.saved.set(false);
      }
      this.notify('已删除本机图片。');
      if (this.storageMessage().startsWith('删除未完成')) this.storageMessage.set('');
      return true;
    } catch {
      if (epoch === this.epoch) {
        this.deleteErrorWork.set(work.jobId);
        this.deleteError.set('删除未完成，原图保留，请重试。');
        this.storageMessage.set('删除未完成，原图保留，请重试。');
      }
      return false;
    } finally {
      this.deletingWork.set(null);
    }
  }
  /** The viewer reads its own original, so the grid can release off-screen previews while it is open. */
  openViewer(work: Work, event: Event) {
    this.dialogTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.viewerTotal.set(this.libraryPage().total ?? this.libraryPage().works.length);
    void this.showWork(work);
  }
  stepViewer(offset: number) {
    if (!this.viewer() || this.viewerPosition() < 1 || this.viewerPaging() || this.deletingWork()) return;
    const position = this.viewerPosition() + offset;
    if (position < 1 || position > this.viewerTotal()) return;
    const page = Math.floor((position - 1) / 24) + 1,
      index = (position - 1) % 24,
      current = this.libraryPage();
    this.viewerMessage.set('');
    if (current.page === page && !current.loading && !current.error && current.works[index]) {
      void this.showWork(current.works[index]);
      return;
    }
    this.viewerPageTarget = { page, index };
    this.viewerPaging.set(true);
    this.library?.query({ ...this.libraryFilters, offset: (page - 1) * 24 });
  }
  retryViewer() {
    const current = this.viewer();
    if (current) void this.showWork(current.work);
  }
  closeViewer() {
    ++this.viewerGeneration;
    this.releaseViewerImage?.();
    this.releaseViewerImage = undefined;
    this.viewer.set(null);
    this.viewerPageTarget = null;
    this.viewerPaging.set(false);
    this.viewerOriginal.set(false);
  }
  async deleteViewed() {
    const current = this.viewer(),
      generation = this.viewerGeneration;
    if (!current || !(await this.deleteWork(current.work))) return;
    if (generation === this.viewerGeneration && this.viewer()?.work === current.work) this.closeViewer();
  }
  hasLocalCopy(task: LocalTask) {
    return this.works().some(work => work.jobId === task.id && work.status === 'saved');
  }
  async loadWorkInfo(work: Work, event: Event) {
    if ((event.target as HTMLDetailsElement).open) await this.fetchWorkInfo(work, true);
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
      this.filtersApplied.set(Object.values(filters).some(value => value.trim()));
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
    this.filtersApplied.set(false);
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
    if (this.view() !== 'library' && this.view() !== 'studio') return;
    if (!this.libraryPage().works.some(item => item.viewKey === work.viewKey)) return;
    this.library?.setVisible(work.jobId, visible);
  }
  retryWork(work: Work) {
    this.library?.retry(work.jobId);
  }
  async downloadImage(event: Event, url: string, name: string, jobId?: string) {
    const store = this.store,
      blob = this.resultBlob;
    try {
      await interceptDownload(event, url, name, async () => {
        if (jobId && store) return (await store.backupImage(jobId)).blob;
        if (blob) return blob;
        throw new Error('原图暂不可读。');
      });
    } catch {
      this.notify('文件保存未完成，请重试；原图保留。');
    }
  }
  async exportBackup() {
    if (!this.store || this.inFlight() || this.dataBusy()) return;
    this.dataBusy.set(true);
    this.dataMessage.set('正在校验全部已保存图片并打包 ZIP…');
    try {
      await navigator.locks.request(`aiao-local-generation-${this.profileId}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('另一标签页正在生成，请稍后备份。');
        await this.studio?.flush();
        await this.readTasks();
        const { createLocalBackup } = await import('./local-backup');
        if (!this.store) throw new Error('本机工作区不可用。');
        const blob = await createLocalBackup(this.store, this.providers(), this.providerId(), this.history());
        if (!(await saveDownload(blob, `aiao-backup-${new Date().toISOString().slice(0, 10)}.zip`))) {
          this.dataMessage.set('已取消导出，原数据保留。');
          return;
        }
        this.dataMessage.set(
          'ZIP 备份已导出，包含全部已保存原图和 backup.json（草稿、配置及任务记录），不含 API Key。'
        );
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
      if (!window.confirm(`导入备份「${file.name}」并切换到独立工作区？原工作区会保留，可在本机数据中切回。`)) {
        this.dataMessage.set('已取消导入，当前工作区未更改。');
        return;
      }
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
          rememberBackupWorkspace(
            localStorage,
            this.profileId,
            nextId,
            file.name.slice(0, 200),
            new Date().toISOString()
          );
          rememberBackupSelection(
            sessionStorage,
            nextId,
            this.backupIdentity(),
            '备份已导入当前工作区。原工作区已保留，可在下方切回。'
          );
          await persistNativeProfile(nextId);
          localStorage.setItem('aiao-local-profile-v1', nextId);
          localStorage.removeItem(stagingKey);
          history.replaceState(null, '', `${paths.providers}#data`);
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
  async restoreBackupWorkspace(id: string) {
    if (!this.store || this.localStatus() !== 'ready' || this.inFlight() || this.providerBusy()) return;
    try {
      const workspace = readBackupWorkspaces(localStorage).find(item => item.id === id && item.id !== this.profileId);
      if (!workspace) throw new Error('未找到可返回的本机工作区。');
      const identity = this.backupIdentity();
      if (!identity) throw new Error('账号正在验证，请稍后切换本机工作区。');
      if (!window.confirm(`切换到「${workspace.label}」？当前草稿和作品会保留，两边内容不会合并。`)) return;
      this.dataBusy.set(true);
      this.dataMessage.set('正在打开所选本机工作区…');
      await navigator.locks.request(`aiao-local-generation-${this.profileId}`, { ifAvailable: true }, lock => {
        if (!lock) throw new Error('另一标签页正在生成，请稍后切换。');
        return navigator.locks.request(`aiao-local-generation-${id}`, { ifAvailable: true }, targetLock => {
          if (!targetLock) throw new Error('目标工作区正在生成，请稍后切换。');
          return this.switchBackupWorkspace(workspace, identity);
        });
      });
    } catch (error) {
      this.dataMessage.set(error instanceof Error ? error.message : '工作区切换失败，当前数据保留。');
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
  onWorkspaceChanged(event: StorageEvent) {
    if (event.key === this.imageSyncKey() && event.newValue === null) {
      this.resetImageSync();
      this.imageSyncEnabled.set(false);
      return;
    }
    if (event.key === this.syncPauseKey() && event.newValue === '1') {
      this.product?.pause();
      this.resetImageSync();
      this.imageSyncEnabled.set(false);
      this.syncPaused.set(true);
      return;
    }
    if (event.key !== 'aiao-local-profile-v1' || event.newValue === this.profileId) return;
    void this.followWorkspace(event.newValue).catch(() =>
      this.storageMessage.set('工作区已变化；当前输入尚未保存，请处理后刷新。')
    );
  }
  async enableSync() {
    const product = this.product,
      version = this.identityVersion;
    if (!product || !this.syncReady()) {
      this.authMessage.set('本机工作区尚未就绪，请稍后启用同步。');
      return;
    }
    this.authMessage.set('');
    try {
      await verifySyncTarget(await this.adminApi.authorization());
      if (version !== this.identityVersion || product !== this.product || this.targetKind() !== 'platform') return;
      this.syncPaused.set(false);
      await product.requestEnable();
    } catch (error) {
      this.authMessage.set(error instanceof Error ? error.message : '平台同步服务检查失败。');
    }
  }
  async confirmSync() {
    localStorage.removeItem(this.syncPauseKey());
    this.syncPaused.set(false);
    await this.product?.confirmEnable();
    this.restoreImageSyncPreference();
  }
  cancelSync() {
    this.product?.cancelEnable();
  }
  async synchronize() {
    localStorage.removeItem(this.syncPauseKey());
    this.syncPaused.set(false);
    await this.product?.synchronize();
    this.restoreImageSyncPreference();
  }

  async enableImageSync(scope: 'future' | 'existing') {
    if (this.imageSyncBusy() || this.settingsBusy() || this.targetKind() !== 'platform' || !this.syncInitialized())
      return;
    const text =
      scope === 'existing' ?
        '这会上传当前工作区已保存的 PNG/JPEG 原图，之后保存的新图也会自动上传。原图会保存到平台账号的私有云存储；API Key 和本机路径不会上传。继续吗？'
      : '之后保存的新 PNG/JPEG 会自动上传到平台账号的私有云存储；已有图片不会补传。继续吗？';
    if (!window.confirm(text)) return;
    this.imageSyncBusy.set(true);
    this.imageSyncMessage.set('正在确认图片同步范围…');
    const signal = this.imageSyncScope.signal;
    try {
      await verifyImageSyncTarget(await this.adminApi.authorization());
      // 确认期间换了目标、账号或工作区：这次确认不能记到新身份名下。
      signal.throwIfAborted();
      localStorage.setItem(this.imageSyncKey(), scope);
      this.imageSyncEnabled.set(true);
      const controller = await this.imageSyncController(signal);
      const images =
        scope === 'existing' ? (await this.requireStore().list()).filter(image => image.status === 'saved') : [];
      for (let index = 0; index < images.length; index++) {
        signal.throwIfAborted();
        this.imageSyncProgress.set(`${index}/${images.length}`);
        await controller.upload(images[index].jobId);
      }
      signal.throwIfAborted();
      this.imageSyncProgress.set(images.length ? `${images.length}/${images.length}` : '');
      this.imageSyncMessage.set(
        scope === 'existing' ?
          images.length ?
            `已同步 ${images.length} 张原图。`
          : '当前没有可上传的本机原图，已开启以后保存图片的自动同步。'
        : '已确认以后保存的图片自动同步；已有图片未上传。'
      );
    } catch (error) {
      if (this.currentImageSync(signal))
        this.imageSyncMessage.set(error instanceof Error ? error.message : '图片同步未完成，本机原图保留。');
    } finally {
      if (this.currentImageSync(signal)) this.imageSyncBusy.set(false);
    }
  }
  async stopImageSync() {
    if (!window.confirm('停止以后图片自动上传？平台账号里的原图和本机原图都保留。')) return;
    this.resetImageSync();
    localStorage.removeItem(this.imageSyncKey());
    this.imageSyncEnabled.set(false);
    this.imageSyncMessage.set('图片自动同步已停止；远端原图未删除。');
  }
  async restoreRemoteWork(work: PublicWorkPayload) {
    if (this.imageSyncBusy() || this.settingsBusy() || this.targetKind() !== 'platform') return;
    const signal = this.imageSyncScope.signal;
    const task =
      this.history().find(item => item.id === work.jobId) ??
      ({
        id: work.jobId,
        request: {
          kind: 'image',
          operation: 'text-to-image',
          providerInstanceId: work.providerInstanceId,
          providerRevision: 1,
          modelId: work.modelId,
          prompt: work.prompt,
          aspectRatio:
            work.width > work.height ? 'landscape'
            : work.height > work.width ? 'portrait'
            : 'square'
        },
        status: 'completed',
        createdAt: work.createdAt,
        updatedAt: work.createdAt,
        delivery: { status: 'available', expiresAt: null, acknowledgedAt: null },
        failure: null
      } as LocalTask);
    this.imageSyncBusy.set(true);
    this.setImageDownloadState(work, { status: 'loading', message: '正在从平台账号取回原图…' });
    try {
      await (await this.imageSyncController(signal)).download(work.jobId, work.sha256, task);
      if (!this.currentImageSync(signal)) return;
      await this.readTasks();
      if (!this.currentImageSync(signal)) return;
      this.retryLibrary();
      this.setImageDownloadState(work, { status: 'saved', message: '原图已校验并保存到本机。' });
      this.notify('原图已校验并保存到本机。');
    } catch (error) {
      if (this.currentImageSync(signal))
        this.setImageDownloadState(work, {
          status: 'failed',
          message: error instanceof Error ? error.message : '原图取回失败，本机数据保留。'
        });
    } finally {
      if (this.currentImageSync(signal)) this.imageSyncBusy.set(false);
    }
  }
  imageDownloadState(work: Pick<PublicWorkPayload, 'jobId' | 'sha256'>): ImageDownloadState | null {
    return this.imageDownloads().get(`${work.jobId}:${work.sha256}`) ?? null;
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
  async inspectRemoteQuota() {
    try {
      const data = (await this.adminApi.manageSync('status')) as {
        records: number;
        active: number;
        bytes: number;
        recordLimit: number;
        byteLimit: number;
      };
      this.remoteQuota.set(
        `远端当前记录 ${data.records}/${data.recordLimit}（有效 ${data.active}），正文 ${Math.ceil(data.bytes / 1024)} KiB / ${data.byteLimit / 1024 / 1024} MiB。历史、冲突和删除标记持续保留；此配额仅统计元数据，原图存储单独计算。`
      );
    } catch {
      this.authMessage.set('平台同步配额暂不可读，请稍后重试或联系服务方。');
    }
  }
  async exportRemoteMetadata() {
    try {
      const data = await this.adminApi.manageSync('export');
      await saveDownload(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'aiao-sync-metadata.json');
    } catch {
      this.authMessage.set('远端导出未完成，本机数据保留。');
    }
  }
  async deleteRemoteMetadata() {
    if (
      this.settingsBusy() ||
      !window.confirm(
        '停止此设备同步并删除远端当前元数据？本机内容保留。删除标记、冲突版本与历史日志继续保留，其他已同步设备会收到删除。以后恢复同步可能合并或产生冲突。此操作不删除原图，也不是彻底清除历史。'
      )
    )
      return;
    this.stopSync();
    try {
      await this.adminApi.manageSync('delete', crypto.randomUUID());
      this.authMessage.set('远端当前记录已标记删除，此设备同步已停止；本机内容、远端历史与删除标记保留。');
    } catch {
      this.authMessage.set('远端删除尚未确认；此设备已停止同步，本机内容保留。');
    }
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
  keyLabel(p: LocalProvider) {
    return (
      !this.keyIds().has(p.id) ? '未填写 Key'
      : p.rememberKey ? 'Key 已保存在本机'
      : 'Key 仅本次会话'
    );
  }
  formatDate(value: string | undefined) {
    return formatTime(value, dateFormat);
  }
  formatDateTime(value: string | undefined) {
    return formatTime(value, dateTimeFormat);
  }
  private transitionTemplate(template: PromptTemplate | null, trigger: HTMLElement | null) {
    const detailImage = () => document.querySelector<HTMLImageElement>('.template-panel .media-stage img');
    const coverImage = () => trigger?.querySelector<HTMLImageElement>('.feed-cover img') ?? null;
    const source = template ? coverImage() : detailImage();
    void transitionImage(source, () => {
      if (!template) document.querySelector<HTMLDialogElement>('.template-panel')?.close();
      this.dialogTrigger = trigger;
      this.detail.set(template);
      return new Promise(resolve => {
        afterNextRender({ read: () => resolve(template ? detailImage() : coverImage()) }, { injector: this.injector });
      });
    }).then(() => {
      if (!template && trigger?.isConnected) trigger.focus();
    });
  }
  private backupIdentity(): string | null {
    if (!['signed-in', 'signed-out'].includes(this.authStatus())) return null;
    return `${this.authStatus()}:${this.auth?.config.url ?? ''}:${this.authUser()?.id ?? ''}`;
  }
  private async switchBackupWorkspace(workspace: BackupWorkspace, identity: string) {
    await navigator.locks.request('aiao-local-profile-v1', async () => {
      if (localStorage.getItem('aiao-local-profile-v1') !== this.profileId)
        throw new Error('工作区已变化，请刷新后重试。');
      const metadata = this.registryStore;
      if (!metadata) throw new Error('本机工作区目录尚未就绪。');
      const root = await metadata.rootOf(workspace.id);
      const registry = new WorkspaceRegistry(root, {
        read: () => metadata.read(root),
        write: (payload, revision) => metadata.write(root, payload, revision),
        exclusive: operation => operation()
      });
      const state = await registry.read();
      const profile = state.profiles.find(item => item.id === workspace.id);
      if (!profile || !this.canActivate(profile))
        throw new Error('请先退出当前账号，或登录此工作区绑定的账号后再切换。');
      await this.studio?.flush();
      const { LocalMediaStore } = await import('../local-data/index');
      const target = await LocalMediaStore.open(workspace.id);
      await target.close();
      if (identity !== this.backupIdentity() || !this.canActivate(profile))
        throw new Error('账号已变化，未切换本机工作区，请重试。');
      if (state.selectedId !== workspace.id) await registry.selectProfile(workspace.id, state.generation);
      rememberBackupWorkspace(localStorage, this.profileId, workspace.id, workspace.label, new Date().toISOString());
      rememberBackupSelection(sessionStorage, workspace.id, identity, '已切回所选本机工作区。草稿和作品仍分别保留。');
      await persistNativeProfile(workspace.id);
      localStorage.setItem('aiao-local-profile-v1', workspace.id);
      history.replaceState(null, '', `${paths.providers}#data`);
      location.reload();
    });
  }
  private restoreImageSyncPreference() {
    this.imageSyncEnabled.set(
      this.targetKind() === 'platform' &&
        this.authStatus() === 'signed-in' &&
        this.syncInitialized() &&
        !this.syncPaused() &&
        localStorage.getItem(this.imageSyncKey()) !== null
    );
  }
  private imageSyncKey(): string {
    return `aiao-media-image-sync-v1:${encodeURIComponent(this.auth?.config.url ?? '')}:${this.authUser()?.id ?? ''}:${this.profileId}`;
  }
  /** 每次传输按当前目标、项目账号和工作区新建控制器，不跨目标复用；作用域中止时在途请求一并取消。 */
  private async imageSyncController(signal = this.imageSyncScope.signal): Promise<ImageSyncController> {
    const store = this.requireStore(),
      profile = this.currentProfile(),
      access = await this.auth?.authorizeProduct();
    // 授权期间换了目标、账号或工作区：这次授权属于旧目标，不能和新的工作区拼在一起。
    signal.throwIfAborted();
    if (
      !profile?.binding?.initialized ||
      !profile.binding.remoteWorkspaceId ||
      !access ||
      profile.account?.userId !== access.userId ||
      profile.account.projectOrigin !== access.config.url ||
      this.targetKind() !== 'platform'
    )
      throw new Error('请先登录平台账号并开启工作区同步。');
    return new ImageSyncController(store, access, profile.binding.remoteWorkspaceId, undefined, signal);
  }
  private resetImageSync() {
    this.imageSyncScope.abort(new Error('同步目标、账号或工作区已变化，旧的图片传输已停止；本机原图保留。'));
    this.imageSyncScope = new AbortController();
    this.imageSyncBusy.set(false);
    this.imageUploads.set(0);
    this.imageDownloads.set(new Map());
  }
  private setImageDownloadState(work: PublicWorkPayload, state: ImageDownloadState) {
    this.imageDownloads.update(current => new Map(current).set(`${work.jobId}:${work.sha256}`, state));
  }
  private currentImageSync(signal: AbortSignal): boolean {
    return !this.disposed && signal === this.imageSyncScope.signal && !signal.aborted;
  }
  private async syncSavedImage(task: LocalTask) {
    if (!this.imageSyncEnabled() || this.targetKind() !== 'platform' || task.status !== 'completed') return;
    const signal = this.imageSyncScope.signal;
    this.imageUploads.update(count => count + 1);
    try {
      await (await this.imageSyncController(signal)).upload(task.id);
      if (this.currentImageSync(signal)) this.imageSyncMessage.set('新作品原图已同步到平台账号。');
    } catch (error) {
      if (this.currentImageSync(signal))
        this.imageSyncMessage.set(error instanceof Error ? error.message : '新作品图片同步失败，本机原图保留。');
    } finally {
      if (this.currentImageSync(signal)) this.imageUploads.update(count => count - 1);
    }
  }
  private releaseLibraryPreviews() {
    for (const work of this.libraryPage().works) this.library?.setVisible(work.jobId, false);
  }
  private syncKeyIds() {
    this.keyIds.set(new Set([...this.keys.keys(), ...this.rememberedKeys.keys()]));
  }
  private startElapsed(started = Date.now()) {
    this.stopElapsed();
    this.elapsedSeconds.set(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    this.elapsedTimer = setInterval(() => this.elapsedSeconds.set(Math.floor((Date.now() - started) / 1000)), 1000);
  }
  private stopElapsed() {
    clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
  }
  /** The stacked narrow layout puts the result below the form, so progress and outcomes are scrolled into view. */
  private revealResult() {
    afterNextRender(
      () => {
        const panel = document.querySelector<HTMLElement>('.result-panel'),
          composer = document.querySelector<HTMLElement>('.composer');
        if (!panel || !composer || panel.offsetTop <= composer.offsetTop) return;
        const top = panel.getBoundingClientRect().top;
        if (top >= 0 && top < innerHeight * 0.4) return;
        panel.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
      },
      { injector: this.injector }
    );
  }
  private async showWork(work: Work) {
    const store = this.store,
      epoch = this.epoch;
    this.releaseViewerImage?.();
    this.releaseViewerImage = undefined;
    this.viewerMessage.set('');
    this.deleteError.set('');
    this.viewerOriginal.set(false);
    const page = this.libraryPage(),
      index = page.works.findIndex(entry => entry.jobId === work.jobId);
    if (index >= 0) this.viewerPosition.set((page.page - 1) * 24 + index + 1);
    this.viewer.set({ work, image: null, failed: false });
    if (!store) return;
    void this.fetchWorkInfo(work, false);
    try {
      const image = await store.previewImage(work.jobId);
      if (epoch !== this.epoch || this.viewer()?.work !== work) {
        store.release(image.url);
        return;
      }
      this.releaseViewerImage = () => store.release(image.url);
      this.viewer.set({ work, image, failed: false });
    } catch {
      if (epoch === this.epoch && this.viewer()?.work === work) this.viewer.set({ work, image: null, failed: true });
    }
  }
  private async fetchWorkInfo(work: Work, report: boolean) {
    if (work.info || !this.store) return;
    const epoch = this.epoch;
    try {
      const info = await this.store.imageInfo(work.jobId);
      if (epoch === this.epoch)
        this.libraryPage.update(page => ({
          ...page,
          works: page.works.map(current => (this.sameWorkFile(current, work) ? { ...current, info } : current))
        }));
    } catch {
      if (report && epoch === this.epoch && this.libraryPage().works.some(current => this.sameWorkFile(current, work)))
        this.notify('本机无可读取的原图，无法核验文件信息。');
    }
  }
  private syncPauseKey() {
    return `aiao-media-sync-paused-v1:${encodeURIComponent(this.auth?.config.url ?? '')}:${this.authUser()?.id ?? ''}:${this.profileId}`;
  }
  private configureTarget(target: SyncTarget) {
    this.unsubscribeAuth?.();
    this.auth?.dispose();
    this.auth = null;
    this.product?.pause();
    this.resetImageSync();
    ++this.identityVersion;
    this.identitySelection = null;
    this.authStatus.set('signed-out');
    this.authUser.set(null);
    this.authConfigured.set(target.config !== null);
    this.targetKind.set(target.kind);
    this.imageSyncEnabled.set(false);
    this.imageSyncMessage.set('');
    this.imageSyncProgress.set('');
    this.syncReady.set(false);
    if (!target.config) return;
    this.auth = new SupabaseAuthClient(target.config);
    this.unsubscribeAuth = this.auth.subscribe(state => {
      // 令牌轮换会以同一账号重新发布 signed-in，不打断传输；退出或换账号才让旧传输失效。
      if (state.status !== 'signed-in' || state.user?.id !== this.authUser()?.id) {
        this.resetImageSync();
        this.imageSyncEnabled.set(false);
      }
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
    if (target.kind === 'platform') void this.loadCatalog();
  }
  private async checkProviderPolicy(provider: LocalProvider): Promise<void> {
    if (!this.authConfigured() || this.targetKind() !== 'platform') return;
    const response = await fetch(apiEndpoint('/api/provider-policies'), {
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
      const response = await fetch(apiEndpoint('/api/templates'), {
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
      this.profileId = await navigator.locks.request('aiao-local-profile-v1', async () => {
        const key = 'aiao-local-profile-v1';
        const existing = localStorage.getItem(key);
        if (existing && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))
          throw new Error('Invalid local profile');
        const id = await initialProfile(existing ?? crypto.randomUUID());
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
      {
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
                .filter(
                  task =>
                    task.channel !== 'platform' &&
                    ['processing', 'completed', 'failed', 'needs_review'].includes(task.status)
                )
                .map(async task => ({
                  id: await productRecordId(workspaceId, 'work', task.id),
                  taskId: task.id,
                  workspaceId,
                  model: task.request.modelId,
                  providerId: task.request.providerInstanceId,
                  channel: task.channel === 'proxy' ? ('proxy' as const) : ('direct' as const),
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
        this.subscriptions.add(
          this.product.state$.subscribe(state => {
            this.sync.set(state);
            if (state.status === 'synced') this.lastSyncedAt.set(new Date().toLocaleString());
          })
        );
        this.product.selection();
      }
      await this.acceptRegistry(this.registryState);
      try {
        this.backupWorkspaceHistory.set(readBackupWorkspaces(localStorage));
        const selection = readBackupSelection(sessionStorage);
        if (selection?.profileId === this.profileId) this.dataMessage.set(selection.message);
      } catch (error) {
        this.dataMessage.set(error instanceof Error ? error.message : '本机恢复记录不可读，现有工作区仍可使用。');
      }
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
    this.resetImageSync();
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
    store.activateDevTools();
    this.profileId = profile.id;
    this.currentProfileId.set(profile.id);
    this.refreshProfiles();
    this.settingsRevision = null;
    this.closeViewer();
    this.keys.clear();
    this.rememberedKeys.clear();
    this.syncKeyIds();
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
    this.filtersApplied.set(false);
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
      profile.account.projectOrigin === this.auth?.config.url
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
      if (state.selectedId === this.profileId) {
        await persistNativeProfile(this.profileId);
        localStorage.setItem('aiao-local-profile-v1', this.profileId);
      }
    });
    this.refreshProfiles();
    this.product?.selection();
  }
  private refreshProfiles(): void {
    const account = this.currentProfile()?.account;
    this.identityBlocked.set(
      this.authStatus() === 'signed-in' &&
        !!account &&
        (account.userId !== this.authUser()?.id || account.projectOrigin !== this.auth?.config.url)
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
      const explicitSelection = consumeBackupSelection(sessionStorage, this.profileId, identityKey);
      if (explicitSelection && !this.identityBlocked()) await this.workspaceSession.follow();
      else
        await this.workspaceSession.select(
          this.authStatus() === 'signed-in' && user && config ? { userId: user.id, projectOrigin: config.url } : null
        );
      await this.attachment;
      if (version !== this.identityVersion || this.disposed) return;
      this.identitySelection = identityKey;
      this.refreshProfiles();
      this.syncReady.set(this.product !== undefined);
      this.syncPaused.set(localStorage.getItem(this.syncPauseKey()) === '1');
      this.restoreImageSyncPreference();
      if (!this.syncPaused() && this.authStatus() === 'signed-in' && this.currentProfile()?.binding?.initialized)
        void this.product?.resume();
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
      this.syncKeyIds();
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
    this.syncKeyIds();
  }
  /** Follows one task to a settled state: a saved image, a definite failure, or a locked uncertain outcome. */
  private async runTask(
    task: LocalTask,
    produce: (signal: AbortSignal) => Promise<Blob>,
    timeoutMs: number | null
  ): Promise<void> {
    this.job.set(task);
    this.revokeResult();
    this.saved.set(false);
    this.startElapsed(Date.parse(task.createdAt));
    this.revealResult();
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.lifetime.signal.addEventListener('abort', abort, { once: true });
    const timer = timeoutMs === null ? undefined : setTimeout(abort, timeoutMs);
    try {
      const blob = await produce(controller.signal);
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
  }
  private async readTasks() {
    const store = this.store,
      epoch = this.epoch;
    const [row, relay] = await Promise.all([store?.preference('tasks-v1'), store?.preference('relay-tasks-v1')]);
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
    this.tickets = relayTickets(relay?.payload ?? null);
    this.history.set(tasks);
    const unresolved = tasks.find(t => !t.acknowledged && ['processing', 'needs_review'].includes(t.status));
    if (unresolved?.status === 'processing' && this.tickets[unresolved.id] && unresolved.request.aspectRatio) {
      // The relay keeps working without this page; continue the task instead of asking for a review.
      this.job.set(unresolved);
      this.uncertain.set(false);
      this.resumeRelay(unresolved);
    } else if (unresolved) {
      this.job.set({ ...unresolved, status: 'needs_review' });
      this.uncertain.set(true);
    } else {
      this.uncertain.set(false);
      const current = this.job();
      if (current && ['processing', 'needs_review'].includes(current.status)) this.job.set(null);
    }
    if (Object.keys(this.tickets).some(id => this.settledTask(id))) this.releaseRelay();
    // The task's old saved flag can outlive a deletion or lag journal recovery.
    // The library compares tasks with readable works instead of trusting it.
  }
  private async writeTask(task: LocalTask, ticket: RelayTicket | null = null) {
    const store = this.store,
      epoch = this.epoch;
    if (!store) throw new Error('本机记录不可用，未发送请求。');
    const [row, relay] = await Promise.all([
      store.preference('tasks-v1'),
      ticket ? store.preference('relay-tasks-v1') : null
    ]);
    const tasks: LocalTask[] = row ? JSON.parse(row.payload) : [];
    const next = [task, ...tasks.filter(t => t.id !== task.id)].slice(0, 100);
    await store.savePreferences(
      [
        { key: 'tasks-v1', payload: JSON.stringify(next), revision: row?.revision ?? null },
        // Written with the task, so a reload never finds a relay task without its ticket.
        ...(ticket ?
          [
            {
              key: 'relay-tasks-v1',
              payload: JSON.stringify({ ...relayTickets(relay?.payload ?? null), [task.id]: ticket }),
              revision: relay?.revision ?? null
            }
          ]
        : [])
      ],
      true
    );
    if (!this.disposed && epoch === this.epoch && store === this.store) this.history.set(next);
  }
  /** A ticket is released only once its task is in the journal and no longer processing. */
  private settledTask(id: string): boolean {
    const status = this.history().find(task => task.id === id)?.status;
    return status !== undefined && status !== 'processing';
  }
  /** Continues an unsettled relay task once no other tab of this workspace is generating or resuming. */
  private resumeRelay(task: LocalTask): void {
    if (this.relayResuming === task.id) return;
    this.relayResuming = task.id;
    const epoch = this.epoch;
    navigator.locks
      .request(`aiao-local-generation-${this.profileId}`, { signal: this.lifetime.signal }, async () => {
        if (epoch !== this.epoch || this.disposed) return;
        this.sending.set(true);
        try {
          await this.readTasks();
          await this.continueRelay(task.id);
        } finally {
          this.sending.set(false);
          this.stopElapsed();
          if (this.resultUrl() || this.panelError()) this.revealResult();
          this.releaseRelay();
        }
      })
      .catch(() => {
        if (!this.disposed) this.storageMessage.set('代理任务续接失败，请刷新页面重试；任务不会重复生成。');
      })
      .finally(() => {
        if (this.relayResuming === task.id) this.relayResuming = null;
      });
  }
  private async continueRelay(id: string): Promise<void> {
    // Another tab may have settled the task while this one waited for the lock.
    const task = this.history().find(item => item.id === id),
      ticket = this.tickets[id],
      ratio = task?.request.aspectRatio;
    if (task?.status !== 'processing' || !ticket || !ratio) return;
    await this.runTask(
      task,
      signal =>
        runRelayTask({ id, ticket, ratio, signal, dispatch: null, accepted: () => this.acceptRelay(id, ticket) }),
      null
    );
  }
  private async acceptRelay(id: string, ticket: RelayTicket): Promise<void> {
    try {
      await this.writeTickets(tickets => ({ ...tickets, [id]: { ...ticket, accepted: true } }));
    } catch {
      this.storageMessage.set('本站已接单，但回执未能写入本机；图片保存前请保留当前页面。');
    }
  }
  private async writeTickets(update: (tickets: Record<string, RelayTicket>) => Record<string, RelayTicket>) {
    const store = this.store;
    if (!store) throw new Error('本机记录不可用。');
    const row = await store.preference('relay-tasks-v1');
    await store.savePreference(
      'relay-tasks-v1',
      JSON.stringify(update(relayTickets(row?.payload ?? null))),
      row?.revision ?? null
    );
  }
  /** Removes settled tasks from the relay, then forgets their tickets. A failed removal retries on a later read. */
  private releaseRelay(): void {
    if (this.disposed) return;
    if (this.releasing) {
      this.releaseAgain = true;
      return;
    }
    this.releasing = true;
    this.releaseSettled()
      .catch(() => {
        if (!this.disposed) this.storageMessage.set('本机代理任务记录更新失败，请刷新后重试。');
      })
      .finally(() => {
        this.releasing = false;
        if (!this.releaseAgain) return;
        this.releaseAgain = false;
        this.releaseRelay();
      });
  }
  private async releaseSettled(): Promise<void> {
    const store = this.store;
    if (!store) return;
    const settled = Object.entries(relayTickets((await store.preference('relay-tasks-v1'))?.payload ?? null)).filter(
      ([id]) => this.settledTask(id)
    );
    const released: string[] = [];
    // Bounded by this page's lifetime and 30 seconds; AbortSignal.any is missing from older desktop WebKit.
    const controller = new AbortController();
    const stop = () => controller.abort();
    this.lifetime.signal.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 30000);
    try {
      for (const [id, ticket] of settled)
        await deleteRelayTask(id, ticket, controller.signal).then(
          () => released.push(id),
          // The relay keeps the task until it expires; the ticket stays so a later read can retry.
          () => undefined
        );
    } finally {
      clearTimeout(timer);
      this.lifetime.signal.removeEventListener('abort', stop);
    }
    if (!released.length || store !== this.store) return;
    await this.writeTickets(tickets =>
      Object.fromEntries(Object.entries(tickets).filter(([id]) => !released.includes(id)))
    );
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
    this.syncKeyIds();
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
    if (this.viewer() && page.total !== null) this.viewerTotal.set(page.total);
    this.acceptViewerPage(page);
  }
  private acceptViewerPage(page: LibraryState): void {
    const target = this.viewerPageTarget;
    if (page.loading || !this.viewer()) return;
    if (!target) {
      if (!page.error) this.refreshViewerPosition(page);
      return;
    }
    this.viewerPageTarget = null;
    this.viewerPaging.set(false);
    if (page.error) {
      this.viewerMessage.set('作品读取失败，当前原图保留，请再次切换重试。');
      return;
    }
    const next = page.works[target.index];
    if (page.page !== target.page || !next) {
      this.viewerMessage.set('作品列表已变化，请关闭大图后重新选择。');
      return;
    }
    void this.showWork(next);
  }
  private refreshViewerPosition(page: LibraryState): void {
    const index = page.works.findIndex(work => work.jobId === this.viewer()?.work.jobId);
    this.viewerPosition.set(index < 0 ? 0 : (page.page - 1) * 24 + index + 1);
    this.viewerMessage.set(index < 0 ? '作品列表已变化，当前作品已不在此页；已加载的预览保留，请关闭后重新选择。' : '');
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
