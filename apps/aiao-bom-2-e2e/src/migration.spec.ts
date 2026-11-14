import { expect, test, type Page, type Download } from '@playwright/test';
import { RxDBBackupArchiveReader } from '@aiao/rxdb';
import { Blob as NodeBlob } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';

async function downloadBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream(); if (!stream) throw new Error('备份下载为空');
  const buffers: Buffer[] = []; for await (const chunk of stream) buffers.push(Buffer.from(chunk));
  return Buffer.concat(buffers);
}
async function backup(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '下载完整领域备份', exact: true }).click();
  return downloadBytes(await download);
}
async function snapshotArchive(bytes: Buffer) {
  const reader = new RxDBBackupArchiveReader(new NodeBlob([new Uint8Array(bytes)]).stream().getReader());
  const manifest = await reader.readManifest(); const entries: Record<string, string> = {}; let current = ''; let chunks: Uint8Array[] = [];
  for (;;) {
    const frame = await reader.next();
    if (frame.type === 'data') { chunks.push(frame.bytes); continue; }
    if (current) entries[current] = Buffer.concat(chunks).toString('utf8');
    if (frame.type === 'end') break;
    current = frame.header.path; chunks = [];
  }
  return { manifest, rows: entries };
}

test('旧版完整库备份迁入新版，草稿、Decimal、ECN、换件历史不丢失并可回退', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.goto('http://localhost:4316/');
  page.once('dialog', dialog => dialog.accept()); await page.getByTestId('prepare-data').click();
  await expect(page.getByTestId('overview-data-status')).toContainText('已有', { timeout: 30000 });
  await page.goto('http://localhost:4316/explosion');
  await page.locator('summary').filter({ hasText: /^导入与导出$/ }).click();
  const parent = { itemNo: 'MIGRATION-ROOT', revisionNo: 'M1', bomType: 'ebom', orgId: 'org-x', alternativeNo: 1 };
  const records = [{ kind: 'item', source_ref: 'm-root', itemNo: parent.itemNo, ext: { rohs: 'yes' } },
    { kind: 'item', source_ref: 'm-child', itemNo: 'MIGRATION-CHILD', ext: { rohs: 'yes' } },
    { kind: 'revision', source_ref: 'm-rev', itemNo: parent.itemNo, revisionNo: 'M1' },
    { kind: 'header', source_ref: 'm-header', ...parent, baseQty: '1', baseUom: 'pcs' },
    { kind: 'line', source_ref: 'm-line', ...parent, lineNo: 10 },
    { kind: 'occurrence', source_ref: 'm-occurrence', ...parent, lineNo: 10, childItemNo: 'MIGRATION-CHILD', qty: '0.123456789123456789', uom: 'pcs', effectiveFrom: '2026-11-14' }];
  await page.getByTestId('import-file').setInputFiles({ name: 'migration-draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(records)) });
  await page.getByTestId('import-bom').click();
  await expect(page.getByTestId('import-status')).toContainText('导入成功');
  await page.goto('http://localhost:4316/instances');
  await expect(page.getByTestId('instance-replace')).toBeEnabled();
  await page.getByTestId('instance-replace-date').fill('2026-11-01');
  page.once('dialog', dialog => dialog.accept()); await page.getByTestId('instance-replace').click();
  await expect(page.getByTestId('instance-action-result')).toContainText('换件成功');
  await page.goto('http://localhost:4316/transfer');
  const old = await backup(page); const before = await snapshotArchive(old);
  expect(Object.values(before.rows).some(value => value.includes('ecn'))).toBe(true);
  expect(Object.values(before.rows).some(row => row.includes('PACK-003'))).toBe(true);
  expect(Object.values(before.rows).some(row => row.includes('0.123456789123456789'))).toBe(true);
  await page.goto('/transfer'); await expect(page.getByTestId('domain-database')).toHaveText('aiao-bom-2-domain-v1');
  await page.locator('input[type=file]').setInputFiles({ name: 'old.rxdb-backup', mimeType: 'application/octet-stream', buffer: old });
  await page.getByRole('button', { name: '校验并迁入新库', exact: true }).click();
  await expect(page.getByTestId('domain-database')).toHaveText(/^bom-r-/);
  const migratedName = await page.getByTestId('domain-database').textContent();
  const migrated = await backup(page); const after = await snapshotArchive(migrated);
  await mkdir('test-output/evidence', { recursive: true });
  await writeFile('test-output/evidence/migration-before.json', JSON.stringify(before, null, 2));
  await writeFile('test-output/evidence/migration-after.json', JSON.stringify(after, null, 2));
  expect(after.manifest.schemaFingerprint).toBe(before.manifest.schemaFingerprint);
  expect(after.manifest.constraintFingerprint).toBe(before.manifest.constraintFingerprint);
  const dataRows = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).filter(([name]) => name !== 'sqlite/schema.json'));
  expect(dataRows(after.rows)).toEqual(dataRows(before.rows));
  const schema = (entries: Record<string, string>) => {
    const value = JSON.parse(entries['sqlite/schema.json']) as { objects: { name: string }[] };
    value.objects.sort((a, b) => a.name.localeCompare(b.name)); return value;
  };
  expect(schema(after.rows)).toEqual(schema(before.rows));
  await page.reload(); await expect(page.getByTestId('domain-database')).toHaveText(migratedName!);
  const corrupted = Buffer.from(old); corrupted[corrupted.length - 8] ^= 1;
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.rxdb-backup', mimeType: 'application/octet-stream', buffer: corrupted });
  await page.getByRole('button', { name: '校验并迁入新库', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/checksum|archive|校验/i);
  await expect(page.getByTestId('domain-database')).toHaveText(migratedName!);
  await page.getByRole('button', { name: '回退到保留的原库', exact: true }).click();
  await expect(page.getByTestId('domain-database')).toHaveText('aiao-bom-2-domain-v1');
  await page.goto('http://localhost:4316/transfer'); const unchanged = await snapshotArchive(await backup(page));
  expect(unchanged.rows).toEqual(before.rows);
  const report = { checkedAt: new Date().toISOString(), sourceDatabase: 'dev-rxdb-bom', targetDatabase: migratedName,
    bytes: old.length, tables: Object.fromEntries(Object.entries(before.rows).map(([name, rows]) => [name, Buffer.byteLength(rows)])),
    exactRowsPreserved: true, originalUnchanged: true, corruptedArchiveRejected: true, rollbackVerified: true };
  await mkdir('test-output/evidence', { recursive: true });
  await writeFile('test-output/evidence/migration.json', JSON.stringify(report, null, 2));
  await writeFile('test-output/evidence/migration-old.rxdb-backup', old);
  await info.attach('migration.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});
