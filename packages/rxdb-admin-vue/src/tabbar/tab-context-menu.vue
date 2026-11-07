<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { useAdminShell, useAdminStore, useAdminText } from '../context.js';
import type { TabMenuAnchor } from './types.js';

interface Item {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

/**
 * 页签右键菜单：关闭 / 刷新 / 固定 / 新窗口 / 关闭一侧 / 关闭其他 / 关闭全部 / 内容最大化。
 * 打开时焦点落在第一项；Esc、点击菜单外、滚动、窗口失焦都会关闭（`close`）。
 */
const props = defineProps<{
  /** 菜单锚点。 */
  anchor: TabMenuAnchor;
}>();

const emit = defineEmits<{
  /** 菜单应该关闭。 */
  close: [];
}>();

const shell = useAdminShell();
const t = useAdminText();
const tabsState = useAdminStore(shell.tabs);
const ui = useAdminStore(shell.ui);
const prefs = useAdminStore(shell.preferences);
const root = useTemplateRef<HTMLDivElement>('root');

const index = computed(() => tabsState.value.tabs.findIndex(candidate => candidate.key === props.anchor.key));
const tab = computed(() => tabsState.value.tabs[index.value]);
const position = computed(() => ({
  left: `${Math.min(props.anchor.x, window.innerWidth - 190)}px`,
  top: `${Math.min(props.anchor.y, window.innerHeight - 330)}px`
}));

const items = computed<Item[]>(() => {
  const current = tab.value;
  if (!current) return [];
  const { tabs } = tabsState.value;
  const { key } = props.anchor;
  const others = tabs.filter(candidate => candidate.key !== key && !candidate.pinned);
  return [
    { id: 'close', label: t('tabbar.close'), disabled: current.pinned, run: () => shell.closeTab(key) },
    {
      id: 'reload',
      label: t('tabbar.reload'),
      run: () => {
        shell.activateTab(key);
        shell.ui.refresh();
      }
    },
    { id: 'pin', label: current.pinned ? t('tabbar.unpin') : t('tabbar.pin'), run: () => shell.tabs.togglePin(key) },
    { id: 'openNew', label: t('tabbar.openNew'), run: () => shell.openTabInNewWindow(key) },
    {
      id: 'closeLeft',
      label: t('tabbar.closeLeft'),
      disabled: !tabs.slice(0, index.value).some(candidate => !candidate.pinned),
      run: () => shell.closeLeftTabs(key)
    },
    {
      id: 'closeRight',
      label: t('tabbar.closeRight'),
      disabled: !tabs.slice(index.value + 1).some(candidate => !candidate.pinned),
      run: () => shell.closeRightTabs(key)
    },
    {
      id: 'closeOthers',
      label: t('tabbar.closeOthers'),
      disabled: others.length === 0,
      run: () => shell.closeOtherTabs(key)
    },
    {
      id: 'closeAll',
      label: t('tabbar.closeAll'),
      disabled: !tabs.some(candidate => !candidate.pinned),
      run: () => shell.closeAllTabs()
    },
    ...(prefs.value.tabbar.showMaximize ?
      [
        {
          id: 'maximize',
          label: ui.value.maximized ? t('tabbar.restore') : t('tabbar.maximize'),
          run: () => shell.ui.toggleMaximize()
        }
      ]
    : [])
  ];
});

const close = (): void => emit('close');

const dismiss = (event: Event): void => {
  if (!(event.target instanceof Node) || !root.value?.contains(event.target)) close();
};

onMounted(() => {
  root.value?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  document.addEventListener('pointerdown', dismiss, true);
  window.addEventListener('scroll', close, true);
  window.addEventListener('blur', close);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', dismiss, true);
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('blur', close);
});

const run = (item: Item): void => {
  close();
  item.run();
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  const delta =
    event.key === 'ArrowDown' ? 1
    : event.key === 'ArrowUp' ? -1
    : 0;
  if (delta === 0) return;
  event.preventDefault();
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[(current + delta + buttons.length) % buttons.length]?.focus();
};
</script>

<template>
  <div
    v-if="tab"
    ref="root"
    class="admin-context-menu"
    role="menu"
    :aria-label="tab.title"
    data-testid="admin-tab-menu"
    :style="position"
    @keydown="onKeyDown"
  >
    <ul class="menu menu-sm p-0">
      <li
        v-for="item in items"
        :key="item.id"
        v-bind="item.disabled ? { class: 'menu-disabled' } : undefined"
      >
        <button
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          :data-testid="`admin-tab-menu-${item.id}`"
          @click="run(item)"
        >
          {{ item.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
