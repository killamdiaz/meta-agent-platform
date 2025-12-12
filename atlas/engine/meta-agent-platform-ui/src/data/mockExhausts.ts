export interface ExhaustStream {
  id: string;
  name: string;
  status: "active" | "waiting" | "disconnected";
  linkedTicket: string | null;
  ticketKey: string | null;
  createdBy: string;
  createdAt: string;
  lastActivity: string;
  streamUrl: string;
  token: string;
  logs: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  message: string;
  source?: string;
}

export interface AIAnalysis {
  status: "idle" | "analyzing" | "complete";
  statusMessage: string;
  findings: AIFinding[];
}

export interface AIFinding {
  id: string;
  type: "error_pattern" | "suggestion" | "match" | "diagnosis";
  title: string;
  content: string;
  severity?: "critical" | "warning" | "info";
  timestamp: string;
}

export const mockExhausts: ExhaustStream[] = [
  {
    id: "1",
    name: "prod-api-logs",
    status: "active",
    linkedTicket: "Authentication failures in production",
    ticketKey: "ATLAS-1234",
    createdBy: "Sarah Chen",
    createdAt: "2024-01-15T10:30:00Z",
    lastActivity: "2024-01-15T14:22:00Z",
    streamUrl: "https://atlas.exhaust.io/stream/prod-api-logs",
    token: "exh_live_a1b2c3d4e5f6g7h8i9j0",
    logs: [
      { id: "1", timestamp: "2024-01-15T14:20:00Z", level: "ERROR", message: "[ZPA] Policy denied: user_id=12345, resource=/api/admin", source: "auth-service" },
      { id: "2", timestamp: "2024-01-15T14:20:01Z", level: "WARN", message: "Rate limit approaching threshold: 450/500 requests", source: "gateway" },
      { id: "3", timestamp: "2024-01-15T14:20:02Z", level: "INFO", message: "Health check passed: database connection OK", source: "db-service" },
      { id: "4", timestamp: "2024-01-15T14:20:03Z", level: "DEBUG", message: "Cache miss for key: session_12345", source: "cache-service" },
      { id: "5", timestamp: "2024-01-15T14:21:00Z", level: "ERROR", message: "[ZPA] Policy denied: user_id=12345, resource=/api/settings", source: "auth-service" },
      { id: "6", timestamp: "2024-01-15T14:21:30Z", level: "INFO", message: "Request completed: GET /api/users (200) 45ms", source: "api-gateway" },
    ],
  },
  {
    id: "2",
    name: "staging-debug",
    status: "waiting",
    linkedTicket: "Slow response times on staging",
    ticketKey: "ATLAS-1189",
    createdBy: "Mike Johnson",
    createdAt: "2024-01-15T09:00:00Z",
    lastActivity: "2024-01-15T09:00:00Z",
    streamUrl: "https://atlas.exhaust.io/stream/staging-debug",
    token: "exh_live_k1l2m3n4o5p6q7r8s9t0",
    logs: [],
  },
  {
    id: "3",
    name: "customer-logs-acme",
    status: "disconnected",
    linkedTicket: "ACME Corp - Login issues",
    ticketKey: "ATLAS-1156",
    createdBy: "Emily Davis",
    createdAt: "2024-01-14T16:00:00Z",
    lastActivity: "2024-01-14T18:45:00Z",
    streamUrl: "https://atlas.exhaust.io/stream/customer-logs-acme",
    token: "exh_live_u1v2w3x4y5z6a7b8c9d0",
    logs: [
      { id: "1", timestamp: "2024-01-14T18:40:00Z", level: "ERROR", message: "Connection timeout after 30s", source: "network" },
      { id: "2", timestamp: "2024-01-14T18:45:00Z", level: "WARN", message: "Stream disconnected unexpectedly", source: "system" },
    ],
  },
];

export const mockAIAnalysis: AIAnalysis = {
  status: "analyzing",
  statusMessage: "Scanning logs for error patterns...",
  findings: [
    {
      id: "1",
      type: "error_pattern",
      title: "Detected Error Pattern: Policy Denied (ZPA)",
      content:
        "Multiple authentication failures detected from the same user. The ZPA (Zero Trust Policy Access) system is blocking requests to `/api/admin` and `/api/settings` endpoints.",
      severity: "critical",
      timestamp: "2024-01-15T14:21:05Z",
    },
    {
      id: "2",
      type: "match",
      title: "Matching Past Incidents",
      content:
        "Found **3 similar incidents** in the last 30 days:\n- ATLAS-1102: ZPA policy misconfiguration\n- ATLAS-1089: Role permissions not synced\n- ATLAS-1045: Token expiration issue",
      severity: "info",
      timestamp: "2024-01-15T14:21:10Z",
    },
    {
      id: "3",
      type: "suggestion",
      title: "Suggested Fix",
      content:
        "1. **Verify user role assignment** in the admin console\n2. **Check ZPA policy rules** for the affected endpoints\n3. **Review token validity** - user may need to re-authenticate\n\n```bash\n# Run this to check user permissions\natlas-cli user:permissions --id 12345\n```",
      severity: "warning",
      timestamp: "2024-01-15T14:21:15Z",
    },
  ],
};
