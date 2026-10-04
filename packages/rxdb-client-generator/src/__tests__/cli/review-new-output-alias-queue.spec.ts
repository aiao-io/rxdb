import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';
import * as fileDiscovery from '../../cli/find-files.js';

const entitySource = (name: string): string => `import { Entity, EntityBase } from '@aiao/rxdb';
@Entity({ name: '${name}', properties: [] }) class ${name} extends EntityBase {}`;

describe('评审：首次输出目录的父软链别名必须共用构建队列', () => {
  it.each([false, true])('输出目录已存在=%s 时，最后调用的构建必须最后发布', async existing => {
    const temp = await mkdtemp(join(tmpdir(), 'rxdb-review-generator-alias-'));
    const parent = join(temp, 'physical');
    const alias = join(temp, 'alias');
    const aFile = join(temp, 'alpha.ts');
    const bFile = join(temp, 'beta.ts');
    await mkdir(parent);
    await symlink(parent, alias);
    await writeFile(aFile, entitySource('Alpha'));
    await writeFile(bFile, entitySource('Beta'));
    const outA = join(parent, 'generated');
    const outB = join(alias, 'generated');
    if (existing) await mkdir(outA);
    let release!: () => void;
    const hold = new Promise<void>(accept => {
      release = accept;
    });
    const original = fileDiscovery.default;
    const discovery = vi.spyOn(fileDiscovery, 'default').mockImplementation(async (patterns, options) => {
      if (patterns.includes(aFile)) await hold;
      return original(patterns, options);
    });
    const order: string[] = [];
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    try {
      first = buildClientLibrary({ entities: [aFile], outDir: outA }).then(() => {
        order.push('A');
      });
      second = buildClientLibrary({ entities: [bFile], outDir: outB }).then(() => {
        order.push('B');
      });
      await Promise.race([second, new Promise<void>(accept => setTimeout(accept, 300))]);
      release();
      await Promise.all([first, second]);
      const output = await readFile(join(outA, 'index.js'), 'utf8');
      console.log(
        'REVIEW_GENERATOR_ALIAS ' +
          JSON.stringify({
            existing,
            completionOrder: order,
            hasAlpha: /\bAlpha\b/.test(output),
            hasBeta: /\bBeta\b/.test(output)
          })
      );
      expect(order).toEqual(['A', 'B']);
      expect(output).toMatch(/\bBeta\b/);
      expect(output).not.toMatch(/\bAlpha\b/);
    } finally {
      release();
      await Promise.allSettled([first, second]);
      discovery.mockRestore();
      await rm(temp, { recursive: true, force: true });
    }
  });
});
