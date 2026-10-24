import { concatMap, type Observable, type Subscription } from 'rxjs';
import type { LocalImageInfo, LocalWorkSummary } from '../local-data/index';

export type LibraryWork = LocalWorkSummary & { url: string | null; info?: LocalImageInfo };
export interface WorkLibraryPort {
  works$(): Observable<LocalWorkSummary[]>;
  preview(jobId: string): Promise<string>;
  release(url: string): void;
}

export class WorkLibrarySession {
  private closed = false;
  private works: LibraryWork[] = [];
  private subscription?: Subscription;

  constructor(
    private readonly port: WorkLibraryPort,
    private readonly accept: (works: LibraryWork[]) => void,
    private readonly report: () => void
  ) {}

  start(): void {
    this.subscription = this.port
      .works$()
      .pipe(concatMap(entries => this.render(entries)))
      .subscribe({
        error: () => {
          this.close();
          this.report();
        }
      });
  }

  close(): void {
    this.closed = true;
    this.subscription?.unsubscribe();
    this.release(this.works);
    this.works = [];
  }

  private async render(entries: LocalWorkSummary[]): Promise<void> {
    const previous = new Map(this.works.map(work => [work.jobId, work]));
    const next: LibraryWork[] = [];
    for (const item of entries) {
      if (this.closed) break;
      next.push(await this.preview(item, previous.get(item.jobId)));
    }
    if (this.closed) return this.release(next);
    const retained = new Set(next.map(work => work.url));
    this.release(this.works.filter(work => !retained.has(work.url)));
    this.works = next;
    this.accept(next);
  }

  private async preview(item: LocalWorkSummary, previous?: LibraryWork): Promise<LibraryWork> {
    if (item.status !== 'saved') return { ...item, url: null };
    try {
      return {
        ...item,
        url: previous?.url ?? (await this.port.preview(item.jobId))
      };
    } catch {
      return { ...item, url: null };
    }
  }

  private release(works: LibraryWork[]): void {
    for (const work of works) if (work.url) this.port.release(work.url);
  }
}
