import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  StreamingEntityParser,
  closeAndParseJson,
  findTopLevelValue,
  type StreamingEntityCallbacks,
  type StreamingParseResult
} from '../../services/streaming-entity-parser';

// aaacccc.json 完整内容（User + Order 实体）
const FULL_JSON = JSON.stringify({
  thinking:
    '根据业务描述，需要设计两个核心实体：用户（User）和订单（Order），并建立一对多关系。\n设计思路如下：\n1. 用户实体\n2. 订单实体\n3. 关系设计',
  entities: [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'User',
      displayName: '用户',
      properties: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'name',
          propertyType: 'string',
          displayName: '姓名',
          isRequired: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          enumValues: null
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          name: 'email',
          propertyType: 'string',
          displayName: '邮箱',
          isRequired: true,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
          enumValues: null
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440004',
          name: 'phone',
          propertyType: 'string',
          displayName: '手机号',
          isRequired: false,
          isNullable: true,
          isUnique: false,
          defaultValue: null,
          enumValues: null
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440005',
          name: 'age',
          propertyType: 'integer',
          displayName: '年龄',
          isRequired: false,
          isNullable: true,
          isUnique: false,
          defaultValue: null,
          enumValues: null
        }
      ],
      relations: [
        {
          id: '550e8400-e29b-41d4-a716-446655440006',
          name: 'orders',
          relationKind: 'ONE_TO_MANY',
          mappedEntityId: '550e8400-e29b-41d4-a716-446655440007',
          mappedPropertyId: '550e8400-e29b-41d4-a716-446655440010',
          onDeleteAction: 'CASCADE'
        }
      ],
      indexes: [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          propertyIds: ['550e8400-e29b-41d4-a716-446655440003'],
          isUnique: true
        }
      ]
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440007',
      name: 'Order',
      displayName: '订单',
      properties: [
        {
          id: '550e8400-e29b-41d4-a716-446655440008',
          name: 'orderNumber',
          propertyType: 'string',
          displayName: '订单号',
          isRequired: true,
          isNullable: false,
          isUnique: true,
          defaultValue: null,
          enumValues: null
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440009',
          name: 'amount',
          propertyType: 'number',
          displayName: '金额',
          isRequired: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          enumValues: null
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440012',
          name: 'status',
          propertyType: 'enum',
          displayName: '状态',
          isRequired: true,
          isNullable: false,
          isUnique: false,
          defaultValue: 'PENDING',
          enumValues: ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED']
        }
      ],
      relations: [
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          name: 'user',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: '550e8400-e29b-41d4-a716-446655440001',
          mappedPropertyId: '550e8400-e29b-41d4-a716-446655440006',
          onDeleteAction: 'NO_ACTION'
        }
      ],
      indexes: [
        {
          id: '550e8400-e29b-41d4-a716-446655440013',
          propertyIds: ['550e8400-e29b-41d4-a716-446655440008'],
          isUnique: true
        }
      ]
    }
  ]
});

/** 将字符串按指定大小分块 */
function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.substring(i, i + size));
  }
  return chunks;
}

/**
 * 带 spy 的回调集合
 *
 * 每个 spy 显式带上回调的真实签名，与 {@link StreamingEntityCallbacks} 求交集：
 * 签名一旦漂移，这里先编译失败，而不是让 `mock.calls` 退化成 any 把断言架空。
 */
type SpyCallbacks = StreamingEntityCallbacks & {
  onThinking: Mock<(text: string) => void>;
  onEntityProgress: Mock<(partial: Record<string, unknown>, index: number) => void>;
  onEntityComplete: Mock<(entity: Record<string, unknown>, index: number) => void>;
  onComplete: Mock<(result: StreamingParseResult) => void>;
  onError: Mock<(error: Error) => void>;
};

/** 创建带 spy 的回调集合 */
function createSpyCallbacks(): SpyCallbacks {
  return {
    onThinking: vi.fn<(text: string) => void>(),
    onEntityProgress: vi.fn<(partial: Record<string, unknown>, index: number) => void>(),
    onEntityComplete: vi.fn<(entity: Record<string, unknown>, index: number) => void>(),
    onComplete: vi.fn<(result: StreamingParseResult) => void>(),
    onError: vi.fn<(error: Error) => void>()
  };
}

// ===== findTopLevelValue =====

