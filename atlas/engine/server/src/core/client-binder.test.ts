import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bindClient } from './client-binder.js';
import { MessageBroker } from '../multiAgent/MessageBroker.js';
import { BaseAgent } from '../multiAgent/BaseAgent.js';

class TestAgent extends BaseAgent {
  constructor(id: string) {
    super({
      id,
      name: `Agent-${id}`,
      role: 'Tester',
      broker: new MessageBroker(),
    });
  }

  protected override async processMessage(): Promise<void> {
    // No-op for testing.
  }
}

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

describe('client-binder', () => {
  const originalSlackToken = process.env.SLACK_BOT_TOKEN;
  const originalNotionKey = process.env.NOTION_API_KEY;

  beforeEach(() => {
    restoreEnv('SLACK_BOT_TOKEN', undefined);
    restoreEnv('NOTION_API_KEY', undefined);
  });

  afterEach(() => {
    restoreEnv('SLACK_BOT_TOKEN', originalSlackToken);
    restoreEnv('NOTION_API_KEY', originalNotionKey);
  });

  it('binds Slack client when credentials are available', async () => {
    process.env.SLACK_BOT_TOKEN = 'test-token';
    const agent = new TestAgent('slack-agent');

    await bindClient(agent, 'slack_support_agent');

    assert.ok(agent.client, 'expected Slack client to be attached');
  });

  it('binds Slack client using config fallback when env vars are missing', async () => {
    const agent = new TestAgent('slack-config-agent');

    await bindClient(agent, 'slack_support_agent', {
      config: {
        slackBotToken: 'config-token',
      },
    });

    assert.ok(agent.client, 'expected Slack client to be attached via config fallback');
  });

  it('skips binding when credentials are missing and warns', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    const agent = new TestAgent('notion-agent');
    await bindClient(agent, 'notion_knowledge_agent');

    console.warn = originalWarn;

    assert.equal(agent.client, null, 'expected client to remain null');
    assert.ok(
      warnings.some((entry) => entry.includes('Missing credentials')),
      'expected warning about missing credentials',
    );
  });

  it('logs skip for unknown agent types', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };

    const agent = new TestAgent('unknown-agent');
    await bindClient(agent, 'totally-unknown');

    console.log = originalLog;

    assert.equal(agent.client, null, 'client should remain null when no binding exists');
    assert.ok(
      logs.some((entry) => entry.includes('No binding found')),
      'expected log indicating no binding found',
    );
  });
});
