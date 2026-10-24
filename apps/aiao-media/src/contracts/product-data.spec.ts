import { describe, expect, it } from 'vitest';
import { imageMvpCatalog } from '../app/image-mvp-catalog';
import {
  productRecordId,
  validateProviderPolicy,
  validatePublishedTemplate,
  validateSyncPayload,
  validateTaskReport
} from './product-data.mjs';

const uuid = '00000000-0000-4000-8000-000000000001';
describe('product transport field whitelists', () => {
  it('scopes stable record identities by workspace and record kind', async () => {
    const first = await productRecordId(uuid, 'provider', uuid);
    expect(await productRecordId(uuid, 'provider', uuid)).toBe(first);
    expect(await productRecordId('00000000-0000-4000-8000-000000000002', 'provider', uuid)).not.toBe(first);
    expect(await productRecordId(uuid, 'work', uuid)).not.toBe(first);
  });
  it('rejects credentials and local file identifiers in synced records', () => {
    const provider = {
      version: 1,
      name: 'Example',
      baseUrl: 'https://provider.example.test/v1',
      model: 'image',
      mode: 'direct'
    };
    expect(validateSyncPayload('provider', provider)).toEqual(provider);
    for (const key of ['apiKey', 'rememberKey', 'fileId', 'opfsPath', 'access_token'])
      expect(() => validateSyncPayload('provider', { ...provider, [key]: 'secret' })).toThrow();
  });
  it('validates inert draft nodes and rejects unknown nested fields', () => {
    const value = { version: 1, state: { document: { type: 'doc', content: [] }, fields: [], values: {} } };
    expect(validateSyncPayload('draft', value)).toEqual(value);
    expect(() => validateSyncPayload('draft', { ...value, state: { ...value.state, token: 'secret' } })).toThrow();
    expect(() =>
      validateSyncPayload('draft', {
        ...value,
        state: { ...value.state, document: { type: 'html', text: '<script>' } }
      })
    ).toThrow();
  });
  it('publishes only validated template snapshots', () => {
    expect(validatePublishedTemplate(imageMvpCatalog[0])).toEqual(imageMvpCatalog[0]);
    expect(() => validatePublishedTemplate({ ...imageMvpCatalog[0], image: 'javascript:alert(1)' })).toThrow();
    expect(() => validatePublishedTemplate({ ...imageMvpCatalog[0], templateDocument: { type: 'script' } })).toThrow();
  });
  it('拒绝策略中的凭据、重复目标和非法地址', () => {
    const provider = {
      id: uuid,
      name: '供应商',
      baseUrl: 'https://provider.example.test/v1',
      models: ['image'],
      sizes: ['1024x1024'],
      direct: true,
      proxy: true,
      enabled: true
    };
    expect(validateProviderPolicy({ version: 1, providers: [provider] })).toEqual({
      version: 1,
      providers: [provider]
    });
    for (const value of [
      { ...provider, baseUrl: 'http://provider.example.test' },
      { ...provider, baseUrl: 'https://user:secret@provider.example.test' },
      { ...provider, apiKey: 'secret' },
      { ...provider, models: ['bad/model'] }
    ])
      expect(() => validateProviderPolicy({ version: 1, providers: [value] })).toThrow();
    expect(() => validateProviderPolicy({ version: 1, providers: [provider, provider] })).toThrow();
  });
  it('keeps unknown usage unknown and excludes prompts and credentials', () => {
    const report = {
      id: uuid,
      taskId: uuid,
      workspaceId: uuid,
      model: 'image',
      providerId: uuid,
      channel: 'direct',
      status: 'completed',
      startedAt: '2026-10-24T00:00:00.000Z',
      source: 'application',
      requestCount: 1,
      providerUnits: null,
      verifiedCost: null,
      currency: null
    };
    expect(validateTaskReport(report)).toEqual(report);
    expect(() => validateTaskReport({ ...report, prompt: 'private' })).toThrow();
    expect(() => validateTaskReport({ ...report, verifiedCost: 1 })).toThrow();
  });
});
