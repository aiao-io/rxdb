<script lang="ts" setup>
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { Menu } from '@lucide/vue';
import { DEMO_DATE_OPTIONS, DEMO_FORMAT_DATE, DEMO_FORMAT_NUMBER } from '../rxdb/i18n';
import { useAppService } from '../composables/useAppService';

const { toggleSidebar } = useAppService();
const { t, locale, setLocale, formatDate, formatNumber } = useI18n();
const changeLocale = (event: Event) => {
  void setLocale((event.target as HTMLSelectElement).value);
};
</script>

<template>
  <div
    class="flex items-center justify-between"
    id="layout-topbar"
    aria-label="Navbar"
    role="navigation"
    style="pointer-events: none"
  >
    <div class="inline-flex items-center gap-3">
      <button
        class="btn btn-ghost btn-sm pointer-events-auto md:hidden"
        @click="toggleSidebar"
        aria-label="Toggle menu"
      >
        <Menu :size="20" />
      </button>
    </div>
    <div class="pointer-events-auto inline-flex items-center gap-3">
      <div
        class="hidden text-xs sm:block"
        :aria-label="t('preview', undefined, 'demo')"
      >
        <span data-testid="i18n-formatted-date">{{ formatDate(DEMO_FORMAT_DATE, DEMO_DATE_OPTIONS) }}</span>
        <span
          class="mx-2"
          aria-hidden="true"
          >·</span
        >
        <span data-testid="i18n-formatted-number">{{ formatNumber(DEMO_FORMAT_NUMBER) }}</span>
      </div>
      <label class="inline-flex items-center gap-2 text-sm">
        <span>{{ t('language', undefined, 'demo') }}</span>
        <select
          class="select select-sm w-auto"
          data-testid="i18n-locale"
          :value="locale.startsWith('en') ? 'en' : 'zh-Hans'"
          @change="changeLocale"
        >
          <option value="zh-Hans">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
    </div>
  </div>
</template>
