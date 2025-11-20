import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { QueryClient, QueryClientProvider } from "react-query"
import { SolvePrompt } from "./components/SolvePrompt"

declare global {
  interface Window {
    electronAPI: {
      //RANDOM GETTER/SETTERS
      updateContentDimensions: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      //GLOBAL EVENTS
      //TODO: CHECK THAT PROCESSING NO SCREENSHOTS AND TAKE SCREENSHOTS ARE BOTH CONDITIONAL
      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<void>

      //INITIAL SOLUTION EVENTS
      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onSolutionStart: (callback: () => void) => () => void
      onSolutionError: (callback: (error: string) => void) => () => void
      onSolutionSuccess: (callback: (data: any) => void) => () => void
      onProblemExtracted: (callback: (data: any) => void) => () => void

      onDebugSuccess: (callback: (data: any) => void) => () => void

      onDebugStart: (callback: () => void) => () => void
      onDebugError: (callback: (error: string) => void) => () => void

      // Audio Processing
      analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
      analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
      analyzeImageFile: (path: string) => Promise<{ text: string; timestamp: number }>
      processScreenshots: () => Promise<{ success: boolean; error?: string }>
      processClipboardText: (text: string) => Promise<{ success: boolean; error?: string }>
      startRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
      stopRealtimeAssistant: () => Promise<{ success: boolean; error?: string }>
      getRealtimeStatus: () => Promise<{ active: boolean }>
      onRealtimeTranscript: (callback: (data: any) => void) => () => void
      onRealtimeSuggestion: (callback: (data: any) => void) => () => void
      onRealtimeStatus: (callback: (data: any) => void) => () => void
      onRealtimeError: (callback: (message: string) => void) => () => void

      moveWindowLeft: () => Promise<void>
      moveWindowRight: () => Promise<void>
      moveWindowUp: () => Promise<void>
      moveWindowDown: () => Promise<void>
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
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  }
})

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)

  // Clipboard monitoring state
  const [showSolvePrompt, setShowSolvePrompt] = useState(false)
  const [codeDetection, setCodeDetection] = useState<{
    language: string | null
    confidence: number
    snippet: string
  } | null>(null)

  // Effect for height monitoring
  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(() => {
      console.log("Received 'reset-view' message from main process.")
      queryClient.invalidateQueries(["screenshots"])
      queryClient.invalidateQueries(["problem_statement"])
      queryClient.invalidateQueries(["solution"])
      queryClient.invalidateQueries(["new_solution"])
      setView("queue")
    })

    return () => {
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const updateHeight = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      const width = containerRef.current.scrollWidth
      window.electronAPI?.updateContentDimensions({ width, height })
    }

    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })

    // Initial height update
    updateHeight()

    // Observe for changes
    resizeObserver.observe(containerRef.current)

    // Also update height when view changes
    const mutationObserver = new MutationObserver(() => {
      updateHeight()
    })

    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [view]) // Re-run when view changes

  // Clipboard monitoring effect
  useEffect(() => {
    const cleanup = window.electronAPI.onCodeDetected((data) => {
      console.log('[App] Code detected:', data)
      setCodeDetection({
        language: data.language,
        confidence: data.confidence,
        snippet: data.snippet
      })
      setShowSolvePrompt(true)
    })

    return cleanup
  }, [])

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
        console.log("starting processing")
      }),

      window.electronAPI.onUnauthorized(() => {
        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("Unauthorized")
      }),
      // Update this reset handler
      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process")

        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("View reset to 'queue' via Command+R shortcut")
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        console.log("[App] Problem extracted successfully", data)
        queryClient.setQueryData(["problem_statement"], data)
      }),
      window.electronAPI.onSolutionSuccess((data: any) => {
        console.log("[App] Received solution success", data)
        if (data?.solution) {
          const solutionData = {
            code: data.solution.code,
            thoughts: data.solution.thoughts,
            time_complexity: data.solution.time_complexity,
            space_complexity: data.solution.space_complexity
          }
          queryClient.setQueryData(["solution"], solutionData)
        }
      })
    ]
    return () => cleanupFunctions.forEach((cleanup) => cleanup())
  }, [])

  // Handle SOLVE action from clipboard prompt
  const handleSolve = async () => {
    console.log('[App] SOLVE triggered from clipboard')
    setShowSolvePrompt(false)

    // Trigger processing
    try {
      if (codeDetection && codeDetection.snippet) {
        await window.electronAPI.processClipboardText(codeDetection.snippet)
      } else {
        await window.electronAPI.processScreenshots()
      }
      setView("solutions")
    } catch (error) {
      console.error('[App] Error processing from clipboard:', error)
    }
  }

  // Handle dismiss action from clipboard prompt
  const handleDismiss = () => {
    console.log('[App] SOLVE prompt dismissed')
    setShowSolvePrompt(false)
  }

  return (
    <div ref={containerRef} className="min-h-0">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          {view === "queue" ? (
            <Queue setView={setView} />
          ) : view === "solutions" ? (
            <Solutions setView={setView} />
          ) : (
            <></>
          )}

          {/* Clipboard Code Detection Prompt */}
          {showSolvePrompt && codeDetection && (
            <SolvePrompt
              language={codeDetection.language}
              confidence={codeDetection.confidence}
              snippet={codeDetection.snippet}
              hotkey="Ctrl+Enter"
              onSolve={handleSolve}
              onDismiss={handleDismiss}
              autoDismissMs={5000}
            />
          )}

          <ToastViewport />
        </ToastProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App
