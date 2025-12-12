import { loadPermissionMap } from '../config/permissionLoader.js';
import { SandboxManager, type SpawnResult } from './SandboxManager.js';

const permissionMap = loadPermissionMap();

export interface AgentSpec {
  name: string;
  description: string;
  goals: string[];
  capabilities: {
    tools: string[];
    memory: boolean;
    autonomy_level: 'manual' | 'semi' | 'autonomous';
    execution_interval: string;
  };
  model: string;
  securityProfile: {
    sandbox: boolean;
    network: {
      allowInternet: boolean;
      domainsAllowed: string[];
    };
    filesystem: {
      read: string[];
      write: string[];
    };
    permissions: string[];
    executionTimeout: number;
  };
  creator: string;
  created_at: string;
}

export interface BuildAgentOptions {
  persist?: boolean;
  spawn?: boolean;
  creator?: string;
}

export interface BuildAgentResult {
  spec: AgentSpec;
  savedAgent?: unknown;
  spawnResult?: SpawnResult | null;
}

const TOOL_KEYWORDS: Record<string, RegExp[]> = {
  browser: [/(\b|\s)(fetch|scrape|browse|monitor|read|check|track|scan|research)(\b|\s)/i, /news/i, /web/i],
  api: [/api/i, /endpoint/i, /integrate/i],
  email: [/email/i, /mail\b/i, /inbox/i, /send\s+me/i],
  scheduler: [/daily/i, /weekly/i, /every\s+(morning|day|week|hour|month)/i, /schedule/i],
  notifier: [/notify/i, /alert/i, /remind/i],
  summarizer: [/summary/i, /summari[sz]e/i, /digest/i],
  code_executor: [/run\s+code/i, /execute\s+script/i, /simulation/i],
  memory: [/remember/i, /log/i, /history/i],
  llm: [/write/i, /draft/i, /analy[sz]e/i, /generate/i]
};

const DOMAIN_MAPPINGS: { keywords: RegExp[]; domains: string[] }[] = [
  { keywords: [/crypto/i, /bitcoin/i, /ethereum/i, /token/i], domains: ['api.coingecko.com'] },
  { keywords: [/stock/i, /market/i, /finance/i, /equity/i], domains: ['finnhub.io', 'alphavantage.co'] },
  { keywords: [/news/i, /headline/i, /press/i], domains: ['newsapi.org'] },
  { keywords: [/weather/i, /forecast/i, /temperature/i], domains: ['api.openweathermap.org'] },
  { keywords: [/github/i, /repository/i], domains: ['api.github.com'] },
  { keywords: [/tweet/i, /twitter/i, /x\.com/i], domains: ['api.twitter.com'] }
];

const INTERNET_CUES = [/internet/i, /online/i, /fetch/i, /browser/i, /api/i, /scrape/i, /news/i, /monitor/i];

const MODEL_PREFIXES = [
  'gpt',
  'claude',
  'llama',
  'mixtral',
  'mistral',
  'gemini',
  'command',
  'sonnet',
  'opus',
  'haiku',
  'phi',
  'bison',
  'qwen',
  'yi',
  'orca',
  'ernie',
  'deepseek',
  'palm',
  'gemma',
  'jurassic',
  'cohere',
  'mpt',
  'openai',
  'anthropic'
];

const MODEL_SUFFIXES = [
  'turbo',
  'mini',
  'preview',
  'flash',
  'pro',
  'ultra',
  'instant',
  'sonnet',
  'opus',
  'haiku',
  'large',
  'medium',
  'small',
  'chat',
  'instruct'
];

