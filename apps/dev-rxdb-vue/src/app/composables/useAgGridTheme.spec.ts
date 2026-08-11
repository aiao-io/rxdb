import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import { useAgGridTheme } from './useAgGridTheme';

describe('useAgGridTheme', () => {
  it('updates an initialized grid without recreating it', async () => {
    const isDark = ref(false);
    const setGridOption = vi.fn();
    const gridApi = shallowRef({ setGridOption });
    const theme = useAgGridTheme(isDark, gridApi);
    const lightTheme = theme.value;

    isDark.value = true;
    await nextTick();

    expect(theme.value).not.toBe(lightTheme);
    expect(setGridOption).toHaveBeenCalledOnce();
    expect(setGridOption).toHaveBeenCalledWith('theme', theme.value);
  });
});
