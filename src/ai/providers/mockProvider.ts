import type { AIProvider, AIRequest, AIResponse } from '../types';

export class MockAIProvider implements AIProvider {
  readonly id = 'mock';
  readonly name = 'Local Mock Provider';

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    await new Promise((resolve) => setTimeout(resolve, 700));

    if (request.providerStatus === 'offline') {
      return { status: 'offline', provider: this.id, error: { code: 'ENGINE_OFFLINE', message: 'The companion engine is offline.' } };
    }
    if (request.providerStatus === 'recovering' || request.providerStatus === 'loading') {
      return { status: 'recovering', provider: this.id, error: { code: 'ENGINE_RECOVERING', message: 'The companion engine is recovering.' } };
    }
    if (request.userMessage.trim().toLowerCase() === '/fail') {
      return { status: 'error', provider: this.id, error: { code: 'PROVIDER_FAILURE', message: 'The local provider failed to generate a response.' } };
    }

    const languageHint = request.companion.aiConfig?.language.codeSwitching
      ? ` ${request.companion.aiConfig.language.primary} and ${request.companion.aiConfig.language.secondary || 'English'} can flow naturally here.`
      : '';
    const addressed = request.mentions?.[0]?.displayName;
    return {
      status: 'success',
      provider: this.id,
      model: 'deterministic-local-v1',
      text: `${request.companion.name}${addressed ? `, ${addressed}` : ''} is here with you. I heard: “${request.userMessage}”.${languageHint}`,
    };
  }
}
