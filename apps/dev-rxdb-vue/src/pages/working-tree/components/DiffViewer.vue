<script lang="ts" setup>
import type { WorkingTreeDiffEntry } from '@aiao/rxdb-plugin-working-tree';
import { ChevronDown, FileDiff, Settings } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  buildFieldDiff,
  buildHunks,
  filterWhitespaceOnlyChanges,
  formatFieldValue,
  formatSide
} from '../utils/diff-format';
import {
  diffDisplayMode,
  diffHideWhitespace,
  diffWrap,
  type WorkingTreeDiffViewMode
} from '../utils/diff-viewer-preferences';
import { gdEntryPath, gdOpColor, gdOpIcon, gdOpLabel, gdPathColor, gdTableName } from '../utils/gd';

/** Split 视图里的一行：一个字段的旧 / 新两侧，缺侧为 `null`。 */
interface SplitRow {
  readonly key: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
}

/**
 * 右栏的 diff 查看器，模仿 GitHub Desktop 的文件 diff 视图。
 *
 * @remarks
 * 没有选中项时显示空态提示而不是空白：右栏是页面的主视觉区，空白会让
 * 「点左侧文件看右侧 diff」这个轴显得没接上。每个**字段**画成一个 hunk 盒子
 * （`buildHunks`，见 diff-format 的 TSDoc）：头部是 git 风格的
 * `@@ -a,b +c,d @@ <字段名>`（字段名占 git 里「函数上下文」的位置）。
 *
 * **两种显示模式**（GitHub Desktop 的 Unified / Split）：
 * Unified 逐字段显示 `- / +` 行；Split 是**逐行对齐的双栏**（side-by-side 形态）——
 * 一个字段占一行，旧值左栏红底、新值右栏绿底，缺侧留灰槽，两侧行号独立推进，
 * **不带「改前 / 改后」文字标签**（GitHub Desktop 的 split 也没有）。
 * 切换入口在 Diff Settings 菜单里，与 Hide Whitespace Changes / Show Word Wrap
 * 两个开关同处一菜单。两种模式只改变显示，不改变补丁内容。
 *
 * 文件头不显示**事务** id（`transactionId` 是工作树的簿记，与内容无关），
 * 路径 `schema/实体/实体id` 是「文件名」本身，完整保留、按状态着色
 * （PathLabel 同款）；操作类型图标放在 Settings 按钮的右侧（源码 diff-header 同位置）。
 *
 * 视觉对齐 GitHub Desktop：浅灰行号槽（`.gd-diff-gutter`），`-`/`+` 行整行红 / 绿底，
 * 行号与符号用对应侧的深红 / 深绿，内容文字保持正文色。
 */
const props = defineProps<{
  entry: WorkingTreeDiffEntry | null;
}>();

/** 面板的逻辑开合：驱动触发按钮的 aria-expanded 与面板的 hidden。 */
const settingsOpen = ref(false);
/** 面板节点是否留在 DOM 里；与 settingsOpen 分开，见 {@link closeSettingsLogically}。 */
const settingsMounted = ref(false);
const settingsContainer = ref<HTMLElement | null>(null);
const settingsButton = ref<HTMLButtonElement | null>(null);

/**
 * 选中后只做**逻辑收起**（隐藏节点、不卸载）：
 * Playwright 的 `check()` 在点击之后还要在**原节点**上读一次 checked 状态，
 * 同步卸载会把节点摘掉、让那次校验卡到超时；逻辑收起对用户来说与 Angular
 * 参考实现（选中即收起）视觉无差，节点留在 DOM 里直到下一次开合 / Escape /
 * 点击面板之外才真正卸载。
 */
function closeSettingsLogically(): void {
  settingsOpen.value = false;
}

const hunks = computed(() => {
  const entry = props.entry;
  if (entry === null) return [];
  const built = buildHunks(entry);
  return diffHideWhitespace.value ? filterWhitespaceOnlyChanges(built) : built;
});

/** Split 视图的行：一个字段一行，两侧行号独立推进（GitHub Desktop 的 side-by-side 行对齐）。 */
const splitRows = computed<SplitRow[]>(() => {
  const entry = props.entry;
  if (entry === null) return [];
  let oldLine = 1;
  let newLine = 1;
  return buildFieldDiff(entry).map(line => {
    const oldNumber = line.before === undefined ? null : oldLine++;
    const newNumber = line.after === undefined ? null : newLine++;
    return { key: line.key, before: line.before, after: line.after, oldNumber, newNumber };
  });
});

