<script lang="ts" setup>
import { AdapterEncryptionFacade } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { injectRxDB } from '@aiao/rxdb-vue';
import { Lock, LockOpen, Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { firstValueFrom, Subscription } from 'rxjs';
import { computed, onMounted, onUnmounted, ref } from 'vue';

const rxdb = injectRxDB()!;

let encFacade: AdapterEncryptionFacade | null = null;
let lockSub: Subscription | null = null;

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
    users.value = await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

onMounted(async () => {
  try {
    const adapter = (await rxdb.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite;
    encFacade = adapter.encryption;
    isLocked.value = encFacade.isLocked;
    isFirstTime.value = !(await encFacade.isInitialized());
    lockSub = encFacade.lockChange$.subscribe(locked => {
      isLocked.value = locked;
      if (!locked) {
        void loadUsers();
      } else {
        users.value = [];
      }
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});

onUnmounted(() => {
  lockSub?.unsubscribe();
});

async function handleUnlock() {
  if (!encFacade || !passphrase.value.trim()) return;
  error.value = null;
  try {
    await encFacade.unlock({ passphrase: passphrase.value });
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
      <h1 class="text-2xl font-bold">本地字段加密演示</h1>
      <span :class="['badge', isLocked ? 'badge-error' : 'badge-success']">
        {{ isLocked ? '已锁定' : '已解锁' }}
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
        <h2 class="card-title text-lg">解锁数据库</h2>
        <div
          class="alert alert-info alert-soft"
          v-if="isFirstTime"
          role="alert"
        >
          <span
            >首次使用：请设置一个密码短语，系统将用它加密您的数据。请牢记此密码，后续解锁需要输入相同的密码短语。</span
          >
        </div>
        <p
          class="text-base-content/70 text-sm"
          v-else
        >
          输入密码短语以解密加密字段。密码短语不会离开您的设备。
        </p>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">密码</legend>
          <input
            class="input input-bordered w-full"
            v-model="passphrase"
            @keydown.enter="handleUnlock"
            placeholder="输入密码…"
            type="password"
          />
        </fieldset>
        <div class="card-actions">
          <button
            class="btn btn-primary"
            :disabled="!passphrase.trim()"
            @click="handleUnlock"
          >
            <LockOpen class="size-4" />
            解锁
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
          刷新
        </button>
        <button
          class="btn btn-sm btn-error btn-outline"
          @click="handleLock"
        >
          <Lock class="size-4" />
          锁定
        </button>
      </div>

      <!-- Create new user -->
      <div class="card card-border bg-base-100">
        <div class="card-body space-y-3">
          <h2 class="card-title text-base">添加加密用户</h2>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <fieldset class="fieldset">
              <legend class="fieldset-legend">姓名（明文）</legend>
              <input
                class="input input-bordered w-full"
                v-model="newName"
                placeholder="Alice"
                type="text"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">信用卡号（加密）</legend>
              <input
                class="input input-bordered w-full"
                v-model="newCard"
                placeholder="4242 4242 4242 4242"
                type="text"
              />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">API 密钥（加密）</legend>
              <input
                class="input input-bordered w-full"
                v-model="newSecret"
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
            >
              <Plus class="size-4" />
              保存用户
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
              <th>姓名</th>
              <th>信用卡号 <span class="badge badge-warning badge-xs ml-1">加密</span></th>
              <th>API 密钥 <span class="badge badge-warning badge-xs ml-1">加密</span></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
            >
              <td>{{ user.name }}</td>
              <td class="font-mono text-xs">{{ user.creditCardInfo ?? '—' }}</td>
              <td class="font-mono text-xs">{{ user.apiSecret ?? '—' }}</td>
              <td>
                <button
                  class="btn btn-ghost btn-xs text-error"
                  @click="handleRemoveUser(user)"
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
        <p>暂无加密用户，请在上方添加。</p>
      </div>
    </template>
  </div>
</template>
