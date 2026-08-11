/** @type {import('@aiao/rxdb-adapter-sqliteai').SqliteaiOptions} */
export const sqliteaiOptionsContract = {
  opfs: true,
  opfsFallback: 'throw'
};

/**
 * @param {import('@aiao/rxdb-adapter-sqliteai').GenerateSqlResult} result
 * @returns {import('@aiao/rxdb-adapter-sqliteai').GenerateSqlResult}
 */
export const acceptGenerateSqlResult = result => result;
