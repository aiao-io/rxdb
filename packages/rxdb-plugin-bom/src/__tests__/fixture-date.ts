const fixtureOrigin = Date.parse('2026-10-01T00:00:00.000Z');
const utcToday = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const dateOffset = utcToday - fixtureOrigin;

/** 将夹具中的 2026-10-01 对齐本轮 UTC 当日，保持历史、发布和评估日期的相对间隔。 */
export const fixtureDay = (iso: string): Date => new Date(Date.parse(`${iso}T00:00:00.000Z`) + dateOffset);
