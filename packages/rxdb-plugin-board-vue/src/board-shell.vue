<script setup lang="ts">
import {
  BoardShellController,
  focusModalTab,
  type BoardShellOptions,
  type BoardShellState
} from '@aiao/rxdb-plugin-board';
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue';

import { boardI18n } from './board-i18n.js';
import BoardView from './board-view.vue';

/** 看板文案翻译：`t(key, params)` 固定解析 board 命名空间（见 board-i18n.ts）。 */
const t = boardI18n.t;

/**
 * 看板外壳（US-537 / US-539 AC#4 / #5）：启动选择（新建空看板 / 装载演示数据 / 从备份恢复）、
 * 准备中与恢复中、工具栏（重置为演示数据 / 从备份恢复）与应用内确认，看板阶段嵌入 {@link BoardView}。
 *
 * 编排全部在核心包 `BoardShellController`（活动位置、恢复到新库名后整页重载读回、跨页面恢复中与切库重载），
 * 组件只渲染其状态并转发用户动作。与 Angular 的 `BoardShellComponent`、React 的 `BoardShell` 同功能同 DOM 契约
 * （类名 + data-testid）；样式随 `board-view.css` 子路径交付。
 */
const props = defineProps<{
  /** 宿主配置：实例工厂、本地适配器名、可选的演示数据（挂载时读取一次）。Angular / React 绑定的同名输入为 `options`。 */
  options: BoardShellOptions;
}>();

const controller = new BoardShellController(props.options);
// 实例类（RxDB）只能走 shallowRef：深层响应式代理会剥掉 #private
const state = shallowRef<BoardShellState>(controller.state);
const subscription = controller.state$.subscribe(next => {
  state.value = next;
});
const root = useTemplateRef<HTMLElement>('shell-root');
const startupFile = useTemplateRef<HTMLInputElement>('startup-file');
const menuFile = useTemplateRef<HTMLInputElement>('menu-file');
const confirmTitleId = `rxb-shell-${useId()}-confirm-title`;
let returnFocus: HTMLElement | null = null;

/** 看板视图的导出回调：归档完整生成后才交给浏览器下载。 */
const downloadBackup = (): Promise<void> => controller.downloadBackup();
const startEmpty = (): void => void controller.startEmpty();
const startSeed = (): void => void controller.startSeed();
const resetDemo = (): void => void controller.resetDemo();
const settleConfirm = (confirmed: boolean): void => controller.settleConfirm(confirmed);

const onRestoreFile = (event: Event): void => {
  const fileInput = event.target as HTMLInputElement;
  const file = fileInput.files?.[0];
  if (!file) return;
  fileInput.value = '';
  void controller.restoreFromFile(file);
};

/** 确认对话框的键盘：Esc 取消；Tab 不离开对话框（WAI-ARIA 模态对话框）。 */
const onConfirmKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.preventDefault();
    settleConfirm(false);
    return;
  }
  if (event.key === 'Tab' && root.value && focusModalTab(root.value, event.shiftKey)) event.preventDefault();
};

// 确认框打开聚焦「取消」（破坏性操作默认不确认），关闭后焦点回到触发入口
watch(
  () => state.value.confirm !== null,
  async open => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      root.value?.querySelector<HTMLElement>('[data-testid="host-confirm-no"]')?.focus();
      return;
    }
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  }
);

onMounted(() => {
  void controller.start();
});

onBeforeUnmount(() => {
  subscription.unsubscribe();
  void controller.destroy().catch((cause: unknown) => console.error('[board-shell] 断开看板失败', cause));
});
</script>

