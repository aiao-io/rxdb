import { ChangeDetectionStrategy, Component } from '@angular/core';
import { getImportedDbName, leaveImportedDb } from '../rxdb/imported-db';

/**
 * 外壳提示条：当前打开的是导入的失败现场库（US-909 阶段 B，AC#7）。
 *
 * @remarks
 * 库名在启动时定下（`setup_rxdb_sqlite-wasm.ts` 读覆盖键），换库只能整页重载，所以这里读一次即可，不必响应式。
 * 「回到默认库」删覆盖键后重载；导入的库留在本机，可再从导入页「打开该库」。
 */
@Component({
  selector: 'app-imported-db-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dbName; as name) {
      <div class="alert alert-warning alert-soft m-2" data-testid="imported-db-banner" role="status">
        <span>
          正在查看导入的失败现场库
          <code class="font-mono" data-testid="imported-db-name">{{ name }}</code>
        </span>
        <button class="btn btn-sm" (click)="leave()" type="button">回到默认库</button>
      </div>
    }
  `
})
export class ImportedDbBanner {
  readonly dbName = getImportedDbName(window.localStorage);

  leave(): void {
    leaveImportedDb();
  }
}
