import type { Audit } from '../model.js';

/**
 * 审计时间线：摘要里最近的一批事件，加上已按需读取的更早事件，按时间正序。
 * 始终是完整日志的一个连续后缀，所以「是否还有更早的事件」只需比较已加载条数与总数。
 */
export class AuditTimeline {
  private loaded: Audit[] = [];
  private total = 0;

  /** 已加载的事件，时间正序。 */
  get events(): readonly Audit[] {
    return this.loaded;
  }
  /** 还有更早的事件没有加载。 */
  get hasEarlier(): boolean {
    return this.loaded.length < this.total;
  }
  /** 读取更早事件用的游标：当前最旧事件的 ID；时间线为空时为 undefined。 */
  get cursor(): string | undefined {
    return this.loaded[0]?.id;
  }

  /**
   * 接受新摘要里的最近事件。窗口与已加载的事件相接时保留更早的部分、并入新事件；
   * 窗口已越过已加载的部分（期间新增事件超过一个窗口）时从窗口重新开始，避免时间线中间出现缺口。
   */
  accept(window: readonly Audit[], total: number): void {
    const first = window[0];
    const at = first ? this.loaded.findIndex(event => event.id === first.id) : -1;
    this.loaded = at < 0 ? [...window] : [...this.loaded.slice(0, at), ...window];
    this.total = total;
  }
  /**
   * 并入读取到的一页更早事件（从新到旧）。`cursor` 须仍是当前最旧事件，否则时间线已被重置或重新开始，
   * 这页不再相接，丢弃并返回 false。
   */
  prepend(cursor: string, page: readonly Audit[]): boolean {
    if (this.cursor !== cursor) return false;
    this.loaded = [...page].reverse().concat(this.loaded);
    return true;
  }
  /** 清空，用于切换团队或退出账号。 */
  reset(): void {
    this.loaded = [];
    this.total = 0;
  }
}
