import { requireCondition } from '../core/errors.js';
import { normalizeRoute, type NavigationAction, type NavigationState } from '../core/routes.js';

type ApplyRoute = (route: string, signal: AbortSignal) => void | Promise<void>;

export class AppNavigation {
  private entries: string[];
  private index = 0;
  private busy = false;
  private apply: ApplyRoute | null = null;
  get state(): NavigationState {
    return { route: this.entries[this.index], back: this.index > 0, forward: this.index < this.entries.length - 1 };
  }

  constructor(
    route: string,
    private readonly changed: () => void
  ) {
    this.entries = [normalizeRoute(route)];
  }

  bind(apply: ApplyRoute): () => void {
    requireCondition(!this.apply, 'INVALID', '应用重复登记导航协议');
    this.apply = apply;
    this.changed();
    return () => {
      this.apply = null;
    };
  }

  record(route: string, replace = false): void {
    const normalized = normalizeRoute(route);
    if (normalized === this.state.route) return;
    if (replace) this.entries[this.index] = normalized;
    else {
      this.entries = [...this.entries.slice(0, this.index + 1), normalized];
      this.index++;
    }
    this.changed();
  }

  async go(action: NavigationAction, signal: AbortSignal): Promise<NavigationState> {
    requireCondition(this.apply, 'UNSUPPORTED', '此应用尚未登记导航协议');
    requireCondition(!this.busy, 'BUSY', '请先完成当前导航');
    const index = action.type === 'back' ? this.index - 1 : this.index + 1;
    const moving = action.type === 'back' || action.type === 'forward';
    requireCondition(!moving || (index >= 0 && index < this.entries.length), 'NOT_FOUND', '没有可用的导航历史');
    const route = 'route' in action ? normalizeRoute(action.route) : this.entries[index];
    signal.throwIfAborted();
    this.busy = true;
    try {
      await this.apply(route, signal);
      signal.throwIfAborted();
      if (moving) {
        this.index = index;
        this.changed();
      } else this.record(route, action.type === 'replace');
      return this.state;
    } finally {
      this.busy = false;
    }
  }
}
