<script setup lang="ts">
import { Search as SearchIcon } from '@lucide/vue';
import { useTemplateRef, watch, type Component } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import { closeOnBackdrop, useModalDialog } from '../use-dialog.js';

/**
 * 命令面板：聚合菜单、命令与应用注册的来源（如全文搜索），键盘上下选择、回车执行。
 * 以原生模态 `<dialog>` 呈现；输入框是 combobox，结果是 listbox。
 */
const shell = useAdminShell();
const t = useAdminText();
const state = useAdminStore(shell.palette);
const field = useTemplateRef<HTMLInputElement>('field');

const close = (): void => shell.palette.close();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
useModalDialog(dialog, () => state.value.open, close);

watch(
  () => state.value.open,
  open => {
    if (open) field.value?.focus();
  },
  { flush: 'post' }
);

const iconOf = (icon: unknown): Component | undefined => (icon ? (icon as Component) : undefined);

const onInput = (event: Event): void => shell.palette.setQuery((event.target as HTMLInputElement).value);

const onKeyDown = (event: KeyboardEvent): void => {
  // 输入法组合中的按键交给输入法；Safari 确认候选的回车在 compositionend 之后到达，isComposing 为 false、keyCode 为 229
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    shell.palette.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    void shell.palette.select();
  }
};
</script>

<template>
  <dialog
    ref="dialog"
    class="admin-palette"
    :aria-label="t('widget.search')"
    data-testid="admin-palette"
    @click="closeOnBackdrop($event, close)"
  >
    <template v-if="state.open">
      <div class="admin-palette-input">
        <SearchIcon
          :size="18"
          aria-hidden="true"
        />
        <input
          ref="field"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="admin-palette-list"
          :aria-activedescendant="state.total > 0 ? `admin-palette-option-${state.selectedIndex}` : undefined"
          aria-autocomplete="list"
          autocomplete="off"
          :placeholder="t('palette.placeholder')"
          :aria-label="t('palette.placeholder')"
          :value="state.query"
          data-testid="admin-palette-input"
          @input="onInput"
          @keydown="onKeyDown"
        />
      </div>
      <div
        id="admin-palette-list"
        role="listbox"
        class="admin-palette-list"
        :aria-label="t('widget.search')"
      >
        <div
          v-for="group in state.groups"
          :key="group.id"
          role="group"
          :aria-label="group.labelKey ? t(group.labelKey) : group.label"
        >
          <div
            class="admin-palette-group"
            aria-hidden="true"
          >
            {{ group.labelKey ? t(group.labelKey) : group.label }}
          </div>
          <div
            v-for="entry in group.entries"
            :id="`admin-palette-option-${entry.index}`"
            :key="`${group.id}:${entry.item.id}`"
            role="option"
            class="admin-palette-item"
            :aria-selected="entry.index === state.selectedIndex"
            data-testid="admin-palette-option"
            @mousemove="entry.index !== state.selectedIndex && shell.palette.hover(entry.index)"
            @click="shell.palette.select(entry.index)"
          >
            <component
              :is="iconOf(entry.item.icon)"
              v-if="iconOf(entry.item.icon)"
              :size="16"
            />
            <span>
              <template
                v-for="(segment, index) in entry.segments"
                :key="index"
              >
                <mark v-if="segment.match">{{ segment.text }}</mark>
                <span v-else>{{ segment.text }}</span>
              </template>
            </span>
            <span
              v-if="entry.item.sublabel"
              class="admin-palette-sub"
              >{{ entry.item.sublabel }}</span
            >
          </div>
        </div>
        <p
          v-if="state.total === 0 && !state.loading && state.mode === 'results'"
          class="admin-palette-empty"
          role="status"
        >
          {{ t('palette.empty') }}
        </p>
        <p
          v-if="state.loading"
          class="admin-palette-empty"
          role="status"
        >
          {{ t('palette.loading') }}
        </p>
        <p
          v-if="state.failed.length > 0"
          class="admin-palette-empty text-warning"
          role="status"
        >
          {{ t('palette.failed') }}
        </p>
      </div>
      <div
        class="admin-palette-footer"
        aria-hidden="true"
      >
        <span><kbd class="kbd kbd-xs">↑</kbd> <kbd class="kbd kbd-xs">↓</kbd> {{ t('palette.hint.navigate') }}</span>
        <span><kbd class="kbd kbd-xs">↵</kbd> {{ t('palette.hint.open') }}</span>
        <span><kbd class="kbd kbd-xs">Esc</kbd> {{ t('palette.hint.close') }}</span>
      </div>
    </template>
  </dialog>
</template>
