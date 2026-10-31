import { useCallback, useRef, useState } from 'react';

/** 只读引用：异步续体与全局监听经它读最新值。 */
export interface LatestRef<T> {
  readonly current: T;
}

/**
 * state + 同步镜像引用：渲染读 state，`await` 之后与 document 级监听读引用。
 *
 * @remarks
 * 异步续体捕获的是发起时那一帧的 state；提交串行、迟到快照、回车后紧跟失焦这类判定
 * 必须读写入当下的值，因此每次写入先同步更新引用、再排渲染。
 */
export const useStateRef = <T>(initial: T): readonly [T, (next: T) => void, LatestRef<T>] => {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const set = useCallback((next: T) => {
    ref.current = next;
    setValue(() => next);
  }, []);
  return [value, set, ref];
};
