import { Observability, MastraStorageExporter } from '@mastra/observability';

export function createObservability(_projectRoot: string) {
  // Keep the factory root-parameterized; exporter behavior is independent of it.
  return new Observability({
    configs: {
      default: {
        serviceName: 'mastra-meeting-summarizer',
        exporters: [new MastraStorageExporter()],
      },
    },
  });
}
