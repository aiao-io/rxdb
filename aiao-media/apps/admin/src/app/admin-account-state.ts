import { computed, signal } from '@angular/core';
import { normalizeDisplayName, type AdminProfile } from './admin-profile';
import { ProductRequestError, type ProductClient } from './product-client';

/** 顶栏和账户页共享已确认的资料，异步回执受当前身份约束。 */
export class AdminAccountState {
  private userId: string | null = null;
  private generation = 0;
  private readonly needsReload = signal(false);
  readonly profile = signal<AdminProfile | null>(null);
  readonly draft = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly saved = signal(false);
  readonly validation = computed(() => {
    try {
      normalizeDisplayName(this.draft());
      return '';
    } catch (error) {
      return (error as Error).message;
    }
  });
  readonly canSave = computed(() =>
    Boolean(
      this.profile() &&
      !this.loading() &&
      !this.saving() &&
      !this.needsReload() &&
      !this.validation() &&
      this.draft().trim() !== this.profile()?.displayName
    )
  );

  constructor(private readonly client: Pick<ProductClient, 'adminProfile' | 'saveAdminProfile'>) {}

  async connect(userId: string | null): Promise<void> {
    if (userId === this.userId) return;
    this.userId = userId;
    this.generation++;
    this.profile.set(null);
    this.draft.set('');
    this.message.set('');
    this.saved.set(false);
    this.loading.set(false);
    this.saving.set(false);
    this.needsReload.set(false);
    if (userId) await this.reload();
  }

  async reload(): Promise<void> {
    if (!this.userId || this.saving() || this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.message.set('');
    this.saved.set(false);
    try {
      const profile = await this.client.adminProfile();
      if (generation !== this.generation) return;
      this.profile.set(profile);
      this.draft.set(profile.displayName ?? '');
      this.needsReload.set(false);
    } catch {
      if (generation !== this.generation) return;
      this.needsReload.set(true);
      this.message.set('账户资料暂时无法读取。后台仍可使用，请稍后重新读取资料。');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const profile = this.profile();
    if (!profile || !this.canSave()) return;
    const generation = this.generation;
    this.saving.set(true);
    this.message.set('');
    this.saved.set(false);
    try {
      const confirmed = await this.client.saveAdminProfile(
        normalizeDisplayName(this.draft()),
        profile.revision,
        crypto.randomUUID()
      );
      if (generation !== this.generation) return;
      this.profile.set(confirmed);
      this.draft.set(confirmed.displayName ?? '');
      this.saved.set(true);
      this.message.set('名称已保存。');
    } catch (error) {
      if (generation !== this.generation) return;
      this.needsReload.set(true);
      this.message.set(
        error instanceof ProductRequestError && error.status === 409 ?
          '资料已被其他页面修改。请重新读取资料，核对后再保存。'
        : '未能确认保存结果。请重新读取资料，核对后再保存。'
      );
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }
}
