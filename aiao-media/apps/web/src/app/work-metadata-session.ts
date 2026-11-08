import { type Observable, Subscription } from 'rxjs';
import type { LocalWorkSummary } from '../local-data/index';

export interface WorkMetadataState {
  works: LocalWorkSummary[];
  known: boolean;
  error: string | null;
}

/** 保留最后一次成功读取的全库归属事实，读取失败不代表作品不存在。 */
export class WorkMetadataSession {
  private subscription?: Subscription;
  private generation = 0;
  private closed = false;
  private state: WorkMetadataState = { works: [], known: false, error: null };

  constructor(
    private readonly port: { works$(): Observable<LocalWorkSummary[]> },
    private readonly accept: (state: WorkMetadataState) => void
  ) {}

  /** 重订阅时保留上次成功的事实，直到收到新的完整结果。 */
  start(): void {
    if (this.closed) return;
    const generation = ++this.generation;
    this.subscription?.unsubscribe();
    const subscription = new Subscription();
    this.subscription = subscription;
    this.state = { ...this.state, error: null };
    this.accept(this.state);
    try {
      subscription.add(
        this.port.works$().subscribe({
          next: works => {
            if (!this.active(generation)) return;
            this.state = { works, known: true, error: null };
            this.accept(this.state);
          },
          error: () => this.fail(generation)
        })
      );
    } catch {
      this.fail(generation);
    }
  }

  /** 关闭旧工作区的订阅，不再回调界面。 */
  close(): void {
    this.closed = true;
    ++this.generation;
    this.subscription?.unsubscribe();
  }

  private active(generation: number): boolean {
    return !this.closed && generation === this.generation;
  }

  private fail(generation: number): void {
    if (!this.active(generation)) return;
    this.state = { ...this.state, error: '本机作品记录暂时无法读取，请重试。' };
    this.accept(this.state);
  }
}
