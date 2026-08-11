import { describe, expect, it } from 'vitest';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

const SIGNED_64_MIN = -(1n << 63n);
const SIGNED_64_MAX = (1n << 63n) - 1n;

export function bigintBinaryClientSuite(factory: AdapterFactory) {
  describe(`bigint/binary client contract [${factory.name}]`, () => {
    it('round-trips signed 64-bit bounds and the current Uint8Array view', async () => {
      const client = await factory.createClient<SqliteClientLike>(
        `bigint-binary-${factory.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      const source = new Uint8Array([9, 0, 255, 8]);
      const view = source.subarray(1, 3);

      try {
        await client.execute('CREATE TABLE bigint_binary (id INTEGER PRIMARY KEY, amount INTEGER, payload BLOB);');
        await client.execute('INSERT INTO bigint_binary (id, amount, payload) VALUES (?, ?, ?);', [
          SIGNED_64_MIN,
          SIGNED_64_MIN,
          view
        ]);
        await client.execute('INSERT INTO bigint_binary (id, amount, payload) VALUES (?, ?, ?);', [
          SIGNED_64_MAX,
          SIGNED_64_MAX,
          new Uint8Array([1, 2])
        ]);
        source.fill(7);

        const range = await client.execute(
          'SELECT amount, payload FROM bigint_binary WHERE amount BETWEEN ? AND ? ORDER BY amount ASC;',
          [SIGNED_64_MIN, SIGNED_64_MAX]
        );
        expect(range.results[0].rows).toEqual([
          [SIGNED_64_MIN, new Uint8Array([0, 255])],
          [SIGNED_64_MAX, new Uint8Array([1, 2])]
        ]);

        const binary = await client.execute('SELECT amount FROM bigint_binary WHERE payload = ?;', [
          new Uint8Array([0, 255])
        ]);
        expect(binary.results[0].rows).toEqual([[SIGNED_64_MIN]]);

        const notBinary = await client.execute('SELECT amount FROM bigint_binary WHERE payload NOT IN (?);', [
          new Uint8Array([0, 255])
        ]);
        expect(notBinary.results[0].rows).toEqual([[SIGNED_64_MAX]]);

        const bigintSet = await client.execute(
          'SELECT amount FROM bigint_binary WHERE amount IN (?, ?) AND amount NOT IN (?) ORDER BY amount ASC;',
          [SIGNED_64_MIN, SIGNED_64_MAX, SIGNED_64_MAX]
        );
        expect(bigintSet.results[0].rows).toEqual([[SIGNED_64_MIN]]);

        const binarySet = await client.execute(
          'SELECT amount FROM bigint_binary WHERE payload IN (?, ?) ORDER BY amount ASC;',
          [new Uint8Array([0, 255]), new Uint8Array([9, 9])]
        );
        expect(binarySet.results[0].rows).toEqual([[SIGNED_64_MIN]]);
      } finally {
        await client.disconnect();
      }
    });

    it('paginates bigint cursors without gaps or duplicates', async () => {
      const client = await factory.createClient<SqliteClientLike>(
        `bigint-cursor-${factory.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      const ids = [9007199254740993n, 9007199254740994n, 9007199254740995n, 9007199254740996n];

      try {
        await client.execute('CREATE TABLE bigint_cursor (id INTEGER PRIMARY KEY, rank INTEGER NOT NULL);');
        await client.execute('CREATE INDEX bigint_cursor_rank ON bigint_cursor (rank, id);');
        for (let index = 0; index < ids.length; index++) {
          await client.execute('INSERT INTO bigint_cursor (id, rank) VALUES (?, ?);', [
            ids[index],
            Math.floor(index / 2)
          ]);
        }

        const first = await client.execute('SELECT id, rank FROM bigint_cursor ORDER BY rank ASC, id ASC LIMIT 2;');
        expect(first.results[0].rows).toEqual([
          [ids[0], 0],
          [ids[1], 0]
        ]);

        const after = await client.execute(
          'SELECT id, rank FROM bigint_cursor WHERE rank > ? OR (rank = ? AND id > ?) ORDER BY rank ASC, id ASC LIMIT 2;',
          [0, 0, ids[1]]
        );
        expect(after.results[0].rows).toEqual([
          [ids[2], 1],
          [ids[3], 1]
        ]);

        const before = await client.execute(
          'SELECT id, rank FROM bigint_cursor WHERE rank < ? OR (rank = ? AND id < ?) ORDER BY rank DESC, id DESC LIMIT 2;',
          [1, 1, ids[2]]
        );
        expect(before.results[0].rows).toEqual([
          [ids[1], 0],
          [ids[0], 0]
        ]);
      } finally {
        await client.disconnect();
      }
    });

    it('keeps bigint foreign keys through joins and cascades', async () => {
      const client = await factory.createClient<SqliteClientLike>(
        `bigint-relations-${factory.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      );
      const parentId = 9007199254740993n;
      const tagId = 9007199254740994n;

      try {
        await client.execute('PRAGMA foreign_keys = ON;');
        await client.execute('CREATE TABLE bigint_parent (id INTEGER PRIMARY KEY);');
        await client.execute(
          'CREATE TABLE bigint_profile (id TEXT PRIMARY KEY, parent_id INTEGER NOT NULL UNIQUE REFERENCES bigint_parent(id) ON DELETE CASCADE);'
        );
        await client.execute(
          'CREATE TABLE bigint_child (id TEXT PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES bigint_parent(id) ON DELETE CASCADE);'
        );
        await client.execute('CREATE TABLE bigint_tag (id INTEGER PRIMARY KEY);');
        await client.execute(
          'CREATE TABLE bigint_parent_tag (parent_id INTEGER NOT NULL REFERENCES bigint_parent(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES bigint_tag(id) ON DELETE CASCADE);'
        );

        await client.execute('INSERT INTO bigint_parent (id) VALUES (?);', [parentId]);
        await client.execute('INSERT INTO bigint_profile (id, parent_id) VALUES (?, ?);', ['profile', parentId]);
        await client.execute('INSERT INTO bigint_child (id, parent_id) VALUES (?, ?);', ['child', parentId]);
        await client.execute('INSERT INTO bigint_tag (id) VALUES (?);', [tagId]);
        await client.execute('INSERT INTO bigint_parent_tag (parent_id, tag_id) VALUES (?, ?);', [parentId, tagId]);

        const joined = await client.execute(
          'SELECT p.id, c.parent_id, pt.parent_id, pt.tag_id FROM bigint_parent p JOIN bigint_child c ON c.parent_id = p.id JOIN bigint_parent_tag pt ON pt.parent_id = p.id WHERE p.id = ?;',
          [parentId]
        );
        expect(joined.results[0].rows).toEqual([[parentId, parentId, parentId, tagId]]);

        await client.execute('DELETE FROM bigint_parent WHERE id = ?;', [parentId]);
        const children = await client.execute('SELECT id FROM bigint_child;');
        const profiles = await client.execute('SELECT id FROM bigint_profile;');
        const junctions = await client.execute('SELECT parent_id FROM bigint_parent_tag;');
        expect(children.results[0].rows).toEqual([]);
        expect(profiles.results[0].rows).toEqual([]);
        expect(junctions.results[0].rows).toEqual([]);
      } finally {
        await client.disconnect();
      }
    });
  });
}
