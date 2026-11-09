import { fixJson } from './fix-json';

export type PartialJsonParseState = 'undefined-input' | 'successful-parse' | 'repaired-parse' | 'failed-parse';

export interface PartialJsonParseResult {
  value: unknown;
  state: PartialJsonParseState;
}

function tryParse(text: string): { success: true; value: unknown } | { success: false } {
  try {
    return { success: true, value: JSON.parse(text) as unknown };
  } catch {
    return { success: false };
  }
}

export async function parsePartialJson(jsonText: string | undefined): Promise<PartialJsonParseResult> {
  if (jsonText === undefined) return { value: undefined, state: 'undefined-input' };

  const parsed = tryParse(jsonText);
  if (parsed.success) return { value: parsed.value, state: 'successful-parse' };

  const repaired = tryParse(fixJson(jsonText));
  if (repaired.success) return { value: repaired.value, state: 'repaired-parse' };

  return { value: undefined, state: 'failed-parse' };
}
