import { checkName } from './errors.js';
import { copyValue } from './payload.js';
import type { WujieEventBus, WujieEventHandler, WujieValue } from './types.js';

export class EventBus implements WujieEventBus {
  private readonly handlers = new Map<string, Set<WujieEventHandler>>();

  get listenerCount(): number {
    return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0);
  }
  constructor(private readonly send: (event: string, args: WujieValue[]) => void) {}

  $on(event: string, handler: WujieEventHandler): this {
    checkName(event);
    const handlers = this.handlers.get(event) ?? new Set<WujieEventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  $once(event: string, handler: WujieEventHandler): this {
    const once: WujieEventHandler = (...args) => {
      this.$off(event, once);
      handler(...args);
    };
    return this.$on(event, once);
  }

  $off(event: string, handler?: WujieEventHandler): this {
    if (!handler) {
      this.handlers.delete(event);
      return this;
    }
    const handlers = this.handlers.get(event);
    handlers?.delete(handler);
    if (!handlers?.size) this.handlers.delete(event);
    return this;
  }

  $emit(event: string, ...args: unknown[]): this {
    checkName(event);
    const payload = copyValue(args) as WujieValue[];
    this.send(event, payload);
    this.dispatch(event, payload);
    return this;
  }

  dispatch(event: string, args: WujieValue[]): void {
    const errors: unknown[] = [];
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      try {
        handler(...args);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, '事件处理失败');
  }

  $clear(): void {
    this.handlers.clear();
  }
}
