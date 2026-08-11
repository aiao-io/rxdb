import { themeQuartz, type GridApi } from 'ag-grid-enterprise';
import { computed, watch, type Ref } from 'vue';

const darkTheme = themeQuartz.withParams({
  backgroundColor: 'var(--color-base-200)',
  foregroundColor: 'initial',
  browserColorScheme: 'dark'
});

type GridThemeApi = Pick<GridApi, 'setGridOption'>;

export function useAgGridTheme(isDark: Readonly<Ref<boolean>>, gridApi: Readonly<Ref<GridThemeApi | null>>) {
  const theme = computed(() => (isDark.value ? darkTheme : themeQuartz));

  watch(theme, nextTheme => {
    gridApi.value?.setGridOption('theme', nextTheme);
  });

  return theme;
}
