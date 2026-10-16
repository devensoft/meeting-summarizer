import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';

// Keep the DuckDB wrapper alive alongside the domain it provides. The wrapper
// owns the close() path that releases DuckDB's file lock during shutdown and
// dev hot reload.
const duckdbStoreReferences = new Set<DuckDBStore>();

export function createStorage(projectRoot: string) {
  const dataDirectory = path.join(projectRoot, '.mastra', 'data');
  mkdirSync(dataDirectory, { recursive: true });

  const duckdbStore = new DuckDBStore({ path: path.join(dataDirectory, 'mastra.duckdb') });
  duckdbStoreReferences.add(duckdbStore);

  return new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: `file:${path.join(dataDirectory, 'mastra.db').replace(/\\/g, '/')}`,
    }),
    domains: {
      observability: duckdbStore.observability,
    },
  });
}
