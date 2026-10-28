import type { RxDB } from '@aiao/rxdb';
import type { BomViewInput } from '@aiao/rxdb-plugin-bom';
import { NEVER } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';
import { useBomView } from '../use-bom-view.js';

const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'X', asOfDate: new Date('2026-01-01T00:00:00Z') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};

const database = () => {
  const watchView = vi.fn<(value: BomViewInput) => typeof NEVER>(() => NEVER);
  return { db: { bom: { watchView } } as unknown as RxDB, watchView };
};

describe('Vue 响应式输入进入真实共享控制器', () => {
  it('getter 返回的嵌套代理与后续原地修改都能克隆，日期保持 Date', async () => {
    const { db, watchView } = database();
    const context = ref({ ...structuredClone(input.context), configSelection: { colors: ['red'] } });
    const plannedQty = reactive({ ...input.plannedQty });
    const configSelection = context.value.configSelection;
    const scope = effectScope();
    try {
      scope.run(() =>
        useBomView(db, () => ({
          ...input,
          context: context.value,
          plannedQty
        }))
      );
      expect(watchView).toHaveBeenCalledOnce();
      expect(watchView.mock.calls[0]?.[0]).toEqual({
        ...input,
        context: { ...input.context, configSelection: { colors: ['red'] } }
      });
      context.value.asOfDate = new Date('2026-02-01T00:00:00Z');
      plannedQty.value = '3';
      configSelection.colors.push('blue');
      await nextTick();
      expect(watchView).toHaveBeenCalledTimes(2);
      expect(watchView.mock.calls[1]?.[0]).toEqual({
        ...input,
        context: { ...input.context, asOfDate: context.value.asOfDate, configSelection: { colors: ['red', 'blue'] } },
        plannedQty: { value: '3', uom: 'pcs' }
      });
      expect(watchView.mock.calls[0]?.[0]).toEqual({
        ...input,
        context: { ...input.context, configSelection: { colors: ['red'] } }
      });
    } finally {
      scope.stop();
    }
  });

  it('reactive 中的嵌套 ref 自动解包，更新后旧快照保持独立', async () => {
    const { db, watchView } = database();
    const context = ref(structuredClone(input.context));
    const nested: BomViewInput = reactive({ ...input, context });
    const scope = effectScope();
    try {
      expect(() => scope.run(() => useBomView(db, nested))).not.toThrow();
      expect(watchView).toHaveBeenCalledWith(input);
      context.value.orgId = 'Y';
      await nextTick();
      expect(watchView).toHaveBeenCalledTimes(2);
      expect(watchView.mock.calls[1]?.[0]).toEqual({ ...input, context: { ...input.context, orgId: 'Y' } });
      expect(watchView.mock.calls[0]?.[0]).toEqual(input);
    } finally {
      scope.stop();
    }
  });

  it('setInput 命令也自动解包嵌套 ref 并保留日期', () => {
    const { db, watchView } = database();
    const scope = effectScope();
    try {
      const binding = scope.run(() => useBomView(db, input));
      const context = ref({ ...structuredClone(input.context), orgId: 'Y' });
      const next: BomViewInput = reactive({ ...input, context });
      binding?.commands.setInput(next);
      expect(watchView).toHaveBeenCalledTimes(2);
      expect(watchView.mock.calls[1]?.[0]).toEqual({ ...input, context: { ...input.context, orgId: 'Y' } });
      context.value.orgId = 'Z';
      expect(watchView.mock.calls[1]?.[0]).toEqual({ ...input, context: { ...input.context, orgId: 'Y' } });
    } finally {
      scope.stop();
    }
  });

  it('setInput 命令也接收嵌套响应式输入并保留快照', () => {
    const { db, watchView } = database();
    const scope = effectScope();
    try {
      const binding = scope.run(() => useBomView(db, input));
      const next = reactive({ ...structuredClone(input), plannedQty: { value: '5', uom: 'pcs' } });
      expect(() => binding?.commands.setInput(next)).not.toThrow();
      expect(watchView).toHaveBeenCalledTimes(2);
      expect(watchView.mock.calls[1]?.[0]).toEqual({ ...input, plannedQty: { value: '5', uom: 'pcs' } });
      next.plannedQty.value = '8';
      expect(watchView.mock.calls[1]?.[0]).toEqual({ ...input, plannedQty: { value: '5', uom: 'pcs' } });
    } finally {
      scope.stop();
    }
  });
});
