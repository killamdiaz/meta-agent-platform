import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REGISTRY_DIR = join(__dirname, '..', '..', 'registry', 'agents');

export type PrivilegeLevel = 'system' | 'commander' | 'orchestrator' | 'orchestrator-lite' | 'tool';

export interface AgentProfile {
  agentType: string;
  name: string;
  description: string;
  role: string;
  privilegeLevel: PrivilegeLevel;
  capabilities: string[];
  safeActions: string[];
  commandScope: string[];
}

const profileCache = new Map<string, AgentProfile>();
let profilesLoaded = false;

function uniqueArray(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function sanitizeStringArray(values: unknown[]): string[] {
  return uniqueArray(
    values
      .map((value) => {
        if (typeof value === 'string') {
          return value.trim();
        }
        if (value && typeof value === 'object' && 'name' in value) {
          const candidate = (value as { name?: unknown }).name;
          return typeof candidate === 'string' ? candidate.trim() : '';
        }
        return '';
      })
      .filter((entry) => entry.length > 0),
  );
}

function sanitizeUppercaseArray(values: unknown[]): string[] {
  return uniqueArray(
    values
      .map((value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
      .filter((entry) => entry.length > 0),
  );
}

export function loadAgentProfiles(): void {
  profileCache.clear();
  profilesLoaded = false;

  // 🔹 Ensure the registry directory exists
  try {
    if (!existsSync(REGISTRY_DIR)) {
      console.warn("[agent-profile-registry] directory missing, creating new one", { REGISTRY_DIR });
      mkdirSync(REGISTRY_DIR, { recursive: true });

      // Optionally auto-create a minimal Slack profile so startup never breaks
      const defaultSlack = {
        agentType: "SlackCustomerSupportAgent",
        name: "Slack Customer Support Agent",
        description: "Listens to Slack mentions and responds to user queries.",
        role: "support",
        privilegeLevel: "tool",
        capabilities: ["listen_mentions", "respond"],
        safeActions: ["SEND_MESSAGE"],
        commandScope: ["slack"]
      };
      writeFileSync(join(REGISTRY_DIR, "SlackCustomerSupportAgent.json"), JSON.stringify(defaultSlack, null, 2));
    }
  } catch (err) {
    console.error("[agent-profile-registry] failed to verify or create registry directory", { REGISTRY_DIR, err });
    return;
  }

  // 🔹 Read all profiles
  let files: string[] = [];
  try {
    files = readdirSync(REGISTRY_DIR).filter((file) => file.endsWith(".json"));
  } catch (error) {
    console.warn("[agent-profile-registry] unable to read registry directory", { REGISTRY_DIR, error });
    return;
  }

  // 🔹 Load and validate profiles
  for (const file of files) {
    const agentType = file.replace(/\.json$/i, "");
    try {
      const raw = readFileSync(join(REGISTRY_DIR, file), "utf-8");
      const parsed = JSON.parse(raw) as Partial<AgentProfile>;
      if (!parsed.name || !parsed.role) {
        console.warn("[agent-profile-registry] invalid profile, missing name/role", { file });
        continue;
      }
      const profile: AgentProfile = {
        agentType,
        name: parsed.name,
        description: parsed.description ?? "",
        role: parsed.role,
        privilegeLevel: (parsed.privilegeLevel as PrivilegeLevel) ?? "tool",
        capabilities: Array.isArray(parsed.capabilities) ? sanitizeStringArray(parsed.capabilities) : [],
        safeActions: Array.isArray(parsed.safeActions) ? sanitizeUppercaseArray(parsed.safeActions) : [],
        commandScope: Array.isArray(parsed.commandScope) ? sanitizeStringArray(parsed.commandScope) : [],
      };
      profileCache.set(agentType, profile);
    } catch (error) {
      console.error("[agent-profile-registry] failed to load profile", { file, error });
    }
  }

  profilesLoaded = true;
  console.log(`[agent-profile-registry] loaded ${profileCache.size} profiles from`, REGISTRY_DIR);
}

function ensureProfilesLoaded() {
  if (!profilesLoaded && profileCache.size === 0) {
    loadAgentProfiles();
  }
}

export function getAgentProfile(agentType: string): AgentProfile | undefined {
  ensureProfilesLoaded();
  if (!agentType) {
    return undefined;
  }
  const direct = profileCache.get(agentType);
  if (direct) {
    return direct;
  }
  const normalized = agentType.toLowerCase();
  for (const [key, profile] of profileCache.entries()) {
    if (key.toLowerCase() === normalized || profile.agentType.toLowerCase() === normalized) {
      return profile;
    }
  }
  return undefined;
}

export function listAgentProfiles(): AgentProfile[] {
  ensureProfilesLoaded();
  return Array.from(profileCache.values());
}
