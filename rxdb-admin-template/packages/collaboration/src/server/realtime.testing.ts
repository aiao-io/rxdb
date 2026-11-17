/**
 * 集成测试用的 Realtime 数据库对象。裸 `supabase/postgres` 镜像只有空的 realtime schema，
 * realtime.messages、realtime.topic() 与 realtime.send() 由 Realtime 服务首次连库时建出。这里按本机隔离栈里
 * Realtime v2.102.3 建出的定义原样复制（列、分区键、约束、授权与行级安全；分区改为一个默认分区，免得按日期建表），
 * 让迁移里的频道策略与命令事务里的广播在临时库上照常执行；真实频道的收发另在三端 E2E 的隔离栈上验证。
 */
const realtimeObjects = `
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE TABLE IF NOT EXISTS realtime.messages (
  topic text NOT NULL,
  extension text NOT NULL,
  payload jsonb,
  event text,
  private boolean DEFAULT false,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  inserted_at timestamp without time zone DEFAULT now() NOT NULL,
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  binary_payload bytea,
  CONSTRAINT messages_payload_exclusive CHECK (payload IS NULL OR binary_payload IS NULL),
  PRIMARY KEY (id, inserted_at)
) PARTITION BY RANGE (inserted_at);
CREATE TABLE IF NOT EXISTS realtime.messages_default PARTITION OF realtime.messages DEFAULT;
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON TABLE realtime.messages TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION realtime.topic()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
select nullif(current_setting('realtime.topic', true), '')::text;
$function$;
CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$;
GRANT USAGE ON SCHEMA realtime TO anon, authenticated, service_role;
`;

/** 在临时库上建出 Realtime 的消息表与函数（幂等），须在执行产品迁移之前调用。 */
export async function installRealtime(database: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await database.query(realtimeObjects);
}
