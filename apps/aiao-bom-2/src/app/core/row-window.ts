export class RowWindows<T, R> {
  private readonly pages = new Map<number, R[]>();
  get size(): number {
    return [...this.pages.values()].reduce((sum, page) => sum + page.length, 0);
  }
  constructor(
    private readonly rows: readonly T[],
    private readonly project: (row: T) => R,
    readonly pageSize = 500,
    readonly maxPages = 8
  ) {}
  get(index: number): R | undefined {
    if (index < 0 || index >= this.rows.length) return undefined;
    const start = Math.floor(index / this.pageSize) * this.pageSize;
    let page = this.pages.get(start);
    if (!page) {
      page = this.rows.slice(start, start + this.pageSize).map(this.project);
      this.pages.set(start, page);
      if (this.pages.size > this.maxPages) this.pages.delete(this.pages.keys().next().value!);
    }
    return page[index - start];
  }
  forEach(visit: (record: R) => void): void {
    for (const page of this.pages.values()) for (const row of page) visit(row);
  }
}
