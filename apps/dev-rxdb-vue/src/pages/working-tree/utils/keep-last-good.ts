import { computed, shallowRef, watch, type ComputedRef, type Ref } from 'vue';

/** 查询 loading 期间继续展示上一份已知状态，避免刷新时列表与详情闪空。 */
export const useKeepLastGood = <T extends { readonly phase: string }>(source: Readonly<Ref<T>>): ComputedRef<T> => {
  const last = shallowRef<T | null>(null);
  watch(
    () => source.value,
    state => {
      if (state.phase !== 'loading') last.value = state;
    },
    { immediate: true }
  );
  return computed(() => {
    const state = source.value;
    return state.phase === 'loading' ? (last.value ?? state) : state;
  });
};
