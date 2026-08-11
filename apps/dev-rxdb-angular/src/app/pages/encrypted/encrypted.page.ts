import { RxDB } from '@aiao/rxdb';
import { AdapterEncryptionFacade } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  LucideLock as Lock,
  LucideLockOpen as LockOpen,
  LucideDynamicIcon,
  LucidePlus as Plus,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-encrypted-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './encrypted.page.html',
  imports: [CommonModule, FormsModule, LucideDynamicIcon]
})
export default class EncryptedPage implements OnInit {
  private readonly rxdb = inject(RxDB);
  private readonly destroyRef = inject(DestroyRef);
  private encFacade: AdapterEncryptionFacade | null = null;

  readonly Lock = Lock;
  readonly LockOpen = LockOpen;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly RefreshCw = RefreshCw;

  readonly $isLocked = signal<boolean>(true);
  readonly $ready = signal<boolean>(false);
  readonly $users = signal<EncryptedUser[]>([]);
  readonly $error = signal<string | null>(null);
  readonly $isLoading = signal<boolean>(false);
  readonly $isFirstTime = signal<boolean>(false);

  readonly $hasUsers = computed(() => this.$users().length > 0);

  passphrase = '';
  newName = '';
  newCard = '';
  newSecret = '';

  async ngOnInit(): Promise<void> {
    try {
      const adapter = (await this.rxdb.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite;
      await adapter.connect();
      this.encFacade = adapter.encryption;
      this.$isLocked.set(this.encFacade.isLocked);
      this.$isFirstTime.set(!(await this.encFacade.isInitialized()));
      this.$ready.set(true);

      this.encFacade.lockChange$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(isLocked => {
        this.$isLocked.set(isLocked);
        if (isLocked) {
          this.$users.set([]);
        } else {
          void this.loadUsers();
        }
      });
    } catch (err) {
      this.$error.set(`Init failed: ${err instanceof Error ? err.message : String(err)}`);
      this.$ready.set(true);
    }
  }

  async unlock(): Promise<void> {
    if (!this.passphrase.trim()) return;
    this.$error.set(null);
    try {
      if (!this.encFacade) {
        const adapter = (await this.rxdb.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite;
        this.encFacade = adapter.encryption;
      }
      await this.encFacade.unlock({ passphrase: this.passphrase });
      this.$isFirstTime.set(false);
      this.passphrase = '';
    } catch (err) {
      this.$error.set(err instanceof Error ? err.message : String(err));
    }
  }

  lock(): void {
    if (!this.encFacade) return;
    this.encFacade.lock();
  }

  async loadUsers(): Promise<void> {
    this.$isLoading.set(true);
    this.$error.set(null);
    try {
      const repo = this.rxdb.entityManager.getRepository(EncryptedUser);
      const users = await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
      this.$users.set(users);
    } catch (err) {
      this.$error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.$isLoading.set(false);
    }
  }

  async createUser(): Promise<void> {
    if (!this.newName.trim()) return;
    this.$error.set(null);
    try {
      const user = new EncryptedUser();
      user.name = this.newName.trim();
      user.creditCardInfo = this.newCard.trim() || null;
      user.apiSecret = this.newSecret.trim() || null;
      await user.save();
      this.newName = '';
      this.newCard = '';
      this.newSecret = '';
      await this.loadUsers();
    } catch (err) {
      this.$error.set(err instanceof Error ? err.message : String(err));
    }
  }

  async removeUser(user: EncryptedUser): Promise<void> {
    this.$error.set(null);
    try {
      await user.remove();
      await this.loadUsers();
    } catch (err) {
      this.$error.set(err instanceof Error ? err.message : String(err));
    }
  }
}
