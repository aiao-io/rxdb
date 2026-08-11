import { describe, expect, it, vi } from 'vitest';
import { cloneDeep } from '../../object/cloneDeep.js';

describe('cloneDeep', () => {
  it('should return primitives as-is', () => {
    expect(cloneDeep(42)).toBe(42);
    expect(cloneDeep('hello')).toBe('hello');
    expect(cloneDeep(true)).toBe(true);
    expect(cloneDeep(null)).toBe(null);
    expect(cloneDeep(undefined)).toBe(undefined);
  });

  it('should deep clone plain objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = cloneDeep(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it('should deep clone arrays', () => {
    const arr = [1, [2, 3], { a: 4 }];
    const cloned = cloneDeep(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[1]).not.toBe(arr[1]);
    expect(cloned[2]).not.toBe(arr[2]);
  });

  it('should clone Date objects', () => {
    const date = new Date('2024-01-01');
    const cloned = cloneDeep(date);
    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
  });

  it('should clone nested structures', () => {
    const obj = {
      where: { field: 'id', value: 1 },
      orderBy: [{ field: 'createdAt', sort: 'desc' }],
      limit: 10
    };
    const cloned = cloneDeep(obj);
    expect(cloned).toEqual(obj);
    expect(cloned.orderBy).not.toBe(obj.orderBy);
    cloned.orderBy[0].sort = 'asc';
    expect(obj.orderBy[0].sort).toBe('desc');
  });

  describe('单一对象模型（UTL-021）', () => {
    it('类实例一律保留原型，函数属性不改变判定', () => {
      // 历史实现按异常分派：无函数属性走 structuredClone → 丢原型，
      // 多一个函数属性触发 DataCloneError → 走内部实现 → 保原型。同类两种语义。
      class Plain {
        x = 1;
      }
      class WithFn {
        x = 1;
        fn = (): number => 1;
      }

      expect(cloneDeep(new Plain())).toBeInstanceOf(Plain);
      expect(cloneDeep(new WithFn())).toBeInstanceOf(WithFn);
    });

    it('原型上的方法在拷贝后仍可调用', () => {
      class Counter {
        constructor(public value: number) {}
        double(): number {
          return this.value * 2;
        }
      }

      const cloned = cloneDeep(new Counter(21));

      expect(cloned).not.toBe(undefined);
      expect(cloned.double()).toBe(42);
    });

    it('不再调用 structuredClone 做主路径', () => {
      const spy = vi.spyOn(globalThis, 'structuredClone');
      try {
        cloneDeep({ a: 1, nested: { b: [1, 2] } });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('函数属性按引用保留，不抛 DataCloneError', () => {
      const fn = vi.fn();
      const cloned = cloneDeep({ fn });
      expect(cloned.fn).toBe(fn);
    });

    it('symbol 键与不可枚举属性都被复制', () => {
      const key = Symbol('tag');
      const source = { [key]: { deep: 1 } };
      Object.defineProperty(source, 'hidden', { value: { deep: 2 }, enumerable: false, configurable: true });

      const cloned = cloneDeep(source);

      expect(cloned[key]).toEqual({ deep: 1 });
      expect(cloned[key]).not.toBe(source[key]);
      const descriptor = Object.getOwnPropertyDescriptor(cloned, 'hidden');
      expect(descriptor?.enumerable).toBe(false);
      expect(descriptor?.value).toEqual({ deep: 2 });
    });

    it('accessor descriptor 保持为 accessor，不被求值成数据属性', () => {
      const source = {
        calls: 0,
        get computed(): number {
          this.calls++;
          return 7;
        }
      };

      const cloned = cloneDeep(source);

      expect(Object.getOwnPropertyDescriptor(cloned, 'computed')?.get).toBeTypeOf('function');
      expect(cloned.computed).toBe(7);
    });

    it('循环引用与共享引用都收敛', () => {
      const shared = { n: 1 };
      const source: { self?: unknown; left: object; right: object } = { left: shared, right: shared };
      source.self = source;

      const cloned = cloneDeep(source);

      expect(cloned).not.toBe(source);
      expect(cloned.self).toBe(cloned);
      expect(cloned.left).toBe(cloned.right);
      expect(cloned.left).not.toBe(shared);
    });
  });

  it('should clone typed arrays', () => {
    const source = new Uint16Array([1, 2, 65535]);
    const cloned = cloneDeep(source);
    expect(cloned).toBeInstanceOf(Uint16Array);
    expect(Array.from(cloned)).toEqual([1, 2, 65535]);
    expect(cloned).not.toBe(source);
    cloned[0] = 42;
    expect(source[0]).toBe(1);
  });

  it('should clone Date, RegExp, ArrayBuffer, DataView, Map, and Set', () => {
    const buffer = new ArrayBuffer(8);
    new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
    const source = {
      date: new Date('2024-05-01T00:00:00.000Z'),
      re: /ab+c/gi,
      buffer,
      view: new DataView(buffer, 2, 4),
      map: new Map<unknown, unknown>([[{ k: 1 }, { v: 2 }]]),
      set: new Set([{ n: 3 }])
    };

    const cloned = cloneDeep(source);

    expect(cloned).not.toBe(source);
    expect(cloned.date).toEqual(source.date);
    expect(cloned.date).not.toBe(source.date);
    expect(cloned.re).toEqual(source.re);
    expect(cloned.re).not.toBe(source.re);
    expect(cloned.buffer).not.toBe(source.buffer);
    expect(new Uint8Array(cloned.buffer)).toEqual(new Uint8Array(source.buffer));
    expect(cloned.view).toBeInstanceOf(DataView);
    // 会重建切片缓冲区，因此 offset 重置为 0，但字节保持不变。
    expect(cloned.view.byteOffset).toBe(0);
    expect(cloned.view.byteLength).toBe(4);
    expect(cloned.view.getUint8(0)).toBe(source.view.getUint8(0));
    expect(cloned.view.getUint8(3)).toBe(source.view.getUint8(3));
    expect(cloned.map).not.toBe(source.map);
    expect([...cloned.map.values()][0]).toEqual({ v: 2 });
    expect([...cloned.map.values()][0]).not.toBe([...source.map.values()][0]);
    expect(cloned.set).not.toBe(source.set);
    expect([...cloned.set][0]).toEqual({ n: 3 });
    expect([...cloned.set][0]).not.toBe([...source.set][0]);
  });

  describe('内部槽类型委托 structuredClone（UTL-021）', () => {
    it('装箱原语保留内部槽，valueOf 可用', () => {
      // 通用对象分支只会复制自有属性，产出没有 [[StringData]] 的空壳，valueOf() 抛错。
      const source = { boxed: new String('ab') };

      const cloned = cloneDeep(source);

      expect(cloned.boxed).not.toBe(source.boxed);
      expect(cloned.boxed.valueOf()).toBe('ab');
      expect(cloned.boxed).toBeInstanceOf(String);
    });

    it('Blob 走 structuredClone 分支而非通用对象分支', () => {
      // 只断言「路由到哪条分支」：happy-dom 的 Blob 是普通 JS 类（内容存在
      // Symbol(buffer) 自有属性上，tag 为 [object Object]），Node 的
      // structuredClone 认不出它、会降级成普通对象。真实浏览器/Node 里 Blob 是
      // 带内部槽的宿主对象，结论相反。因此这里不断言拷贝结果的保真度。
      const spy = vi.spyOn(globalThis, 'structuredClone');
      try {
        const blob = new Blob(['hello'], { type: 'text/plain' });
        cloneDeep({ blob });
        expect(spy).toHaveBeenCalledWith(blob);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
