import { checkName } from './errors.js';
import { copyValue } from './payload.js';
import type { OrbitEventBus, OrbitEventHandler, OrbitValue } from './types.js';

export class EventBus implements OrbitEventBus {
  private readonly handlers = new Map<string, Set<OrbitEventHandler>>();

  get listenerCount(): number {
    return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0);
  }
  constructor(private readonly send: (event: string, args: OrbitValue[]) => void) {}

  $on(event: string, handler: OrbitEventHandler): this {
    checkName(event);
    const handlers = this.handlers.get(event) ?? new Set<OrbitEventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  $once(event: string, handler: OrbitEventHandler): this {
    const once: OrbitEventHandler = (...args) => {
      this.$off(event, once);
      handler(...args);
    };
    return this.$on(event, once);
  }

  $off(event: string, handler?: OrbitEventHandler): this {
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
    const payload = copyValue(args) as OrbitValue[];
    this.send(event, payload);
    this.dispatch(event, payload);
    return this;
  }

  dispatch(event: string, args: OrbitValue[]): void {
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