const MODEL_HINT_PATTERNS = [
  /\b(?:model|llm)\s*(?:name)?\s*[:=]\s*["'“”]?([\w.:\/\-]+)["'“”]?/i,
  /\b(?:use|using|with|via|run(?:ning)?\s+on|powered\s+by|target)\s+(?:the\s+)?([\w.:\/\-]+)/i,
  /\bcall\s+(?:the\s+)?([\w.:\/\-]+)\s+model\b/i,
  /\b(?:switch|default)\s+to\s+(?:the\s+)?([\w.:\/\-]+)/i
];

const SUMMARY_CUES = [/summary/i, /summari[sz]e/i, /digest/i];

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function inferName(prompt: string): string {
  const segments = prompt
    .replace(/[.!?]/g, '')
    .split(/(?:make|build|create|need|want|design|develop)\s+me\s+an?\s+agent\s+that/i);
  const relevant = segments.length > 1 ? segments[1] : prompt;
  const keywords = ['news', 'crypto', 'research', 'email', 'weather', 'insight', 'market'];
  for (const keyword of keywords) {
    if (new RegExp(keyword, 'i').test(prompt)) {
      return titleCase(`${keyword} assistant`).replace(/\bAssistant\b/i, 'Assistant');
    }
  }
  const truncated = relevant.trim().split(/[,;:.]/)[0];
  const words = truncated.split(/\s+/).slice(0, 3);
  if (words.length > 0) {
    return titleCase(`${words.join(' ')} Agent`).trim();
  }
  return 'Adaptive Agent';
}

function summarizePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length <= 140) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return `${trimmed.slice(0, 137)}...`;
}

function sanitizeModelCandidate(raw: string | undefined | null): string | null {
  if (!raw) {
    return null;
  }
  const cleaned = raw.trim().replace(/^["'`“”]+|["'`“”,.;:!?]+$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function isLikelyModelName(value: string): boolean {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(lower)) {
    return true;
  }
  if (MODEL_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}-`) || lower.startsWith(prefix))) {
    return true;
  }
  if (lower.includes('gpt') || lower.includes('claude') || lower.includes('llama') || lower.includes('mixtral') || lower.includes('mistral')) {
    return true;
  }
  if (/[0-9]/.test(lower) && (lower.includes('-') || lower.includes('.') || lower.includes('_'))) {
    return true;
  }
  if (lower.includes('/') && MODEL_PREFIXES.some((prefix) => lower.includes(prefix))) {
    return true;
  }
  return false;
}

function buildCombinedModelToken(tokens: string[], startIndex: number): string | null {
  const parts: string[] = [];
  for (let index = startIndex; index < tokens.length && parts.length < 3; index += 1) {
    const sanitized = sanitizeModelCandidate(tokens[index]);
    if (!sanitized) {
      break;
    }
    const lower = sanitized.toLowerCase();
    if (parts.length === 0) {
      parts.push(sanitized);
      continue;
    }
    const isSuffix = MODEL_SUFFIXES.includes(lower);
    if (/\d/.test(lower) || lower.includes('.') || isSuffix) {
      parts.push(sanitized);
    } else {
      break;
    }
  }

  if (parts.length <= 1) {
    return null;
  }

  const candidate = parts.join('-').replace(/--+/g, '-');
  const sanitizedCandidate = sanitizeModelCandidate(candidate);
  if (sanitizedCandidate && isLikelyModelName(sanitizedCandidate)) {
    return sanitizedCandidate;
  }

  return null;
}

function extractModelFromTokens(prompt: string): string | null {
  const tokens = prompt.split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    const sanitized = sanitizeModelCandidate(tokens[i]);
    if (!sanitized) {
      continue;
    }
    const lower = sanitized.toLowerCase();
    const startsWithPrefix = MODEL_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}-`) || lower.startsWith(prefix));
    if (!startsWithPrefix) {
      continue;
    }

    const combined = buildCombinedModelToken(tokens, i);
    if (combined) {
      return combined;
    }

    if (
      isLikelyModelName(sanitized) &&
      (/[0-9]/.test(sanitized) || sanitized.includes('-') || sanitized.includes('.') || sanitized.length > 4)
    ) {
      return sanitized;
    }
  }

  return null;
}

