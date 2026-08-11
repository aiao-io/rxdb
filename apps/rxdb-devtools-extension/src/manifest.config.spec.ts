import { describe, expect, it } from 'vitest';
import manifest from '../manifest.config';

describe('extension permissions', () => {
  it('uses optional host access and does not require webNavigation', () => {
    expect(manifest).toMatchObject({
      permissions: ['scripting'],
      optional_host_permissions: ['<all_urls>']
    });
    expect(manifest).not.toHaveProperty('host_permissions');
  });
});
