import { onScopeDispose, ref } from 'vue';

/**
 * 历史侧栏开合状态：桌面默认展开、移动端默认收起，
 * 并在断点跨越（旋转 / 窗口缩放）时自动同步（与 useAppService 的侧栏口径一致）。
 *
 * 断点监听随调用方的组件（作用域）销毁而摘掉：Todo / 菜单 / 文件页每次进入都会调用，
 * 与 React 的 effect 清理、Angular 的 DestroyRef 同口径。
 */
export function useShowHistory() {
  const showHistory = ref(window.innerWidth >= 768);
  const media = window.matchMedia('(min-width: 768px)');
  const onBreakpointChange = (event: MediaQueryListEvent) => {
    showHistory.value = event.matches;
  };
  media.addEventListener('change', onBreakpointChange);
  onScopeDispose(() => media.removeEventListener('change', onBreakpointChange));

  return { showHistory };
}
