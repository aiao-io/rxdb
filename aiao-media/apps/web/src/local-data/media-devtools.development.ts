import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';

let owner: symbol | null = null;

/** 只观测当前工作区，延迟释放的旧工作区不能断开新会话。 */
export function connectMediaDevTools(db: RxDB): () => void {
  const connector = getDevToolsConnector();
  const token = Symbol();
  connector.disconnect();
  owner = null;
  connector.init(db, getEntityMetadata);
  owner = token;
  return () => {
    if (owner !== token) return;
    owner = null;
    connector.disconnect();
  };
}
