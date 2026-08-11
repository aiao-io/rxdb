import { useCallback, useEffect, useRef, useState } from 'react';

interface ResettableTimeout {
  schedule: (callback: () => void, delay: number) => void;
  cancel: () => void;
}

export function useResettableTimeout(): ResettableTimeout {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    if (timeoutRef.current === undefined) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, []);

  const schedule = useCallback(
    (callback: () => void, delay: number) => {
      cancel();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = undefined;
        callback();
      }, delay);
    },
    [cancel]
  );

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
}

interface AutoDismissedState<T> {
  value: T | null;
  show: (value: T) => void;
  dismiss: () => void;
}

export function useAutoDismissedState<T>(delay: number): AutoDismissedState<T> {
  const [value, setValue] = useState<T | null>(null);
  const { schedule, cancel } = useResettableTimeout();

  const show = useCallback(
    (nextValue: T) => {
      setValue(nextValue);
      schedule(() => setValue(null), delay);
    },
    [delay, schedule]
  );

  const dismiss = useCallback(() => {
    cancel();
    setValue(null);
  }, [cancel]);

  return { value, show, dismiss };
}
