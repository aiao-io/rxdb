import { libraryWhere } from './library-query.ts';

if (process.argv.length !== 3) throw new Error('时区夹具仅接受一个 JSON 查询参数。');
const filters = JSON.parse(process.argv[2]);
process.stdout.write(JSON.stringify(libraryWhere(filters)));
