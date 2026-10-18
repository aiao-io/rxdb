<script setup lang="ts">
import { BOM_VIEW_STYLES, bomErrorText } from '@aiao/rxdb-plugin-bom';
import type { BomViewCommands, BomViewNode, BomViewState } from '@aiao/rxdb-plugin-bom';
import { nextTick, ref, shallowRef, watch } from 'vue';

const props = defineProps<{ state: BomViewState; commands: BomViewCommands }>();
const tree = ref<HTMLElement>();
const focused = ref('[]');
const interactionError = shallowRef<unknown>(null);

watch(
  () => props.state.nodes,
  nodes => {
    if (!nodes.some(node => node.key === focused.value)) focused.value = nodes[0]?.key ?? '[]';
  }
);

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

const moveLeft = (node: BomViewNode, index: number): void => {
  if (node.hasChildren && node.expanded) {
    props.commands.toggle(node.path);
    return;
  }
  focus(
    props.state.nodes.findLastIndex(
      (candidate, candidateIndex) => candidateIndex < index && candidate.depth === node.depth - 1
    )
  );
};

const keydown = (event: KeyboardEvent, node: BomViewNode, index: number): void => {
  const actions: Record<string, () => void> = {
    ArrowDown: () => focus(index + 1),
    ArrowUp: () => focus(index - 1),
    Home: () => focus(0),
    End: () => focus(props.state.nodes.length - 1),
    ArrowRight: () => moveRight(node, index),
    ArrowLeft: () => moveLeft(node, index),
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
        :tabindex="focused === node.key ? 0 : -1"
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
      v-if="state.unresolved.length"
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
      v-if="state.truncated"
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
