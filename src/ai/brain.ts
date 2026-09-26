import type { AIProvider, AIRequest, AIResponse } from './types';

export class AIBrain {
  constructor(private readonly provider: AIProvider) {}

  async respond(request: AIRequest): Promise<AIResponse> {
    return this.provider.generateResponse(request);
  }
}
