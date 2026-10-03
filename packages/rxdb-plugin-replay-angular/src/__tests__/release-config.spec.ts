import { describe, expect, it } from 'vitest';
import projectJson from '../../project.json';

interface ReleaseProjectConfig {
  release?: {
    version?: {
      manifestRootsToUpdate?: string[];
    };
  };
  targets: Record<string, { options?: { packageRoot?: string } }>;
}

describe('Angular package release config', () => {
  it('versions both manifests and publishes the APF build output', () => {
    const project = projectJson as ReleaseProjectConfig;

    expect(project.release?.version?.manifestRootsToUpdate).toEqual(['{projectRoot}', 'dist/{projectRoot}']);
    expect(project.targets['nx-release-publish']?.options?.packageRoot).toBe('dist/{projectRoot}');
  });
});