<template>
  <div
    ref="shell-root"
    class="rxb rxb-shell"
    data-testid="board-shell"
  >
    <!-- 启动选择：选择前不连接、不建表、不装种子（US-537） -->
    <section
      v-if="state.phase === 'startup'"
      class="rxb-shell-startup"
      :aria-label="t('shell.startup.ariaLabel')"
      data-testid="startup-page"
    >
      <div class="rxb-shell-card">
        <p class="rxb-shell-eyebrow">{{ t('shell.startup.eyebrow') }}</p>
        <h1 class="rxb-shell-heading">{{ t('shell.startup.heading') }}</h1>
        <p class="rxb-shell-hint">{{ t('shell.startup.hint') }}</p>
        <div class="rxb-shell-options">
          <button
            class="rxb-shell-option"
            type="button"
            data-testid="start-empty"
            @click="startEmpty"
          >
            <strong>{{ t('shell.startup.emptyTitle') }}</strong>
            <span>{{ t('shell.startup.emptyDesc') }}</span>
          </button>
          <button
            v-if="state.canSeed"
            class="rxb-shell-option"
            type="button"
            data-testid="start-seed"
            @click="startSeed"
          >
            <strong>{{ t('shell.startup.seedTitle') }}</strong>
            <span>{{ t('shell.startup.seedDesc') }}</span>
          </button>
          <button
            class="rxb-shell-option"
            type="button"
            data-testid="start-restore"
            @click="startupFile?.click()"
          >
            <strong>{{ t('shell.startup.restoreTitle') }}</strong>
            <span>{{ t('shell.startup.restoreDesc') }}</span>
          </button>
          <input
            ref="startup-file"
            type="file"
            accept=".rxdb"
            hidden
            :aria-label="t('shell.startup.fileLabel')"
            data-testid="restore-file"
            @change="onRestoreFile"
          />
        </div>
        <p
          v-if="state.error"
          class="rxb-shell-error"
          role="alert"
          data-testid="app-error"
          >{{ state.error }}</p
        >
      </div>
    </section>
    <p
      v-else-if="state.phase === 'loading'"
      class="rxb-shell-status"
      role="status"
      data-testid="loading-page"
      >{{ t('shell.loading') }}</p
    >
    <p
      v-else-if="state.phase === 'restoring'"
      class="rxb-shell-status"
      role="status"
      data-testid="restoring-page"
      >{{ state.restore.state === 'switching' ? t('shell.restoring.switching') : t('shell.restoring.status') }}</p
    >
    <div
      v-else
      class="rxb-shell-board"
    >
      <header
        class="rxb-shell-bar"
        data-testid="board-tools"
      >
        <span class="rxb-shell-brand">{{ t('shell.bar.brand') }}</span>
        <span class="rxb-shell-spacer"></span>
        <button
          v-if="state.canSeed"
          class="rxb-btn rxb-btn-sm"
          type="button"
          data-testid="reset-demo"
          @click="resetDemo"
          >{{ t('shell.bar.resetDemo') }}</button
        >
        <button
          class="rxb-btn rxb-btn-sm"
          type="button"
          data-testid="restore-open"
          @click="menuFile?.click()"
          >{{ t('shell.bar.restore') }}</button
        >
        <input
          ref="menu-file"
          type="file"
          accept=".rxdb"
          hidden
          :aria-label="t('shell.bar.fileLabel')"
          data-testid="restore-file-menu"
          @change="onRestoreFile"
        />
      </header>
      <p
        v-if="state.error"
        class="rxb-shell-error"
        role="alert"
        data-testid="app-error"
        >{{ state.error }}</p
      >
      <!-- 换库即换视图实例：useBoard 只认挂载时的那个实例 -->
      <BoardView
        v-if="state.rxdb"
        :key="state.rxdb.config.dbName"
        :rxdb="state.rxdb"
        :on-export-backup="downloadBackup"
      />
    </div>
    <div
      v-if="state.confirm"
      class="rxb-dialog-backdrop"
      @keydown="onConfirmKeydown"
    >
      <div
        class="rxb-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="confirmTitleId"
        data-testid="host-confirm"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="confirmTitleId"
            class="rxb-dialog-title"
            >{{ state.confirm.title }}</h2
          >
        </div>
        <div class="rxb-dialog-body">
          <p>{{ state.confirm.message }}</p>
        </div>
        <div class="rxb-dialog-footer">
          <button
            class="rxb-btn"
            type="button"
            data-testid="host-confirm-no"
            @click="settleConfirm(false)"
            >{{ t('common.cancel') }}</button
          >
          <button
            class="rxb-btn rxb-btn-primary"
            type="button"
            data-testid="host-confirm-yes"
            @click="settleConfirm(true)"
            >{{ state.confirm.confirmLabel }}</button
          >
        </div>
      </div>
    </div>
  </div>
</template>
