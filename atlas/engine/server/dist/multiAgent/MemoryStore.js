import { promises as fs } from 'fs';
import path from 'path';
const DEFAULT_STATE = {
    agents: {},
    shared: [],
};
const MAX_SHORT_TERM = 12;
const LONG_TERM_THRESHOLD = 200;
export class MemoryStore {
    constructor(fileName = 'multi-agent-memory.json') {
        this.state = DEFAULT_STATE;
        this.dataDir = path.resolve(process.cwd(), 'data');
        this.filePath = path.join(this.dataDir, fileName);
    }
    async initialise() {
        try {
            const contents = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(contents);
            this.state = {
                agents: parsed.agents ?? {},
                shared: Array.isArray(parsed.shared) ? parsed.shared : [],
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                await this.persist();
                return;
            }
            throw error;
        }
    }
    async persist() {
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    }
    ensureAgent(agentId) {
        if (!this.state.agents[agentId]) {
            this.state.agents[agentId] = { shortTerm: [], longTerm: [] };
        }
    }
    async appendAgentMemory(agentId, entry, { promoteToLongTerm = false } = {}) {
        if (!entry.trim())
            return;
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
    async appendSharedMemory(content, agentsInvolved) {
        if (!content.trim())
            return;
        const entry = {
            id: `shared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            content: content.trim(),
            agentsInvolved,
            timestamp: new Date().toISOString(),
        };
        this.state.shared.push(entry);
        await this.persist();
        return entry;
    }
    getSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }
}
