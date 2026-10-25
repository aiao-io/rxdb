import type { RxDB } from '@aiao/rxdb';
import { BehaviorSubject, defer, Observable, Subscription } from 'rxjs';
import { BomHeader } from './entities.js';
import type { BomRepository } from './repository.js';
import { assertCompleteResolution } from './resolve/expansion.js';
import { BomResolutionError } from './resolve/resolution.js';
import { assertContext, type ResolveTarget } from './resolve/resolver.js';
import { BomTruncationError } from './types.js';
import { loadViewOccurrence, saveViewOccurrence } from './view-editor.js';
import { projectViewNodes, viewCandidates, viewPathKey } from './view-projection.js';
import type {
  BomLineEditorState,
  BomLineEditorValue,
  BomOccurrencePatch,
  BomViewHandle,
  BomViewInput,
  BomViewSnapshot,
  BomViewState
} from './view-types.js';
import { readBomViewSnapshot } from './view.js';

/** 编辑器以外的数据字段；成功结果按完整类型发布，状态增字段时编译期即暴露漏改。 */
type BomViewData = Omit<BomViewState, 'editor'>;

/** 展开与编辑器状态按目标划分：同一目标只改参数时保留，换目标回到默认。 */
const sameTarget = (left: ResolveTarget, right: ResolveTarget): boolean =>
  left.parentItemId === right.parentItemId && left.parentRevisionId === right.parentRevisionId;

const initialEditorState = (): BomLineEditorState => ({ phase: 'idle', value: null, saving: false, error: null });

/** 每个绑定各自创建初态，不共享可变的节点或编辑对象。 */
export const initialBomViewState = (): BomViewState => ({
  phase: 'idle',
  nodes: [],
  unresolved: [],
  truncated: null,
  quantityError: null,
  error: null,
  refreshing: false,
  editor: initialEditorState()
});

const saveLoaded = async (
  db: RxDB,
  value: BomLineEditorValue | null,
  patch: BomOccurrencePatch
): Promise<BomLineEditorValue> => {
  if (value === null) throw new BomResolutionError('occurrenceId', '请先加载发生项');
  return saveViewOccurrence(db, value.occurrenceId, patch);
};

const ignore = (): void => undefined;

class BomViewController implements BomViewHandle {
  #input: BomViewInput;
  #snapshot: BomViewSnapshot | null = null;
  #source: Subscription | null = null;
  #subscribers = 0;
  #generation = 0;
  #editorGeneration = 0;
  /** 已发起的保存全部落定（成败不论）后兑现。 */
  #saves: Promise<void> = Promise.resolve();
  #destroyed = false;
  readonly #state = new BehaviorSubject(initialBomViewState());
  readonly #expanded = new Set([viewPathKey([])]);
  readonly state$: Observable<BomViewState>;

