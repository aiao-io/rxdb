<script lang="ts" setup>
import { RxDBBranch } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-vue';
import { GitBranch, Plus } from '@lucide/vue';
import { computed, nextTick, ref } from 'vue';
import { formatErrorMessage, useToast } from '../composables/useToast';

const toast = useToast();
const rxdb = useRxDB();
const switching = ref(false);
const branchName = ref('');
const showPopover = ref(false);
const popoverInput = ref<HTMLInputElement | null>(null);

const branches = useFindAll(RxDBBranch, { where: { combinator: 'and', rules: [] } });
const activeBranch = computed(() => branches.value?.find(b => b.activated)?.id ?? '');

const togglePopover = () => {
  showPopover.value = !showPopover.value;
  if (showPopover.value) {
    nextTick(() => popoverInput.value?.focus());
  }
};

const closePopover = () => {
  showPopover.value = false;
};

const createBranch = async (name: string) => {
  if (!name.trim()) return;
  try {
    await rxdb.versionManager.createBranch(name.trim());
    branchName.value = '';
    closePopover();
  } catch (error) {
    toast.error(formatErrorMessage('创建分支失败', error));
  }
};

const switchBranch = async (event: Event) => {
  const branch = (event.target as HTMLSelectElement).value;
  switching.value = true;
  try {
    await rxdb.versionManager.switchBranch(branch);
  } catch (error) {
    toast.error(formatErrorMessage('切换分支失败', error));
  } finally {
    switching.value = false;
  }
};
</script>

<template>
  <div class="relative flex items-center gap-1.5 p-1">
    <div class="join">
      <div>
        <span class="btn btn-xs join-item flex items-center px-2 text-xs">
          <GitBranch :size="16" />
        </span>
      </div>
      <select
        class="select select-xs join-item"
        :disabled="switching"
        @change="switchBranch"
      >
        <option
          v-for="branch in branches.value ?? []"
          :key="branch.id"
          :selected="branch.id === activeBranch"
          :value="branch.id"
        >
          {{ branch.id }}
        </option>
      </select>
    </div>

    <span
      class="loading loading-spinner loading-xs pointer-events-none absolute right-6"
      v-if="switching"
    />

    <!-- 创建分支按钮 -->
    <button
      class="btn btn-xs btn-ghost btn-circle"
      :disabled="switching"
      @click="togglePopover"
      title="创建分支"
    >
      <Plus :size="16" />
    </button>

    <!-- Popover 弹出框 -->
    <div
      class="bg-base-100 border-base-300 absolute bottom-full left-0 z-50 mb-2 rounded-lg border p-3 shadow-xl"
      v-if="showPopover"
    >
      <div class="flex flex-col gap-2">
        <div class="text-xs font-medium">创建新分支</div>
        <input
          class="input input-sm input-bordered w-48"
          v-model="branchName"
          @keydown.enter="createBranch(branchName)"
          @keydown.escape="closePopover"
          placeholder="输入分支名称"
          ref="popoverInput"
          type="text"
        />
        <div class="flex justify-end gap-2">
          <button
            class="btn btn-ghost btn-sm"
            @click="closePopover"
          >
            取消
          </button>
          <button
            class="btn btn-primary btn-sm"
            :disabled="!branchName.trim()"
            @click="createBranch(branchName)"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
