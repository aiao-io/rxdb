import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 用一致的清单与空态展示反查、差异、覆盖率等结果。 */
@Component({
  selector: 'bom-line-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lines().length === 0) {
      <div class="empty-state" role="status">{{ emptyText() }}</div>
    } @else {
      <ul class="result-list">
        @for (line of lines(); track line) {
          <li class="where-used-row" [attr.data-testid]="testId()">{{ line }}</li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .result-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .where-used-row {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class LineList {
  readonly lines = input.required<string[]>();
  readonly testId = input.required<string>();
  readonly emptyText = input('暂无数据');
}
