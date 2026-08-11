import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventDispatcher } from '../../tools/event.js';

interface MyCustomEvent {
  customEvent1: {
    type: 'customEvent1';
    a: string;
  };
  customEvent2: {
    type: 'customEvent2';
    a: string;
  };
}

describe('event', () => {
  it('addEventListener', () => {
    return new Promise(done => {
      class BaseEvent extends EventDispatcher<MyCustomEvent> {}
      const be = new BaseEvent();
      be.addEventListener('customEvent1', done);
      expect(be.hasEventListener('customEvent1', done)).toBeTruthy();
      be.dispatchEvent('customEvent1', {
        type: 'customEvent1',
        a: '123'
      });
    });
  });

  it('rethrows listener errors', () => {
    class BaseEvent extends EventDispatcher<MyCustomEvent> {}
    const dispatcher = new BaseEvent();
    dispatcher.addEventListener('customEvent1', () => {
      throw new Error('listener failed');
    });

    expect(() =>
      dispatcher.dispatchEvent('customEvent1', {
        type: 'customEvent1',
        a: '123'
      })
    ).toThrow('listener failed');
  });

  it('removeEventListener', () => {
    class BaseEvent extends EventDispatcher<MyCustomEvent> {}
    const be = new BaseEvent();
    const listener = () => {
      //
    };
    be.addEventListener('customEvent1', listener);
    expect(be.hasEventListener('customEvent1', listener)).toBeTruthy();
    be.removeEventListener('customEvent1', listener);
    expect(be.hasEventListener('customEvent1', listener)).toBeFalsy();
  });

  it('removeAllEventListener', () => {
    class BaseEvent extends EventDispatcher<MyCustomEvent> {}
    const be = new BaseEvent();
    const listener = () => {
      //
    };
    be.addEventListener('customEvent1', listener);
    be.addEventListener('customEvent2', listener);
    expect(be.hasEventListener('customEvent1', listener)).toBeTruthy();
    expect(be.hasEventListener('customEvent2', listener)).toBeTruthy();
    be.removeAllEventListeners();
    expect(be.hasEventListener('customEvent1', listener)).toBeFalsy();
    expect(be.hasEventListener('customEvent2', listener)).toBeFalsy();
  });

  describe('派发快照（UTL-011）', () => {
    class BaseEvent extends EventDispatcher<MyCustomEvent> {}
    const payload = { type: 'customEvent1', a: '123' } as const;

    it('派发中新增的监听器不参与本轮，留到下一次派发', () => {
      // 遍历实时 Set 时 JS 迭代器会访问本轮新增项：每个回调再加一个监听器，
      // 单次同步 dispatch 就能被第三方无限延长。
      const dispatcher = new BaseEvent();
      const calls: string[] = [];
      dispatcher.addEventListener('customEvent1', () => {
        calls.push('first');
        dispatcher.addEventListener('customEvent1', () => calls.push('late'));
      });

      dispatcher.dispatchEvent('customEvent1', payload);
      expect(calls).toEqual(['first']);

      dispatcher.dispatchEvent('customEvent1', payload);
      expect(calls).toEqual(['first', 'first', 'late']);
    });

    it('每个监听器都自喂一个新监听器也会终止', () => {
      const dispatcher = new BaseEvent();
      let calls = 0;
      const selfFeeding = (): void => {
        calls++;
        dispatcher.addEventListener('customEvent1', () => selfFeeding());
      };
      dispatcher.addEventListener('customEvent1', selfFeeding);

      dispatcher.dispatchEvent('customEvent1', payload);

      expect(calls).toBe(1);
    });

    it('派发中被移除的监听器仍收到本次事件', () => {
      const dispatcher = new BaseEvent();
      const calls: string[] = [];
      const second = (): void => {
        calls.push('second');
      };
      dispatcher.addEventListener('customEvent1', () => {
        calls.push('first');
        dispatcher.removeEventListener('customEvent1', second);
      });
      dispatcher.addEventListener('customEvent1', second);

      dispatcher.dispatchEvent('customEvent1', payload);
      expect(calls).toEqual(['first', 'second']);

      dispatcher.dispatchEvent('customEvent1', payload);
      expect(calls).toEqual(['first', 'second', 'first']);
    });

    it('监听器自我移除后不再收到后续事件', () => {
      const dispatcher = new BaseEvent();
      let calls = 0;
      const once = (): void => {
        calls++;
        dispatcher.removeEventListener('customEvent1', once);
      };
      dispatcher.addEventListener('customEvent1', once);

      dispatcher.dispatchEvent('customEvent1', payload);
      dispatcher.dispatchEvent('customEvent1', payload);

      expect(calls).toBe(1);
    });

    it('嵌套派发不影响外层快照', () => {
      const dispatcher = new BaseEvent();
      const calls: string[] = [];
      dispatcher.addEventListener('customEvent1', () => {
        calls.push('outer');
        dispatcher.dispatchEvent('customEvent2', { type: 'customEvent2', a: 'inner' });
      });
      dispatcher.addEventListener('customEvent2', () => calls.push('inner'));
      dispatcher.addEventListener('customEvent1', () => calls.push('after'));

      dispatcher.dispatchEvent('customEvent1', payload);

      expect(calls).toEqual(['outer', 'inner', 'after']);
    });
  });

  describe('事件名回收（UTL-011）', () => {
    class BaseEvent extends EventDispatcher<MyCustomEvent> {}
    const listener = (): void => {
      //
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('未知事件的 has/remove/dispatch 都不建立集合', () => {
      const dispatcher = new BaseEvent();
      const mapSet = vi.spyOn(Map.prototype, 'set');

      expect(dispatcher.hasEventListener('customEvent1', listener)).toBe(false);
      dispatcher.removeEventListener('customEvent1', listener);
      dispatcher.dispatchEvent('customEvent1', { type: 'customEvent1', a: '123' });

      expect(mapSet).not.toHaveBeenCalled();
    });

    it('监听器删空后立即回收事件名', () => {
      const dispatcher = new BaseEvent();
      dispatcher.addEventListener('customEvent1', listener);

      const mapDelete = vi.spyOn(Map.prototype, 'delete');
      dispatcher.removeEventListener('customEvent1', listener);

      expect(mapDelete).toHaveBeenCalledWith('customEvent1');
      expect(dispatcher.hasEventListener('customEvent1', listener)).toBe(false);
    });

    it('还有其他监听器时不回收事件名', () => {
      const dispatcher = new BaseEvent();
      const other = (): void => {
        //
      };
      dispatcher.addEventListener('customEvent1', listener);
      dispatcher.addEventListener('customEvent1', other);

      const mapDelete = vi.spyOn(Map.prototype, 'delete');
      dispatcher.removeEventListener('customEvent1', listener);

      expect(mapDelete).not.toHaveBeenCalled();
      expect(dispatcher.hasEventListener('customEvent1', other)).toBe(true);
    });
  });
});
