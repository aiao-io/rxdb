import { deterministicStringify, type RxDB } from '@aiao/rxdb';
import type { BomViewCommands, BomViewHandle, BomViewInput, BomViewState } from '@aiao/rxdb-plugin-bom';
import { createBomView, initialBomViewState } from '@aiao/rxdb-plugin-bom';
import type { Subscription } from 'rxjs';
import {
  getCurrentScope,
  onScopeDispose,
  shallowReadonly,
  shallowRef,
  toRaw,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef
} from 'vue';

/** 输入的内容身份；与 Angular / React 绑定逐字同一判据，无效日期经 JSON 归一为 null 而不抛错。 */
const inputIdentity = (input: BomViewInput): string =>
  deterministicStringify(JSON.parse(JSON.stringify(input)) as unknown);

/** 递归解除嵌套代理，保留日期供共享控制器创建独立快照。 */
const inputSnapshot = <T>(value: T): T => {
  const raw = toRaw(value);
  if (raw === null || typeof raw !== 'object' || raw instanceof Date) return raw;
  if (Array.isArray(raw)) return raw.map(inputSnapshot) as T;
  return Object.fromEntries(Object.entries(raw).map(([key, nested]) => [key, inputSnapshot(nested)])) as T;
};

/** Vue的只读shallowRef容器与共享命令。 */
export interface BomViewBinding {
  state: Readonly<ShallowRef<BomViewState>>;
  commands: BomViewCommands;
}

/**
 * 将显式数据库上的共享 BOM 控制器绑定到当前 Vue scope。
 *
 * @remarks
 * 与 Angular / React 的 `useBomView` 同一语义：输入按内容身份比较，内容相同的新对象不会重载；
 * `db` 身份变化时销毁旧控制器并以当前输入新建，旧流的迟到值不会写入状态。跟踪来源是 ref、
 * getter 或响应式对象：内容变化（含原地修改）时自动 `setInput`；普通对象只在创建时读取一次，
 * 之后的原地修改不会生效。控制器随 setup 同步创建，scope 销毁之后调用命令会明确抛错。
 * 传给控制器的是去掉响应式代理的原始对象；数据库请用普通值、`shallowRef` 或 getter 传入。
 *
 * @example
 * ```ts
 * const props = defineProps<{ db: RxDB; input: BomViewInput }>();
 * const { state, commands } = useBomView(() => props.db, () => props.input);
 * ```
 *
 * @param db - 已连接并安装 BOM 插件的数据库；普通值（只读一次）、ref 或 getter
 * @param input - 完整的解析上下文、目标、计划量、预算与公式参数；普通值（只读一次）、ref、getter 或响应式对象
 * @returns 只读状态与共享命令，scope 销毁时自动释放订阅
 */
export const useBomView = (db: MaybeRefOrGetter<RxDB>, input: MaybeRefOrGetter<BomViewInput>): BomViewBinding => {
  if (!getCurrentScope()) throw new Error('useBomView 必须在 setup 或活动 effectScope 作用域中调用');
  const state = shallowRef(initialBomViewState());
  let active: BomViewHandle | null = null;
  let activeDb: RxDB | null = null;
  let appliedInput: string | null = null;
  let subscription: Subscription | null = null;

  const release = (): void => {
    subscription?.unsubscribe();
    active?.destroy();
    subscription = null;
    active = null;
    activeDb = null;
  };
  const install = (nextDb: RxDB, nextInput: BomViewInput): void => {
    release();
    const handle = createBomView(nextDb, nextInput);
    active = handle;
    activeDb = nextDb;
    appliedInput = inputIdentity(nextInput);
    subscription = handle.state$.subscribe(value => {
      state.value = value;
    });
  };
  const sync = (nextDb: RxDB, nextInput: BomViewInput): void => {
    if (active === null || nextDb !== activeDb) {
      install(nextDb, nextInput);
      return;
    }
    const key = inputIdentity(nextInput);
    if (key === appliedInput) return;
    appliedInput = key;
    active.setInput(nextInput);
  };
  const current = (): BomViewHandle => {
    if (active === null) throw new Error('BOM 视图尚未挂载或已经卸载');
    return active;
  };

  // 第二个来源在 getter 里序列化整份输入：Vue 据此深度跟踪原地修改，字符串比较又让同内容新对象不触发
  watch(
    [() => toRaw(toValue(db)), () => inputIdentity(toValue(input))],
    ([nextDb]) => sync(nextDb, inputSnapshot(toValue(input))),
    { immediate: true }
  );
  onScopeDispose(release);

  const commands: BomViewCommands = {
    setInput: value => current().setInput(inputSnapshot(value)),
    refresh: () => current().refresh(),
    toggle: path => current().toggle(path),
    loadOccurrence: id => current().loadOccurrence(id),
    saveOccurrence: patch => current().saveOccurrence(patch),
    calculate: () => current().calculate()
  };
  return { state: shallowReadonly(state), commands };
};
