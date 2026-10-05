import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { base, virtualRoot, hash, assertFrozen } from './consumer-tools.mjs';

const read = name => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8'));
const assertions = [];
const verify = (name, action) => { action(); assertions.push(name); console.log(`PASS ${name}`); };
const ngc = read('compiler-consumer-ngc-final.json');
const tsc = read('compiler-consumer-tsc-final.json');
verify('strict .ts ngc positive has zero diagnostics', () => { assert.equal(ngc.exitCode, 0); assert.deepEqual(ngc.diagnostics, []); assert.equal(ngc.strict, true); assert.equal(ngc.strictTemplates, true); assert.equal(ngc.skipLibCheck, false); });
verify('AOT and TS-only emit consume the exact same source', () => assert.deepEqual(ngc.sourceFiles, tsc.sourceFiles));
for (const [name, compilation] of [['ngc', ngc], ['tsc', tsc]]) {
  verify(`${name} ESM mirrors are byte-identical emitted artifacts`, () => { assert.equal(compilation.esmMirrors.length, 1); for (const mirror of compilation.esmMirrors) { assert.equal(mirror.byteIdentical, true); assert.ok(fs.readFileSync(mirror.file).equals(fs.readFileSync(mirror.target))); assert.equal(hash(fs.readFileSync(mirror.target)), mirror.sha256); } });
}
const expected = {
  'tree-missing': [-998008], 'tree-input': [2322], 'tree-event': [2345],
  'search-missing': [-998008], 'search-input': [2322, 2559], 'search-event': [2345, 2345]
};
for (const [name, codes] of Object.entries(expected)) {
  verify(`${name} .ts template rejects with exact diagnostics`, () => { const result = read(`compiler-${name}-ngc-final.json`); assert.equal(result.exitCode, 1); assert.deepEqual(result.diagnostics.map(d => d.code), codes); assert.equal(result.errorCount, codes.length); assert.equal(result.strictTemplates, true); assert.equal(result.skipLibCheck, false); assert.equal(result.emittedFiles.length, 0); });
}
for (const name of ['tree-input', 'tree-event', 'search-input', 'search-event']) {
  verify(`${name} earlier .mts false acceptance is preserved`, () => { const result = read(`compiler-${name}-esm-ngc.json`); assert.equal(result.exitCode, 0); assert.equal(result.strictTemplates, true); assert.equal(result.errorCount, 0); });
}
for (const [mode, expectedCount] of [['tree-aot', 14], ['search-lifecycle-aot', 10]]) {
  verify(`${mode} final runtime assertions pass`, () => { const result = read(`runtime-${mode}-ts-final.json`); assert.equal(result.exitCode, 0); assert.equal(result.assertionCount, expectedCount); assert.equal(result.failure, undefined); assert.equal(result.compiledSha256, ngc.esmMirrors[0].sha256); });
}
for (const mode of ['tree-jit-unbound', 'search-field-source-aot', 'search-field-options-aot']) {
  verify(`${mode} actual runtime remains red NG0950`, () => { const result = read(`runtime-${mode}-ts-final.json`); assert.equal(result.exitCode, 1); assert.match(result.failure.message, /NG0950/); assert.equal(result.searchRecords.length, 0); if (mode === 'tree-jit-unbound') assert.deepEqual(result.inputMetadata.TreeChild, {}); else assert.ok(result.inputMetadata.FieldSourceSearchChild.source); });
}
verify('JIT raw red contains NG0303 before NG0950', () => { const dir = path.join(base, '27-tree-jit-unbound-ts-final'); const raw = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(file => file.endsWith('.txt'))), 'utf8'); assert.ok(raw.indexOf('NG0303') >= 0); assert.ok(raw.indexOf('NG0303') < raw.indexOf('RuntimeError: NG0950')); });
const statuses = fs.readdirSync(base, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^\d\d-/.test(entry.name)).flatMap(entry => fs.readdirSync(path.join(base, entry.name)).filter(file => file.endsWith('.status.json')).map(file => read(path.join(entry.name, file))));
verify('all prior real commands held the shared lock without scoped drift', () => { assert.equal(statuses.length, 30); assert.ok(statuses.every(status => status.serialHeavyTaskLock && status.changedInputsDuringMeasurement.length === 0 && status.headAtStart === status.headAtFinish)); });
verify('protected 71 scoped files still equal initial discovery snapshot', () => { const dir = path.join(base, '01-resolved-projects'); const inputs = read(path.join('01-resolved-projects', fs.readdirSync(dir).find(file => file.endsWith('.inputs.json')))); const root = '/Users/jimmy/Documents/aiao/rxdb'; assert.equal(Object.keys(inputs).length, 71); for (const [name, expectedHash] of Object.entries(inputs)) assert.equal(hash(fs.readFileSync(path.join(root, name))), expectedHash); });
verify('virtual consumer directory was never physically written', () => assert.equal(fs.existsSync(virtualRoot), false));
verify('canonical .ts runtime logs have no Node module-format warning', () => { for (const entry of fs.readdirSync(base).filter(name => /^(26|27|28|29|30)-/.test(name) && !name.endsWith('.txt'))) { const raw = fs.readFileSync(path.join(base, entry, fs.readdirSync(path.join(base, entry)).find(file => file.endsWith('.txt'))), 'utf8'); assert.doesNotMatch(raw, /MODULE_TYPELESS_PACKAGE_JSON|Warning:/); } });
assertFrozen();
fs.writeFileSync(path.join(base, 'artifact-verification.json'), JSON.stringify({ assertionCount: assertions.length, assertions, priorMeasurements: statuses.length, finalDistinctRuntimeAssertions: 24, finalInvalidTemplateGroups: 6, finalTemplateDiagnosticCount: 8, exitCode: 0 }, null, 2) + '\n');
console.log(`SUMMARY artifact verification assertions=${assertions.length} exit=0`);
