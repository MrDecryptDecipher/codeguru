import { LLMHelper } from './LLMHelper'

interface SuggestionOptions {
  persona: 'interview' | 'meeting' | 'custom'
  maxTokens: number
}

export class RealtimeResponder {
  constructor(private llmHelper: LLMHelper, private options: SuggestionOptions) {}

  public async generateSuggestion(
    latestTranscript: string,
    rollingContext: string
  ): Promise<string> {
    const personaPrompt = this.getPersonaInstruction()
    const prompt = `${personaPrompt}

Interviewer just said:
"${latestTranscript}"

Recent context:
${rollingContext}

Respond with a concise <60 word suggestion I can speak verbatim. Prefer structured, confident tone.`

    return this.llmHelper.generateRealtimeSuggestion(prompt, this.options.maxTokens)
  }

  private getPersonaInstruction(): string {
    switch (this.options.persona) {
      case 'meeting':
        return 'You are a senior meeting strategist providing succinct talking points.'
      case 'custom':
        return 'You are an adaptable real-time assistant that crafts immediate replies.'
      case 'interview':
      default:
        return 'You are a world-class technical interview wingman supplying precise, confident answers.'
    }
  }
}









