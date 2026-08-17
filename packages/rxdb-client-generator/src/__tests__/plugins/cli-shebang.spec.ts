import { describe, expect, it } from 'vitest';
import {
  isCliEntryModuleId,
  rxdbClientGeneratorCliShebangPlugin,
  stripCliShebang
} from '../../plugins/cli-shebang.js';

const SHEBANG = '#!/usr/bin/env node\n';
const BODY = 'export const main = async () => undefined;\n';
const SOURCE = `${SHEBANG}\n${BODY}`;

const transform = (id: string, code = SOURCE): string | null => {
  const plugin = rxdbClientGeneratorCliShebangPlugin();
  const hook = plugin.transform;
  if (typeof hook !== 'function') {
    throw new Error('Expected transform hook');
  }
  const result = hook.call({} as never, code, id);
  if (result == null || typeof result === 'string') {
    return result;
  }
  return result.code;
};

describe('rxdbClientGeneratorCliShebangPlugin', () => {
  it('recognizes POSIX, Windows, query, and file URL module ids', () => {
    expect(isCliEntryModuleId('/Users/jimmy/rxdb/packages/rxdb-client-generator/src/cli/cli.ts')).toBe(true);
    expect(isCliEntryModuleId('D:/a/rxdb/rxdb/packages/rxdb-client-generator/src/cli/cli.ts')).toBe(true);
    expect(isCliEntryModuleId('D:\\a\\rxdb\\rxdb\\packages\\rxdb-client-generator\\src\\cli\\cli.ts')).toBe(true);
    expect(isCliEntryModuleId('D:/a/rxdb/rxdb/packages/rxdb-client-generator/src/cli/cli.ts?v=1')).toBe(true);
    expect(isCliEntryModuleId('file:///D:/a/rxdb/rxdb/packages/rxdb-client-generator/src/cli/cli.ts')).toBe(true);
    expect(isCliEntryModuleId('/tmp/other.ts')).toBe(false);
  });

  it('strips LF and CRLF shebang lines', () => {
    expect(stripCliShebang(SOURCE)).toBe(`\n${BODY}`);
    expect(stripCliShebang(`#!/usr/bin/env node\r\n${BODY}`)).toBe(BODY);
    expect(stripCliShebang(BODY)).toBeNull();
  });

  it('strips the CLI shebang when Vite reports a Windows-style module id', () => {
    const windowsId = 'D:/a/rxdb/rxdb/packages/rxdb-client-generator/src/cli/cli.ts';
    const posixId = '/Users/jimmy/rxdb/packages/rxdb-client-generator/src/cli/cli.ts';
    const backslashId = 'D:\\a\\rxdb\\rxdb\\packages\\rxdb-client-generator\\src\\cli\\cli.ts';

    expect(transform(windowsId)).toBe(`\n${BODY}`);
    expect(transform(posixId)).toBe(`\n${BODY}`);
    expect(transform(backslashId)).toBe(`\n${BODY}`);
    expect(transform(`${windowsId}?v=1`, `#!/usr/bin/env node\r\n${BODY}`)).toBe(BODY);
    expect(transform('/tmp/other.ts')).toBeNull();
  });

  it('keeps a shebang on the emitted cli.js chunk', () => {
    const plugin = rxdbClientGeneratorCliShebangPlugin();
    const hook = plugin.renderChunk;
    if (typeof hook !== 'function') {
      throw new Error('Expected renderChunk hook');
    }

    expect(hook.call({} as never, BODY, { fileName: 'cli.js' } as never)).toEqual({
      code: `${SHEBANG}${BODY}`,
      map: null
    });
    expect(hook.call({} as never, `${SHEBANG}${BODY}`, { fileName: 'cli.js' } as never)).toEqual({
      code: `${SHEBANG}${BODY}`,
      map: null
    });
    expect(hook.call({} as never, BODY, { fileName: 'index.js' } as never)).toBeNull();
  });
});
