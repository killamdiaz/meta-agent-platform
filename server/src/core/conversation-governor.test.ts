import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationGovernor, type AgentMessage, type GovernorPolicy } from './conversation-governor.js';

const basePolicy: GovernorPolicy = {
  cooldownMs: 100,
  maxTokensPerCycle: 100,
  similarityThreshold: 0.6,
  confidenceThreshold: 0.4,
  maxTurns: 5,
  loopDetectionWindow: 3,
};

const buildMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
  from: 'agent-1',
  to: 'agent-2',
  intent: 'inform',
  content: 'Initial content',
  tokens: 5,
  ...overrides,
});

describe('ConversationGovernor', () => {
  const originalWarn = console.warn;

  beforeEach(() => {
    // Reduce log noise during tests.
    console.warn = () => {};
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it('allows the first message from an agent', async () => {
    const governor = new ConversationGovernor(basePolicy);
    const allowed = await governor.shouldAllow('agent-1', buildMessage());
    assert.equal(allowed, true);
  });

  it('enforces cooldown between messages', async () => {
    const governor = new ConversationGovernor(basePolicy);
    const first = await governor.shouldAllow('agent-1', buildMessage());
    const second = await governor.shouldAllow('agent-1', buildMessage({ content: 'Follow up' }));
    assert.equal(first, true);
    assert.equal(second, false, 'Second message should be blocked due to cooldown');
  });

  it('blocks redundant content based on similarity threshold', async () => {
    const governor = new ConversationGovernor({ ...basePolicy, cooldownMs: 0 });
    const first = await governor.shouldAllow('agent-1', buildMessage({ content: 'Plans for launch' }));
    const second = await governor.shouldAllow('agent-1', buildMessage({ content: 'Plan for launch' }));
    assert.equal(first, true);
    assert.equal(second, false, 'Redundant content should be blocked');
    assert.ok(governor.getNoiseScore('agent-1') > 0, 'Noise score should increase after redundant block');
  });

  it('tracks token budgets and blocks when exceeded', async () => {
    const governor = new ConversationGovernor({ ...basePolicy, cooldownMs: 0, maxTokensPerCycle: 10 });
    const first = await governor.shouldAllow('agent-1', buildMessage({ tokens: 6 }));
    const second = await governor.shouldAllow('agent-1', buildMessage({ tokens: 6, content: 'Another idea' }));
    assert.equal(first, true);
    assert.equal(second, false, 'Token budget excess should be blocked');
  });

  it('detects looping intents within the configured window', async () => {
    const governor = new ConversationGovernor({ ...basePolicy, cooldownMs: 0, loopDetectionWindow: 3 });
    const sequence = [
      buildMessage({ intent: 'verify', content: 'Checking status 1' }),
      buildMessage({ intent: 'verify', content: 'Checking status 2' }),
      buildMessage({ intent: 'verify', content: 'Checking status 3' }),
    ];

    const allow1 = await governor.shouldAllow('agent-1', sequence[0]);
    const allow2 = await governor.shouldAllow('agent-1', sequence[1]);
    const allow3 = await governor.shouldAllow('agent-1', sequence[2]);

    assert.equal(allow1, true);
    assert.equal(allow2, true);
    assert.equal(allow3, false, 'Looping intent should be blocked');
    assert.ok(governor.getNoiseScore('agent-1') > 0, 'Noise score should capture loop penalty');
  });

  it('allows manual noise penalties for ungrounded replies', () => {
    const governor = new ConversationGovernor(basePolicy);
    governor.penalize('agent-99', 'ungrounded', 2);
    assert.ok(governor.getNoiseScore('agent-99') >= 2, 'Manual penalty should update noise score');
    assert.ok(governor.getPriority('agent-99') < 1, 'Priority should decrease with higher noise');
  });
});
