<script setup lang="ts">
/**
 * BOM 展开树（对齐 Angular `ao-bom-tree`、React `BomTree`）。
 *
 * 渲染共享控制器给出的可见路径、未裁决候选、截断原因与查询状态。交互一律经 `commands`
 * 回到共享控制器，组件不发出事件。键盘遵循 WAI-ARIA tree 模式：方向键移动焦点
 * （ArrowLeft 无父节点时不动），Home/End 跳到首尾，Space 切换展开，Enter 加载发生项；
 * 当前焦点节点不在可见节点中时首行是 Tab 入口。
 */
import { BOM_VIEW_STYLES, bomErrorText } from '@aiao/rxdb-plugin-bom';
import type { BomViewCommands, BomViewNode, BomViewState } from '@aiao/rxdb-plugin-bom';
import { computed, nextTick, ref, shallowRef } from 'vue';

const props = defineProps<{
  /** 共享控制器发布的视图状态（`useBomView` 的 `state.value`）。 */
  state: BomViewState;
  /** 共享控制器命令，原样透传。 */
  commands: BomViewCommands;
}>();
const tree = ref<HTMLElement>();
const focused = ref<string | null>(null);
const hasFocused = computed(() => props.state.nodes.some(node => node.key === focused.value));
const interactionError = shallowRef<unknown>(null);

const focus = (index: number): void => {
  const node = props.state.nodes[index];
  if (!node) return;
  focused.value = node.key;
  void nextTick(() => tree.value?.querySelectorAll<HTMLElement>('[role="treeitem"]')[index]?.focus());
};

const select = async (node: BomViewNode): Promise<void> => {
  if (node.occurrenceId === null) return;
  interactionError.value = null;
  try {
    await props.commands.loadOccurrence(node.occurrenceId);
  } catch (error) {
    interactionError.value = error;
  }
};

const activate = (node: BomViewNode, index: number): void => {
  focus(index);
  void select(node);
};

const moveRight = (node: BomViewNode, index: number): void => {
  if (node.hasChildren && !node.expanded) {
    props.commands.toggle(node.path);
    return;
  }
  if ((props.state.nodes[index + 1]?.depth ?? 0) > node.depth) focus(index + 1);
};

const moveLeft = (node: BomViewNode): void => {
  if (node.hasChildren && node.expanded) {
    props.commands.toggle(node.path);
    return;
  }
  focus(props.state.nodes.findIndex(candidate => candidate.key === JSON.stringify(node.path.slice(0, -1))));
};

const keydown = (event: KeyboardEvent, node: BomViewNode, index: number): void => {
  const actions: Record<string, () => void> = {
    ArrowDown: () => focus(index + 1),
    ArrowUp: () => focus(index - 1),
    Home: () => focus(0),
    End: () => focus(props.state.nodes.length - 1),
    ArrowRight: () => moveRight(node, index),
    ArrowLeft: () => moveLeft(node),
    Enter: () => {
      void select(node);
    },
    ' ': () => {
      if (node.hasChildren) props.commands.toggle(node.path);
    }
  };
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
};
</script>

<template>
  <section
    class="bom-view bom-tree"
    aria-label="BOM 展开"
    :aria-busy="state.refreshing || state.phase === 'loading'"
  >
    <component :is="'style'">{{ BOM_VIEW_STYLES }}</component>
    <p
      v-if="state.phase === 'idle' || state.phase === 'loading'"
      role="status"
      >正在加载 BOM…</p
    >
    <p
      v-if="state.phase === 'empty'"
      role="status"
      >没有可见 BOM 节点</p
    >
    <p
      v-if="state.refreshing"
      role="status"
      >正在刷新 BOM…</p
    >
    <p
      v-if="state.error !== null"
      role="alert"
      >{{ bomErrorText(state.error) }}</p
    >
    <button
      v-if="state.phase === 'error'"
      type="button"
      @click="commands.refresh()"
      >重试</button
    >
    <p
      v-if="interactionError !== null"
      role="alert"
      >{{ bomErrorText(interactionError) }}</p
    >
    <ul
      ref="tree"
      role="tree"
      aria-label="BOM 结构"
      :aria-busy="state.refreshing || state.phase === 'loading'"
    >
      <li
        v-for="(node, index) in state.nodes"
        :key="node.key"
        role="treeitem"
        data-testid="bom-node"
        :data-path="node.key"
        :data-occurrence="node.occurrenceId ?? ''"
        :aria-level="node.depth + 1"
        :aria-expanded="node.hasChildren ? node.expanded : undefined"
        :aria-selected="node.occurrenceId !== null && state.editor.value?.occurrenceId === node.occurrenceId"
        :tabindex="focused === node.key || (!hasFocused && index === 0) ? 0 : -1"
        @focus="focused = node.key"
        @keydown="keydown($event, node, index)"
        @click="activate(node, index)"
      >
        <div
          class="bom-node-content"
          :style="{ paddingInlineStart: `${node.depth * 24}px` }"
        >
          <button
            v-if="node.hasChildren"
            type="button"
            tabindex="-1"
            :aria-label="`${node.expanded ? '折叠' : '展开'} ${node.itemNo}`"
            @click.stop="commands.toggle(node.path)"
            >{{ node.expanded ? '−' : '+' }}</button
          >
          <span>{{ node.itemNo }}</span>
          <span v-if="node.description">{{ node.description }}</span>
          <span
            class="bom-node-quantity"
            data-testid="bom-quantity"
            >{{ node.quantity ? `${node.quantity.value} ${node.quantity.uom}` : '未解析' }}</span
          >
          <button
            v-if="node.occurrenceId !== null"
            type="button"
            tabindex="-1"
            :aria-label="`编辑 ${node.itemNo}`"
            @click.stop="select(node)"
            >编辑</button
          >
        </div>
      </li>
    </ul>
    <section
      v-if="state.unresolved.length > 0"
      aria-label="未解析候选"
    >
      <h3>未解析</h3>
      <div
        v-for="group in state.unresolved"
        :key="group.key"
        data-testid="bom-candidate"
      >
        <span>{{ group.kind }}</span>
        <ul
          ><li
            v-for="candidate in group.candidates"
            :key="candidate.key"
            >{{ candidate.label }}</li
          ></ul
        >
      </div>
    </section>
    <p
      v-if="state.truncated !== null"
      role="note"
      >结果已截断：{{ state.truncated.reason }}</p
    >
    <p
      v-if="state.quantityError !== null"
      role="alert"
      >{{ bomErrorText(state.quantityError) }}</p
    >
  </section>
</template>
