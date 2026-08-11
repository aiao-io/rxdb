import { render } from '@testing-library/react';
import { act, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadingBar, { LoadingBarRef } from './LoadingBar';

describe('LoadingBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ignores complete while inactive', () => {
    const ref = createRef<LoadingBarRef>();
    const onLoaderFinished = vi.fn();
    const { container } = render(<LoadingBar ref={ref} onLoaderFinished={onLoaderFinished} />);

    act(() => ref.current?.complete());

    expect(container.innerHTML).toBe('');
    act(() => vi.runAllTimers());
    expect(onLoaderFinished).not.toHaveBeenCalled();
  });

  it('completes an active loading cycle', () => {
    const ref = createRef<LoadingBarRef>();
    const onLoaderFinished = vi.fn();
    const { container } = render(
      <LoadingBar ref={ref} onLoaderFinished={onLoaderFinished} transitionTime={100} waitingTime={100} />
    );

    act(() => ref.current?.staticStart(40));
    expect(container.innerHTML).not.toBe('');

    act(() => ref.current?.complete());
    expect(container.innerHTML).not.toBe('');

    act(() => vi.advanceTimersByTime(200));
    expect(container.innerHTML).toBe('');
    expect(onLoaderFinished).toHaveBeenCalledOnce();
  });
});
