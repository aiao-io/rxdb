import type { ConfigEnv } from 'vite';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import angularConfig from '/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-angular/vite.config.mts';

class ReviewSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = [...files].sort((left, right) => 1 * left.moduleId.localeCompare(right.moduleId));
    console.log('R3-03 old-first:', ordered.map(file => file.moduleId));
    return ordered;
  }
}

export default (environment: ConfigEnv) => {
  const config = angularConfig(environment);
  return { ...config, test: { ...config.test, sequence: { sequencer: ReviewSequencer } } };
};
