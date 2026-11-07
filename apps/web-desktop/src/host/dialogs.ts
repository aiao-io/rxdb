export interface DialogField {
  name: string;
  label: string;
  value: string;
  options?: { value: string; label: string }[];
}
export interface DialogOptions {
  title: string;
  message: string;
  fields?: DialogField[];
  actions: { id: string; label: string; danger?: boolean }[];
}
export interface DialogResult {
  action: string;
  values: Record<string, string>;
}
export interface PendingDialog {
  options: DialogOptions;
  resolve(result: DialogResult): void;
}

export class Dialogs {
  private readonly queue: PendingDialog[] = [];
  current: PendingDialog | null = null;
  constructor(private readonly changed: () => void) {}
  ask(options: DialogOptions, signal?: AbortSignal): Promise<DialogResult> {
    if (signal?.aborted) return Promise.resolve({ action: 'cancel', values: {} });
    return new Promise(resolve => {
      const cancel = () => this.cancel(pending);
      const pending: PendingDialog = {
        options,
        resolve: result => {
          signal?.removeEventListener('abort', cancel);
          resolve(result);
        }
      };
      signal?.addEventListener('abort', cancel, { once: true });
      this.queue.push(pending);
      this.next();
    });
  }
  answer(action: string, values: Record<string, string> = {}): void {
    this.current?.resolve({ action, values });
    this.current = null;
    this.next();
  }
  cancelAll(): void {
    this.current?.resolve({ action: 'cancel', values: {} });
    this.current = null;
    for (const pending of this.queue.splice(0)) pending.resolve({ action: 'cancel', values: {} });
    this.changed();
  }
  private cancel(pending: PendingDialog): void {
    const index = this.queue.indexOf(pending);
    if (index >= 0) this.queue.splice(index, 1);
    if (this.current === pending) this.current = null;
    pending.resolve({ action: 'cancel', values: {} });
    this.next();
  }
  private next(): void {
    if (!this.current) this.current = this.queue.shift() ?? null;
    this.changed();
  }
}
