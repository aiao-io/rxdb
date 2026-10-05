const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = '/Users/jimmy/Documents/aiao/rxdb';
const base = path.join(root, 'requirements/reviews/evidence/2026-10-05/parallel-round3/replay-fixture');
const setup = JSON.parse(fs.readFileSync(path.join(root, 'requirements/reviews/evidence/2026-10-05/parallel-round2/validation/isolated-consumer-setup.json'), 'utf8'));
const mode = process.argv[2];
const configPath = mode === 'consumer'
  ? path.join(setup.consumerDirectory, 'cases/rxdb-plugin-replay-angular/tsconfig.valid.json')
  : path.join(root, 'packages/rxdb-plugin-replay-angular/tsconfig.spec.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath), {}, configPath);
const options = {...parsed.options, strict: true, skipLibCheck: false, skipDefaultLibCheck: false, noEmit: true, composite: false, incremental: false, emitDeclarationOnly: false, ...(mode === 'consumer' ? {} : {rootDir: root, lib: ['lib.es2025.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts']})};
const fileNames = mode === 'consumer' ? parsed.fileNames : [path.join(root, 'packages/rxdb-plugin-replay-angular/src/__tests__/review-round2-player-lifecycle.spec.ts')];
const program = ts.createProgram(fileNames, options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
console.log(JSON.stringify({mode, compilerVersion: ts.version, configPath, fileNames, strict: options.strict, skipLibCheck: options.skipLibCheck, skipDefaultLibCheck: options.skipDefaultLibCheck, noEmit: options.noEmit, diagnostics: diagnostics.map(d => ({file: d.file?.fileName, code: d.code, category: ts.DiagnosticCategory[d.category], line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : undefined, message: ts.flattenDiagnosticMessageText(d.messageText, '\n')}))}, null, 2));
if (diagnostics.length) process.exitCode = 1;
