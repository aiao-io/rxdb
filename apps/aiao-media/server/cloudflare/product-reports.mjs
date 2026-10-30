import { reject, uuid } from './product-http.mjs';

export function reportFilter(url) {
  const query = new URLSearchParams({
    select: 'id,owner_id,workspace_id,task_id,model,channel,status,started_at,payload,received_at',
    order: 'started_at.desc,id',
    limit: '100'
  });
  const names = { userId: 'owner_id', model: 'model', channel: 'channel', status: 'status' };
  for (const [name, column] of Object.entries(names)) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    if (
      name === 'userId' ? !uuid(value)
      : name === 'model' ? !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)
      : name === 'channel' ? !['direct', 'proxy'].includes(value)
      : !['processing', 'completed', 'failed', 'needs_review'].includes(value)
    )
      reject(400, '任务筛选参数无效。');
    query.set(column, `eq.${value}`);
  }
  for (const [name, operator] of [
    ['from', 'gte'],
    ['to', 'lt']
  ]) {
    const value = url.searchParams.get(name);
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
      reject(400, '时间筛选需要包含时区。');
    query.append('started_at', `${operator}.${new Date(value).toISOString()}`);
  }
  const page = Number(url.searchParams.get('page') ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) reject(400, '分页无效。');
  query.set('offset', String((page - 1) * 100));
  return query;
}
export async function reports(client, url, usage = false) {
  const query = reportFilter(url);
  if (!usage) return { reports: await client.call(`/rest/v1/media_task_reports?${query}`), limit: 100 };
  query.delete('offset');
  const sources = Object.fromEntries(
    ['application', 'provider', 'verified'].map(source => [
      source,
      {
        records: 0,
        requestCount: null,
        providerUnits: null,
        verifiedCost: null,
        currencies: {},
        unknown: { requestCount: 0, providerUnits: 0, verifiedCost: 0 }
      }
    ])
  );
  let offset = 0;
  while (true) {
    query.set('offset', String(offset));
    const rows = await client.call(`/rest/v1/media_task_reports?${query}`);
    for (const row of rows) {
      const payload = row.payload,
        bucket = sources[payload.source];
      if (!bucket) reject(502, '用量来源不可识别。');
      bucket.records++;
      for (const key of ['requestCount', 'providerUnits']) {
        if (payload[key] === null) bucket.unknown[key]++;
        else bucket[key] = (bucket[key] ?? 0) + payload[key];
      }
      if (payload.verifiedCost === null) bucket.unknown.verifiedCost++;
      else bucket.currencies[payload.currency] = (bucket.currencies[payload.currency] ?? 0) + payload.verifiedCost;
    }
    offset += rows.length;
    if (rows.length < 100) break;
    if (offset >= 10000) return { sources, partial: true, receivedRecords: offset };
  }
  for (const bucket of Object.values(sources))
    if (Object.keys(bucket.currencies).length === 1) bucket.verifiedCost = Object.values(bucket.currencies)[0];
  return { sources, partial: false, receivedRecords: offset };
}
