import { promises as fs } from 'fs';
import path from 'path';

export type MemoryType = 'short-term' | 'long-term' | 'shared';

export interface AgentMemorySnapshot {
  shortTerm: string[];
  longTerm: string[];
}

export interface SharedMemoryEntry {
  id: string;
  content: string;
  agentsInvolved: string[];
  timestamp: string;
}

interface PersistedMemoryState {
  agents: Record<string, AgentMemorySnapshot>;
  shared: SharedMemoryEntry[];
}

const DEFAULT_STATE: PersistedMemoryState = {
  agents: {},
  shared: [],
};

const MAX_SHORT_TERM = 12;
const LONG_TERM_THRESHOLD = 200;

export class MemoryStore {
  private state: PersistedMemoryState = DEFAULT_STATE;
  private readonly filePath: string;
  private readonly dataDir: string;

  constructor(fileName = 'multi-agent-memory.json') {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.filePath = path.join(this.dataDir, fileName);
  }

  async initialise() {
    try {
      const contents = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(contents) as PersistedMemoryState;
      this.state = {
        agents: parsed.agents ?? {},
        shared: Array.isArray(parsed.shared) ? parsed.shared : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.persist();
        return;
      }
      throw error;
    }
  }

  private async persist() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  private ensureAgent(agentId: string) {
    if (!this.state.agents[agentId]) {
      this.state.agents[agentId] = { shortTerm: [], longTerm: [] };
    }
  }

  async appendAgentMemory(
    agentId: string,
    entry: string,
    { promoteToLongTerm = false }: { promoteToLongTerm?: boolean } = {},
  ) {
    if (!entry.trim()) return;
    this.ensureAgent(agentId);
    const snapshot = this.state.agents[agentId];
    snapshot.shortTerm.push(entry.trim());
    if (snapshot.shortTerm.length > MAX_SHORT_TERM) {
      snapshot.shortTerm.splice(0, snapshot.shortTerm.length - MAX_SHORT_TERM);
    }
    if (promoteToLongTerm || entry.length >= LONG_TERM_THRESHOLD) {
      snapshot.longTerm.push(entry.trim());
    }
    await this.persist();
  }

  async appendSharedMemory(content: string, agentsInvolved: string[]) {
    if (!content.trim()) return;
    const entry: SharedMemoryEntry = {
      id: `shared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      content: content.trim(),
      agentsInvolved,
      timestamp: new Date().toISOString(),
    };
    this.state.shared.push(entry);
    await this.persist();
    return entry;
  }

  getSnapshot(): PersistedMemoryState {
    return JSON.parse(JSON.stringify(this.state));
  }
}
