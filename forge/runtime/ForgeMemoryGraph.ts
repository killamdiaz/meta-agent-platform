import type { ConnectorQueryResponse } from '../connectors/types';
import type { ForgeJob, ForgeJobResult } from './types';

export interface MemoryNode {
  id: string;
  jobId: string;
  connector: string;
  action: string;
  status: ForgeJobResult['status'];
  timestamp: string;
  dataPreview?: unknown;
  dependsOn: string[];
  error?: { message: string };
}

export class ForgeMemoryGraph {
  private readonly nodes = new Map<string, MemoryNode>();

  upsertNode(job: ForgeJob, result: ForgeJobResult): void {
    const preview = this.buildPreview(result.data);
    const node: MemoryNode = {
      id: `${result.jobId}`,
      jobId: result.jobId,
      connector: job.connector,
      action: job.action,
      status: result.status,
      timestamp: result.finishedAt,
      dataPreview: preview,
      dependsOn: job.dependsOn ?? [],
      error: result.error
        ? { message: result.error.message }
        : undefined,
    };

    this.nodes.set(node.id, node);
  }

  snapshot(): MemoryNode[] {
    return Array.from(this.nodes.values());
  }

  clear(): void {
    this.nodes.clear();
  }

  private buildPreview(data: ConnectorQueryResponse | undefined): unknown {
    if (!data) {
      return undefined;
    }

    if (Array.isArray(data)) {
      return data.slice(0, 3);
    }

    if (typeof data === 'object') {
      const entries = Object.entries(data).slice(0, 8);
      return Object.fromEntries(entries);
    }

    return data;
  }
}

