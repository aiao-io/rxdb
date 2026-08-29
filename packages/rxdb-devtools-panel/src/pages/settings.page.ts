import { NgClass } from '@angular/common';

// P2-13：与 `manifest.config.ts` 取同一个来源，避免关于页与 manifest 的版本分叉
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import pkg from '../../../package.json';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import {
  clearDatabase,
  createScriptRequestId,
  downloadDatabase,
  executeInInspectedWindow,
  serializeFunctionWithResult,
  type ClearDatabaseResult,
  type DownloadDatabaseResult
} from '../scripts';
import { DatabaseStateService } from '../services/database-state.service';
import { PortService } from '../services/port.service';
import { ThemeService } from '../services/theme.service';
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

        <!-- 数据库下载 -->
        <div class="card bg-base-200">
          <div class="card-body">
            <h3 class="card-title text-sm">下载数据库</h3>
            <p class="text-xs opacity-70">将 OPFS 中的数据库文件打包下载为 tar 文件，用于备份或调试。</p>
            <div class="card-actions mt-4">
              <button
                class="btn btn-primary btn-sm"
                [disabled]="downloadLoading() || !dbInfo()"
                (click)="handleDownloadDatabase()"
              >
                @if (downloadLoading()) {
                  <span class="loading loading-spinner loading-xs"></span>
                  打包中...
                } @else {
                  下载数据库
                }
              </button>
            </div>
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
   * 这里改为读构建期注入的同一个来源。
   */
  readonly version = pkg.version;

  private readonly themeService = inject(ThemeService);
  private readonly portService = inject(PortService);
  private readonly databaseState = inject(DatabaseStateService);

  readonly theme = this.themeService.theme;
  readonly resolvedTheme = this.themeService.resolvedTheme;
  readonly dbInfo = this.databaseState.dbInfo;

  readonly downloadLoading = signal(false);
  readonly clearLoading = signal(false);
  readonly error = signal<string | null>(null);

  readonly themeOptions: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' }
  ];

  setTheme(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  handleDownloadDatabase(): void {
    const databaseName = this.dbInfo()?.dbName;
    if (!databaseName) {
      this.error.set('未获取到数据库信息，请先刷新数据库连接');
      return;
    }

    this.downloadLoading.set(true);
    this.error.set(null);

    void this.executeInInspectedWindow<DownloadDatabaseResult>(downloadDatabase, 'download', [databaseName])
      .then(res => {
        if (res?.error) {
          this.error.set(res.error);
        }
      })
      .catch(err => {
        this.error.set(err instanceof Error ? err.message : '下载失败');
      })
      .finally(() => {
        this.downloadLoading.set(false);
      });
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
          chrome.devtools.inspectedWindow.reload({});
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
    return executeInInspectedWindow<T>(this.portService, chrome.devtools.inspectedWindow, code, requestId);
  }
}
