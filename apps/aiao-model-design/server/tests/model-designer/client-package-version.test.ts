// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PackageDesignContract } from '../../src/routes/model-designer/client-package/package-builder';
import { decideClientPackageVersion } from '../../src/routes/model-designer/client-package/package-version';

const previous: PackageDesignContract = {
  entities: [
    {
      name: 'Post',
      properties: [{ name: 'title', type: 'string' }],
      relations: [{ name: 'author', kind: 'MANY_TO_ONE', mappedEntity: 'User' }]
    }
  ],
  metadata: { designName: 'Blog' }
};

function current(changes: Partial<PackageDesignContract>): PackageDesignContract {
  return { ...previous, ...changes };
}

describe('client package version decision', () => {
  it('starts at 1.0.0 without a previous publication', () => {
    expect(decideClientPackageVersion(current({}), null)).toEqual({ version: '1.0.0', bump: 'initial' });
  });

  it('uses a minor bump for additive entities, properties, and relations', () => {
    const properties = [...previous.entities[0].properties, { name: 'summary', type: 'string' }];
    expect(
      decideClientPackageVersion(current({ entities: [{ ...previous.entities[0], properties }] }), {
        version: '1.2.3',
        designContract: previous
      })
    ).toEqual({ version: '1.3.0', bump: 'minor' });
  });

  it.each([
    ['removed property', [{ ...previous.entities[0], properties: [] }]],
    ['changed property type', [{ ...previous.entities[0], properties: [{ name: 'title', type: 'number' }] }]],
    [
      'optional property became required',
      [{ ...previous.entities[0], properties: [{ name: 'title', type: 'string', required: true }] }]
    ],
    [
      'relation target changed',
      [
        {
          ...previous.entities[0],
          relations: [{ name: 'author', kind: 'MANY_TO_ONE', mappedEntity: 'Account' }]
        }
      ]
    ]
  ])('uses a major bump for %s', (_label, entities) => {
    expect(decideClientPackageVersion(current({ entities }), { version: '1.2.3', designContract: previous })).toEqual({
      version: '2.0.0',
      bump: 'major'
    });
  });

  it('uses a patch bump for metadata-only changes', () => {
    expect(
      decideClientPackageVersion(current({ metadata: { designName: 'Renamed Blog' } }), {
        version: '1.2.3',
        designContract: previous
      })
    ).toEqual({ version: '1.2.4', bump: 'patch' });
  });

  it('rejects malformed previous semantic versions', () => {
    expect(() =>
      decideClientPackageVersion(current({ metadata: { designName: 'Renamed Blog' } }), {
        version: 'latest',
        designContract: previous
      })
    ).toThrow('semantic version');
  });
});
