<script lang="ts" setup>
import type { RxDB } from '@aiao/rxdb';
import { Eye } from '@lucide/vue';
import { computed, ref } from 'vue';
import { readOnlyCatalog, type ReadOnlyViewerState } from '../utils/read-only-checkout';
import DialogShell from './DialogShell.vue';
import ReadOnlyEntityPane from './ReadOnlyEntityPane.vue';

/**
 * 只读检出位查看器（US-313）：不切换分支，以只读方式浏览另一条分支或一个提交的完整数据。
 *
 * @remarks
 * 视图的 `rxdb` 是第二个只读实例，经右栏的 `provideRxDB` 交给里面的实体列表，照常查询；
 * 只读实例上列表不出新建、编辑与删除。左栏只列复制进快照的实体，主实例上不记变更日志的标「不随版本」：
 * 它们在快照里是此刻的内容，不随检出的分支或提交。
 */
const props = defineProps<{
  /** 页面持有的查看器状态（见 `ReadOnlyViewerSession`），本组件只做展示 */
  viewer: ReadOnlyViewerState | null;
  /** 主实例：「不随版本」按它的实体元数据判 */
  mainRxdb: RxDB;
  /** 正在刷新：按钮置灰，连点不会叠出第二个检出位 */
  refreshing: boolean;
}>();

const emit = defineEmits<{
  (e: 'refreshRequested'): void;
  (e: 'closeRequested'): void;
}>();

const catalog = computed(() =>
  props.viewer === null ? [] : readOnlyCatalog(props.viewer.view.rxdb.config.entities, props.mainRxdb.config.entities)
);
// 刷新换了视图也留着选中的实体：快照的实体集合跟主实例走，刷新前后是同一份
const selectedKey = ref<string | null>(null);
const selected = computed(() => catalog.value.find(entry => entry.key === selectedKey.value) ?? catalog.value[0]);
</script>

<template>
  <DialogShell
    v-if="viewer !== null"
    @close-requested="emit('closeRequested')"
    labelled-by="wt-readonly-title"
    size="wide"
    test-id="wt-readonly-dialog"
  >
    <div class="mb-3 flex items-center gap-2">
      <Eye
        class="text-[var(--gd-accent)]"
        aria-hidden="true"
        :size="18"
      />
      <h2
        class="text-[15px] font-semibold"
        id="wt-readonly-title"
        >Read-only checkout</h2
      >
    </div>

    <div
      class="gd-warn-strip mb-3"
      data-testid="wt-readonly-banner"
      role="status"
    >
      Viewing <span class="font-mono">{{ viewer.label }}</span> read-only, as it was when opened. Creating, editing and
      deleting are disabled.
    </div>

    <div class="flex h-[60dvh] min-h-0 gap-3 max-md:flex-col">
      <nav
        class="w-52 shrink-0 overflow-y-auto rounded border border-[var(--gd-border)] max-md:h-32 max-md:w-full"
        aria-label="Entities in this checkout"
        data-testid="wt-readonly-catalog"
      >
        <ul class="py-1">
          <li
            v-for="entry in catalog"
            :key="entry.key"
          >
            <button
              class="gd-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
              :class="{ 'gd-row-selected': entry.key === selected?.key }"
              @click="selectedKey = entry.key"
              :aria-current="entry.key === selected?.key ? 'true' : undefined"
              :data-entity-key="entry.key"
              data-testid="wt-readonly-entity"
              type="button"
            >
              <span class="min-w-0 flex-1 truncate">{{ entry.displayName }}</span>
              <span
                class="badge badge-ghost badge-xs shrink-0"
                v-if="entry.unversioned"
                data-testid="wt-readonly-unversioned"
                title="Shows the current content, not the version being viewed"
              >
                不随版本
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <div
        class="min-h-0 min-w-0 flex-1"
        data-testid="wt-readonly-list"
      >
        <!-- 按视图 id 重建：刷新换了一个只读实例，旧实例上的订阅不能沿用 -->
        <ReadOnlyEntityPane
          v-if="selected !== undefined"
          :key="viewer.view.id"
          :name="selected.name"
          :namespace="selected.namespace"
          :rxdb="viewer.view.rxdb"
        />
      </div>
    </div>

    <div class="mt-4 flex justify-end gap-2">
      <button
        class="gd-btn-secondary"
        @click="emit('refreshRequested')"
        data-testid="wt-readonly-refresh"
        :disabled="refreshing"
        type="button"
      >
        {{ refreshing ? 'Refreshing…' : 'Refresh' }}
      </button>
      <button
        class="gd-btn-secondary"
        @click="emit('closeRequested')"
        data-testid="wt-readonly-close"
        type="button"
      >
        Close
      </button>
    </div>
  </DialogShell>
</template>
