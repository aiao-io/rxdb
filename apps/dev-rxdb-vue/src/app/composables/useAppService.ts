import { ref } from 'vue';

// 获取初始侧边栏状态
function getInitialSidebarState(): boolean {
  // 服务端渲染返回 false
  if (typeof window === 'undefined') return false;
  // 移动端默认关闭，桌面端默认打开
  return window.innerWidth >= 768;
}

// 全局共享的应用状态
const sidebarPinned = ref(getInitialSidebarState());

// 断点跨越（旋转 / 窗口缩放）时同步侧栏状态：移动端自动收起、桌面端自动展开。
if (typeof window !== 'undefined') {
  window.matchMedia('(min-width: 768px)').addEventListener('change', event => {
    sidebarPinned.value = event.matches;
  });
}
const headerFloating = ref(getInitialSidebarState());

export function useAppService() {
  const toggleSidebar = () => {
    sidebarPinned.value = !sidebarPinned.value;
  };

  const toggleHeaderFloating = () => {
    headerFloating.value = !headerFloating.value;
  };

  return {
    sidebarPinned,
    headerFloating,
    toggleSidebar,
    toggleHeaderFloating
  };
}
