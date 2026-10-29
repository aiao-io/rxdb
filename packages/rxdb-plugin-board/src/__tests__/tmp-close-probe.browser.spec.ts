import type { RxDB } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';
import { sqliteWasmFactory } from '@aiao/rxdb-adapter-sqlite-wasm/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

@Entity({
  name: 'ProbeNote',
  tableName: 'probe_note',
  namespace: 'legacy',
  displayName: '笔记',
  properties: [{ name: 'title', type: PropertyType.string, displayName: '标题' }]
})
class ProbeNote extends EntityBase {
  title!: string;
}

type Opened = { rxdb: RxDB; disconnect(): Promise<void> };

const open = (dbName: string) =>
  sqliteWasmFactory.createAdapter<Opened>({
    entities: [ProbeNote],
    plugins: [rxDBPluginHistory],
    persistent: true,
    dbName
  });

const titles = async (opened: Opened) =>
  (
    await firstValueFrom(
      opened.rxdb.entityManager.getRepository(ProbeNote).find({ where: { combinator: 'and', rules: [] } })
    )
  ).map(note => note.title);

const write = async (opened: Opened, id: string, title: string) => {
  await opened.rxdb.entityManager
    .getRepository(ProbeNote)
    .create(opened.rxdb.entityManager.instantiate(ProbeNote, { id, title }));
};

describe('probe', () => {
  for (const mode of ['adapter', 'rxdb'] as const) {
    it(`close via ${mode}`, async () => {
      const name = `pr-${mode}-${Math.random().toString(36).slice(2, 8)}`;
      const first = await open(name);
      await write(first, 'd0000000-0000-4000-8000-000000000001', 'one');
      if (mode === 'adapter') await first.disconnect();
      else await first.rxdb.disconnectAll();
      const second = await open(name);
      const seen = await titles(second);
      await second.rxdb.disconnectAll();
      expect(seen).toEqual(['one']);
    });
  }
});
