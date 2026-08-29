import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import {
  clearDatabase,
  createScriptRequestId,
  serializeFunctionWithResult,
  type ClearDatabaseResult
} from '../scripts';
import { DatabaseStateService } from '../services/database-state.service';
import { ThemeService } from '../services/theme.service';
import { DEVTOOLS_HOST_ACCESS, DEVTOOLS_PANEL_VERSION } from '../transport';
import type { Theme } from '../types/devtools.types';

/**
 * Settings 页面
 * 主题切换、数据库管理等设置
 */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, ConnectionGuardComponent],
  template: `
    <app-connection-guard>
      <div class="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <!-- 主题设置 -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-sm">主题设置</h3>
            <div class="mt-2 flex gap-2">
              @for (option of themeOptions; track option.value) {
                <button
                  class="btn btn-sm"
                  [ngClass]="{
                    'btn-primary': theme() === option.value,
                    'btn-ghost': theme() !== option.value
                  }"
                  (click)="setTheme(option.value)"
                >
                  {{ option.label }}
                </button>
              }
            </div>
            <span class="mt-1 text-xs opacity-70"> 当前：{{ resolvedTheme() }} </span>
          </div>
        </div>

        <!-- 关于 -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-sm">关于</h3>
            <p class="text-xs opacity-70">RxDB DevTools v{{ version }} (Angular)</p>
          </div>
        </div>

        <!-- 数据库导出（已停用） -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-sm">导出数据库</h3>
            <p class="text-xs opacity-70">
              导出已停用：面板不再把整个 OPFS 目录打包下载。该操作会绕过应用自己的加密与访问控制，
              把原始 SQLite / WAL 字节交到调试通道上。请改用应用侧的备份能力。
            </p>
            <div class="card-actions mt-4">
              <button class="btn btn-primary btn-sm" [disabled]="databaseExportDisabled">导出数据库</button>
            </div>
            @if (exportRefusal()) {
              <span class="mt-1 text-xs opacity-70">{{ exportRefusal() }}</span>
            }
          </div>
        </div>

        <!-- 数据库清理 -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-sm">清理数据库</h3>
            <p class="text-xs opacity-70">
              清理所有本地存储数据，包括 RxDB、OPFS、IndexedDB 和 localStorage。清理完成后页面会自动刷新。
            </p>

            <div class="card-actions mt-4">
              <button class="btn btn-error btn-sm" [disabled]="clearLoading()" (click)="handleClearDatabase()">
                @if (clearLoading()) {
                  <span class="loading loading-spinner loading-xs"></span>
                  清理中...
                } @else {
                  清理所有数据
                }
              </button>
            </div>
          </div>
        </div>

        <!-- 错误提示 (横跨两列) -->
        @if (error()) {
          <div class="alert alert-error col-span-1 md:col-span-2">
            <span class="text-xs">{{ error() }}</span>
          </div>
        }
      </div>
    </app-connection-guard>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: auto;
      }
    `
  ]
})
export class SettingsPage {
  /**
   * 扩展版本号。
   *
   * @remarks
   * P2-13：早先模板里硬编码 `v0.0.1`，与 `package.json` 无任何联动 ——
   * 而 `manifest.config.ts:10` 已经是 `version: pkg.version`，
   * 于是「manifest 显示的版本」与「关于页显示的版本」会在下次发版时分叉。
   * 这里改为读宿主注入的同一个来源（见 {@link DEVTOOLS_PANEL_VERSION}）。
   */
  readonly version = inject(DEVTOOLS_PANEL_VERSION);

  private readonly themeService = inject(ThemeService);
  private readonly hostAccess = inject(DEVTOOLS_HOST_ACCESS);
  private readonly databaseState = inject(DatabaseStateService);

  readonly theme = this.themeService.theme;
  readonly resolvedTheme = this.themeService.resolvedTheme;
  readonly dbInfo = this.databaseState.dbInfo;

  readonly clearLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * 数据库导出按钮是否禁用。
   *
   * @remarks
   * 常量 `true` 而不是信号：AC#43 要求的是「没有可点的入口」，不是「某些条件下不可点」。
   * 写成条件式会让「禁用」变成一个将来可能被某个分支解开的状态。
   */
  readonly databaseExportDisabled = true;

  /**
   * 强制发出的导出命令得到的固定拒绝码。
   *
   * @remarks
   * 与 v2 `settings.export` 的答案一致（见 `DEVTOOLS_OPERATION_REQUIRED_CAPABILITY`）。
   * 面板与 connector 各自拒一次是有意的：禁用按钮只挡住 UI，绕过 UI 的调用要在两侧都碰壁。
   */
  readonly exportRefusal = signal<string | null>(null);

  readonly themeOptions: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' }
  ];

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  /**
   * 强制发出数据库导出命令。
   *
   * @remarks
   * AC#43：无论数据库状态如何，答案固定为 `export_unsupported`，并且**不向被检查页面
   * 派发任何脚本**——`navigator.storage.getDirectory()`、SQLite 与 WAL 的读取次数因此结构上为 0，
   * 而不是靠「记得别调用」维持。答案不随 {@link dbInfo} 变化：一条会变的拒绝会被读成「稍后再试」。
   */
  requestDatabaseExport(): void {
    this.exportRefusal.set('export_unsupported');
  }

  handleClearDatabase(): void {
    if (!confirm('确定要清理所有本地数据吗？此操作不可撤销。')) {
      return;
    }

    this.clearLoading.set(true);
    this.error.set(null);

    void this.executeInInspectedWindow<ClearDatabaseResult>(clearDatabase, 'clear')
      .then(res => {
        const errors: string[] = [];
        if (!res?.rxdb?.success && res?.rxdb?.error) {
          errors.push(`RxDB: ${res.rxdb.error}`);
        }
        if (!res?.opfs?.success && res?.opfs?.error) {
          errors.push(`OPFS: ${res.opfs.error}`);
        }
        if (!res?.indexedDB?.success && res?.indexedDB?.error) {
          errors.push(`IndexedDB: ${res.indexedDB.error}`);
        }
        if (!res?.localStorage?.success && res?.localStorage?.error) {
          errors.push(`localStorage: ${res.localStorage.error}`);
        }

        if (errors.length > 0) {
          this.error.set(errors.join('; '));
        }

        // 全部关键项清理成功后，由面板控制刷新被检查页面（此时已持有结果，无竞态）。
        const criticalSuccess =
          !!res?.rxdb?.success && !!res?.opfs?.success && !!res?.indexedDB?.success && !!res?.localStorage?.success;
        if (criticalSuccess) {
          this.hostAccess.reloadInspectedPage();
        }
      })
      .catch(err => {
        this.error.set(err instanceof Error ? err.message : '清理失败');
      })
      .finally(() => {
        this.clearLoading.set(false);
      });
  }

  private executeInInspectedWindow<T>(
    fn: (...args: never[]) => unknown,
    prefix: string,
    args: readonly unknown[] = []
  ): Promise<T> {
    const requestId = createScriptRequestId(prefix);
    const code = serializeFunctionWithResult(fn, requestId, args);
    return this.hostAccess.evaluate<T>(code, requestId);
  }
}