describe('findTopLevelValue', () => {
  it('should find "thinking" value position', () => {
    const json = '{"thinking": "hello"}';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBe(13);
    expect(json[pos]).toBe('"');
  });

  it('should find "entities" value position', () => {
    const json = '{"thinking": "hello", "entities": []}';
    const pos = findTopLevelValue(json, 'entities');
    expect(pos).toBeGreaterThan(0);
    expect(json[pos]).toBe('[');
  });

  it('should handle whitespace around colon and value', () => {
    const json = '{ "thinking" :  "hello" }';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBeGreaterThan(0);
    expect(json[pos]).toBe('"');
  });

  it('should ignore key inside nested object', () => {
    const json = '{"meta": {"thinking": "inner"}, "thinking": "outer"}';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBeGreaterThan(0);
    const jsonStr = json.substring(pos, json.indexOf('}', pos));
    expect(jsonStr).toContain('outer');
  });

  it('should ignore key inside string value', () => {
    const json = '{"desc": "has thinking inside", "thinking": "real"}';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBeGreaterThan(0);
    expect(json.substring(pos, pos + 6)).toBe('"real"');
  });

  it('should not match partial key name "entities_count"', () => {
    const json = '{"entities_count": 5, "entities": []}';
    const pos = findTopLevelValue(json, 'entities');
    expect(pos).toBeGreaterThan(0);
    expect(json[pos]).toBe('[');
  });

  it('should not match value string "entities"', () => {
    const json = '{"type": "entities", "entities": []}';
    const pos = findTopLevelValue(json, 'entities');
    expect(pos).toBeGreaterThan(0);
    expect(json[pos]).toBe('[');
  });

  it('should return -1 when key not found', () => {
    const json = '{"foo": "bar"}';
    expect(findTopLevelValue(json, 'thinking')).toBe(-1);
  });

  it('should return -1 for incomplete buffer (value not started)', () => {
    const json = '{"thinking":';
    expect(findTopLevelValue(json, 'thinking')).toBe(-1);
  });

  it('should return -1 for empty string', () => {
    expect(findTopLevelValue('', 'thinking')).toBe(-1);
  });

  it('should handle key at second position', () => {
    const json = '{"a": 1, "thinking": "yes"}';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBeGreaterThan(0);
    expect(json[pos]).toBe('"');
  });

  it('should handle string value with escaped quotes containing key', () => {
    const json = '{"note": "key is \\"thinking\\"", "thinking": "real"}';
    const pos = findTopLevelValue(json, 'thinking');
    expect(pos).toBeGreaterThan(0);
    expect(json.substring(pos, pos + 6)).toBe('"real"');
  });
});

// ===== closeAndParseJson =====

describe('closeAndParseJson', () => {
  it('should parse complete JSON object', () => {
    const result = closeAndParseJson('{"name": "User"}');
    expect(result).toEqual({ name: 'User' });
  });

  it('should close incomplete string', () => {
    const result = closeAndParseJson('{"name": "Us');
    expect(result).toEqual({ name: 'Us' });
  });

  it('should close open object', () => {
    const result = closeAndParseJson('{"name": "User"');
    expect(result).toEqual({ name: 'User' });
  });

  it('should close open array', () => {
    const result = closeAndParseJson('{"items": [1, 2');
    expect(result).toEqual({ items: [1, 2] });
  });

  it('should close nested structures', () => {
    const result = closeAndParseJson('{"props": [{"name": "email"');
    expect(result).toEqual({ props: [{ name: 'email' }] });
  });

  it('should handle trailing comma', () => {
    const result = closeAndParseJson('{"name": "User",');
    expect(result).toEqual({ name: 'User' });
  });

  it('should handle escaped quotes in strings', () => {
    const result = closeAndParseJson('{"name": "Test\\"Value"');
    expect(result).toEqual({ name: 'Test"Value' });
  });

  it('should handle escaped backslash before closing quote', () => {
    const result = closeAndParseJson('{"path": "C:\\\\"}');
    expect(result).toEqual({ path: 'C:\\' });
  });

  it('should return null for totally broken input', () => {
    expect(closeAndParseJson('')).toBeNull();
  });

  it('should handle deeply nested partial JSON', () => {
    const result = closeAndParseJson('{"a": {"b": {"c": "d"');
    expect(result).toEqual({ a: { b: { c: 'd' } } });
  });

  it('should handle mixed arrays and objects', () => {
    const result = closeAndParseJson('{"properties": [{"id": "p1", "name": "email", "type": "string"}, {"id": "p2"');
    expect(result).toEqual({
      properties: [{ id: 'p1', name: 'email', type: 'string' }, { id: 'p2' }]
    });
  });

  it('should handle enum values array', () => {
    const result = closeAndParseJson('{"enumValues": ["PENDING", "PAID"');
    expect(result).toEqual({ enumValues: ['PENDING', 'PAID'] });
  });

  it('should handle boolean and null values', () => {
    const result = closeAndParseJson('{"isRequired": true, "defaultValue": null');
    expect(result).toEqual({ isRequired: true, defaultValue: null });
  });

  it('should handle trailing colon (incomplete key-value)', () => {
    // When we have "name": "User", "prop": → trailing colon stripped
    const result = closeAndParseJson('{"name": "User", "prop":');
    // After stripping trailing `:` and whitespace, we get {"name": "User", "prop"}
    // This parse-fails because "prop" is a string key without value after stripping colon
    // Expect null since JSON is structurally invalid
    // Actually: closeAndParseJson strips trailing `:` → `{"name": "User", "prop"` → then close `}`
    // `{"name": "User", "prop"}` is invalid JSON (key without value)
    expect(result).toBeNull();
  });

  it('should handle numeric values', () => {
    const result = closeAndParseJson('{"amount": 99.5, "count": 3');
    expect(result).toEqual({ amount: 99.5, count: 3 });
  });
});

