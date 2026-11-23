<script lang="ts" setup>
import { AdapterEncryptionFacade } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { injectRxDB } from '@aiao/rxdb-vue';
import { Lock, LockOpen, Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { firstValueFrom, Subscription } from 'rxjs';
import { computed, markRaw, onMounted, onUnmounted, ref } from 'vue';

const rxdb = injectRxDB()!;
const { t } = useI18n();

let encFacade: AdapterEncryptionFacade | null = null;
let lockSub: Subscription | null = null;
/** 页面已卸载：连接与加密元数据查询都可能晚于卸载才回来，回来后不再建订阅、不再写页面状态 */
let disposed = false;

const isLocked = ref(true);
const users = ref<EncryptedUser[]>([]);
const error = ref<string | null>(null);
const isLoading = ref(false);
const isFirstTime = ref(false);

const passphrase = ref('');
const newName = ref('');
const newCard = ref('');
const newSecret = ref('');

const hasUsers = computed(() => users.value.length > 0);

async function loadUsers() {
  isLoading.value = true;
  error.value = null;
  try {
    const repo = rxdb.entityManager.getRepository(EncryptedUser);
    users.value = (await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }))).map(user =>
      markRaw(user)
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

async function bindEncryption(adapter: RxDBAdapterSqlite): Promise<AdapterEncryptionFacade> {
  const facade = adapter.encryption;
  encFacade = facade;
  isLocked.value = facade.isLocked;
  const initialized = await facade.isInitialized();
  if (disposed) return facade;
  isFirstTime.value = !initialized;
  lockSub?.unsubscribe();
  lockSub = facade.lockChange$.subscribe(locked => {
    isLocked.value = locked;
    if (!locked) {
      void loadUsers();
    } else {
      users.value = [];
    }
  });
  return facade;
}

onMounted(async () => {
  try {
    const adapter = (await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite;
    if (disposed) return;
    await bindEncryption(adapter);
  } catch (err) {
    if (!disposed) error.value = err instanceof Error ? err.message : String(err);
  }
});

onUnmounted(() => {
  disposed = true;
  lockSub?.unsubscribe();
  lockSub = null;
});

async function handleUnlock() {
  if (!passphrase.value.trim()) return;
  error.value = null;
  try {
    const facade = encFacade ?? (await bindEncryption((await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite));
    await facade.unlock({ passphrase: passphrase.value });
    isLocked.value = facade.isLocked;
    isFirstTime.value = false;
    passphrase.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function handleLock() {
  encFacade?.lock();
}

async function handleCreateUser() {
  if (!newName.value.trim()) return;
  error.value = null;
  try {
    const user = new EncryptedUser();
    user.name = newName.value.trim();
    user.creditCardInfo = newCard.value.trim() || null;
    user.apiSecret = newSecret.value.trim() || null;
    await user.save();
    newName.value = '';
    newCard.value = '';
    newSecret.value = '';
    await loadUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

async function handleRemoveUser(user: EncryptedUser) {
  error.value = null;
  try {
    await user.remove();
    await loadUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div class="container mx-auto max-w-3xl space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <component
        :class="['size-6', isLocked ? 'text-error' : 'text-success']"
        :is="isLocked ? Lock : LockOpen"
      />
      <h1 class="text-2xl font-bold">{{ t('page.encrypted.title') }}</h1>
      <span
        :class="['badge', isLocked ? 'badge-error' : 'badge-success']"
        data-testid="encryption-status"
      >
        {{ isLocked ? t('page.encrypted.locked') : t('page.encrypted.unlocked') }}
      </span>
    </div>

    <!-- Error -->
    <div
      class="alert alert-error alert-soft"
      v-if="error"
      role="alert"
    >
      <span>{{ error }}</span>
    </div>

    <!-- Unlock form -->
    <div
      class="card card-border bg-base-100"
      v-if="isLocked"
    >
      <div class="card-body space-y-4">
        <h2 class="card-title text-lg">{{ t('page.encrypted.unlockTitle') }}</h2>
        <div
          class="alert alert-info alert-soft"
          v-if="isFirstTime"
          role="alert"
        >
          <span>{{ t('page.encrypted.firstUse') }}</span>
        </div>
        <p
          class="text-base-content/70 text-sm"
          v-else
        >
          {{ t('page.encrypted.unlockHint') }}
        </p>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">{{ t('page.encrypted.passphraseLabel') }}</legend>
          <input
            class="input input-bordered w-full"
            v-model="passphrase"
            @keydown.enter="handleUnlock"
            data-testid="encryption-passphrase"
            :placeholder="t('page.encrypted.passphrasePlaceholder')"
            type="password"
          />
        </fieldset>
        <div class="card-actions">
          <button
            class="btn btn-primary"
            :disabled="!passphrase.trim()"
            @click="handleUnlock"
            data-testid="encryption-unlock"
          >
            <LockOpen class="size-4" />
            {{ t('page.encrypted.unlock') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Unlocked state -->
    <template v-else>
      <!-- Toolbar -->
      <div class="flex items-center justify-between">
        <button
          class="btn btn-sm btn-ghost"
          @click="loadUsers"
        >
          <RefreshCw :class="['size-4', isLoading ? 'animate-spin' : '']" />
          {{ t('page.encrypted.refresh') }}
        </button>
        <button
          class="btn btn-sm btn-error btn-outline"
          @click="handleLock"
          data-testid="encryption-lock"
        >
          <Lock class="size-4" />
          {{ t('page.encrypted.lock') }}
        </button>
      </div>

      <!-- Create new user -->
      <div class="card card-border bg-base-100">
        <div class="card-body space-y-3">
          <h2 class="card-title text-base">{{ t('page.encrypted.createTitle') }}</h2>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">{{ t('page.encrypted.nameLabel') }}</legend>
              <input
                class="input input-bordered w-full"
                v-model="newName"
                data-testid="encryption-name"
                placeholder="Alice"
                type="text"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">{{ t('page.encrypted.cardLabel') }}</legend>
              <input
                class="input input-bordered w-full"
                v-model="newCard"
                data-testid="encryption-card"
                placeholder="4242 4242 4242 4242"
                type="text"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">{{ t('page.encrypted.apiKeyLabel') }}</legend>
              <input
                class="input input-bordered w-full"
                v-model="newSecret"
                data-testid="encryption-secret"
                placeholder="sk_live_…"
                type="text"
              />
            </fieldset>
          </div>
          <div class="card-actions">
            <button
              class="btn btn-primary btn-sm"
              :disabled="!newName.trim()"
              @click="handleCreateUser"
              data-testid="encryption-save-user"
            >
              <Plus class="size-4" />
              {{ t('page.encrypted.saveUser') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Users table -->
      <div
        class="overflow-x-auto"
        v-if="hasUsers"
      >
        <table class="table-zebra table-sm table">
          <thead>
            <tr>
              <th>{{ t('page.encrypted.name') }}</th>
              <th>{{ t('page.encrypted.card') }} <span class="badge badge-warning badge-xs ml-1">{{ t('page.encrypted.encryptedBadge') }}</span></th>
              <th>{{ t('page.encrypted.apiKey') }} <span class="badge badge-warning badge-xs ml-1">{{ t('page.encrypted.encryptedBadge') }}</span></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
              data-testid="encryption-user-row"
            >
              <td>{{ user.name }}</td>
              <td class="font-mono text-xs">{{ user.creditCardInfo ?? '—' }}</td>
              <td class="font-mono text-xs">{{ user.apiSecret ?? '—' }}</td>
              <td>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  @click="handleRemoveUser(user)"
                  data-testid="encryption-delete-user"
                >
                  <Trash2 class="size-3" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="text-base-content/50 py-10 text-center"
        v-else
      >
        <p>{{ t('page.encrypted.empty') }}</p>
      </div>
    </template>
  </div>
</template>
