import { themeQuartz, type GridApi } from 'ag-grid-enterprise';
import { computed, watch, type Ref } from 'vue';

// foregroundColor 必须给出真实颜色：自定义属性的值一旦是 CSS 全局关键字 `initial`，
// 计算后等于 guaranteed-invalid，--ag-text-color / --ag-border-color 连带 --ag-row-border
// 等一整条边框链全部失效（AG Grid warning #9）。取 daisyUI 前景色与 backgroundColor 配套。
const darkTheme = themeQuartz.withParams({
  backgroundColor: 'var(--color-base-200)',
  foregroundColor: 'var(--color-base-content)',
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
