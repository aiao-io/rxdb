<script setup lang="ts">
/**
 * 团队任务编辑界面（ADMIN-US-221 AC#4）：用模型驱动的实体列表编辑任务所在的团队库。
 *
 * 实体页签与列表都来自团队库注册的实体元数据，标签是随语言切换的实体显示名，组件里不写任何具体实体名；
 * 换一套业务实体，这里不需要改。每次保存都由团队库的 working-tree 捕获进任务工作树。
 * 页签遵循 WAI-ARIA 页签模式：只有选中的页签在 Tab 序列里，左右方向键与 Home / End 在页签间移动。
 * 切换实体时按实体重建列表，不把上一个实体的筛选与排序状态带过去；旧列表卸载时若还有未保存的输入，会先补报 false。
 *
 * 它是协作包渲染回调创建的独立 Vue 应用的根组件，继承不到主应用的 provide：这里把团队库与工作台的国际化运行时
 * 提供给后代的实体列表。组件读不到自己 provide 的值，所以翻译显式取工作台的运行时。团队库在应用的整个生命周期内不变
 * （任务切换时协作包卸载应用、再为新任务创建一个），因此直接读 prop，不做响应式追踪。
 */

import type { RxDB } from '@aiao/rxdb';
import { provideI18n, useI18n } from '@aiao/rxdb-i18n-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import { computed, ref, useId } from 'vue';
import { entityDisplayName } from '../entities/entity-labels';
import { visibleEntityEntries } from '../entities/entity-registry';
import { workbenchShell } from '../shell/workbench-shell';

const props = defineProps<{
  /** 任务所在的团队库：已连接、已启用 working-tree，实例归协作包所有。 */
  database: RxDB;
  /**
   * 实体列表的未保存状态（`dirty-change`）原样交给协作包（渲染回调上下文里的 `reportDirty`，ADMIN-US-205 AC#5）：
   * 对话框里还没点保存的输入不在任务工作树里，协作面板据此标出、离开前提示，并拦下同步与切换。
   */
  reportDirty: (dirty: boolean) => void;
}>();

provideRxDB(props.database);
provideI18n(workbenchShell.i18n);
const { t } = useI18n(workbenchShell.i18n);
const entries = visibleEntityEntries(props.database.config.entities);
const position = ref(0);
const current = computed(() => entries[position.value]);
const id = useId();
const panelId = `${id}-panel`;
const tabId = (index: number): string => `${id}-tab-${index}`;

/** 页签组的键盘移动：左右方向键首尾相接，Home / End 到首尾；其余按键返回 `undefined`，不处理。 */
function movedPosition(key: string, from: number, count: number): number | undefined {
  if (key === 'ArrowRight') return (from + 1) % count;
  if (key === 'ArrowLeft') return (from + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}

/** 页签上的按键：方向键与 Home / End 移动选中并聚焦目标页签。 */
function onKeydown(event: KeyboardEvent, index: number): void {
  const next = movedPosition(event.key, index, entries.length);
  if (next === undefined) return;
  event.preventDefault();
  position.value = next;
  const tablist = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
  tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
}
</script>
<template>
  <div
    class="flex flex-col"
    data-testid="team-editor"
    style="height: 32rem"
    ><div
      v-if="!current"
      role="alert"
      >{{ t('entity.none') }}</div
    ><template v-else
      ><!-- 未选中的页签沿用正文颜色：DaisyUI 默认把它减淡到对比度 3.4，达不到 WCAG AA 的 4.5 --><div
        class="tabs tabs-border shrink-0 overflow-x-auto"
        role="tablist"
        :aria-label="t('teamEditor.entities')"
        ><button
          v-for="(entry, index) in entries"
          :id="tabId(index)"
          :key="`${entry.namespace}/${entry.name}`"
          :aria-controls="panelId"
          :aria-selected="index === position"
          class="tab text-base-content"
          role="tab"
          :tabindex="index === position ? 0 : -1"
          type="button"
          @click="position = index"
          @keydown="onKeydown($event, index)"
          >{{ entityDisplayName(entry, t) }}</button
        ></div
      ><div
        :id="panelId"
        :aria-labelledby="tabId(position)"
        class="page-host min-h-0 flex-1"
        role="tabpanel"
        ><EntityList
          :key="`${current.namespace}/${current.name}`"
          :name="current.name"
          :namespace="current.namespace"
          @dirty-change="props.reportDirty" /></div></template
  ></div>
</template>
