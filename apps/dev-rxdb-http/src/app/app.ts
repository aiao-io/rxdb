import { RxDB } from '@aiao/rxdb';
import { useFind } from '@aiao/rxdb-angular';
import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resolveApiBaseUrl, resolveDiagnosticsEnabled } from './demo-config';
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
import { clearTraffic, onTraffic, trafficEntries, type TrafficEntry } from './traffic-recorder';

/** 新建表单的初值。 */
const emptyDraft = (): { title: string; status: string; price: string; tag: string } => ({
  title: '',
  status: 'published',
  price: '0',
  tag: ''
});

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
  readonly $editingId = signal<string | null>(null);
  readonly $writeError = signal<string | null>(null);

  // ---- 后端信息与开关 -------------------------------------------------------

  /** `version()` 的返回值。这是**后端自己报的字符串**，不是 npm 包版本号。 */
  readonly $backendVersion = signal<string | null>(null);
  readonly $backendVersionError = signal<string | null>(null);
  readonly $control = signal<DemoControlState | null>(null);
  readonly $controlError = signal<string | null>(null);
  readonly $serverLog = signal<readonly DemoRequestLogEntry[]>([]);

  // ---- 协议流量面板 ---------------------------------------------------------

  readonly $traffic = signal<readonly TrafficEntry[]>(trafficEntries());

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
   */
  readonly $networkDown = computed(() => this.$traffic().at(-1)?.status === 0);

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
    const unsubscribe = onTraffic(entries => this.$traffic.set(entries));
    this.#destroyRef.onDestroy(unsubscribe);

    const unsubscribeDiagnostics = onEtagDiagnostic(entries => this.$etagDiagnostics.set(entries));
    this.#destroyRef.onDestroy(unsubscribeDiagnostics);

    void this.loadBackendVersion();
    void this.refreshControl();
  }

  // ---- 动作 -----------------------------------------------------------------

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

  /** 读后端版本。 */
  async loadBackendVersion(): Promise<void> {
    this.$backendVersionError.set(null);
    try {
      const adapter = await this.#rxdb.connect('http');
      this.$backendVersion.set(await adapter.version());
    } catch (cause) {
      this.$backendVersion.set(null);
      this.$backendVersionError.set(cause instanceof Error ? cause.message : String(cause));
    }
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

  /** 把某一行装进表单准备改。 */
  startEdit(recipe: Recipe): void {
    this.$editingId.set(recipe.id);
    this.$draft.set({
      title: recipe.title,
      status: recipe.status,
      price: String(recipe.price),
      tag: recipe.tag ?? ''
    });
  }

  /** 退出编辑态。 */
  cancelEdit(): void {
    this.$editingId.set(null);
    this.$draft.set(emptyDraft());
  }

  /** 保存正在编辑的行。 */
  async update(): Promise<void> {
    const id = this.$editingId();
    if (id === null) return;
    const draft = this.$draft();
    const target = this.recipes.value().find(recipe => recipe.id === id);
    if (target === undefined) {
      this.$writeError.set(`找不到 id=${id} 的行，可能已被后端删除`);
      return;
    }
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

  /** 把后端数据重置回种子。 */
  async resetBackend(): Promise<void> {
    await this.#control(() => resetDatabase(this.baseUrl).then(() => readControlState(this.baseUrl)));
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
   */
  async clearBackend(): Promise<void> {
    await this.#control(() => clearDatabase(this.baseUrl).then(() => readControlState(this.baseUrl)));
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
    await this.#control(() => clearRequestLog(this.baseUrl).then(() => readControlState(this.baseUrl)));
  }

  /** 让列表重新查一次（换一个等价但不同身份的筛选对象即可触发）。 */
  refetch(): void {
    this.$appliedFilter.update(state => ({ ...state }));
  }

  // ---- 私有 -----------------------------------------------------------------

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
