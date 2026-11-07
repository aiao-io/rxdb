export type ResourcePriority = 'foreground' | 'background';
interface Waiter {
  priority: ResourcePriority;
  resolve(): void;
  reject(error: unknown): void;
  cleanup(): void;
}
interface ResourceTask {
  key: string;
  run(signal: AbortSignal): Promise<void>;
  controller: AbortController;
  waiters: Set<Waiter>;
  state: 'queued' | 'running';
  preempted: boolean;
}

export class ResourceScheduler {
  private readonly tasks = new Map<string, ResourceTask>();
  private readonly running = new Set<ResourceTask>();
  constructor(private readonly limit = 2) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('INVALID: 资源并发数无效');
  }

  keys(): string[] {
    return [...new Set([...this.tasks.keys(), ...[...this.running].map(task => task.key)])];
  }

  enqueue(key: string, priority: ResourcePriority, run: ResourceTask['run'], signal?: AbortSignal): Promise<void> {
    let task = this.tasks.get(key);
    if (!task) {
      task = { key, run, controller: new AbortController(), waiters: new Set(), state: 'queued', preempted: false };
      this.tasks.set(key, task);
    }
    if (task.state === 'running' && task.controller.signal.aborted) task.preempted = true;
    const current = task;
    const result = new Promise<void>((resolve, reject) => {
      const cancel = () => this.cancel(current, waiter);
      const waiter: Waiter = { priority, resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) };
      current.waiters.add(waiter);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
    this.pump();
    return result;
  }

  private priority(task: ResourceTask): number {
    return [...task.waiters].some(waiter => waiter.priority === 'foreground') ? 0 : 1;
  }

  private cancel(task: ResourceTask, waiter: Waiter): void {
    if (!task.waiters.delete(waiter)) return;
    waiter.cleanup();
    waiter.reject(new Error('CANCELLED: 资源准备已取消'));
    if (task.waiters.size) return;
    task.preempted = false;
    if (task.state === 'queued') this.tasks.delete(task.key);
    else task.controller.abort(new Error('CANCELLED: 资源准备已取消'));
    this.pump();
  }

  private pump(): void {
    const queued = [...this.tasks.values()]
      .filter(task => task.state === 'queued')
      .sort((a, b) => this.priority(a) - this.priority(b));
    while (this.running.size < this.limit && queued.length) this.start(queued.shift()!);
    if (!queued.some(task => this.priority(task) === 0)) return;
    const background = [...this.running].find(task => this.priority(task) === 1 && !task.controller.signal.aborted);
    if (!background) return;
    background.preempted = true;
    background.controller.abort(new Error('PREEMPTED: 前台加载优先'));
  }

  private start(task: ResourceTask): void {
    task.state = 'running';
    this.running.add(task);
    let pending: Promise<void>;
    try {
      pending = task.run(task.controller.signal);
    } catch (error) {
      pending = Promise.reject(error);
    }
    void pending.then(
      () => this.finish(task),
      error => this.finish(task, error)
    );
  }

  private finish(task: ResourceTask, error?: unknown): void {
    this.running.delete(task);
    if (task.preempted && task.waiters.size) {
      task.preempted = false;
      task.state = 'queued';
      task.controller = new AbortController();
      this.pump();
      return;
    }
    this.tasks.delete(task.key);
    for (const waiter of task.waiters) {
      waiter.cleanup();
      if (error !== undefined) waiter.reject(error);
      else waiter.resolve();
    }
    task.waiters.clear();
    this.pump();
  }
}
