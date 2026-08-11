import type { RxDB } from '@aiao/rxdb';
import { SEARCH_PARITY_ARTICLES, SEARCH_PARITY_COMMENTS } from '@aiao/rxdb-test';
import { Article, Comment } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';

let seedQueue: Promise<void> = Promise.resolve();

function collectErrorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  if (!cause) return error.message;

  return `${error.message} ${collectErrorText(cause)}`;
}

function isDuplicateSeedIdError(error: unknown): boolean {
  const text = collectErrorText(error).toLowerCase();
  const duplicate = text.includes('unique constraint failed') || text.includes('duplicate key');
  return duplicate && text.includes('id');
}

async function readIds<T extends { id: unknown }>(records: Promise<T[]>): Promise<Set<string>> {
  return new Set((await records).map(record => String(record.id)));
}

async function createSeedRecord(id: string | undefined, existingIds: Set<string>, create: () => Promise<void>) {
  if (id && existingIds.has(id)) return;

  try {
    await create();
    if (id) existingIds.add(id);
  } catch (error) {
    if (id && isDuplicateSeedIdError(error)) {
      existingIds.add(id);
      return;
    }
    throw error;
  }
}

async function runSeed(db: RxDB): Promise<void> {
  const articleRepo = db.entityManager.getRepository(Article);
  const commentRepo = db.entityManager.getRepository(Comment);
  const [existingArticleIds, existingCommentIds] = await Promise.all([
    readIds(firstValueFrom(articleRepo.findAll({ where: { combinator: 'and', rules: [] } }))),
    readIds(firstValueFrom(commentRepo.findAll({ where: { combinator: 'and', rules: [] } })))
  ]);

  for (const articleData of SEARCH_PARITY_ARTICLES) {
    await createSeedRecord(articleData.id, existingArticleIds, () =>
      articleRepo.create(Object.assign(new Article(), articleData)).then(() => undefined)
    );
  }

  for (const commentData of SEARCH_PARITY_COMMENTS) {
    await createSeedRecord(commentData.id, existingCommentIds, () =>
      commentRepo.create(Object.assign(new Comment(), commentData)).then(() => undefined)
    );
  }
}

export async function seedSearchParityData(db: RxDB): Promise<void> {
  seedQueue = seedQueue.catch(() => undefined).then(() => runSeed(db));
  await seedQueue;
}
