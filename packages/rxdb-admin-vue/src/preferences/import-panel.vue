<script setup lang="ts">
import { ref } from 'vue';
import { useAdminShell, useAdminText } from '../context.js';

/**
 * 导入配置面板：粘贴 JSON 后应用，非法 JSON 提示且保持当前设置；应用成功或取消时触发 `done`。
 */
const emit = defineEmits<{
  /** 面板应该收起。 */
  done: [];
}>();

const shell = useAdminShell();
const t = useAdminText();
const text = ref('');
const error = ref(false);

const onInput = (event: Event): void => {
  text.value = (event.target as HTMLTextAreaElement).value;
  error.value = false;
};

const apply = (): void => {
  if (shell.preferences.importJson(text.value).ok) emit('done');
  else error.value = true;
};
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-testid="pref-import-panel"
  >
    <textarea
      class="textarea textarea-sm h-28 w-full font-mono"
      :value="text"
      :placeholder="t('prefs.import.placeholder')"
      :aria-label="t('prefs.import')"
      data-testid="pref-import-text"
      @input="onInput"
    />
    <p
      v-if="error"
      role="alert"
      class="text-error text-sm"
      >{{ t('prefs.import.invalid') }}</p
    >
    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        @click="emit('done')"
        >{{ t('prefs.import.cancel') }}</button
      >
      <button
        type="button"
        class="btn btn-primary btn-sm"
        data-testid="pref-import-apply"
        @click="apply"
        >{{ t('prefs.import.apply') }}</button
      >
    </div>
  </div>
</template>
