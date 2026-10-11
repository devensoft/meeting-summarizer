import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { Observability, MastraStorageExporter } from '@mastra/observability';
import { ingestionWorkflow } from './workflows/ingestion-wf';
import { resolveProjectRoot } from '../common/utils';

// Data files must live OUTSIDE src/mastra/public (that directory is copied into
// the build output and served statically). Anchor to the project root so the
// location is independent of the terminal the server was started from.
const dataDir = path.join(resolveProjectRoot(process.cwd()), '.mastra', 'data');
mkdirSync(dataDir, { recursive: true });

// Composite storage: LibSQL for app data, DuckDB for the observability domain (traces + metrics aggregation)
const storage = new MastraCompositeStore({
  id: 'composite-storage',
  default: new LibSQLStore({
    id: 'mastra-storage',
    url: `file:${path.join(dataDir, 'mastra.db').replace(/\\/g, '/')}`,
  }),
  domains: {
    observability: await new DuckDBStore({ path: path.join(dataDir, 'mastra.duckdb') }).getStore('observability'),
  },
});

// Tracing: persist spans to storage so they are viewable in Studio and queryable via `mastra api trace`
const observability = new Observability({
  configs: {
    default: {
      serviceName: 'mastra-meeting-summarizer',
      exporters: [new MastraStorageExporter()],
    },
  },
});

// Export the initialized Mastra application bundle.
// Agents: file-based agents under src/mastra/agents/<name>/ are auto-discovered
// and registered by the bundler (see src/mastra/agents/meeting-master/).
export const mastra = new Mastra({
  workflows: { ingestionWorkflow },
  storage,
  observability,
});
