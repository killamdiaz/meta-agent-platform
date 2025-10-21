declare namespace Express {
  interface Request {
    context: {
      requestId: string;
      startedAt: number;
    };
    rawBody?: string;
    agentId?: string;
    user?: {
      id: string;
      agentId?: string;
      [key: string]: unknown;
    };
  }
}
