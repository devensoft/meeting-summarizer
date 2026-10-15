import { Observability, MastraStorageExporter } from '@mastra/observability';

export function createObservability() {
  return new Observability({
    configs: {
      default: {
        serviceName: 'mastra-meeting-summarizer',
        exporters: [new MastraStorageExporter()],
      },
    },
  });
}
