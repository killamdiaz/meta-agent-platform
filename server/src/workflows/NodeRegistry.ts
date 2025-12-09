import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { WorkflowPlan, WorkflowNodeDefinition, WorkflowNodeIO } from './types.js';

// Lightweight validator to ensure node definitions are well-formed before registration.
const nodeDefinitionSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  inputs: z.record(z.unknown()).default({}),
  outputs: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).optional(),
  executor: z.function().args(z.any()).returns(z.any()).optional(),
  examples: z.array(z.string()).optional(),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class NodeRegistry {
  private loaded = false;
  private readonly definitions = new Map<string, WorkflowNodeDefinition>();
  private readonly rootDir: string;

  constructor(rootDir = join(__dirname, 'nodes')) {
    this.rootDir = rootDir;
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    await this.loadFromDisk(this.rootDir);
    this.loaded = true;
  }

  list(): WorkflowNodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  get(id: string): WorkflowNodeDefinition | undefined {
    return this.definitions.get(id);
  }

  register(definition: WorkflowNodeDefinition): void {
    const parsed = nodeDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      console.warn('[workflow-node-registry] skipping invalid node definition', {
        id: definition?.id,
        issues: parsed.error.issues,
      });
      return;
    }
    const normalizedId = parsed.data.id.trim();
    const existing = this.definitions.get(normalizedId);
    if (existing) {
      console.warn('[workflow-node-registry] duplicate node id, replacing', { id: normalizedId });
    }
    const normalized: WorkflowNodeDefinition = {
      ...parsed.data,
      inputs: (parsed.data.inputs as Record<string, WorkflowNodeIO>) ?? {},
      outputs: (parsed.data.outputs as Record<string, WorkflowNodeIO>) ?? {},
      // Preserve executor even if zod drops the reference.
      executor: typeof definition.executor === 'function' ? definition.executor : undefined,
    };
    this.definitions.set(normalizedId, normalized);
  }

  findMissingNodes(plan: WorkflowPlan): string[] {
    const referenced = new Set<string>();
    plan.steps.forEach((step) => {
      if (step.type === 'node') {
        referenced.add(step.node);
      }
    });
    (plan.requiredNodes ?? []).forEach((id) => referenced.add(id));

    return Array.from(referenced).filter((id) => !this.definitions.has(id));
  }

  private async loadFromDisk(root: string): Promise<void> {
    if (!existsSync(root)) {
      console.warn('[workflow-node-registry] node directory missing, creating placeholder', { root });
      return;
    }

    const walk = async (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        const ext = extname(entry);
        if (ext === '.json') {
          this.loadJsonDefinition(fullPath);
        } else if (ext === '.ts' || ext === '.js') {
          // Dynamic import preserves the executor function when running in tsx/ts-node.
          try {
            const module = await import(pathToFileURL(fullPath).href);
            const definition = module?.default ?? module;
            if (definition) {
              this.register(definition as WorkflowNodeDefinition);
            }
          } catch (error) {
            console.error('[workflow-node-registry] failed to import node', { fullPath, error });
          }
        }
      }
    };

    await walk(root);
  }

  private loadJsonDefinition(fullPath: string) {
    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.register(parsed);
    } catch (error) {
      console.error('[workflow-node-registry] failed to load json node', { fullPath, error });
    }
  }
}

export const defaultNodeRegistry = new NodeRegistry();
