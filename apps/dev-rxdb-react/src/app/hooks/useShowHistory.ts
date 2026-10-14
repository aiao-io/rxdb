import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * 历史侧栏开合状态：桌面默认展开、移动端默认收起，
 * 并在断点跨越（旋转 / 窗口缩放）时自动同步（与 AppService 的侧栏口径一致）。
 */
export function useShowHistory(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [showHistory, setShowHistory] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => setShowHistory(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return [showHistory, setShowHistory];
}
