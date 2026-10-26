import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { useKeepLastGood } from './keep-last-good';

type TestState = {
  readonly phase: 'loading' | 'success' | 'empty';
  readonly value: string;
};

describe('useKeepLastGood', () => {
  it('首次 loading 且没有旧值时返回 loading', () => {
    const loading: TestState = { phase: 'loading', value: '' };
    const source = ref<TestState>(loading);

    expect(useKeepLastGood(source).value).toEqual(loading);
  });

  it('success 进入 loading 时保留上一份成功状态', async () => {
    const success: TestState = { phase: 'success', value: 'ready' };
    const loading: TestState = { phase: 'loading', value: '' };
    const source = ref<TestState>(success);
    const kept = useKeepLastGood(source);

    source.value = loading;
    await nextTick();

    expect(kept.value).toEqual(success);
  });

  it('success 进入 loading 后最终变成 empty 时返回 empty', async () => {
    const success: TestState = { phase: 'success', value: 'ready' };
    const loading: TestState = { phase: 'loading', value: '' };
    const empty: TestState = { phase: 'empty', value: '' };
    const source = ref<TestState>(success);
    const kept = useKeepLastGood(source);

    source.value = loading;
    await nextTick();
    expect(kept.value).toEqual(success);

    source.value = empty;
    await nextTick();

    expect(kept.value).toEqual(empty);
  });
});
