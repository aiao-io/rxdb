<script setup lang="ts">
import { Check as CheckIcon, Languages as LanguagesIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { blurActive, localeLabel } from './menu-widgets.js';

/**
 * 语言切换：列出运行时的可用语言，选择后写入偏好。只有一种语言时不渲染。
 */
const shell = useAdminShell();
const t = useAdminText();
const prefs = useAdminStore(shell.preferences);
const revision = useAdminStore(shell.text);

// 语言目录由运行时持有、不是响应式的：随文案修订号重新读取，目录加载完成后下拉能出现
const locales = computed(() => {
  void revision.value;
  return shell.i18n.availableLocales;
});
const current = computed(() => {
  void revision.value;
  return prefs.value.app.locale || shell.i18n.locale;
});

const select = (locale: string): void => {
  shell.preferences.setPath('app.locale', locale);
  blurActive();
};
</script>

<template>
  <div
    v-if="locales.length >= 2"
    class="dropdown dropdown-end"
  >
    <button
      type="button"
      tabindex="0"
      class="btn btn-ghost btn-sm btn-square"
      :aria-label="t('widget.language')"
      aria-haspopup="menu"
      data-testid="admin-widget-language"
    >
      <LanguagesIcon :size="18" />
    </button>
    <ul
      tabindex="0"
      role="menu"
      class="dropdown-content menu bg-base-100 rounded-box z-50 w-48 p-2 shadow"
    >
      <li
        v-for="locale in locales"
        :key="locale"
      >
        <button
          type="button"
          role="menuitemradio"
          :aria-checked="locale === current"
          @click="select(locale)"
          >{{ localeLabel(locale)
          }}<CheckIcon
            v-if="locale === current"
            :size="14"
        /></button>
      </li>
    </ul>
  </div>
</template>
