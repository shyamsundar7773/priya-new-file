import type { AIProvider } from './types';
import { AIBrain } from './brain';
import { isAIBackendConfigured } from './config';
import { BackendAIProvider } from './providers/backendProvider';
import { MockAIProvider } from './providers/mockProvider';

export function createAIGateway(provider?: AIProvider) {
  const selectedProvider = provider || (isAIBackendConfigured() ? new BackendAIProvider() : new MockAIProvider());
  return new AIBrain(selectedProvider);
}
