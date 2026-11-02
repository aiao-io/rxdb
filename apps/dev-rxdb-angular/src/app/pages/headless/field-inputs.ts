import type { EntityFormController } from '@aiao/rxdb-model/headless';
import { DestroyRef, inject, signal } from '@angular/core';

/** 控件 id：前缀与区块标题的 id 分开命名，避免字段名恰好叫 `title` 时与标题元素撞 id。 */
export const fieldId = (prefix: string, field: string): string => `${prefix}-field-${field}`;

/**
 * 表单输入的本地状态：原始文本、已触碰字段、是否尝试过提交。
 *
 * 控制器只保存解析后的合法值；解析失败时用户键入的文本仍要留在控件里，所以由消费方保存原始文本，
 * 并在宿主重置 / 取消（控制器发出 `reset` / `cancelled`）时清空。
 */
export class FieldInputs {
  readonly #controller: EntityFormController;
  readonly raw = signal<Readonly<Record<string, string>>>({});
  readonly touched = signal<ReadonlySet<string>>(new Set());
  readonly attempted = signal(false);

  constructor(controller: EntityFormController) {
    this.#controller = controller;
  }

  input(field: string, value: unknown): void {
    if (typeof value === 'string') this.raw.update(previous => ({ ...previous, [field]: value }));
    this.touched.update(previous => (previous.has(field) ? previous : new Set(previous).add(field)));
    this.#controller.setField(field, value);
  }

  markAttempted(): void {
    this.attempted.set(true);
  }

  reset(): void {
    this.raw.set({});
    this.touched.set(new Set());
    this.attempted.set(false);
  }
}

/** 在注入上下文里创建输入状态，随宿主销毁取消订阅。 */
export function injectFieldInputs(controller: EntityFormController): FieldInputs {
  const inputs = new FieldInputs(controller);
  const stop = controller.subscribe((_snapshot, event) => {
    if (event.type === 'reset' || event.type === 'cancelled') inputs.reset();
  });
  inject(DestroyRef).onDestroy(stop);
  return inputs;
}
