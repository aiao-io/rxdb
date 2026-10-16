import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * 结果行清单：where-used / 影响面 / 差异 / 覆盖率 / 缺口 的统一展示面。
 * 每行携带 data-testid（e2e 断言依赖），空数据时展示空态文案。
 */
@Component({
  selector: 'bom-line-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lines().length === 0) {
      <div class="empty-state">{{ emptyText() }}</div>
    } @else {
      @for (line of lines(); track line) {
        <div class="where-used-row" [attr.data-testid]="testId()">{{ line }}</div>
      }
    }
  `
})
export class LineList {
  readonly lines = input.required<string[]>();
  readonly testId = input.required<string>();
  readonly emptyText = input('暂无数据');
}
