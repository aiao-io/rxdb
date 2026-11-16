import '@angular/compiler';
import { DefaultUrlSerializer } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { isEntitiesRoot } from './entities-root';

describe('isEntitiesRoot', () => {
  it.each(['/entities', '/entities/', '/entities?from=menu', '/entities/?from=menu#top', '/entities#top'])(
    '%s 停在实体根路径，需要跳到首个实体',
    url => {
      expect(isEntitiesRoot(url)).toBe(true);
    }
  );

  it.each(['/', '/dashboard', '/entities/assets/Asset', '/entities/assets/Asset/', '/entity', '/entitiesx'])(
    '%s 不是实体根路径，不跳转',
    url => {
      expect(isEntitiesRoot(url)).toBe(false);
    }
  );

  it('Angular 序列化后的 router.url 保留尾部斜杠，深链 /entities/ 仍判为根路径', () => {
    const serializer = new DefaultUrlSerializer();
    const url = serializer.serialize(serializer.parse('/entities/'));

    expect(url).toBe('/entities/');
    expect(isEntitiesRoot(url)).toBe(true);
  });
});
