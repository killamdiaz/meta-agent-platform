import { AutomationEventBus } from './AutomationEventBus.js';
import { AutomationSessionManager } from './AutomationSessionManager.js';
import { NaturalLanguageAutomationParser } from './NaturalLanguageAutomationParser.js';
import { PostgresAutomationRepository } from './AutomationRepository.js';

const automationEventBus = new AutomationEventBus();
const automationParser = new NaturalLanguageAutomationParser();
const automationRepository = new PostgresAutomationRepository();

export const automationSessionManager = new AutomationSessionManager(
  automationParser,
  automationEventBus,
  automationRepository,
);

export { automationEventBus };
