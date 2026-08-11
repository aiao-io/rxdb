<script lang="ts" setup>
import { HistoryItem, HistoryScopeType } from '@aiao/rxdb';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { pairVirtualRows } from '../utils/virtual-rows';

interface HistorySidebarProps {
  show: boolean;
  histories: HistoryItem[];
  scopeType: HistoryScopeType;
  borderSide?: 'left' | 'right';
}

const props = withDefaults(defineProps<HistorySidebarProps>(), {
  borderSide: 'left'
});

const emit = defineEmits<{
  close: [];
}>();

const parentRef = ref<HTMLDivElement | null>(null);

const rowVirtualizerOptions = computed(() => ({
  count: props.histories.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => 80,
  overscan: 5
}));

const virtualizer = useVirtualizer(rowVirtualizerOptions);
const virtualRows = computed(() => pairVirtualRows(props.histories, virtualizer.value.getVirtualItems()));

const hasHistories = computed(() => props.histories.length > 0);

const getScopeLabel = () => {
  switch (props.scopeType) {
    case 'database':
      return 'badge-primary';
    case 'repository':
      return 'badge-secondary';
    case 'entity':
      return 'badge-accent';
    default:
      return '';
  }
};

const getScopeLabelText = () => {
  switch (props.scopeType) {
    case 'database':
      return '数据库';
    case 'repository':
      return '仓库';
    case 'entity':
      return '实体';
    default:
      return '';
  }
};

const getTypeColor = (type: HistoryItem['type']) => {
  switch (type) {
    case 'DELETE':
      return 'bg-error';
    case 'UPDATE':
      return 'bg-info';
    case 'TRANSACTION':
      return 'bg-primary';
    case 'INSERT':
      return 'bg-success';
    default:
      return 'bg-base-300';
  }
};

const formatTime = (timestamp: number | Date) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return (
    date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) +
    '.' +
    String(date.getMilliseconds()).padStart(3, '0')
  );
};
</script>

<template>
  <aside
    :class="[
      'bg-base-100 border-base-300 flex h-full flex-col overflow-hidden shadow-lg transition-all duration-300',
      borderSide === 'left' ? 'border-l' : 'border-r'
    ]"
    :style="{ width: show ? '192px' : '0' }"
  >
    <div class="flex h-full min-w-48 flex-col">
      <!-- Header -->
      <div class="border-base-300 border-b px-4 py-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold">操作历史</h2>
            <span
              v-if="getScopeLabel()"
              :class="['badge badge-xs', getScopeLabel()]"
              >{{ getScopeLabelText() }}</span
            >
          </div>
          <button
            class="btn btn-circle btn-ghost btn-xs"
            @click="emit('close')"
            aria-label="关闭历史"
          >
            <X :size="14" />
          </button>
        </div>
      </div>

      <!-- 时间线 -->
      <div
        class="flex-1 overflow-auto"
        ref="parentRef"
      >
        <div class="p-3">
          <ol
            :class="['relative', hasHistories ? 'border-base-300 border-l-2' : '']"
            :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }"
          >
            <li
              class="text-base-content/40 flex min-h-40 items-center justify-center text-xs"
              v-if="histories.length === 0"
            >
              暂无操作历史
            </li>
            <li
              class="relative mb-4 pb-2 pl-4 last:mb-0"
              v-for="{ item: historyItem, virtualItem } in virtualRows"
              :key="historyItem.fingerprint"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`
              }"
            >
              <!-- 时间线点 -->
              <div
                :class="[
                  'ring-base-100 absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full ring-2',
                  getTypeColor(historyItem.type),
                  historyItem.reverted ? 'opacity-40' : ''
                ]"
              />
              <!-- 内容 -->
              <div :class="{ 'opacity-50': historyItem.reverted }">
                <!-- 时间 -->
                <time class="text-base-content/50 mb-1 block text-[10px]">
                  {{ formatTime(historyItem.createdAt) }}
                </time>
                <!-- 简介 -->
                <p :class="['text-base-content mb-1.5 text-xs', historyItem.redoInvalidated ? 'line-through' : '']">
                  <span>#{{ historyItem.changeId }}</span>
                  {{ historyItem.description }}
                </p>

                <!-- 徽章 -->
                <div class="flex flex-wrap gap-1">
                  <template v-if="scopeType === 'database'">
                    <span class="badge badge-xs badge-soft badge-ghost">{{ historyItem.namespace }}</span>
                    <span class="badge badge-xs badge-soft badge-primary">{{ historyItem.entity }}</span>
                  </template>
                  <span
                    class="badge badge-xs badge-soft badge-warning"
                    v-if="historyItem.reverted && !historyItem.redoInvalidated"
                    >已撤销</span
                  >
                  <span
                    class="badge badge-xs badge-soft badge-error"
                    v-if="historyItem.redoInvalidated"
                    >已失效</span
                  >
                </div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </aside>
</template>
