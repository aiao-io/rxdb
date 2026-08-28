import { REMOTE_ENTITY_INVALIDATED_EVENT, RxDB } from '@aiao/rxdb';
import type { RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { useFind } from '@aiao/rxdb-angular';
import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChildren
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  changeFeedStats,
  clearChangeFeedStats,
  onChangeFeedStats,
  type ChangeFeedStats
} from './change-feed-diagnostics';
import { resolveApiBaseUrl, resolveChangeFeedEnabled, resolveDiagnosticsEnabled } from './demo-config';
import {
  clearDatabase,
  clearRequestLog,
  readControlState,
  readRequestLog,
  resetDatabase,
  setExposeEtag,
  setForcedStatus,
  setOffline,
  setPageMode,
  type DemoControlState,
  type DemoRequestLogEntry
} from './demo-control';
import { clearEtagDiagnostics, etagDiagnostics, onEtagDiagnostic, type EtagDiagnosticEntry } from './etag-diagnostics';
import { buildFilterRules, emptyFilterState, type RecipeFilterState, type RecipeRuleGroup } from './filter-rules';
import { clampPage, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, pageCount } from './paging';
import { Recipe } from './recipe';
import { clearTraffic, lastTransportStatus, onTraffic, trafficEntries, type TrafficEntry } from './traffic-recorder';

/** 新建表单的初值。 */
const emptyDraft = (): { title: string; status: string; price: string; tag: string } => ({
  title: '',
  status: 'published',
  price: '0',
  tag: ''
});

/** 主面板上的三个视图。取值同时是 DOM 里 `tab-*` / `tabpanel-*` 的后缀。 */
type MainTab = 'recipe' | 'traffic' | 'etag';

/**
 * 方向键在页签之间怎么走。
 *
 * @remarks
 * 左右**环形**移动而不是撞到两端停住：三个页签排成一行，「最后一个再往右」除了
 * 回到第一个没有别的合理去处，停住只会让人以为键盘压根没生效。
 */
