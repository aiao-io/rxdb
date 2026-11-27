import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** 正式产物的受控批准目录夹具：仅改目录字节与其构建批准摘要，不 import 产品源码。 */
export async function createApprovedCatalogArtifact({ source, releases, trustedDigests = [] }) {
  const root = await mkdtemp(join(tmpdir(), 'aiao-approved-catalog-'));
  try {
    await cp(source, root, { recursive: true });
    const original = digest(await readFile(join(source, 'approved-apps.json')));
    const contents = `${JSON.stringify({ formatVersion: 1, releases }, null, 2)}\n`;
    const sha256 = digest(contents);
    const approvals = JSON.stringify([...new Set([sha256, ...trustedDigests])]);
    let matched = 0;
    for (const file of await readdir(root)) {
      if (!file.endsWith('.js')) continue;
      const path = join(root, file);
      const before = await readFile(path, 'utf8');
      if (!before.includes(original)) continue;
      const replaced = before.replaceAll(original, sha256);
      const pattern = new RegExp(`trustedDigests:\\[(?:"|'|\\x60)${sha256}(?:"|'|\\x60)\\]`, 'g');
      const after = replaced.replace(pattern, () => {
        matched++;
        return `trustedDigests:${approvals}`;
      });
      await writeFile(path, after);
    }
    if (matched !== 1) throw new Error(`Expected one compiled approved catalog configuration; found ${matched}.`);
    await writeFile(join(root, 'approved-apps.json'), contents);
    return { root, sha256, contents, dispose: () => rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
