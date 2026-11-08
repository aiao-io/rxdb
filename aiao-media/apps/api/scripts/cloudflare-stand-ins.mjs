import { DatabaseSync } from 'node:sqlite';

// Node stand-ins for the Durable Object and R2 bindings behind the relay tasks. They keep the parts of the runtime
// contract the Worker relies on: SQL storage per object, one alarm per object, waitUntil, a reset that makes the old
// instance's storage writes fail, and bucket get/put/head/delete. The dev server and tests run the production code
// against them instead of Wrangler.

function storage(entry, live, scheduled) {
  const guard = () => {
    if (!live()) throw new Error('Durable Object was reset');
  };
  return {
    sql: {
      exec(query, ...params) {
        guard();
        const statement = entry.db.prepare(query);
        return statement.columns().length ? statement.all(...params) : (statement.run(...params), []);
      }
    },
    async getAlarm() {
      return entry.alarm;
    },
    async setAlarm(time) {
      guard();
      entry.alarm = time;
      scheduled?.(time);
    },
    async deleteAlarm() {
      guard();
      entry.alarm = null;
      scheduled?.(null);
    },
    async deleteAll() {
      guard();
      for (const { name } of entry.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())
        entry.db.exec(`DROP TABLE "${name}"`);
    }
  };
}

/**
 * A Durable Object namespace whose objects run in this process. With `autoAlarms` the alarm fires on a real timer
 * (development); otherwise tests fire it with `alarm(name)` after moving the clock.
 */
export function durableObjectNamespace(create, { autoAlarms = true } = {}) {
  const objects = new Map();
  const schedule = (name, entry) => time => {
    clearTimeout(entry.timer);
    if (time === null) return;
    entry.timer = setTimeout(() => void fire(name).catch(() => undefined), Math.max(0, time - Date.now()));
    entry.timer.unref();
  };
  function activate(name) {
    let entry = objects.get(name);
    if (!entry) {
      entry = { db: new DatabaseSync(':memory:'), alarm: null, generation: 0, instance: null, pending: new Set() };
      objects.set(name, entry);
    }
    if (entry.instance) return entry;
    const generation = ++entry.generation;
    const ctx = {
      storage: storage(entry, () => entry.generation === generation, autoAlarms ? schedule(name, entry) : null),
      waitUntil(promise) {
        // The runtime only logs a rejected waitUntil promise; it never reaches the caller.
        const settled = promise.catch(() => undefined);
        entry.pending.add(settled);
        void settled.finally(() => entry.pending.delete(settled));
      }
    };
    entry.instance = create(ctx);
    return entry;
  }
  async function fire(name) {
    const entry = activate(name);
    entry.alarm = null;
    await entry.instance.alarm();
  }
  return {
    idFromName: name => ({ name, toString: () => name }),
    get: id => ({ fetch: (input, init) => activate(id.name).instance.fetch(new Request(input, init)) }),
    alarm: fire,
    /** Drops the in-memory instance. Its later storage writes fail, as after a Cloudflare reset. */
    reset(name) {
      const entry = objects.get(name);
      entry.generation++;
      entry.instance = null;
    },
    /** Resolves once every waitUntil promise of the object has settled. */
    async settled(name) {
      while (objects.get(name)?.pending.size) await Promise.all(objects.get(name).pending);
    },
    alarmAt: name => objects.get(name)?.alarm ?? null,
    rows: (name, query) => objects.get(name)?.db.prepare(query).all() ?? [],
    get size() {
      return objects.size;
    }
  };
}

/** An in-memory R2 bucket with the methods the relay tasks use. */
export function r2Bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) {
      const bytes = new Uint8Array(value);
      objects.set(key, { bytes, httpMetadata: options.httpMetadata ?? {} });
      return { key, size: bytes.byteLength };
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        key,
        size: object.bytes.byteLength,
        httpMetadata: object.httpMetadata,
        body: new Response(object.bytes).body
      };
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { key, size: object.bytes.byteLength } : null;
    },
    async delete(key) {
      objects.delete(key);
    }
  };
}
