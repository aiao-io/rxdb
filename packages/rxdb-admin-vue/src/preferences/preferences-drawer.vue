<script setup lang="ts">
import type { PreferenceTab } from '@aiao/rxdb-admin';
import { X as XIcon } from '@lucide/vue';
import { computed, ref, useTemplateRef } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { closeOnBackdrop, useModalDialog } from '../use-dialog.js';
import ImportPanel from './import-panel.vue';
import PrefRow from './pref-row.vue';

/**
 * 偏好抽屉：由 schema 驱动的五个页签，页脚提供重置 / 复制 / 导入配置。
 * 以原生模态 `<dialog>` 呈现，焦点陷阱、Esc 与背景惰性由浏览器负责。
 */
const shell = useAdminShell();
const t = useAdminText();
const ui = useAdminStore(shell.ui);
const tabs = useAdminStore(shell.drawer);
const hasDiff = useAdminStore(shell.preferences.hasDiff);
const active = ref<PreferenceTab>('appearance');
const importing = ref(false);
const copyState = ref<'copy' | 'copied' | 'copyFailed'>('copy');

const close = (): void => shell.ui.setPreferencesOpen(false);
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
useModalDialog(dialog, () => ui.value.preferencesOpen, close);
const current = computed(() => tabs.value.find(tab => tab.id === active.value) ?? tabs.value[0]);

const copy = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(shell.preferences.exportJson());
    copyState.value = 'copied';
  } catch {
    copyState.value = 'copyFailed';
  }
  setTimeout(() => {
    copyState.value = 'copy';
  }, 1500);
};
</script>

<template>
  <dialog
    ref="dialog"
    class="admin-drawer"
    aria-labelledby="admin-prefs-title"
    data-testid="admin-preferences"
    @click="closeOnBackdrop($event, close)"
  >
    <template v-if="ui.preferencesOpen">
      <header class="flex items-center justify-between px-5 pt-4">
        <h2
          id="admin-prefs-title"
          class="text-lg font-semibold"
        >
          {{ t('prefs.title') }}
        </h2>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          :aria-label="t('prefs.close')"
          data-testid="pref-close"
          @click="close"
        >
          <XIcon :size="16" />
        </button>
      </header>
      <div
        role="tablist"
        class="tabs tabs-border admin-drawer-tabs px-5"
      >
        <button
          v-for="tab in tabs"
          :id="`prefs-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="tab.id === current?.id"
          aria-controls="prefs-panel"
          :class="tab.id === current?.id ? 'tab tab-active' : 'tab'"
          :data-testid="`pref-tab-${tab.id}`"
          @click="active = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <div
        id="prefs-panel"
        role="tabpanel"
        :aria-labelledby="`prefs-tab-${current?.id}`"
        class="admin-drawer-body"
      >
        <p
          v-if="current?.sections.length === 0"
          class="text-sm opacity-60"
        >
          {{ t('prefs.empty.extension') }}
        </p>
        <section
          v-for="section in current?.sections"
          :key="section.id"
          class="admin-section"
          :aria-labelledby="`prefs-section-${section.id}`"
        >
          <h3
            :id="`prefs-section-${section.id}`"
            class="admin-section-title"
          >
            {{ section.title }}
          </h3>
          <PrefRow
            v-for="row in section.rows"
            :key="row.id"
            :row="row"
          />
        </section>
      </div>
      <footer class="admin-drawer-footer">
        <ImportPanel
          v-if="importing"
          @done="importing = false"
        />
        <template v-else>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            data-testid="pref-reset"
            @click="shell.preferences.reset()"
            >{{ t('prefs.reset')
            }}<span
              v-if="hasDiff"
              class="admin-reset-dot"
              aria-hidden="true"
              data-testid="pref-reset-dot"
          /></button>
          <span class="flex gap-1">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-testid="pref-import"
              @click="importing = true"
            >
              {{ t('prefs.import') }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-testid="pref-copy"
              @click="copy"
            >
              {{ t(`prefs.${copyState}`) }}
            </button>
          </span>
        </template>
      </footer>
    </template>
  </dialog>
</template>
