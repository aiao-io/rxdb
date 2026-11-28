/**
 * 「有没有未保存输入」的汇总状态，供实体列表与详情交给宿主的 `dirtyChange` 判定。
 *
 * 三端绑定只做接线：把表单的字段变化、嵌套组件的报告与会话边界交给本类，再把它的通知转成各自的回调、输出或事件。
 * 判定规则只写在这里，三端不各写一份。
 * @module entity-form/dirty-tracker
 */
import { cloneStructured, structuralEqual } from '../structural-equal.js';
import type { FormFieldChangeEvent } from './interfaces.js';

/** 未保存输入状态的监听：`dirty` 为 true 表示有未保存输入。 */
export type EntityDirtyListener = (dirty: boolean) => void;

/** 本次编辑里变化过的一个字段：第一次变化之前的取值（基线）与最近一次取值，都是副本。 */
interface FieldEntry {
  readonly baseline: unknown;
  value: unknown;
}

/** 空值：表单把清空的输入解析成 `null`，实体上同一个空字段可能是 `''` 或缺省，三者对用户都是「没填」。 */
const isEmpty = (value: unknown): boolean => value === null || value === undefined || value === '';

/** 取值是否仍等于基线：都为空值，或结构相同。 */
const unchanged = (entry: FieldEntry): boolean =>
  (isEmpty(entry.value) && isEmpty(entry.baseline)) || structuralEqual(entry.value, entry.baseline);

/**
 * 「有没有未保存输入」的汇总状态。
 *
 * @remarks
 * 两类来源，任一有未保存内容即为 true：
 * - 表单字段：{@link EntityDirtyTracker.recordField} 记下表单发出的字段变化。每个字段在本次编辑里第一次变化时的
 *   `previousValue` 记作基线，之后取值与基线结构相同（改回原值、把新建表单的字段清空）就不算未保存；
 *   `null`、`undefined` 与空串都算空值、彼此相等——表单把清空的输入解析成 `null`，而原值可能是空串。
 *   不直接读表单控制器的 `dirty`：详情组件会把用户输入回灌成表单的 `data`（create 模式的草稿数据、Vue 端 edit 模式的
 *   覆盖项），每次回灌都把表单基线挪到最新输入，`dirty` 随即回到 false；字段变化事件则不受回灌影响。
 *   以表单交给控制器的取值为准：Angular 的表单在 `change`（失焦或回车）时才提交取值，失焦之前的按键还不是表单输入。
 * - 具名子来源：{@link EntityDirtyTracker.setSource} 报告嵌套部件的状态，如对话框里的详情、关系页签里的嵌套列表、
 *   随父实体一起保存的本地草稿。
 *
 * 一次编辑结束（保存成功、交给宿主、取消、关闭）时调用 {@link EntityDirtyTracker.reset}，字段与子来源一起清空。
 *
 * 只在状态真正变化时通知。订阅即对齐：订阅时已有未保存输入立即通知 true；取消订阅时它最近收到的是 true，就补发 false。
 * 每个监听看到的都是从 false 开始、true / false 交替、以 false 收尾的序列：组件卸载（含 React StrictMode 回放、
 * `<Activity>` 隐藏）时取消订阅，宿主就不会停在 true；重新订阅时状态若仍未保存，再收到一次 true。
 */
export class EntityDirtyTracker {
  readonly #fields = new Map<string, FieldEntry>();
  /** 报告有未保存内容的子来源。 */
  readonly #sources = new Set<string>();
  /** 监听 → 最近一次交给它的状态。 */
  readonly #listeners = new Map<EntityDirtyListener, boolean>();
  #dirty = false;

  /** 当前是否有未保存输入。 */
  get dirty(): boolean {
    return this.#dirty;
  }

  /**
   * 记下表单的一次字段变化。
   * @param event 表单发出的字段变化；只读 `field`、`previousValue` 与 `value`，基线与取值都留存副本，
   * 宿主之后原地修改数组或对象不会改写判定。
   */
  recordField(event: Pick<FormFieldChangeEvent, 'field' | 'previousValue' | 'value'>): void {
    const entry = this.#fields.get(event.field);
    if (entry) entry.value = cloneStructured(event.value);
    else
      this.#fields.set(event.field, {
        baseline: cloneStructured(event.previousValue),
        value: cloneStructured(event.value)
      });
    this.#update();
  }

  /**
   * 报告一个具名子来源是否有未保存内容。
   * @param key 子来源的名字，同一个部件每次用同一个名字；同名再次报告覆盖上一次。
   * @param dirty 该子来源是否有未保存内容。
   */
  setSource(key: string, dirty: boolean): void {
    if (dirty) this.#sources.add(key);
    else this.#sources.delete(key);
    this.#update();
  }

  /** 结束一次编辑：清空字段与子来源，之后的输入按新的一次编辑重新取基线。 */
  reset(): void {
    this.#fields.clear();
    this.#sources.clear();
    this.#update();
  }

  /**
   * 订阅后续状态变化。
   * @param listener 状态变化时调用；订阅时已有未保存输入，立即以 true 调用一次。
   * @returns 取消订阅函数，可重复调用；取消时这个监听最近收到的是 true，就再以 false 调用一次。
   */
  subscribe(listener: EntityDirtyListener): () => void {
    this.#listeners.set(listener, false);
    this.#notify(listener, this.#dirty);
    return () => {
      const last = this.#listeners.get(listener);
      this.#listeners.delete(listener);
      if (last === true) listener(false);
    };
  }

  #update(): void {
    const dirty = this.#sources.size > 0 || [...this.#fields.values()].some(entry => !unchanged(entry));
    if (dirty === this.#dirty) return;
    this.#dirty = dirty;
    for (const listener of [...this.#listeners.keys()]) {
      // 监听在回调里又改了状态：更新的那一轮已经通知过全部监听，这一轮剩下的状态已经过时
      if (this.#dirty !== dirty) return;
      this.#notify(listener, dirty);
    }
  }

  /** 交给一个仍在订阅的监听；与它最近收到的状态相同就不再通知。 */
  #notify(listener: EntityDirtyListener, dirty: boolean): void {
    if (!this.#listeners.has(listener) || this.#listeners.get(listener) === dirty) return;
    this.#listeners.set(listener, dirty);
    listener(dirty);
  }
}

/** 创建「有没有未保存输入」的汇总状态，见 {@link EntityDirtyTracker}。 */
export function createEntityDirtyTracker(): EntityDirtyTracker {
  return new EntityDirtyTracker();
}
