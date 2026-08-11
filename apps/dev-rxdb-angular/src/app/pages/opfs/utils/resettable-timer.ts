export class ResettableTimer {
  private timer?: ReturnType<typeof setTimeout>;

  schedule(callback: () => void, delay: number): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      callback();
    }, delay);
  }

  clear(): void {
    if (this.timer === undefined) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
