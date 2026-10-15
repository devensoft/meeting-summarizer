import path from 'node:path';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';

export function createWorkspace(projectRoot: string) {
  return new Workspace({
    id: 'meeting-workspace',
    filesystem: new LocalFilesystem({
      id: 'meeting-workspace-fs',
      basePath: path.join(projectRoot, '.workspace'),
    }),
  });
}
