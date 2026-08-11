import { RxDBClientGenerator, type SourceFile } from '@aiao/rxdb-client-generator';

export interface GeneratorSourceState {
  sources: SourceFile[];
  error: Error | null;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function generateSourceState(json: string): GeneratorSourceState {
  if (!json) return { sources: [], error: null };

  try {
    const generator = new RxDBClientGenerator();
    generator.addEntity(JSON.parse(json));
    generator.exec();
    return { sources: generator.getSourceFiles(), error: null };
  } catch (error: unknown) {
    return { sources: [], error: normalizeError(error) };
  }
}
