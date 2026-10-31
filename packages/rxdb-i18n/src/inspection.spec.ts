import { describe, expect, it } from 'vitest';
import { I18n } from './index.js';

describe('只读国际化检视', () => {
  it('静态模式列出命名空间及来源，返回脱离可变状态的快照', async () => {
    const runtime = new I18n({
      locale: 'en',
      catalogs: [{ locale: 'en', namespace: 'app', messages: { hello: 'Hello' } }]
    });
    try {
      const snapshot = await runtime.inspect();
      expect(snapshot).toEqual({
        locale: 'en',
        availableLocales: ['en'],
        messages: [{ locale: 'en', namespace: 'app', key: 'hello', value: 'Hello', source: 'bundle', active: true }],
        missingMessages: []
      });
      const mutated = snapshot as unknown as { messages: { value: string }[] };
      mutated.messages[0].value = 'changed outside';
      expect(runtime.t('hello')).toBe('Hello');
      runtime.destroy();
      await expect(runtime.inspect()).rejects.toThrow(/destroyed/);
    } finally {
      runtime.destroy();
    }
  });
});
