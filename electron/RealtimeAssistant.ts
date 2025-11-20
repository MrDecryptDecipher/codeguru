import { BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { ConfigManager } from './ConfigManager'
import { AppState } from './main'
import { RealtimeResponder } from './RealtimeResponder'
import { RealtimeTranscriber, RealtimeTranscriptEvent } from './RealtimeTranscriber'

interface ContextEntry {
  text: string
  timestamp: number
}

export class RealtimeAssistant extends EventEmitter {
  private transcriber: RealtimeTranscriber
  private responder: RealtimeResponder
  private context: ContextEntry[] = []
  private isActive = false
  private throttleTimer: NodeJS.Timeout | null = null
  private lastSuggestionAt = 0
  private realtimeConfig = ConfigManager.getInstance().getSection('realtime')

  constructor(private appState: AppState) {
    super()
    this.transcriber = new RealtimeTranscriber(ConfigManager.getInstance())
    this.responder = new RealtimeResponder(
      this.appState.processingHelper.getLLMHelper(),
      {
        persona: this.realtimeConfig.responder.persona,
        maxTokens: this.realtimeConfig.responder.maxTokens
      }
    )

    this.transcriber.on('transcript', (event) => this.handleTranscript(event))
    this.transcriber.on('error', (error) => {
      console.error('[RealtimeAssistant] transcriber error:', error)
      this.emitToRenderer('realtime-error', error instanceof Error ? error.message : String(error))
    })
  }

  public async start(): Promise<void> {
    if (this.isActive) return
    await this.transcriber.start()
    this.isActive = true
    this.emitToRenderer('realtime-status', { active: true })
  }

  public stop(): void {
    if (!this.isActive) return
    this.transcriber.stop()
    this.context = []
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = null
    }
    this.isActive = false
    this.emitToRenderer('realtime-status', { active: false })
  }

  public get status(): { active: boolean } {
    return { active: this.isActive }
  }

  private handleTranscript(event: RealtimeTranscriptEvent): void {
    this.context.push({ text: event.text, timestamp: event.timestamp })
    this.trimContext()
    this.emitToRenderer('realtime-transcript', event)

    if (event.isFinal) {
      this.scheduleSuggestion(event.text)
    }
  }

  private scheduleSuggestion(latestText: string): void {
    const now = Date.now()
    const throttleMs = this.realtimeConfig.responder.throttleMs
    const elapsed = now - this.lastSuggestionAt
    if (elapsed < throttleMs) {
      if (this.throttleTimer) clearTimeout(this.throttleTimer)
      this.throttleTimer = setTimeout(() => this.scheduleSuggestion(latestText), throttleMs - elapsed)
      return
    }

    this.lastSuggestionAt = now
    void this.generateSuggestion(latestText)
  }

  private async generateSuggestion(latestText: string): Promise<void> {
    try {
      const rollingContext = this.context.map((entry) => entry.text).join('\n').slice(-1500)
      const suggestion = await this.responder.generateSuggestion(latestText, rollingContext)
      this.emitToRenderer('realtime-suggestion', {
        suggestion,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('[RealtimeAssistant] suggestion error:', error)
      this.emitToRenderer(
        'realtime-error',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private trimContext(): void {
    const windowMs = this.realtimeConfig.responder.contextWindowSeconds * 1000
    const cutoff = Date.now() - windowMs
    this.context = this.context.filter((entry) => entry.timestamp >= cutoff)
  }

  private emitToRenderer(channel: string, payload: any): void {
    const window = this.appState.getMainWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(channel, payload)
  }
}









