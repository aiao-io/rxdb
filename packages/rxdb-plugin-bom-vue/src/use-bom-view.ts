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

/** Vue的只读shallowRef容器与共享命令。 */
export interface BomViewBinding {
  state: Readonly<ShallowRef<BomViewState>>;
  commands: BomViewCommands;
}

/**
 * 将显式数据库上的共享 BOM 控制器绑定到当前 Vue scope。
 *
 * @remarks
 * 与 Angular / React 的 `useBomView` 同一语义：`input` 按内容身份跟踪，内容变化（含响应式对象的
 * 原地修改）时自动 `setInput`，内容相同的新对象不会重载；`db` 身份变化时销毁旧控制器并以当前输入
 * 新建，旧流的迟到值不会写入状态。控制器随 setup 同步创建，scope 销毁之后调用命令会明确抛错。
 * 传给控制器的是去掉响应式代理的原始对象；数据库请用普通值、`shallowRef` 或 getter 传入。
 *
 * @example
 * ```ts
 * const props = defineProps<{ db: RxDB; input: BomViewInput }>();
 * const { state, commands } = useBomView(() => props.db, () => props.input);
 * ```
 *
 * @param db - 已连接并安装 BOM 插件的数据库；普通值、ref 或 getter
 * @param input - 完整的解析上下文、目标、计划量、预算与公式参数；普通值、ref 或 getter
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
    ([nextDb]) => sync(nextDb, toRaw(toValue(input))),
    { immediate: true }
  );
  onScopeDispose(release);

  const commands: BomViewCommands = {
    setInput: value => current().setInput(value),
    refresh: () => current().refresh(),
    toggle: path => current().toggle(path),
    loadOccurrence: id => current().loadOccurrence(id),
    saveOccurrence: patch => current().saveOccurrence(patch),
    calculate: () => current().calculate()
  };
  return { state: shallowReadonly(state), commands };
};
