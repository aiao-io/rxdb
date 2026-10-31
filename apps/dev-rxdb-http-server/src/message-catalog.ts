import type { RuleGroup } from '@aiao/rxdb';
import { catalogMessages, messageId, RemoteMessageEntry } from '@aiao/rxdb-i18n';
import { HttpError } from './http-utils.ts';
import { mapEngineError, normalizeWhere, readObject } from './recipes-repository.ts';
import type { RxdbRecipeStore } from './rxdb-store.ts';

export const MESSAGES_RESOURCE = 'messages';
export const REMOTE_MESSAGE_ENTITY = 'RemoteMessageEntry';
const ALL: RuleGroup<RemoteMessageEntry> = { combinator: 'and', rules: [] };
const byId = (id: string): RuleGroup<RemoteMessageEntry> => ({
  combinator: 'and',
  rules: [{ field: 'id', operator: '=', value: id }]
});
const repository = (store: RxdbRecipeStore) => store.rxdb.localAdapterSync.getRepository(RemoteMessageEntry);
const toWire = (row: RemoteMessageEntry) => ({ ...row, updatedAt: row.updatedAt.toISOString() });

export const listMessageMetadata = async (store: RxdbRecipeStore, where: unknown, limit: number, offset: number) => {
  try {
    const rows = await repository(store).find({
      where: normalizeWhere(where) as RuleGroup<RemoteMessageEntry>,
      limit,
      offset,
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
    return rows.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }));
  } catch (error) {
    throw mapEngineError(error, 'catalog metadata query failed');
  }
};

const readIds = (input: unknown): string[] => {
  const ids = readObject(input, 'catalog ids')['ids'];
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string'))
    throw new HttpError(400, 'ids must be a string array');
  return ids;
};

export const findMessagesByIds = async (store: RxdbRecipeStore, input: unknown) => {
  const ids = readIds(input);
  const rows = await repository(store).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });
  return rows.map(toWire);
};

const validateMessage = (input: unknown) => {
  const body = readObject(input, 'catalog message');
  for (const field of ['locale', 'namespace', 'key', 'value']) {
    if (typeof body[field] !== 'string') throw new HttpError(400, `${field} must be a string`);
  }
  try {
    const [row] = catalogMessages({
      locale: body['locale'] as string,
      namespace: body['namespace'] as string,
      messages: { [body['key'] as string]: body['value'] as string }
    });
    return { ...row, id: messageId(row.locale, row.namespace, row.key), source: 'remote' as const };
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid ICU catalog');
  }
};

export const createRemoteMessage = async (store: RxdbRecipeStore, input: unknown) => {
  const value = validateMessage(input);
  try {
    return await store.rxdb.localAdapterSync.transaction(async executor => {
      const repo = executor.getRepository(RemoteMessageEntry);
      if ((await repo.find({ where: byId(value.id) })).length) throw new HttpError(409, 'Message already exists');
      const entity = Object.assign(store.rxdb.entityManager.instantiate(RemoteMessageEntry), value, {
        updatedAt: new Date()
      });
      await repo.create(entity);
      return toWire(entity);
    });
  } catch (error) {
    throw mapEngineError(error, 'catalog create failed');
  }
};

export const updateRemoteMessage = async (store: RxdbRecipeStore, id: string, input: unknown) => {
  const body = readObject(input, 'catalog update');
  return store.rxdb.localAdapterSync.transaction(async executor => {
    const repo = executor.getRepository(RemoteMessageEntry);
    const [current] = await repo.find({ where: byId(id) });
    if (!current) throw new HttpError(404, 'Message not found');
    const value = validateMessage({ ...current, value: body['value'] });
    const updated = { ...value, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) };
    await repo.update(current, updated);
    return toWire(Object.assign(current, updated));
  });
};

export const deleteRemoteMessages = async (store: RxdbRecipeStore, input: unknown): Promise<number> => {
  const ids = readIds(input);
  return store.rxdb.localAdapterSync.transaction(async executor => {
    const repo = executor.getRepository(RemoteMessageEntry);
    const rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] }
    });
    for (const row of rows) await repo.remove(row);
    return rows.length;
  });
};

export const seedMessageCatalog = async (store: RxdbRecipeStore): Promise<void> => {
  const rows = await repository(store).find({ where: ALL });
  for (const row of rows) await repository(store).remove(row);
  for (const key of ['greeting', 'status'])
    await createRemoteMessage(store, { locale: 'en', namespace: 'http-demo', key, value: `Remote ${key} v1` });
};