const onDocumentClick = (event: MouseEvent): void => {
  if (!settingsMounted.value) return;
  if (!settingsContainer.value?.contains(event.target as Node)) {
    settingsOpen.value = false;
    settingsMounted.value = false;
  }
};

/** Escape：真正卸载面板并还焦点给触发按钮（Angular 同款）。 */
const closeSettings = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !settingsMounted.value) return;
  event.stopPropagation();
  settingsOpen.value = false;
  settingsMounted.value = false;
  settingsButton.value?.focus();
};

/** 触发按钮的开合：逻辑收起（选中后）按「已收起」处理 → 再点即打开。 */
function toggleSettings(): void {
  if (settingsMounted.value && settingsOpen.value) {
    settingsOpen.value = false;
    settingsMounted.value = false;
    return;
  }
  settingsMounted.value = true;
  settingsOpen.value = true;
}

function toggleWrap(): void {
  diffWrap.value = !diffWrap.value;
  closeSettingsLogically();
}

function toggleWhitespace(): void {
  diffHideWhitespace.value = !diffHideWhitespace.value;
  closeSettingsLogically();
}

function setViewMode(mode: WorkingTreeDiffViewMode): void {
  diffDisplayMode.value = mode;
  closeSettingsLogically();
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', closeSettings);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', closeSettings);
});
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    v-if="entry !== null"
    data-testid="wt-diff-viewer"
  >
    <div
      class="relative shrink-0 border-b px-3 py-1"
      :style="{ background: 'var(--gd-panel)', borderColor: 'var(--gd-border)' }"
    >
      <div class="flex min-w-0 items-center gap-2">
        <FileDiff
          :size="14"
          :style="{ color: gdOpColor(entry.operation) }"
        />
        <!-- 路径里的实体 id 是「文件名」的一部分，不能省略；空间不够时中间省略（尾部保留结尾）；
             文本按状态着色（GitHub Desktop PathLabel 同款） -->
        <span
          class="flex min-w-0 flex-1 items-center text-[12px] font-semibold"
          :style="{ color: gdPathColor(entry.operation) }"
          :title="gdEntryPath(entry)"
        >
          <span class="shrink-0">{{ entry.namespace }}/{{ gdTableName(entry.entity) }}/</span>
          <span class="gd-truncate-tail min-w-0"
            ><span>{{ entry.entityId }}</span></span
          >
        </span>
        <span
          class="rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
          v-if="entry.origin === 'remote_sync'"
          :style="{ color: 'var(--gd-muted)' }"
        >
          Remote sync
        </span>
        <div
          class="flex shrink-0 items-center"
          ref="settingsContainer"
        >
          <button
            class="gd-icon-btn"
            :aria-expanded="settingsOpen"
            @click="toggleSettings"
            aria-haspopup="true"
            aria-label="Diff Settings"
            data-testid="wt-diff-settings"
            ref="settingsButton"
            title="Diff Settings"
            type="button"
          >
            <Settings :size="15" />
            <ChevronDown :size="10" />
          </button>
          <div
            class="gd-menu gd-diff-settings-panel absolute top-full right-2 z-40 mt-1"
            v-if="settingsMounted"
            :hidden="!settingsOpen"
            aria-label="Diff Settings"
            data-testid="wt-diff-settings-popup"
            role="group"
          >
            <div class="px-3 py-1.5 text-xs font-semibold">Diff Settings</div>
            <div class="gd-menu-header">Diff display</div>
            <label class="gd-menu-row cursor-pointer">
              <input
                :checked="diffDisplayMode === 'unified'"
                @change="setViewMode('unified')"
                name="wt-diff-display"
                type="radio"
              />
              Unified
            </label>
            <label class="gd-menu-row cursor-pointer">
              <input
                :checked="diffDisplayMode === 'split'"
                @change="setViewMode('split')"
                name="wt-diff-display"
                type="radio"
              />
              Split
            </label>
            <label class="gd-menu-row cursor-pointer">
              <input
                :checked="diffHideWhitespace"
                @change="toggleWhitespace"
                data-testid="wt-diff-whitespace"
                type="checkbox"
              />
              Hide Whitespace Changes
            </label>
            <label class="gd-menu-row cursor-pointer">
              <input
                :checked="diffWrap"
                @change="toggleWrap"
                data-testid="wt-diff-wrap"
                type="checkbox"
              />
              Show Word Wrap
            </label>
          </div>
        </div>
        <!-- 操作类型图标；title / aria-label 挂在 span 上——实测 svg + lucide 指令
             的 [title] 绑定渲染不出来（style 绑定正常），span 是稳定的载体 -->
        <span
          :aria-label="gdOpLabel(entry.operation)"
          :title="gdOpLabel(entry.operation)"
          role="img"
        >
          <component
            class="shrink-0"
            :is="gdOpIcon(entry.operation)"
            :size="14"
            :style="{ color: gdOpColor(entry.operation) }"
          />
        </span>
      </div>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <template v-if="diffDisplayMode === 'unified'">
        <div
          class="gd-hunk"
          v-for="hunk in hunks"
          :key="hunk.key + hunk.oldStart + hunk.newStart"
        >
          <div class="gd-hunk-header">
            @@ -{{ hunk.oldStart }},{{ hunk.oldCount }} +{{ hunk.newStart }},{{ hunk.newCount }} @@ {{ hunk.key }}
          </div>
          <div
            class="gd-diff-row"
            v-for="row in hunk.rows"
            :class="{ 'gd-add': row.sign === '+', 'gd-del': row.sign === '-' }"
            :key="row.key + row.sign + formatFieldValue(row.value)"
          >
            <div class="gd-diff-gutter border-r border-[var(--gd-border)]">
              <span class="gd-diff-num">{{ row.oldNumber ?? '' }}</span>
              <span class="gd-diff-num">{{ row.newNumber ?? '' }}</span>
              <span
                class="gd-diff-sign"
                :class="{ 'gd-add': row.sign === '+', 'gd-del': row.sign === '-' }"
                >{{ row.sign }}</span
              >
            </div>
            <div
              class="gd-diff-content"
              :style="{ whiteSpace: diffWrap ? undefined : 'pre' }"
            >
              <span :style="{ color: 'var(--gd-muted)' }">{{ row.key }}:</span>
              <span>{{ formatFieldValue(row.value) }}</span>
            </div>
          </div>
        </div>
        <p
          class="py-3 text-center text-xs"
          v-if="hunks.length === 0"
          :style="{ color: 'var(--gd-muted)' }"
        >
          No field-level patch to display
        </p>
      </template>
      <div
        class="gd-split"
        v-else
        data-testid="wt-split"
      >
        <div
          class="gd-split-row"
          v-for="row in splitRows"
          :key="row.key"
        >
          <div
            class="gd-split-cell gd-split-old"
            :class="{ 'gd-split-cell-empty': row.before === undefined }"
            data-testid="wt-split-old"
          >
            <template v-if="row.before !== undefined">
              <span class="gd-split-num">{{ row.oldNumber }}</span>
              <span class="gd-split-sign">-</span>
              <span class="gd-split-value">{{ row.key }}: {{ formatSide(row.before) }}</span>
            </template>
          </div>
          <div
            class="gd-split-cell gd-split-new"
            :class="{ 'gd-split-cell-empty': row.after === undefined }"
            data-testid="wt-split-new"
          >
            <template v-if="row.after !== undefined">
              <span class="gd-split-num">{{ row.newNumber }}</span>
              <span class="gd-split-sign">+</span>
              <span class="gd-split-value">{{ row.key }}: {{ formatSide(row.after) }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div
    class="gd-empty h-full text-sm"
    v-else
  >
    <FileDiff
      class="text-[var(--gd-line-num)]"
      :size="40"
    />
    <p>Select a change from the left to see its field-level diff</p>
  </div>
</template>

<style scoped>
/* 与 Angular 侧组件样式同款：面板宽按视口夹回；单选/复选用品牌蓝 */
.gd-diff-settings-panel {
  width: min(240px, calc(100% - 8px));
}
.gd-diff-settings-panel input {
  accent-color: var(--gd-accent);
}
</style>
