/** Nominatim 的合法地点；坐标和可选范围在进入视图前校验。 */
export interface Place {
  readonly lat: string;
  readonly lon: string;
  readonly name?: string;
  readonly display_name: string;
  readonly boundingbox?: readonly string[];
}

const coordinate = (value: unknown, limit: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  Number.isFinite(Number(value)) &&
  Math.abs(Number(value)) <= limit;

function parsePlace(value: unknown): Place {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid place');
  const place = value as Record<string, unknown>;
  if (!coordinate(place['lat'], 90) || !coordinate(place['lon'], 180)) throw new Error('Invalid coordinates');
  if (typeof place['display_name'] !== 'string' || !place['display_name'].trim()) throw new Error('Invalid place name');
  if (place['name'] !== undefined && typeof place['name'] !== 'string') throw new Error('Invalid short name');
  const box = place['boundingbox'];
  if (box !== undefined) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every((part, index) => coordinate(part, index < 2 ? 90 : 180)))
      throw new Error('Invalid place bounds');
    if (Number(box[0]) > Number(box[1]) || Number(box[2]) > Number(box[3])) throw new Error('Reversed place bounds');
  }
  return value as Place;
}

/** 只有显式搜索发请求；HTTP 或非法数据失败不能冒充没有结果。 */
export async function searchPlaces(query: string, signal: AbortSignal): Promise<readonly Place[]> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' }, signal }
  );
  if (!response.ok) throw new Error('Place search is unavailable');
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Invalid search response');
  return body.map(parsePlace);
}
