import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PinoLogger } from '@mastra/loggers';
import { FileTransport } from '@mastra/loggers/file';

export function createLogger(projectRoot: string) {
  const dataDirectory = path.join(projectRoot, '.mastra', 'data');
  mkdirSync(dataDirectory, { recursive: true });

  const logFilePath = path.join(dataDirectory, 'mastra-logs.jsonl');
  // FileTransport requires a pre-existing file before it can open its stream.
  if (!existsSync(logFilePath)) {
    writeFileSync(logFilePath, '', 'utf8');
  }

  return new PinoLogger({
    name: 'mastra-meeting-summarizer',
    level: 'info',
    transports: {
      file: new FileTransport({ path: logFilePath }),
    },
  });
}
