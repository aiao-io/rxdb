import { ChangeDetectionStrategy, Component } from '@angular/core';
import { I18nPipe } from '../pipes/i18n.pipe';
import { dbConnectionError } from '../rxdb/db-connection';

/**
 * 应用壳的数据库连接失败提示（US-221）。
 *
 * @remarks
 * 连接失败时受守卫的路由不渲染、其余页面的查询也取不到数据；这条提示是唯一能看到原因的地方。
 * 库通常要等占着它的上下文（如刚关闭的页面）退出后才能再打开，所以给一个整页重新加载的按钮。
 */
@Component({
  selector: 'app-db-connection-alert',
  imports: [I18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as text) {
      <div class="alert alert-error m-4" data-testid="app-db-error" role="alert">
        <span class="flex-1 text-sm">{{ 'error.databaseOpen' | i18n: { message: text } }}</span>
        <button class="btn btn-sm" (click)="reload()" type="button">{{ 'common.reload' | i18n }}</button>
      </div>
    }
  `
})
export class DbConnectionAlert {
  readonly message = dbConnectionError.asReadonly();

  reload(): void {
    window.location.reload();
  }
}
