import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type OAuthStatus, readOAuthAvailability } from '../supabase-oauth-status';
import type { SyncTarget } from '../sync-target';

@Component({
  selector: 'app-sync-target-settings',
  imports: [FormsModule],
  templateUrl: './sync-target-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncTargetSettings {
  readonly kind = input.required<SyncTarget['kind']>();
  readonly url = input.required<string>();
  readonly publicKey = input.required<string>();
  readonly platformAvailable = input.required<boolean>();
  readonly nativeMode = input.required<boolean>();
  readonly configured = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly message = input.required<string>();
  readonly oauthProjects =
    input.required<{ ref: string; name: string; organizationId: string | null; status: string | null }[]>();
  readonly oauthBusy = input.required<boolean>();
  readonly urlChanged = output<string>();
  readonly keyChanged = output<string>();
  readonly changeTarget = output<SyncTarget['kind']>();
  readonly login = output<Event>();
  readonly connectOAuth = output<void>();
  readonly initializeOAuth = output<string>();
  readonly oauthStatus = signal<OAuthStatus>('checking');

  constructor() {
    void this.checkOAuth();
  }

  /** 向 Worker 确认一键授权是否已开通；确认期间按钮保持禁用，部署方开通后可以重新检查。 */
  async checkOAuth() {
    this.oauthStatus.set('checking');
    this.oauthStatus.set((await readOAuthAvailability()) ? 'available' : 'unavailable');
  }

  /** 下拉框只作操作入口：选中即复位，取消确认或初始化失败后仍能再选同一项目。 */
  selectOAuthProject(select: HTMLSelectElement) {
    const ref = select.value;
    select.value = '';
    if (ref) this.initializeOAuth.emit(ref);
  }
}
