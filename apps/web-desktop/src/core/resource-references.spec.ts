import { describe, expect, it } from 'vitest';
import { ResourceReferences } from './resource-references.js';

describe('DESKTOP-US-307 版本引用计数', () => {
  it('安装、回退与双实例分别计数；释放一个引用不能回收其余使用者的版本', () => {
    const refs = new ResourceReferences();
    refs.replace('desktop', [
      { id: 'installed', key: 'current' },
      { id: 'rollback', key: 'old' }
    ]);
    refs.replace('frames', [
      { id: 'one', key: 'old' },
      { id: 'two', key: 'old' }
    ]);
    expect(refs.count('old')).toBe(3);
    refs.replace('frames', [{ id: 'two', key: 'old' }]);
    expect(refs.count('old')).toBe(2);
    refs.replace('desktop', [{ id: 'installed', key: 'current' }]);
    expect(refs.count('old')).toBe(1);
    expect(new Set(refs.keys())).toEqual(new Set(['current', 'old']));
    refs.replace('frames', []);
    expect(refs.count('old')).toBe(0);
    expect(refs.keys()).toEqual(['current']);
  });
  it('替换快照不会累计旧引用，重复身份或错误键值明确拒绝', () => {
    const refs = new ResourceReferences();
    refs.replace('desktop', [{ id: 'one', key: 'v1' }]);
    refs.replace('desktop', [{ id: 'one', key: 'v2' }]);
    expect(refs.keys()).toEqual(['v2']);
    expect(() =>
      refs.replace('other', [
        { id: 'same', key: 'one' },
        { id: 'same', key: 'two' }
      ])
    ).toThrow('INVALID');
    expect(() => refs.replace('other', [{ id: '', key: 'one' }])).toThrow('INVALID');
    expect(refs.keys()).toEqual(['v2']);
  });
});