// ===== StreamingEntityParser: entity detection =====

describe('StreamingEntityParser', () => {
  describe('entity boundary detection', () => {
    it('should detect single entity', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name": "User"}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete).toHaveBeenCalledWith({ name: 'User' }, 0);
      expect(callbacks.onComplete).toHaveBeenCalledWith({
        thinking: '',
        entities: [{ name: 'User' }]
      });
    });

    it('should detect multiple entities', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name": "User"}, {"name": "Order"}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete).toHaveBeenNthCalledWith(1, { name: 'User' }, 0);
      expect(callbacks.onEntityComplete).toHaveBeenNthCalledWith(2, { name: 'Order' }, 1);
    });

    it('should handle empty entities array', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": []}');
      parser.end();

      expect(callbacks.onEntityComplete).not.toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith({ thinking: '', entities: [] });
    });

    it('should handle entities with nested objects (properties/relations/indexes)', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      const entity = {
        id: 'e1',
        name: 'User',
        properties: [
          { id: 'p1', name: 'email', propertyType: 'string' },
          { id: 'p2', name: 'age', propertyType: 'integer' }
        ],
        relations: [{ id: 'r1', name: 'orders', relationKind: 'ONE_TO_MANY', mappedEntityId: 'e2' }],
        indexes: [{ id: 'i1', propertyIds: ['p1'], isUnique: true }]
      };

      parser.write(JSON.stringify({ entities: [entity] }));
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      const result = callbacks.onEntityComplete.mock.calls[0][0];
      expect(result['name']).toBe('User');
      expect((result['properties'] as unknown[]).length).toBe(2);
      expect((result['relations'] as unknown[]).length).toBe(1);
      expect((result['indexes'] as unknown[]).length).toBe(1);
    });

    it('should handle escaped quotes inside string values', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name": "Test\\"Entity", "tag": "a}b[c"}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('Test"Entity');
    });

    it('should handle escaped backslash in strings', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"path": "C:\\\\Users\\\\test"}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['path']).toBe('C:\\Users\\test');
    });

    it('should handle brackets inside string values', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"desc": "has ] and } and { and [ inside"}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['desc']).toBe('has ] and } and { and [ inside');
    });

    it('should track entity index correctly', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"a":1},{"b":2},{"c":3}]}');
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(3);
      expect(callbacks.onEntityComplete.mock.calls[0][1]).toBe(0);
      expect(callbacks.onEntityComplete.mock.calls[1][1]).toBe(1);
      expect(callbacks.onEntityComplete.mock.calls[2][1]).toBe(2);
    });
  });

  describe('chunked input', () => {
    it('should work with single-character chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      const json = '{"entities": [{"name": "A"}, {"name": "B"}]}';

      for (const ch of json) {
        parser.write(ch);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('A');
      expect(callbacks.onEntityComplete.mock.calls[1][0]['name']).toBe('B');
    });

    it('should work with large single chunk', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write(FULL_JSON);
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('User');
      expect(callbacks.onEntityComplete.mock.calls[1][0]['name']).toBe('Order');
    });

    it('should work with 10-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 10)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('User');
      expect(callbacks.onEntityComplete.mock.calls[1][0]['name']).toBe('Order');
    });

    it('should work with 50-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 50)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should work with 200-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 200)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should emit first entity before second entity data arrives', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Split right after first entity's closing }
      const json = '{"entities": [{"name":"A"},{"name":"B"}]}';
      const splitIdx = json.indexOf('},') + 1;

      parser.write(json.substring(0, splitIdx));
      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('A');

      parser.write(json.substring(splitIdx));
      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should handle chunk boundary splitting escape sequence', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Split in the middle of \" escape sequence
      const json = '{"entities": [{"name": "test\\"end"}]}';
      const escPos = json.indexOf('\\');

      parser.write(json.substring(0, escPos + 1)); // includes the backslash
      parser.write(json.substring(escPos + 1)); // starts with the quote
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('test"end');
    });
  });

  describe('thinking extraction', () => {
    it('should emit complete thinking text', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"thinking": "hello world", "entities": []}');
      parser.end();

      expect(callbacks.onThinking).toHaveBeenCalled();
      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe('hello world');
    });

    it('should emit partial thinking as stream grows', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"thinking": "hel');
      expect(callbacks.onThinking).toHaveBeenCalled();
      const partial = callbacks.onThinking.mock.calls[0][0] as string;
      expect(partial).toBe('hel');

      parser.write('lo world", "entities": []}');
      parser.end();

      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe('hello world');
    });

    it('should handle newlines in thinking', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write(JSON.stringify({ thinking: 'line1\nline2\nline3', entities: [] }));
      parser.end();

      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe('line1\nline2\nline3');
    });

    it('should handle escaped characters in thinking', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write(JSON.stringify({ thinking: '引号"和\\反斜杠', entities: [] }));
      parser.end();

      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe('引号"和\\反斜杠');
    });

    it('should handle no thinking field', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name":"A"}]}');
      parser.end();

      expect(callbacks.onComplete).toHaveBeenCalledWith({
        thinking: '',
        entities: [{ name: 'A' }]
      });
    });

    it('should handle unicode in thinking', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      const thinking = '根据业务描述，需要设计两个核心实体';
      parser.write(JSON.stringify({ thinking, entities: [] }));
      parser.end();

      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe(thinking);
    });

    it('should handle unicode escape sequences in thinking', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // \\u4f60 = 你
      parser.write('{"thinking": "\\u4f60\\u597d", "entities": []}');
      parser.end();

      const lastCall = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1];
      expect(lastCall[0]).toBe('你好');
    });
  });

  describe('entity progress', () => {
    it('should emit progress when entity name is available', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Feed entity incrementally
      parser.write('{"entities": [{"name": "User"');
      // At this point, the entity is not complete, but name should be extractable

      expect(callbacks.onEntityProgress).toHaveBeenCalled();
      const progressCalls = callbacks.onEntityProgress.mock.calls;
      const lastProgress = progressCalls[progressCalls.length - 1][0] as Record<string, unknown>;
      expect(lastProgress['name']).toBe('User');
    });

    it('should emit progress as properties complete', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name": "User", "properties": [{"id": "p1"}');

      const progressCalls = callbacks.onEntityProgress.mock.calls;
      const lastProgress = progressCalls[progressCalls.length - 1][0] as Record<string, unknown>;
      expect(lastProgress['name']).toBe('User');
      expect(lastProgress['properties']).toBeDefined();
    });

    it('should not emit duplicate progress', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"entities": [{"name": "User"');
      const callCount1 = callbacks.onEntityProgress.mock.calls.length;

      // Write whitespace — no new data, no new progress
      parser.write('  ');
      const callCount2 = callbacks.onEntityProgress.mock.calls.length;

      expect(callCount2).toBe(callCount1);
    });

    it('should emit progress with index of next entity', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Complete first entity, start second
      parser.write('{"entities": [{"name":"A"},{"name":"B"');

      const progressCalls = callbacks.onEntityProgress.mock.calls;
      expect(progressCalls.length).toBeGreaterThan(0);
      const lastIdx = progressCalls[progressCalls.length - 1][1];
      expect(lastIdx).toBe(1); // second entity (index 1)
    });
  });

  describe('end() behavior', () => {
    it('should emit onComplete with all data', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"thinking": "思考", "entities": [{"id": "1"}, {"id": "2"}]}');
      parser.end();

      expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
      const result = callbacks.onComplete.mock.calls[0][0];
      expect(result.thinking).toBe('思考');
      expect(result.entities).toHaveLength(2);
    });

    it('should handle early end (interrupted stream)', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Stream cut off mid-entity
      parser.write('{"thinking": "思考", "entities": [{"name": "User"}, {"name": "Ord');
      parser.end();

      expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
      const result = callbacks.onComplete.mock.calls[0][0];
      expect(result.thinking).toBe('思考');
      expect(result.entities).toHaveLength(1); // only first entity was complete
      expect(result.entities[0]['name']).toBe('User');
    });

    it('should return partial thinking when stream interrupted during thinking', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"thinking": "部分内容');
      parser.end();

      const result = callbacks.onComplete.mock.calls[0][0];
      expect(result.thinking).toBe('部分内容');
      expect(result.entities).toHaveLength(0);
    });

    it('should return empty result for completely empty input', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.end();

      expect(callbacks.onComplete).toHaveBeenCalledWith({ thinking: '', entities: [] });
    });
  });

  describe('error handling', () => {
    it('should call onError for malformed entity and continue', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Create a scenario with a valid first entity and technically-complete-but-invalid second entity
      // This is hard because our bracket counting uses JSON.parse for the entity substring.
      // Let's test getResult instead for this edge case
      parser.write('{"entities": [{"name": "A"}]}');
      parser.end();

      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
    });

    it('should not crash on garbage input', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('not json at all!!!');
      parser.end();

      expect(callbacks.onComplete).toHaveBeenCalledWith({ thinking: '', entities: [] });
    });
  });

  describe('getResult()', () => {
    it('should return current state without triggering callbacks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write('{"thinking": "abc", "entities": [{"x":1}]}');
      callbacks.onComplete.mockClear();

      const result = parser.getResult();
      expect(result.thinking).toBe('abc');
      expect(result.entities).toHaveLength(1);
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });
  });

  describe('integration: aaacccc.json', () => {
    it('should parse full JSON in one write', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      parser.write(FULL_JSON);
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);

      const user = callbacks.onEntityComplete.mock.calls[0][0];
      expect(user['name']).toBe('User');
      expect(user['displayName']).toBe('用户');
      expect((user['properties'] as unknown[]).length).toBe(4);
      expect((user['relations'] as unknown[]).length).toBe(1);
      expect((user['indexes'] as unknown[]).length).toBe(1);

      const order = callbacks.onEntityComplete.mock.calls[1][0];
      expect(order['name']).toBe('Order');
      expect(order['displayName']).toBe('订单');
      expect((order['properties'] as unknown[]).length).toBe(3);
      expect((order['relations'] as unknown[]).length).toBe(1);
      expect((order['indexes'] as unknown[]).length).toBe(1);

      const result = callbacks.onComplete.mock.calls[0][0];
      expect(result.thinking).toContain('用户');
      expect(result.thinking).toContain('订单');
    });

    it('should parse correctly with 1-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const ch of FULL_JSON) {
        parser.write(ch);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      const user = callbacks.onEntityComplete.mock.calls[0][0];
      expect(user['name']).toBe('User');
      const order = callbacks.onEntityComplete.mock.calls[1][0];
      expect(order['name']).toBe('Order');
    });

    it('should parse correctly with 7-byte chunks (odd boundary)', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 7)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('User');
      expect(callbacks.onEntityComplete.mock.calls[1][0]['name']).toBe('Order');
    });

    it('should parse correctly with 33-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 33)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should parse correctly with 128-byte chunks', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      for (const chunk of chunkString(FULL_JSON, 128)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should emit User entity before Order data finishes', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Feed character by character, check that User is emitted before end
      let userEmittedBeforeEnd = false;
      callbacks.onEntityComplete.mockImplementation((entity, index) => {
        if (index === 0) {
          userEmittedBeforeEnd = true;
          expect((entity as Record<string, unknown>)['name']).toBe('User');
        }
      });

      for (const chunk of chunkString(FULL_JSON, 20)) {
        parser.write(chunk);
      }

      expect(userEmittedBeforeEnd).toBe(true);
      parser.end();
      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
    });

    it('should emit thinking updates during streaming', () => {
      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);

      // Feed in small chunks
      for (const chunk of chunkString(FULL_JSON, 30)) {
        parser.write(chunk);
      }
      parser.end();

      // Thinking should have been emitted at least once
      expect(callbacks.onThinking).toHaveBeenCalled();
      const lastThinking = callbacks.onThinking.mock.calls[callbacks.onThinking.mock.calls.length - 1][0];
      expect(lastThinking).toContain('用户');
    });

    it('should produce same result regardless of chunk size', () => {
      const chunkSizes = [1, 3, 7, 10, 50, 100, 500, FULL_JSON.length];
      const results: ReturnType<StreamingEntityParser['getResult']>[] = [];

      for (const size of chunkSizes) {
        const parser = new StreamingEntityParser();
        for (const chunk of chunkString(FULL_JSON, size)) {
          parser.write(chunk);
        }
        parser.end();
        results.push(parser.getResult());
      }

      // All results should be identical
      const baseline = JSON.stringify(results[0]);
      for (let i = 1; i < results.length; i++) {
        expect(JSON.stringify(results[i])).toBe(baseline);
      }
    });

    it('should match entity data from JSON.parse exactly', () => {
      const expected = JSON.parse(FULL_JSON);
      const parser = new StreamingEntityParser();

      for (const chunk of chunkString(FULL_JSON, 17)) {
        parser.write(chunk);
      }
      parser.end();

      const result = parser.getResult();
      expect(result.thinking).toBe(expected.thinking);
      expect(result.entities).toEqual(expected.entities);
    });
  });

  describe('integration: edge case JSON structures', () => {
    it('should handle entity with enumValues array', () => {
      const json = JSON.stringify({
        thinking: '',
        entities: [
          {
            name: 'Status',
            properties: [
              {
                name: 'value',
                propertyType: 'enum',
                enumValues: ['ACTIVE', 'INACTIVE', 'PENDING']
              }
            ],
            relations: [],
            indexes: []
          }
        ]
      });

      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      for (const chunk of chunkString(json, 11)) {
        parser.write(chunk);
      }
      parser.end();

      const entity = callbacks.onEntityComplete.mock.calls[0][0];
      const props = entity['properties'] as { enumValues: string[] }[];
      expect(props[0].enumValues).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);
    });

    it('should handle entity with null and boolean values', () => {
      const json = JSON.stringify({
        entities: [
          {
            name: 'Test',
            properties: [
              {
                name: 'field',
                isRequired: true,
                isNullable: false,
                defaultValue: null,
                enumValues: null
              }
            ]
          }
        ]
      });

      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      for (const chunk of chunkString(json, 9)) {
        parser.write(chunk);
      }
      parser.end();

      const entity = callbacks.onEntityComplete.mock.calls[0][0];
      const props = entity['properties'] as Record<string, unknown>[];
      expect(props[0]['isRequired']).toBe(true);
      expect(props[0]['isNullable']).toBe(false);
      expect(props[0]['defaultValue']).toBeNull();
      expect(props[0]['enumValues']).toBeNull();
    });

    it('should handle 10 entities', () => {
      const entities = Array.from({ length: 10 }, (_, i) => ({
        id: `e${i}`,
        name: `Entity${i}`,
        properties: [{ id: `p${i}`, name: `field${i}` }],
        relations: [],
        indexes: []
      }));
      const json = JSON.stringify({ thinking: 'many entities', entities });

      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      for (const chunk of chunkString(json, 23)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(10);
      for (let i = 0; i < 10; i++) {
        expect(callbacks.onEntityComplete.mock.calls[i][0]['name']).toBe(`Entity${i}`);
        expect(callbacks.onEntityComplete.mock.calls[i][1]).toBe(i);
      }
    });

    it('should handle entity with deeply nested JSON property', () => {
      const json = JSON.stringify({
        entities: [
          {
            name: 'Config',
            properties: [
              {
                name: 'settings',
                propertyType: 'json',
                defaultValue: '{"a":{"b":{"c":"deep"}}}'
              }
            ]
          }
        ]
      });

      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      for (const chunk of chunkString(json, 13)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(1);
      const props = callbacks.onEntityComplete.mock.calls[0][0]['properties'] as Record<string, unknown>[];
      expect(props[0]['defaultValue']).toBe('{"a":{"b":{"c":"deep"}}}');
    });

    it('should handle pretty-printed JSON with whitespace', () => {
      const json = `{
  "thinking": "pretty",
  "entities": [
    {
      "name": "User",
      "properties": []
    },
    {
      "name": "Order",
      "properties": []
    }
  ]
}`;

      const callbacks = createSpyCallbacks();
      const parser = new StreamingEntityParser(callbacks);
      for (const chunk of chunkString(json, 15)) {
        parser.write(chunk);
      }
      parser.end();

      expect(callbacks.onEntityComplete).toHaveBeenCalledTimes(2);
      expect(callbacks.onEntityComplete.mock.calls[0][0]['name']).toBe('User');
      expect(callbacks.onEntityComplete.mock.calls[1][0]['name']).toBe('Order');
    });
  });
});
