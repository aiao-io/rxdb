import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface AppServiceContextType {
  sidebarPinned: boolean;
  headerFloating: boolean;
  toggleSidebar: () => void;
  openRxdbDevtools: (theme: 'light' | 'dark') => void;
}

const AppServiceContext = createContext<AppServiceContextType | undefined>(undefined);

// 获取初始侧边栏状态
function getInitialSidebarState(): boolean {
  // 服务端渲染返回 false
  if (typeof window === 'undefined') return false;
  // 移动端默认关闭，桌面端默认打开
  return window.innerWidth >= 768;
}

export function AppServiceProvider({ children }: { children: ReactNode }) {
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(getInitialSidebarState());
  const [headerFloating] = useState<boolean>(getInitialSidebarState());

  // 断点跨越（旋转 / 窗口缩放）时同步侧栏状态：移动端自动收起、桌面端自动展开。
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => setSidebarPinned(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleSidebar = () => {
    setSidebarPinned(prev => !prev);
  };

  const openRxdbDevtools = (theme: 'light' | 'dark') => {
    // TODO: 实现 RxDB devtools 打开逻辑
  };

  return (
    <AppServiceContext.Provider
      value={{
        sidebarPinned,
        headerFloating,
        toggleSidebar,
        openRxdbDevtools
      }}
    >
      {children}
    </AppServiceContext.Provider>
  );
}

export function useAppService() {
  const context = useContext(AppServiceContext);
  if (!context) {
    throw new Error('useAppService must be used within AppServiceProvider');
  }
  return context;
}