  constructor(
    private readonly db: RxDB,
    input: BomViewInput
  ) {
    this.#input = structuredClone(input);
    this.state$ = new Observable(subscriber => {
      if (this.#destroyed) {
        subscriber.complete();
        return;
      }
      this.#subscribers += 1;
      const stateSubscription = this.#state.subscribe(subscriber);
      if (this.#subscribers === 1 && !subscriber.closed) this.#start();
      return () => {
        stateSubscription.unsubscribe();
        this.#subscribers -= 1;
        if (this.#subscribers === 0) this.#stop();
      };
    });
  }

  setInput = (input: BomViewInput): void => {
    this.#assertAlive();
    // 空态补丁从初态派生，状态增字段不必回来补清单
    const { editor, ...data } = initialBomViewState();
    const loading: Partial<BomViewState> = { ...data, phase: 'loading' };
    if (!sameTarget(this.#input.target, input.target)) {
      this.#resetExpanded();
      // 换目标后旧发生项的加载 / 保存结果不再回填编辑器；保存本身照常落库
      this.#editorGeneration += 1;
      loading.editor = editor;
    }
    this.#input = structuredClone(input);
    this.#snapshot = null;
    this.#publish(loading);
    this.#start();
  };

  refresh = (): void => {
    this.#assertAlive();
    // 源已失败或尚未订阅时重订阅即重读；源正常时只让共享任务重读一次，不能两条路都走
    if (this.#source === null) {
      this.#start();
      return;
    }
    this.db.entityManager
      .getRepository<typeof BomHeader, BomRepository<typeof BomHeader>>(BomHeader)
      .refreshView(this.#input);
  };

  toggle = (path: readonly string[]): void => {
    this.#assertAlive();
    const key = viewPathKey(path);
    if (this.#expanded.has(key)) this.#expanded.delete(key);
    else this.#expanded.add(key);
    if (this.#snapshot !== null && this.#state.value.phase !== 'empty') {
      this.#publish({ nodes: projectViewNodes(this.#snapshot, this.#input, this.#expanded) });
    }
  };

  loadOccurrence = async (id: string): Promise<void> => {
    this.#assertAlive();
    const generation = ++this.#editorGeneration;
    this.#editor({ ...initialEditorState(), phase: 'loading' });
    try {
      // 保存未落库时先等它：否则读到保存前的旧值，而本次加载代次最新照常回填，保存结果反被丢弃
      await this.#saves;
      if (generation !== this.#editorGeneration) return;
      const value = await loadViewOccurrence(this.db, id);
      if (generation === this.#editorGeneration) this.#editor({ phase: 'success', value, error: null });
    } catch (error) {
      if (generation === this.#editorGeneration) this.#editor({ phase: 'error', error });
      throw error;
    }
  };

  saveOccurrence = async (patch: BomOccurrencePatch): Promise<void> => {
    this.#assertAlive();
    const generation = this.#editorGeneration;
    const saving = saveLoaded(this.db, this.#state.value.editor.value, patch);
    this.#saves = Promise.allSettled([this.#saves, saving]).then(ignore);
    this.#editor({ saving: true, error: null });
    try {
      const saved = await saving;
      if (generation === this.#editorGeneration) this.#editor({ phase: 'success', value: saved, saving: false });
    } catch (error) {
      if (generation === this.#editorGeneration) this.#editor({ error, saving: false });
      throw error;
    }
  };

  calculate = async () => {
    this.#assertAlive();
    const input = this.#input;
    await this.#saves;
    this.#assertAlive();
    if (input !== this.#input) throw new BomResolutionError('input', '计算期间输入已替换，旧输入的结果作废');
    const snapshot = await readBomViewSnapshot(this.db, structuredClone(input));
    this.#assertAlive();
    if (input !== this.#input) throw new BomResolutionError('input', '计算期间输入已替换，旧输入的结果作废');
    assertCompleteResolution(snapshot.expansion);
    if (snapshot.quantityError !== null) throw snapshot.quantityError;
    if (viewCandidates(snapshot).length > 0) throw new BomResolutionError('candidates', '存在未裁决的候选');
    if (snapshot.explosion === null) throw new BomResolutionError('quantity', '没有完整数量结果');
    if (snapshot.explosion.truncated !== null) throw new BomTruncationError(snapshot.explosion.truncated.reason);
    return snapshot.explosion;
  };

  destroy = (): void => {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#editorGeneration += 1;
    this.#stop();
    this.#state.complete();
  };

  #publish(patch: Partial<BomViewState>): void {
    if (!this.#destroyed) this.#state.next({ ...this.#state.value, ...patch });
  }

  #stop(): void {
    this.#generation += 1;
    this.#source?.unsubscribe();
    this.#source = null;
  }

  #start(): void {
    this.#stop();
    if (this.#destroyed || this.#subscribers === 0) return;
    const generation = this.#generation;
    const subscription = new Subscription();
    this.#source = subscription;
    this.#publish({
      phase: this.#snapshot === null ? 'loading' : this.#state.value.phase,
      refreshing: this.#snapshot !== null,
      error: null
    });
    if (subscription.closed) return;
    subscription.add(
      defer(() => {
        assertContext(this.#input.context);
        return this.db.bom.watchView(this.#input);
      }).subscribe({
        next: snapshot => {
          if (generation === this.#generation) this.#accept(snapshot);
        },
        error: (error: unknown) => {
          if (generation !== this.#generation) return;
          this.#stop();
          this.#publish({ phase: 'error', error, refreshing: false });
        },
        complete: () => {
          if (generation === this.#generation) this.#stop();
        }
      })
    );
  }

  #accept(snapshot: BomViewSnapshot): void {
    if (snapshot.refreshing) {
      this.#publish({ refreshing: true });
      return;
    }
    this.#snapshot = snapshot;
    const unresolved = viewCandidates(snapshot);
    const empty =
      snapshot.quantityError === null &&
      (snapshot.expansion.nodes.length === 0 ||
        (snapshot.expansion.nodes.length === 1 &&
          unresolved.length === 0 &&
          snapshot.expansion.truncated === null &&
          snapshot.explosion?.truncated == null));
    const data: BomViewData = {
      phase: empty ? 'empty' : 'success',
      nodes: empty ? [] : projectViewNodes(snapshot, this.#input, this.#expanded),
      unresolved,
      truncated: snapshot.expansion.truncated ?? snapshot.explosion?.truncated ?? null,
      quantityError: snapshot.quantityError,
      error: null,
      refreshing: false
    };
    this.#publish(data);
  }

  #resetExpanded(): void {
    this.#expanded.clear();
    this.#expanded.add(viewPathKey([]));
  }

  #editor(patch: Partial<BomLineEditorState>): void {
    this.#publish({ editor: { ...this.#state.value.editor, ...patch } });
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('BOM 视图已销毁');
  }
}

/** 创建显式数据库下的 BOM 交互视图；最后订阅释放时停止查询，destroy 终止整个 handle。 */
export const createBomView = (db: RxDB, input: BomViewInput): BomViewHandle => new BomViewController(db, input);
