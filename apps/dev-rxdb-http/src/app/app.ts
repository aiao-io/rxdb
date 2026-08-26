import { RxDB } from '@aiao/rxdb';
import { useFind } from '@aiao/rxdb-angular';
import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resolveApiBaseUrl } from './demo-config';
import {
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
import { buildFilterRules, emptyFilterState, type RecipeFilterState } from './filter-rules';
import { Recipe } from './recipe';
import { clearTraffic, onTraffic, trafficEntries, type TrafficEntry } from './traffic-recorder';

/** 本地一次能读出的行数上限。种子是 250 行，取 250 让列表能一屏看全。 */
const LOCAL_READ_LIMIT = 250;

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

  // ---- 列表 -----------------------------------------------------------------

  /**
   * 列表数据。
   *
   * @remarks
   * `offlineFallback: true` 是 AC#13 的开关：**只有网络故障**会降级到 wa-sqlite 行缓存，
   * 远端给出的非 2xx（比如注入的 409）照常上抛。两者的区别正是这一栏要演示的东西——
   * 「连不上」与「远端说不行」不是一回事，把后者也吞掉会让真实故障看起来像离线。
   */
  readonly recipes = useFind(Recipe, () => ({
    where: buildFilterRules(this.$appliedFilter()),
    orderBy: [
      { field: 'updatedAt', sort: 'asc' as const },
      { field: 'id', sort: 'asc' as const }
    ],
    limit: LOCAL_READ_LIMIT,
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

  ngOnInit(): void {
    const unsubscribe = onTraffic(entries => this.$traffic.set(entries));
    this.#destroyRef.onDestroy(unsubscribe);

    void this.loadBackendVersion();
    void this.refreshControl();
  }

  // ---- 动作 -----------------------------------------------------------------

  /** 把草稿筛选条件下发。 */
  applyFilter(): void {
    this.$appliedFilter.set({ ...this.$draftFilter(), tags: [...this.$draftFilter().tags] });
  }

  /** 清空筛选条件并立即下发。 */
  resetFilter(): void {
    this.$draftFilter.set(emptyFilterState());
    this.$appliedFilter.set(emptyFilterState());
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
    this.applyFilter();
  }

  /** 清空两侧的流量记录。 */
  async clearLogs(): Promise<void> {
    clearTraffic();
    this.$traffic.set(trafficEntries());
    await this.#control(() => clearRequestLog(this.baseUrl).then(() => readControlState(this.baseUrl)));
  }

  /** 让列表重新查一次（换一个等价但不同身份的筛选对象即可触发）。 */
  refetch(): void {
    this.$appliedFilter.update(state => ({ ...state }));
  }

  // ---- 私有 -----------------------------------------------------------------

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
