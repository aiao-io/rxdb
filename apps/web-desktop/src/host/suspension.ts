import { isRecord } from '../core/catalog.js';
import { requireCondition } from '../core/errors.js';

export type BackgroundState = 'running' | 'suspending' | 'suspended' | 'resuming' | 'unknown';

export class Suspension {
  state: BackgroundState = 'running';
  constructor(
    private readonly supported: boolean,
    private readonly request: (name: string) => Promise<unknown>,
    private readonly changed: (state: BackgroundState) => void
  ) {}

  async suspend(): Promise<void> {
    requireCondition(this.supported, 'UNSUPPORTED', '此应用未声明挂起协议');
    requireCondition(this.state === 'running', 'BUSY', '请先完成当前后台状态切换');
    this.set('suspending');
    let requested = false;
    try {
      const document = await this.request('document.prepareClose');
      requireCondition(isRecord(document) && typeof document['dirty'] === 'boolean', 'INVALID', '应用未确认文档状态');
      requireCondition(document['dirty'] === false, 'DIRTY', '应用有未保存内容，请先保存后再挂起');
      requested = true;
      const result = await this.request('application.suspend');
      requireCondition(isRecord(result) && result['saved'] === true, 'INVALID', '应用未确认状态已保存');
      this.set('suspended');
    } catch (error) {
      if (requested) await this.recover();
      else this.set('running');
      throw error;
    }
  }

  async resume(): Promise<void> {
    requireCondition(this.supported, 'UNSUPPORTED', '此应用未声明挂起协议');
    if (this.state === 'running') return;
    requireCondition(this.state === 'suspended' || this.state === 'unknown', 'BUSY', '请先完成当前后台状态切换');
    this.set('resuming');
    try {
      requireCondition((await this.request('application.resume')) === true, 'INVALID', '应用未确认恢复');
      this.set('running');
    } catch (error) {
      this.set('unknown');
      throw error;
    }
  }

  private async recover(): Promise<void> {
    try {
      requireCondition((await this.request('application.resume')) === true, 'INVALID', '恢复状态未确认');
      this.set('running');
    } catch {
      this.set('unknown');
    }
  }

  private set(state: BackgroundState): void {
    this.state = state;
    this.changed(state);
  }
}
