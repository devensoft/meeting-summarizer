import { Mastra } from '@mastra/core/mastra';
import { ingestionWorkflow } from './workflows/ingestion-wf';
import { createLogger } from './logger';
import { createObservability } from './observability';
import { resolveProjectRoot } from './paths';
import { createStorage } from './storage';
import { createWorkspace } from './workspace';

const projectRoot = resolveProjectRoot(process.cwd());
const storage = createStorage(projectRoot);
const observability = createObservability(projectRoot);
const logger = createLogger(projectRoot);
const workspace = createWorkspace(projectRoot);

export const mastra = new Mastra({
  workflows: { ingestionWorkflow },
  storage,
  observability,
  logger,
  workspace,
});

logger.info(`[project-root] resolved project root: ${projectRoot}`);
