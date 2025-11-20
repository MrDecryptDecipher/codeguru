import { contextBridge, ipcRenderer } from "electron"

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
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
  // Realtime assistant
  startRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
  stopRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
  getRealtimeStatus: () => Promise<{ active: boolean }>
  onRealtimeTranscript: (callback: (data: any) => void) => () => void
  onRealtimeSuggestion: (callback: (data: any) => void) => () => void
  onRealtimeStatus: (callback: (data: any) => void) => () => void
  onRealtimeError: (callback: (message: string) => void) => () => void
  processScreenshots: () => Promise<{ success: boolean; error?: string }>
  quitApp: () => Promise<void>
  
  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini" | "openrouter"; model: string; isOllama: boolean; isOpenRouter?: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  getOpenRouterModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  switchToOpenRouter: (apiKey: string, models: string[]) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  
  // Clipboard Monitoring
  startClipboardMonitor: () => Promise<{ success: boolean; error?: string }>
  stopClipboardMonitor: () => Promise<{ success: boolean; error?: string }>
  getClipboardStatus: () => Promise<{ active: boolean }>
  onCodeDetected: (callback: (data: { isCode: boolean; language: string | null; confidence: number; snippet: string }) => void) => () => void
  
  invoke: (channel: string, ...args: any[]) => Promise<any>
}

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  moveWindowUp: () => ipcRenderer.invoke("move-window-up"),
  moveWindowDown: () => ipcRenderer.invoke("move-window-down"),
  analyzeAudioFromBase64: (data: string, mimeType: string) => ipcRenderer.invoke("analyze-audio-base64", data, mimeType),
  analyzeAudioFile: (path: string) => ipcRenderer.invoke("analyze-audio-file", path),
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  processScreenshots: () => ipcRenderer.invoke("process-screenshots"),
  startRealtimeAssistant: () => ipcRenderer.invoke("realtime-start"),
  stopRealtimeAssistant: () => ipcRenderer.invoke("realtime-stop"),
  getRealtimeStatus: () => ipcRenderer.invoke("realtime-status"),
  onRealtimeTranscript: (callback: (data: any) => void) => {
    const subscription = (_: any, payload: any) => callback(payload)
    ipcRenderer.on("realtime-transcript", subscription)
    return () => ipcRenderer.removeListener("realtime-transcript", subscription)
  },
  onRealtimeSuggestion: (callback: (data: any) => void) => {
    const subscription = (_: any, payload: any) => callback(payload)
    ipcRenderer.on("realtime-suggestion", subscription)
    return () => ipcRenderer.removeListener("realtime-suggestion", subscription)
  },
  onRealtimeStatus: (callback: (data: any) => void) => {
    const subscription = (_: any, payload: any) => callback(payload)
    ipcRenderer.on("realtime-status", subscription)
    return () => ipcRenderer.removeListener("realtime-status", subscription)
  },
  onRealtimeError: (callback: (message: string) => void) => {
    const subscription = (_: any, payload: string) => callback(payload)
    ipcRenderer.on("realtime-error", subscription)
    return () => ipcRenderer.removeListener("realtime-error", subscription)
  },
  quitApp: () => ipcRenderer.invoke("quit-app"),
  
  // LLM Model Management
  getCurrentLlmConfig: () => ipcRenderer.invoke("get-current-llm-config"),
  getAvailableOllamaModels: () => ipcRenderer.invoke("get-available-ollama-models"),
  getOpenRouterModels: () => ipcRenderer.invoke("get-openrouter-models"),
  switchToOllama: (model?: string, url?: string) => ipcRenderer.invoke("switch-to-ollama", model, url),
  switchToGemini: (apiKey?: string) => ipcRenderer.invoke("switch-to-gemini", apiKey),
  switchToOpenRouter: (apiKey: string, models: string[]) => ipcRenderer.invoke("switch-to-openrouter", apiKey, models),
  testLlmConnection: () => ipcRenderer.invoke("test-llm-connection"),
  
  // Clipboard Monitoring
  startClipboardMonitor: () => ipcRenderer.invoke("clipboard-start"),
  stopClipboardMonitor: () => ipcRenderer.invoke("clipboard-stop"),
  getClipboardStatus: () => ipcRenderer.invoke("clipboard-status"),
  onCodeDetected: (callback: (data: { isCode: boolean; language: string | null; confidence: number; snippet: string }) => void) => {
    const subscription = (_: any, data: { isCode: boolean; language: string | null; confidence: number; snippet: string }) => callback(data)
    ipcRenderer.on("code-detected", subscription)
    return () => ipcRenderer.removeListener("code-detected", subscription)
  },
  
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
} as ElectronAPI)
