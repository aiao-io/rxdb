import { DatePipe } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';
import { AdminAccountState } from './admin-account-state';
import type { AdminSession } from './admin-auth';
import type { AdminAccountIdentity } from './admin-profile';
import type { ProductClient } from './product-client';

/** 当前管理员的基础资料编辑页，Auth 与权限字段只读。 */
@Component({
  selector: 'app-admin-account',
  imports: [DatePipe],
  templateUrl: './admin-account.html',
  styleUrl: './admin-account.css'
})
export class AdminAccount {
  private identityGeneration = 0;
  readonly state = input.required<AdminAccountState>();
  readonly user = input.required<AdminSession['user']>();
  readonly client = input.required<ProductClient>();
  readonly identity = signal<AdminAccountIdentity | null>(null);
  readonly identityError = signal('');
  readonly identityLoading = signal(false);

  constructor() {
    effect(onCleanup => {
      const client = this.client();
      const userId = this.user().id;
      void this.loadIdentity(client, userId);
      onCleanup(() => {
        this.identityGeneration++;
      });
    });
  }

  async retryIdentity(): Promise<void> {
    await this.loadIdentity(this.client(), this.user().id);
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.state().save();
  }

  edit(event: Event): void {
    this.state().draft.set((event.target as HTMLInputElement).value);
    this.state().message.set('');
    this.state().saved.set(false);
  }

  private async loadIdentity(client: ProductClient, userId: string): Promise<void> {
    const generation = ++this.identityGeneration;
    this.identity.set(null);
    this.identityError.set('');
    this.identityLoading.set(true);
    try {
      const identity = await client.adminAccountIdentity();
      if (generation === this.identityGeneration && identity.userId === userId) this.identity.set(identity);
    } catch {
      if (generation === this.identityGeneration) this.identityError.set('账号信息暂时无法读取。');
    } finally {
      if (generation === this.identityGeneration) this.identityLoading.set(false);
    }
  }
}
