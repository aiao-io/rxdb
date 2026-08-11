import { APP_BASE_HREF } from '@angular/common';
import { Pipe, PipeTransform, inject } from '@angular/core';

@Pipe({
  name: 'baseSrc',
  standalone: true
})
export class BaseSrcPipe implements PipeTransform {
  /**
   * P0-1：**必须在字段初始化器里注入**。
   *
   * `inject()` 只能在注入上下文中调用，而管道的 `transform()` 由变更检测调用 —— 那不是注入上下文。
   * 原实现把 `inject(APP_BASE_HREF)` 放在 `transform()` 体内的 `if (value.startsWith('/'))` 分支里：
   *
   * - 传相对路径（`'angular.svg' | baseSrc`，即模板里现在的唯一用法）恰好绕过该分支 → 看着没事；
   * - 一旦传 `/` 开头的值 → 立刻 `NG0203`，模板整块渲染失败。
   *
   * 也就是说这个管道的主分支**从未被执行过**。字段初始化器是注入上下文，构造时取一次即可。
   */
  private readonly baseHref = inject(APP_BASE_HREF);

  transform(value: string): string {
    if (!value) return '';
    if (value.startsWith('/')) {
      return `${this.baseHref}${value.slice(1)}`;
    }
    return value;
  }
}
