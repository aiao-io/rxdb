import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const app = path.resolve(import.meta.dirname, '..');
const sourceDir = process.env.BOM_SOURCE_DIR || path.join(app, 'fixtures/windrose-2026-11-13');
const origin = 'https://www.windrose.ai';
const sources = {
  bom: ['BOM-inline-data.json', '/bom?lang=zh'],
  models: ['BOM-3D-data.json', '/assets/BOM-3D-data.json?v=20261009pn2'],
  detail: ['BOM-parts-detail.json', '/assets/BOM-parts-detail.json?v=20261009pn2'],
  hierarchy: ['viewer-hierarchy-data.mjs', '/assets/viewer-hierarchy-data.mjs'],
  names: ['part-names.json', '/assets/part-names.json?v=20260910c'],
  spares: ['spare-parts-data.js', '/assets/spare-parts-data.js']
};
const hashes = [];
async function readSource(key) {
  const [name, url] = sources[key];
  const raw = sourceDir ? await readFile(path.join(sourceDir, name), 'utf8') : await (await fetch(origin + url)).text();
  hashes.push({
    url: origin + url,
    file: name,
    hashScope: key === 'bom' ? 'extracted inline DATA JSON' : 'complete source response',
    sha256: createHash('sha256').update(raw).digest('hex')
  });
  if (key === 'hierarchy') return JSON.parse(raw.split('export const SHARED =')[1].trim().replace(/;\s*$/, ''));
  if (key === 'spares')
    return JSON.parse(
      raw
        .replace(/^window.SP_DATA\s*=\s*/, '')
        .trim()
        .replace(/;\s*$/, '')
    );
  if (key === 'bom' && !sourceDir)
    return JSON.parse(
      raw
        .split('\n')
        .find(x => x.includes('const DATA = '))
        .split('const DATA = ')[1]
        .trim()
        .replace(/;$/, '')
    );
  return JSON.parse(raw);
}
const [bom, catalog, detail, hierarchy, names, spares] = await Promise.all(Object.keys(sources).map(readSource));
const glb = await readFile(path.join(app, 'public/models/eu-x9d13.glb'));
if (glb.toString('utf8', 0, 4) !== 'glTF') throw new Error('整车资源不是 GLB');
const gltf = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const marketMap = { EU: 'WH13', CN: 'WH11', US: 'WH12', AU: 'WH14' };
const marketKeys = { EU: 'eu', CN: 'cn', US: 'us', AU: 'au' };
const gid = id => String(id).match(/^(\d{7}|Q\d{6})/)?.[1] || String(id);
const baseById = new Map(bom.rows.map(r => [r.g, r]));
const metaById = new Map();
for (const row of catalog.rows) {
  const list = metaById.get(row.gid) || [];
  list.push(row);
  metaById.set(row.gid, list);
}
const sceneById = new Map();
gltf.nodes.forEach((n, i) => {
  const id = n.extras?.item_id || n.extras?.gid;
  if (!id) return;
  const list = sceneById.get(gid(id)) || [];
  list.push({ index: i, variant: id });
  sceneById.set(gid(id), list);
});
const ids = new Set([...baseById.keys(), ...metaById.keys(), ...Object.keys(detail)]);
const parts = [...ids].map(id => {
  const b = baseById.get(id);
  const metadata = metaById.get(id) || [];
  const d = detail[id] || {};
  const n = names[id] || {};
  const scenes = sceneById.get(id) || [];
  const quantity = b?.q?.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  const rawQuantity = b?.q || '';
  const family = b?.f || (/^\d{7}$/.test(id) ? id.slice(0, 2) : 'STD');
  const marketParts = Object.fromEntries(
    Object.entries(marketKeys)
      .filter(([, k]) => d.mk?.[k] || metadata.some(m => m.models?.[k]))
      .map(([m, k]) => [m, d.mk?.[k] || metadata.find(x => x.models?.[k]).models[k]])
  );
  const assets = metadata
    .filter(m => m.glb)
    .map((m, i) => ({
      id: `${id}:asset:${i}`,
      url: new URL(m.glb, origin).href,
      variants: [...new Set(Object.values(m.models || {}))],
      kind: 'part'
    }));
  const spare = spares.parts.find(s => gid(s.pn) === id);
  return {
    id,
    name: b?.cn || n.zh || metadata[0]?.name || d.en || id,
    english: d.en || n.en || '',
    family,
    familyName: bom.families[family]?.split(' / ')[0] || (family === 'STD' ? '标准件与其他目录' : `系统 ${family}`),
    variants: [...new Set([...(b?.v?.split(',').filter(Boolean) || []), ...Object.values(marketParts)])],
    markets: Object.keys(marketMap).filter(m => (b ? b.mk?.[marketMap[m]] === 'Y' : Boolean(marketParts[m]))),
    marketParts,
    cb: Object.fromEntries(Object.entries(marketMap).map(([m, k]) => [m, b?.cb?.[k] || '–'])),
    mb: Object.fromEntries(Object.entries(marketMap).map(([m, k]) => [m, b?.mb?.[k] || '–'])),
    sb: Object.fromEntries(Object.entries(marketMap).map(([m, k]) => [m, b?.sb?.[k] || '–'])),
    rawQuantity,
    quantity: quantity?.[1] || null,
    quantityState:
      !rawQuantity ? 'missing'
      : quantity ? 'reference'
      : 'ambiguous',
    uom: quantity?.[2] || '件',
    conflict: b?.cf && b.cf !== '0' ? b.cf : '',
    policy: b?.b || d.advice || '',
    specs: { ...d.specs },
    dimensions: d.dim || [],
    assets,
    sceneNodes: scenes.map(n => n.index),
    sceneVariants: [...new Set(scenes.map(n => n.variant))],
    inBom: Boolean(b),
    photo: d.photo || metadata.find(m => m.photo)?.photo || null,
    price: spare?.price || null,
    parentReference: d.parent || null
  };
});
const partMap = new Map(parts.map(p => [p.id, p]));
const baseOccurrence = (p, key, parentKey, source) => ({
  key,
  parentKey,
  partId: p.id,
  compId: p.variants[0] || p.id,
  kind: 'part',
  source,
  markets: p.markets,
  quantity: p.quantity,
  quantityState: p.quantityState,
  uom: p.uom,
  sourceRef: `${source}:${p.id}`
});
const families = [...new Set(parts.map(p => p.family))].sort();
const catalogNodes = families.map(f => ({
  key: `family:${f}`,
  parentKey: null,
  partId: `@family/${f}`,
  label: parts.find(p => p.family === f).familyName,
  compId: f,
  kind: 'system',
  source: 'catalog',
  markets: Object.keys(marketMap),
  quantity: null,
  quantityState: 'missing',
  uom: '',
  sourceRef: `Family ${f}`
}));
for (const p of parts) catalogNodes.push(baseOccurrence(p, `catalog:${p.id}`, `family:${p.family}`, 'catalog'));
const purchase = [];
function visit(node, parentKey, indices) {
  const key = `purchase:${indices.join('.')}`;
  purchase.push({
    key,
    parentKey,
    partId: node.gid,
    label: node.name_zh || node.name_en,
    compId: node.eu || node.us || node.gid,
    kind: node.level === 'L1' ? 'assembly' : 'part',
    source: 'purchase',
    markets: ['EU', 'US'].filter(m => node[marketKeys[m]]),
    quantity: null,
    quantityState: 'missing',
    uom: '件',
    sourceRef: `CBOM ${indices.join('.')}`
  });
  (node.children || []).forEach((child, i) => visit(child, key, [...indices, i]));
}
hierarchy.forEach((node, i) => visit(node, null, [i]));
const parents = new Map();
gltf.nodes.forEach((node, i) => (node.children || []).forEach(c => parents.set(c, i)));
const cad = gltf.nodes.map((node, index) => {
  const extra = node.extras || {};
  const id = gid(extra.item_id || extra.gid || node.name || `node-${index}`);
  const p = partMap.get(id);
  return {
    key: `cad:${index}`,
    parentKey: parents.has(index) ? `cad:${parents.get(index)}` : null,
    partId: id,
    label: p?.name || node.name || id,
    compId: extra.item_id || extra.gid || node.name || id,
    kind: node.children?.length ? 'assembly' : 'part',
    source: 'cad',
    markets: ['EU'],
    quantity: null,
    quantityState: 'missing',
    uom: '件',
    sourceRef: `glTF node ${index} · ${extra.system_id || ''}`,
    nodeIndex: index
  };
});
hashes.sort((a, b) => a.url.localeCompare(b.url));
const data = {
  schema: 'aiao-bom-2/1',
  id: 'windrose-2026-11-13',
  title: 'Windrose R700',
  version: 'Gen 2 · 来源标签 2026-12',
  observedOn: '2026-11-13',
  parts,
  structures: { catalog: catalogNodes, purchase, cad, draft: [] },
  vehicle: { url: '/models/eu-x9d13.glb', bytes: glb.length, label: 'EU · X9D13C · 参考模型', units: 'mm' },
  sourceUrls: hashes.map(s => s.url)
};
await mkdir(path.join(app, 'public/data'), { recursive: true });
await writeFile(path.join(app, 'public/data/windrose.json'), JSON.stringify(data));
await writeFile(
  path.join(app, 'public/data/provenance.json'),
  JSON.stringify(
    {
      observedOn: data.observedOn,
      sources: hashes,
      vehicleSha256: createHash('sha256').update(glb).digest('hex'),
      baseRows: bom.rows.length,
      parts: parts.length,
      cadNodes: cad.length,
      purchaseNodes: purchase.length
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({
    parts: parts.length,
    catalog: catalogNodes.length,
    purchase: purchase.length,
    cad: cad.length,
    vehicleBytes: glb.length
  })
);
