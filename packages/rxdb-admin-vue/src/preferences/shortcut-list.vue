<script setup lang="ts">
import type { ShortcutInfo } from '@aiao/rxdb-admin';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';

/**
 * 已注册快捷键列表：键帽 + 单独启停（总开关关闭时整体禁用）。
 */
const shell = useAdminShell();
const t = useAdminText();
const infos = useAdminStore(shell.shortcuts.list);
const prefs = useAdminStore(shell.preferences);

const labelOf = (info: ShortcutInfo): string => (info.labelKey ? t(info.labelKey) : (info.label ?? info.id));

const onToggle = (event: Event, id: string): void =>
  shell.shortcuts.setEnabled(id, (event.target as HTMLInputElement).checked);
</script>

<template>
  <p
    v-if="infos.length === 0"
    class="text-sm opacity-60"
    >{{ t('prefs.shortcuts.empty') }}</p
  >
  <ul
    v-else
    class="flex flex-col gap-1"
  >
    <li
      v-for="info in infos"
      :key="info.id"
      class="admin-row"
      :data-disabled="!prefs.shortcuts.enable"
    >
      <label
        :for="`prefs-shortcut-${info.id}`"
        class="admin-row-label"
        >{{ labelOf(info) }}</label
      >
      <span class="flex items-center gap-3">
        <span
          class="flex gap-0.5"
          aria-hidden="true"
        >
          <kbd
            v-for="key in info.keys"
            :key="key"
            class="kbd kbd-sm"
            >{{ key }}</kbd
          >
        </span>
        <input
          :id="`prefs-shortcut-${info.id}`"
          type="checkbox"
          class="toggle toggle-sm"
          :checked="!prefs.shortcuts.disabled.includes(info.id)"
          :disabled="!prefs.shortcuts.enable"
          :data-testid="`pref-shortcut-${info.id}`"
          @change="onToggle($event, info.id)"
        />
      </span>
    </li>
  </ul>
</template>
