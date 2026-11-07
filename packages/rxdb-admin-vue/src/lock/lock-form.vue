<script setup lang="ts">
import { onMounted, ref, useTemplateRef } from 'vue';
import { useAdminShell, useAdminText } from '../context.js';
import LockClock from './lock-clock.vue';

/**
 * 锁屏表单：未设置密码时先要求设置，已设置则校验；忘记密码二次确认后清除密码并解锁（数据不受影响）。
 * 只在锁定期间挂载，所以每次锁定都是干净的输入状态，并把焦点放到密码框。
 */
const shell = useAdminShell();
const t = useAdminText();
const password = ref('');
const error = ref<'wrong' | 'unavailable' | null>(null);
const confirmingReset = ref(false);
const field = useTemplateRef<HTMLInputElement>('field');

onMounted(() => field.value?.focus());

const onInput = (event: Event): void => {
  password.value = (event.target as HTMLInputElement).value;
  error.value = null;
};

const submit = async (): Promise<void> => {
  try {
    if (shell.lock.hasPassword()) {
      if (!(await shell.lock.unlockWith(password.value))) error.value = 'wrong';
    } else if (password.value !== '') {
      await shell.lock.setPassword(password.value);
    }
  } catch {
    error.value = 'unavailable';
  }
};
</script>

<template>
  <form
    class="admin-lock-card"
    @submit.prevent="submit"
  >
    <LockClock />
    <p class="text-sm opacity-70">
      {{ shell.lock.hasPassword() ? t('lock.enterPassword') : t('lock.setPassword') }}
    </p>
    <input
      ref="field"
      type="password"
      class="input w-full"
      :autocomplete="shell.lock.hasPassword() ? 'current-password' : 'new-password'"
      :placeholder="t('lock.placeholder')"
      :aria-label="t('lock.placeholder')"
      :value="password"
      data-testid="admin-lock-input"
      @input="onInput"
    />
    <p
      v-if="error"
      role="alert"
      class="text-error text-sm"
      data-testid="admin-lock-error"
    >
      {{ error === 'wrong' ? t('lock.wrong') : t('lock.unavailable') }}
    </p>
    <button
      type="submit"
      class="btn btn-primary w-full"
      data-testid="admin-lock-submit"
    >
      {{ shell.lock.hasPassword() ? t('lock.unlock') : t('lock.set') }}
    </button>
    <template v-if="shell.lock.hasPassword()">
      <div
        v-if="confirmingReset"
        class="flex flex-col gap-2"
      >
        <p class="text-xs opacity-70">{{ t('lock.forgotConfirm') }}</p>
        <button
          type="button"
          class="btn btn-error btn-sm"
          data-testid="admin-lock-reset-apply"
          @click="shell.lock.resetPassword()"
        >
          {{ t('lock.forgotApply') }}
        </button>
      </div>
      <button
        v-else
        type="button"
        class="btn btn-ghost btn-sm"
        data-testid="admin-lock-forgot"
        @click="confirmingReset = true"
      >
        {{ t('lock.forgot') }}
      </button>
    </template>
  </form>
</template>