function extractGoals(prompt: string): string[] {
  const normalized = prompt.replace(/[.!?]/g, '.');
  const parts = normalized
    .split(/\b(?:and then|then|and|so that|to)\b/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const goals = new Set<string>();

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (/(fetch|get|collect|pull)/.test(lower) && /(news|data|updates|prices|information)/.test(lower)) {
      goals.add('Fetch relevant data from trusted sources');
    }
    if (/(summari|digest|condense|report)/.test(lower)) {
      goals.add('Summarize findings into concise reports');
    }
    if (/(email|send|notify|alert)/.test(lower)) {
      goals.add('Deliver notifications or summaries to stakeholders');
    }
    if (/(analy|insight|interpret)/.test(lower)) {
      goals.add('Analyze data to surface actionable insights');
    }
    if (/(monitor|track|watch)/.test(lower)) {
      goals.add('Continuously monitor sources for new information');
    }
    if (/(schedule|daily|weekly|morning|evening)/.test(lower)) {
      goals.add('Run on a recurring schedule without manual intervention');
    }
  }

  if (goals.size === 0) {
    goals.add(prompt.trim());
  }

  return Array.from(goals);
}

function detectTools(prompt: string): string[] {
  const tools: string[] = [];
  for (const [tool, patterns] of Object.entries(TOOL_KEYWORDS)) {
    if (patterns.some((pattern) => pattern.test(prompt))) {
      tools.push(tool);
    }
  }
  if (!tools.includes('llm')) {
    tools.push('llm');
  }
  if (SUMMARY_CUES.some((pattern) => pattern.test(prompt)) && !tools.includes('summarizer')) {
    tools.push('summarizer');
  }
  return dedupe(tools);
}

function detectAutonomy(prompt: string): 'manual' | 'semi' | 'autonomous' {
  if (/(automatic|automatically|without\s+me|hands?-?free|self\b)/i.test(prompt)) {
    return 'autonomous';
  }
  if (/(assist|help|support)/i.test(prompt)) {
    return 'semi';
  }
  return 'semi';
}

function detectInterval(prompt: string): string {
  if (/every\s+hour|hourly/i.test(prompt)) {
    return 'hourly';
  }
  if (/daily|every\s+(day|morning|evening)/i.test(prompt)) {
    return 'daily';
  }
  if (/weekly|every\s+week/i.test(prompt)) {
    return 'weekly';
  }
  if (/monthly|every\s+month/i.test(prompt)) {
    return 'monthly';
  }
  if (/real\s*-?time|continuous|ongoing/i.test(prompt)) {
    return 'continuous';
  }
  return 'on_demand';
}

function detectDomains(prompt: string): string[] {
  const domains = new Set<string>();
  for (const mapping of DOMAIN_MAPPINGS) {
    if (mapping.keywords.some((regex) => regex.test(prompt))) {
      mapping.domains.forEach((domain) => domains.add(domain));
    }
  }
  if (domains.size === 0 && INTERNET_CUES.some((regex) => regex.test(prompt))) {
    domains.add('newsapi.org');
  }
  return Array.from(domains);
}

function detectPermissions(tools: string[], prompt: string): string[] {
  const permissions = new Set<string>();
  tools.forEach((tool) => {
    const entries = permissionMap[tool];
    if (entries) {
      entries.forEach((permission) => permissions.add(permission));
    }
  });
  if (SUMMARY_CUES.some((pattern) => pattern.test(prompt))) {
    permissions.add('summarize');
  }
  if (permissions.size === 0) {
    ['analyze'].forEach((permission) => permissions.add(permission));
  }
  return Array.from(permissions);
}

function detectMemory(prompt: string): boolean {
  return /(remember|history|log|past|previous|context|record)/i.test(prompt) || SUMMARY_CUES.some((pattern) => pattern.test(prompt));
}

function shouldAllowInternet(prompt: string): boolean {
  return INTERNET_CUES.some((pattern) => pattern.test(prompt));
}

