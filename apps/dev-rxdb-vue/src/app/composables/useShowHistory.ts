import { ref } from 'vue';

/**
 * 历史侧栏开合状态：桌面默认展开、移动端默认收起，
 * 并在断点跨越（旋转 / 窗口缩放）时自动同步（与 useAppService 的侧栏口径一致）。
 */
export function useShowHistory() {
  const showHistory = ref(window.innerWidth >= 768);

  if (typeof window !== 'undefined') {
    window.matchMedia('(min-width: 768px)').addEventListener('change', event => {
      showHistory.value = event.matches;
    });
  }

  return { showHistory };
}
