type SeedResult = { article: number; comment: number } | null;

export async function seedAndRefreshRecords(
  seed: () => Promise<SeedResult>,
  refreshRecords: () => Promise<void>
): Promise<void> {
  const result = await seed();
  if (!result) return;
  await refreshRecords();
}