function detectModel(prompt: string): string {
  const runMatch = prompt.match(/\/run\s+([A-Za-z0-9-]{6,})/i);
  const runCandidate = sanitizeModelCandidate(runMatch?.[1]);
  if (runCandidate) {
    return runCandidate;
  }

  const uuidMatch = prompt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch) {
    return uuidMatch[0];
  }

  for (const pattern of MODEL_HINT_PATTERNS) {
    const match = prompt.match(pattern);
    const candidate = sanitizeModelCandidate(match?.[1]);
    if (
      candidate &&
      isLikelyModelName(candidate) &&
      (/[0-9]/.test(candidate) || candidate.includes('-') || candidate.includes('.') || candidate.length > 4)
    ) {
      return candidate;
    }
  }

  const tokenCandidate = extractModelFromTokens(prompt);
  if (tokenCandidate) {
    return tokenCandidate;
  }

  const knownModelMatch = prompt.match(
    /\b(gpt[0-9a-z_.-]*|claude[0-9a-z_.-]*|llama[0-9a-z_.-]*|mixtral[0-9a-z_.-]*|mistral[0-9a-z_.-]*|gemini[0-9a-z_.-]*|command[0-9a-z_.-]*|sonnet[0-9a-z_.-]*|opus[0-9a-z_.-]*|haiku[0-9a-z_.-]*|phi[0-9a-z_.-]*|bison[0-9a-z_.-]*|qwen[0-9a-z_.-]*|yi[0-9a-z_.-]*|orca[0-9a-z_.-]*|ernie[0-9a-z_.-]*|deepseek[0-9a-z_.-]*|palm[0-9a-z_.-]*|gemma[0-9a-z_.-]*|jurassic[0-9a-z_.-]*|cohere[0-9a-z_.-]*|mpt[0-9a-z_.-]*|openai[0-9a-z_.-]*|anthropic[0-9a-z_.-]*)\b/i
  );
  const knownCandidate = sanitizeModelCandidate(knownModelMatch?.[0]);
  if (
    knownCandidate &&
    (/[0-9]/.test(knownCandidate) || knownCandidate.includes('-') || knownCandidate.includes('.') || knownCandidate.length > 4)
  ) {
    return knownCandidate;
  }

  return 'gpt-5';
}

export class NaturalLanguageAgentBuilder {
  constructor(private readonly sandboxManager = new SandboxManager()) {}

  buildSpec(promptText: string, creator = 'anonymous'): AgentSpec {
    const name = inferName(promptText);
    const description = summarizePrompt(promptText);
    const goals = extractGoals(promptText);
    const tools = detectTools(promptText);
    const allowInternet = shouldAllowInternet(promptText);
    const domains = allowInternet ? detectDomains(promptText) : [];
    const permissions = detectPermissions(tools, promptText);
    const execution_interval = detectInterval(promptText);
    const memory = detectMemory(promptText);
    const autonomy_level = detectAutonomy(promptText);
    const model = detectModel(promptText);

    const spec: AgentSpec = {
      name,
      description,
      goals,
      capabilities: {
        tools,
        memory,
        autonomy_level,
        execution_interval
      },
      model,
      securityProfile: {
        sandbox: true,
        network: {
          allowInternet,
          domainsAllowed: allowInternet ? domains : []
        },
        filesystem: {
          read: ['workspace/tmp'],
          write: ['workspace/output']
        },
        permissions,
        executionTimeout: 300
      },
      creator,
      created_at: new Date().toISOString()
    };

    return spec;
  }

  async buildAgent(promptText: string, options: BuildAgentOptions = {}): Promise<BuildAgentResult> {
    const creator = options.creator ?? 'anonymous';
    const spec = this.buildSpec(promptText, creator);

    let savedAgent: unknown | undefined;
    if (options.persist ?? true) {
      savedAgent = await this.sandboxManager.saveAgent(spec);
    }

    let spawnResult: SpawnResult | null = null;
    if (options.spawn) {
      spawnResult = await this.sandboxManager.spawnAgent(spec);
    }

    return { spec, savedAgent, spawnResult };
  }
}

export const naturalLanguageAgentBuilder = new NaturalLanguageAgentBuilder();
