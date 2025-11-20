export interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (path: string) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (callback: (data: { path: string; preview: string }) => void) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  analyzeImageFile: (path: string) => Promise<{ text: string; timestamp: number }>
  processScreenshots: () => Promise<{ success: boolean; error?: string }>
  startRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
  stopRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
  getRealtimeStatus: () => Promise<{ active: boolean }>
  onRealtimeTranscript: (callback: (data: any) => void) => () => void
  onRealtimeSuggestion: (callback: (data: any) => void) => () => void
  onRealtimeStatus: (callback: (data: any) => void) => () => void
  onRealtimeError: (callback: (message: string) => void) => () => void
  quitApp: () => Promise<void>
  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini" | "openrouter"; model: string; isOllama: boolean; isOpenRouter?: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  getOpenRouterModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  switchToOpenRouter: (apiKey: string, models: string[]) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
} 