const TAB_KEY_MOVES: Record<string, ((index: number, count: number) => number) | undefined> = {
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowRight: (index, count) => (index + 1) % count,
  End: (index, count) => count - 1,
  Home: () => 0
};

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, JsonPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  readonly #rxdb = inject(RxDB);
  readonly #destroyRef = inject(DestroyRef);

  /**
   * HTTP 适配器实例，`ngOnInit` 里解析出来，是通知开关唯一的落点。
   *
   * @remarks
   * 走 `rxdb.getAdapter('http')` 而不是从 `setup_rxdb_http.ts` 导出一个模块级单例：
   * 那个文件已经有一份 `rxdb` 单例了，再加一份 adapter 单例，两者的生命周期迟早分叉。
   * `getAdapter` 自带实例缓存，问多少次都是同一个。
   */
  #httpAdapter: RxDBAdapterHttp | undefined;

  /**
   * 三个页签按钮。方向键换了页签之后，焦点得跟过去。
   *
   * @remarks
   * 这里用 TS 的 `private` 而不是全文其余地方的 `#`：Angular 的信号查询拒绝落在
   * ES 私有字段上（编译期报错，不是运行时才发现）。
   */
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** 后端地址。`?api=` 可覆盖，默认 `http://127.0.0.1:4301/v1`。 */
  readonly baseUrl = resolveApiBaseUrl(typeof location === 'undefined' ? '' : location.search);

  // ---- 过滤面板 -------------------------------------------------------------

  /** 正在编辑的筛选条件；点「应用」才会变成 {@link $appliedFilter}。 */
  readonly $draftFilter = signal<RecipeFilterState>(emptyFilterState());
  /** 真正下发的筛选条件。 */
  readonly $appliedFilter = signal<RecipeFilterState>(emptyFilterState());

  /** 面板上展示的规则树。用户能直接看到自己组出来的 JSON 与网线上跑的是同一份。 */
  readonly $rules = computed(() => buildFilterRules(this.$appliedFilter()));

  /** `in` 算子的候选值。与后端种子的 `TAGS` 一致（第四个取值是 `null`，由下面的开关表达）。 */
  readonly tagOptions = ['sale', 'new', 'classic'] as const;
  /** `=` 算子的候选值。与后端种子的 `STATUSES` 一致。 */
  readonly statusOptions = ['published', 'draft', 'archived'] as const;

  // ---- 主面板页签 -----------------------------------------------------------

  /** 页签顺序。只有方向键需要它——三个按钮本身是逐个写在模板里的。 */
  readonly mainTabs = ['recipe', 'traffic', 'etag'] as const satisfies readonly MainTab[];

  /**
   * 当前选中的页签。
   *
   * @remarks
   * 默认停在 `recipe`：那是唯一一个「不看也知道自己要看什么」的视图，
   * 另外两个是出了状况才去翻的。
   */
  readonly $tab = signal<MainTab>('recipe');

  // ---- 分页 -----------------------------------------------------------------

  /** 页长候选，给模板的 `select` 用。 */
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  /** 当前页长。 */
  readonly $pageSize = signal(DEFAULT_PAGE_SIZE);

  /**
   * 用户请求的页码（0 起），**允许越界**。
   *
   * @remarks
   * 真正生效的是 {@link $page}——这个值经 `clampPage` 夹紧之后的那一个。
   * 分成两段是为了回答「越界了谁负责改」：筛选收窄、删掉最后一行、切大页长、清空数据，
   * 都会让页数变小，而这几处一个都不必记得去改页码。`create()` 更是主动利用了这一点，
   * 直接请求「当前页数」这个必然越界一格的值，等总数刷新后自己落到真末页。
   */
  readonly $requestedPage = signal(0);

  /**
   * 本地行缓存里匹配当前筛选条件的**总行数**。
   *
   * @remarks
   * 由构造函数里的 effect 直接问 wa-sqlite（`SELECT COUNT(...)`）。另外两条路都不通：
   *
   * - 远端 `count()` 是 `fetchMetadata(where).length`，每翻一页多发一个请求，
   *   且 `CountOptions` 上没有 `offlineFallback`——离线时它直接失败，页码跟着一起没。
   * - 再开一个不分页的 `useFind` 更糟：`find()` 的并发去重键是
   *   `{where, localCacheFirst, offlineFallback}`，**不含 `limit`/`offset`**，
   *   两个查询会撞进同一条行流，分页那个会拿到不分页那个的 250 行。
   *
   * 本地计数与列表读的是同一张表、同一棵 `where`（`find_sql` 与 `count_sql` 只差分页与排序），
   * 所以它就是「不分页时列表会有多少行」——与从前 `recipes.value().length` 的语义逐字一致，
   * 这也是分页之后 `row-count` 的文案与判据都不用改的原因。
   */
  readonly $cachedTotal = signal(0);

  /** 当前筛选条件下的总页数。空集合也算 1 页。 */
  readonly $pageCount = computed(() => pageCount(this.$cachedTotal(), this.$pageSize()));

  /** 真正生效的页码（0 起）。 */
  readonly $page = computed(() => clampPage(this.$requestedPage(), this.$cachedTotal(), this.$pageSize()));

  // ---- 列表 -----------------------------------------------------------------

  /**
   * 列表数据。
   *
   * @remarks
   * `offlineFallback: true` 是 AC#13 的开关：**只有网络故障**会降级到 wa-sqlite 行缓存，
   * 远端给出的非 2xx（比如注入的 409）照常上抛。两者的区别正是这一栏要演示的东西——
   * 「连不上」与「远端说不行」不是一回事，把后者也吞掉会让真实故障看起来像离线。
   *
   * `limit` / `offset` 是**真的下推**，但只下推到本地读：同步的粒度是整个 `where`
   * （指纹里没有 `limit`/`offset`），所以翻一页照样把这个 `where` 整个重新同步一遍。
   * 流量面板上因此看得见 6 次 `fetchMetadata`、0 次 `by-ids`——行都还是新鲜的。
   */
  readonly recipes = useFind(Recipe, () => ({
    where: buildFilterRules(this.$appliedFilter()),
    orderBy: [
      { field: 'updatedAt', sort: 'asc' as const },
      { field: 'id', sort: 'asc' as const }
    ],
    limit: this.$pageSize(),
    offset: this.$page() * this.$pageSize(),
    offlineFallback: true
  }));

  // ---- 写入表单 -------------------------------------------------------------

  readonly $draft = signal(emptyDraft());

  /**
   * 正在编辑的那一行本身。
   *
   * @remarks
   * 存**实例**而不是只存 id，是因为保存时不能再去当前页里按 id 找它：列表是分页 + 筛选的，
   * 通知通道触发一次重跑、或者别人在别处翻了页，这一行就可能不在 `recipes.value()` 里了 ——
   * 而编辑框还开着。按 id 找不到就报「可能已被后端删除」，说的是一件根本没发生的事。
   * 用户点开的是哪一行，保存的就是哪一行，这个绑定不该经过一个会漂移的中间层。
   *
   * 行在这期间真被别处改过的话，`save()` 会撞上版本检查抛出真正的冲突错误 ——
   * 那是应该看见的现象，比一句编出来的「已被删除」诚实得多。
   */
  readonly $editingTarget = signal<Recipe | null>(null);

  /** 正在编辑的行 id。从 {@link $editingTarget} 派生，不另存一份免得两处对不上。 */
  readonly $editingId = computed(() => this.$editingTarget()?.id ?? null);

  readonly $writeError = signal<string | null>(null);

  // ---- 后端信息与开关 -------------------------------------------------------

  readonly $control = signal<DemoControlState | null>(null);
  readonly $controlError = signal<string | null>(null);
  readonly $serverLog = signal<readonly DemoRequestLogEntry[]>([]);

  // ---- 协议流量面板 ---------------------------------------------------------

  readonly $traffic = signal<readonly TrafficEntry[]>(trafficEntries());

  /**
   * 最近一次协议请求的状态码，`null` 表示一次都还没发过。
   *
   * @remarks
   * 单独一路而不是从 {@link $traffic} 的末条取：面板可以被「清空日志」清掉，
   * 而连通性不会因此改变。判据留在记录器里（`lastTransportStatus`），这里只做镜像。
   */
  readonly $lastStatus = signal<number | null>(lastTransportStatus());

  // ---- ETag 诊断面板（US-215 AC#8）------------------------------------------

  /** 是否装了 `onEtagUnreadable`。见 `demo-config.ts`：默认关着，好让默认沉默也还能演示。 */
  readonly diagnosticsEnabled = resolveDiagnosticsEnabled(typeof location === 'undefined' ? '' : location.search);

  readonly $etagDiagnostics = signal<readonly EtagDiagnosticEntry[]>(etagDiagnostics());

  /**
   * 是否处于「连不上后端」的状态。
   *
   * @remarks
   * 判据是**最后一次协议请求的状态码是 0**（传输失败），而不是读 `navigator.onLine`
   * 或读 `__control/state`：前者对「后端挂了但网卡还在」一无所知，后者是在问那台
   * 我们正怀疑连不上的机器。最后一条真实流量是唯一自洽的证据。
   *
   * 读 {@link $lastStatus} 而不是 `$traffic().at(-1)`：那条证据必须比面板的缓冲区活得久，
   * 否则离线时点一下「清空日志」横幅就没了 —— 面板会声称已经恢复，而下一次请求照样打不通。
   */
  readonly $networkDown = computed(() => this.$lastStatus() === 0);

  // ---- 变更通知面板（US-023 AC#24）------------------------------------------

  /**
   * 通知通道此刻开着没有。
   *
   * @remarks
   * 初值取自 `?changefeed=`（见 `demo-config.ts`：**默认开**），但它只是初值——
   * 面板上的 checkbox 之后可以随时翻，不刷页。真正的状态在适配器那边
   * （`RxDBAdapterHttp.changeFeedEnabled`），这个 signal 只是它给模板用的镜像，
   * 每次翻转都从适配器回读，不自己算。
   */
  readonly $changeFeedOn = signal(resolveChangeFeedEnabled(typeof location === 'undefined' ? '' : location.search));

  readonly $changeFeedStats = signal<ChangeFeedStats>(changeFeedStats());

  /**
   * 通道触发过几次重跑。
   *
   * @remarks
   * 数的是 core 派发的 `REMOTE_ENTITY_INVALIDATED`，不是「收到几条通知」减「抑制几条」——
   * 那个差值只在实体名认得出来时才等于重跑次数，而认不出的实体名是静默丢弃的（D9）。
   * 面板要能把「通知来了但名字对不上」这种配错显示出来：收到 5 条、抑制 0 条、重跑 0 次。
   */
  readonly $invalidations = signal(0);

  /**
   * 本页开着以来打到 `/metadata` 的**累计**次数。
   *
   * @remarks
   * 从流量面板派生，不另设计数器：这一栏要回答的是「重跑真的落到网线上了吗」，
   * 而唯一有资格回答的就是网线本身。
   *
   * 但它数的是**所有** `/metadata`——冷启动那一次、每次翻页、每次改筛选都在内，
   * 不只是通知触发的那几次，也不因为通道关掉就停。要看某次通知的效果，请取
   * 动作前后两次读数的差（e2e 的 `change-feed.spec.ts` 正是这么用的），
   * 而不是把这个绝对值当成 `fetchMetadata` 的调用次数读。
   */
  readonly $metadataRequests = computed(() => this.$traffic().filter(entry => entry.path.includes('/metadata')).length);

  /** 列表当前是不是靠离线缓存撑住的。 */
  readonly $servingFromCache = computed(() => this.$networkDown() && this.recipes.value().length > 0);

  constructor() {
    /*
     * 总行数的刷新。依赖是**故意**只取这两个的：
     *
     * - `$appliedFilter`：换了 `where` 当然要重数；
     * - `recipes.value()`：行流一动，就说明本地缓存刚被同步或写入改过。
     *
     * 翻页本身不在依赖里——`limit`/`offset` 不改总数，而 `$page` 又由总数派生，
     * 读进来就成了环。同理，`$cachedTotal` 绝不能出现在 `useFind` 的 options 工厂里；
     * 环最终断在 `$page` 这个 number computed 上：值不变就不通知下游。
     *
     * `await` 之后的读不会被追踪，所以 `where` 必须在这里同步取好再传进去。
     */
    effect(() => {
      const where = buildFilterRules(this.$appliedFilter());
      this.recipes.value();
      // 不接 catch：本地计数失败意味着行缓存本身出了问题，这时候安静地把页码显示成 0
      // 比报错更坏——那会让一个坏掉的库看起来像一张空表。
      void this.#refreshTotal(where);
    });
  }

  ngOnInit(): void {
    const unsubscribe = onTraffic(entries => {
      this.$traffic.set(entries);
      this.$lastStatus.set(lastTransportStatus());
    });
    this.#destroyRef.onDestroy(unsubscribe);

    const unsubscribeDiagnostics = onEtagDiagnostic(entries => this.$etagDiagnostics.set(entries));
    this.#destroyRef.onDestroy(unsubscribeDiagnostics);

    const unsubscribeChangeFeed = onChangeFeedStats(stats => this.$changeFeedStats.set(stats));
    this.#destroyRef.onDestroy(unsubscribeChangeFeed);

    // 无条件挂：关掉通道时这个事件本来就一条都不会来，而「挂了监听但一条没来」
    // 正是 AC#23 那条对照用例要看到的现象。
    const countInvalidation = (): void => this.$invalidations.update(count => count + 1);
    this.#rxdb.addEventListener(REMOTE_ENTITY_INVALIDATED_EVENT, countInvalidation);
    this.#destroyRef.onDestroy(() =>
      this.#rxdb.removeEventListener(REMOTE_ENTITY_INVALIDATED_EVENT, countInvalidation)
    );

    void this.#resolveHttpAdapter();
    void this.refreshControl();
  }

  // ---- 动作 -----------------------------------------------------------------

  /** 切到某个页签。 */
  selectTab(tab: MainTab): void {
    this.$tab.set(tab);
  }

  /**
   * 方向键在页签之间移动，并把焦点带过去。
   *
   * @param event - 页签按钮上的 `keydown`
   * @param index - 这个页签在 {@link mainTabs} 里的下标
   *
   * @remarks
   * 走的是 APG 的**自动激活**：移到哪个页签就显示哪个，不必再按一次回车。
   * 三个视图本来就都在 DOM 里（切换只改 `hidden`），切过去不花钱，
   * 让键盘用户多按一次才看得见内容纯属白收费。
   */
  moveTab(event: KeyboardEvent, index: number): void {
    const move = TAB_KEY_MOVES[event.key];
    if (move === undefined) return;
    // 左右键在按钮上没有默认行为，Home / End 有：不拦住的话页面会顺手滚到头尾。
    event.preventDefault();
    const next = move(index, this.mainTabs.length);
    this.$tab.set(this.mainTabs[next]);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  /**
   * 开关变更通知通道，**不刷页**。
   *
   * @param on - checkbox 的新状态
   *
   * @remarks
   * 翻完从适配器回读而不是直接把 `on` 写进 signal：这两个值本该一致，而「本该一致」
   * 正是它们分叉的方式。回读的话，万一哪天 `startChangeFeed()` 拒绝了这次请求
   * （比如适配器已经断开），面板上的勾会自己弹回去，而不是显示一个不存在的状态。
   */
  toggleChangeFeed(on: boolean): void {
    const adapter = this.#httpAdapter;
    if (!adapter) {
      return;
    }
    if (on) {
      adapter.startChangeFeed();
    } else {
      adapter.stopChangeFeed();
    }
    this.$changeFeedOn.set(adapter.changeFeedEnabled);
  }

  /** 把草稿筛选条件下发。 */
  applyFilter(): void {
    this.$requestedPage.set(0);
    this.$appliedFilter.set({ ...this.$draftFilter(), tags: [...this.$draftFilter().tags] });
  }

  /** 清空筛选条件并立即下发。 */
  resetFilter(): void {
    this.$requestedPage.set(0);
    this.$draftFilter.set(emptyFilterState());
    this.$appliedFilter.set(emptyFilterState());
  }

  /** 切页长。页长一变「第几页」就换了含义，回首页最不容易骗人。 */
  setPageSize(pageSize: number): void {
    this.$requestedPage.set(0);
    this.$pageSize.set(pageSize);
  }

  /** 上一页。从**生效**页码上加减，夹紧过之后按钮才跟着用户看见的那一页走。 */
  prevPage(): void {
    this.$requestedPage.set(this.$page() - 1);
  }

  /** 下一页。 */
  nextPage(): void {
    this.$requestedPage.set(this.$page() + 1);
  }

  /** 勾选 / 取消一个 tag（`in` 算子的取值集合）。 */
  toggleTag(tag: string, checked: boolean): void {
    this.$draftFilter.update(state => ({
      ...state,
      tags: checked ? [...state.tags, tag] : state.tags.filter(item => item !== tag)
    }));
  }

  /** 单字段更新草稿筛选条件。 */
  patchFilter(patch: Partial<RecipeFilterState>): void {
    this.$draftFilter.update(state => ({ ...state, ...patch }));
  }

  /** 单字段更新写入表单。 */
  patchDraft(patch: Partial<ReturnType<typeof emptyDraft>>): void {
    this.$draft.update(draft => ({ ...draft, ...patch }));
  }

  /** 拉一次后端状态与后端侧请求日志。 */
  async refreshControl(): Promise<void> {
    this.$controlError.set(null);
    try {
      this.$control.set(await readControlState(this.baseUrl));
      this.$serverLog.set(await readRequestLog(this.baseUrl));
    } catch (cause) {
      this.$controlError.set(cause instanceof Error ? cause.message : String(cause));
    }
  }

  /** 新建一行。 */
  async create(): Promise<void> {
    const draft = this.$draft();
    await this.#write(async () => {
      await new Recipe({
        title: draft.title,
        status: draft.status,
        price: Number(draft.price),
        tag: draft.tag === '' ? null : draft.tag
      }).save();
      this.$draft.set(emptyDraft());
      // 排序是 `updatedAt asc`，新行的 `updatedAt` 是服务端当前时刻，必然落在最后一页。
      // 请求「当前页数」这个越界一格的值，等总数刷新后自动落到真末页——
      // 不跳的话，用户看到的就是「新建成功，但页面什么都没变」。
      this.$requestedPage.set(this.$pageCount());
    });
  }

  /**
   * 写入表单里按回车。
   *
   * @remarks
   * 分派到 {@link create} 还是 {@link update} 由编辑态决定——与那两个按钮的显隐是同一个判据，
   * 所以回车永远等价于「按下此刻看得见的那个主按钮」。
   */
  submitDraft(): void {
    void (this.$editingId() === null ? this.create() : this.update());
  }

  /** 把某一行装进表单准备改。 */
  startEdit(recipe: Recipe): void {
    this.$editingTarget.set(recipe);
    this.$draft.set({
      title: recipe.title,
      status: recipe.status,
      price: String(recipe.price),
      tag: recipe.tag ?? ''
    });
  }

  /** 退出编辑态。 */
  cancelEdit(): void {
    this.$editingTarget.set(null);
    this.$draft.set(emptyDraft());
  }

  /** 保存正在编辑的行。 */
  async update(): Promise<void> {
    const target = this.$editingTarget();
    if (target === null) return;
    const draft = this.$draft();
    await this.#write(async () => {
      target.title = draft.title;
      target.status = draft.status;
      target.price = Number(draft.price);
      target.tag = draft.tag === '' ? null : draft.tag;
      await target.save();
      this.cancelEdit();
    });
  }

  /** 删一行。 */
  async remove(recipe: Recipe): Promise<void> {
    await this.#write(async () => {
      await recipe.remove();
      if (this.$editingId() === recipe.id) this.cancelEdit();
    });
  }

  // ---- 演示开关 -------------------------------------------------------------

  /** 离线开关。 */
  async toggleOffline(offline: boolean): Promise<void> {
    await this.#control(() => setOffline(this.baseUrl, offline));
  }

  /** `Access-Control-Expose-Headers: ETag` 开关。关掉后浏览器读不到 ETag，条件请求全程不命中。 */
  async toggleExposeEtag(exposeEtag: boolean): Promise<void> {
    await this.#control(() => setExposeEtag(this.baseUrl, exposeEtag));
  }

  /** 翻页形态开关。 */
  async togglePageMode(mode: 'offset' | 'token'): Promise<void> {
    await this.#control(() => setPageMode(this.baseUrl, mode));
  }

  /** 注入 / 取消一个固定错误码。 */
  async injectStatus(status: number | null): Promise<void> {
    await this.#control(() => setForcedStatus(this.baseUrl, status));
  }

  /**
   * 把后端数据重置回种子。
   *
   * @remarks
   * 与 {@link clearBackend} 一样带上本机 `clientId`：这两个按钮改的是**共享后端里的行**，
   * 后端因此会广播一条变更通知（别的客户端靠它跟上）。带上 `clientId` 是为了让本页
   * 认出那条回声并丢掉——下面那两行已经在重查了，再被通知推着查一次纯属白跑。
   */
  async resetBackend(): Promise<void> {
    await this.#control(() => resetDatabase(this.baseUrl, this.#clientId()).then(() => readControlState(this.baseUrl)));
    this.$requestedPage.set(0);
    this.applyFilter();
  }

  /**
   * 清空后端所有数据（**表还留着**）。
   *
   * @remarks
   * 这个按钮演示的是 QueryCache 的极端情形：远端一行不剩、本地行缓存却是满的。
   * 重查时 `fetchMetadata` 回空集，`HEAD :entity` 仍是 200（表在），
   * 于是同步走的是**孤儿清理**而不是「实体不存在」那条路——本地 250 行被逐一删掉，
   * 列表清空、`row-count` 归 0。删库重建（「重置为种子」走的 `__control/reset`）看不到这一幕。
   *
   * 重查用 `refetch()` 而不是 `applyFilter()`：后者会顺手把用户还没点「应用」的草稿一起下发，
   * 让人分不清列表空掉是因为清了数据还是因为多了一条筛选。
   *
   * `clientId` 的用途见 {@link resetBackend}。
   */
  async clearBackend(): Promise<void> {
    await this.#control(() => clearDatabase(this.baseUrl, this.#clientId()).then(() => readControlState(this.baseUrl)));
    this.$requestedPage.set(0);
    this.refetch();
  }

  /**
   * 清空两侧的流量记录与诊断面板。
   *
   * @remarks
   * 诊断一并清掉，但**适配器里的去重表不受影响**：那张表只在 `disconnect()` 时清。
   * 所以清空面板之后同一个查询不会再报第二次——面板空着不等于「这次没问题」，
   * 要重新观察请刷新页面。
   */
  async clearLogs(): Promise<void> {
    clearTraffic();
    this.$traffic.set(trafficEntries());
    clearEtagDiagnostics();
    clearChangeFeedStats();
    this.$invalidations.set(0);
    await this.#control(() => clearRequestLog(this.baseUrl).then(() => readControlState(this.baseUrl)));
  }

  /** 让列表重新查一次（换一个等价但不同身份的筛选对象即可触发）。 */
  refetch(): void {
    this.$appliedFilter.update(state => ({ ...state }));
  }

  // ---- 私有 -----------------------------------------------------------------

  /**
   * 本机 `clientId`，用来标记「这次数据变更是我发起的」。
   *
   * @returns `RxDB.init()` 之前是 `undefined`——那时也没人点得到那两个按钮
   *
   * @remarks
   * 不为「万一没有」编一个假值：缺了这个头，后端只是广播一条不含 `clientId` 的通知，
   * 本页顶多多查一次。编一个假的反而会让别的页面把这次变更误判成自己发起的而丢弃它。
   */
  #clientId(): string | undefined {
    const clientId = this.#rxdb.context.clientId;
    return typeof clientId === 'string' ? clientId : undefined;
  }

  /**
   * 取到 HTTP 适配器，并把面板上的勾对齐到它的真实状态。
   *
   * @remarks
   * 初值本来就是从同一个查询串算出来的，这次回读看起来多余——但它守的是
   * `setup_rxdb_http.ts` 里那句 `stopChangeFeed()` 与本组件各算一遍的风险：
   * 两处哪天分叉了，面板会当场显示错的那个，而不是安静地骗人。
   */
  async #resolveHttpAdapter(): Promise<void> {
    const adapter = await this.#rxdb.getAdapter('http');
    this.#httpAdapter = adapter;
    this.$changeFeedOn.set(adapter.changeFeedEnabled);
  }

  /** 问本地 wa-sqlite 要一次总行数。零网络，离线照样准。 */
  async #refreshTotal(where: RecipeRuleGroup): Promise<void> {
    // `connect()` 是幂等的：适配器在 `provideAppInitializer` 里早就连上了，
    // 这里命中的是 `#connect_promise_map` 里那条已 resolve 的 Promise，不会重连。
    const local = await this.#rxdb.connect('wa-sqlite');
    this.$cachedTotal.set(await local.getRepository(Recipe).count({ where }));
  }

  async #write(action: () => Promise<void>): Promise<void> {
    this.$writeError.set(null);
    try {
      await action();
    } catch (cause) {
      this.$writeError.set(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async #control(action: () => Promise<DemoControlState>): Promise<void> {
    this.$controlError.set(null);
    try {
      this.$control.set(await action());
      this.$serverLog.set(await readRequestLog(this.baseUrl));
    } catch (cause) {
      this.$controlError.set(cause instanceof Error ? cause.message : String(cause));
    }
  }
}
