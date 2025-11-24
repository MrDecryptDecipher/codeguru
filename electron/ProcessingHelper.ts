// ProcessingHelper.ts

import { AppState } from "./main"
import { LLMHelper } from "./LLMHelper"
import { ConversationManager } from "./ConversationManager"
import { ErrorHandler } from "./ErrorHandler"
import { CacheManager } from "./CacheManager"
import { RequestQueue } from "./RequestQueue"
import { logger } from "./Logger"
import { OCRHelper } from "./OCRHelper"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"

dotenv.config()
const openRouterEnvPath = path.join(process.cwd(), "config", "openrouter.env")
if (fs.existsSync(openRouterEnvPath)) {
  dotenv.config({ path: openRouterEnvPath, override: false })
}

const isDev = process.env.NODE_ENV === "development"
const isDevTest = process.env.IS_DEV_TEST === "true"
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500

// Ensure .env is loaded from project root
const envPath = path.join(process.cwd(), ".env")
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config() // Fallback to default
}

function readOpenRouterEnvConfig(): { apiKey: string; models: string[] } | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  // Use default models if not provided in env
  const modelsRaw = process.env.OPENROUTER_MODELS || "x-ai/grok-4.1-fast:free,kwaipilot/kat-coder-pro:free,nvidia/nemotron-nano-12b-v2-vl:free,alibaba/tongyi-deepresearch-30b-a3b:free,meituan/longcat-flash-chat:free,nvidia/nemotron-nano-9b-v2:free,openai/gpt-oss-20b:free,z-ai/glm-4.5-air:free,qwen/qwen3-coder:free,moonshotai/kimi-k2:free,google/gemma-3n-e2b-it:free,tngtech/deepseek-r1t2-chimera:free,deepseek/deepseek-r1-0528:free"

  if (!apiKey) {
    return null
  }

  const models = modelsRaw
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)

  if (models.length === 0) {
    return null
  }

  return { apiKey, models }
}

/**
 * Read OpenRouter configuration from openrouter.txt file
 */
function readOpenRouterConfig(): { apiKey: string; models: string[] } | null {
  try {
    // Try to find openrouter.txt in the project root
    const possiblePaths = [
      path.join(__dirname, "../../openrouter.txt"),
      path.join(process.cwd(), "openrouter.txt"),
      path.join(process.cwd(), "../openrouter.txt"),
      "/home/ubuntu/Sandeep/projects/aicode/openrouter.txt"
    ];

    let configPath: string | null = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        configPath = possiblePath;
        break;
      }
    }

    if (!configPath) {
      console.warn("[ProcessingHelper] openrouter.txt not found, skipping OpenRouter initialization");
      return null;
    }

    const content = fs.readFileSync(configPath, "utf-8");
    const lines = content.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#"));

    let apiKey = "";
    const models: string[] = [];

    for (const line of lines) {
      if (line.startsWith("Key:")) {
        apiKey = line.replace("Key:", "").trim();
      } else if (line.match(/^\d+:/)) {
        // Extract model name after the number and colon
        const modelMatch = line.match(/^\d+:\s*(.+)$/);
        if (modelMatch && modelMatch[1]) {
          models.push(modelMatch[1].trim());
        }
      }
    }

    if (!apiKey || models.length === 0) {
      console.warn("[ProcessingHelper] Invalid OpenRouter config: missing API key or models");
      return null;
    }

    return { apiKey, models };
  } catch (error) {
    console.error("[ProcessingHelper] Error reading OpenRouter config:", error);
    return null;
  }
}

export class ProcessingHelper {
  private appState: AppState
  private llmHelper: LLMHelper
  private conversationManager: ConversationManager
  private cacheManager: CacheManager
  private requestQueue: RequestQueue
  private ocrHelper: OCRHelper | null = null
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null
  private static openRouterConfig: { apiKey: string; models: string[] } | null = null

  constructor(appState: AppState) {
    this.appState = appState
    this.conversationManager = new ConversationManager()
    this.cacheManager = CacheManager.getInstance()
    this.requestQueue = new RequestQueue()

    // Initialize OCR if enabled
    try {
      this.ocrHelper = new OCRHelper()
      logger.info('OCR helper initialized')
    } catch (error) {
      logger.warn('Failed to initialize OCR helper', { error })
    }

    // Priority: OpenRouter > Ollama > Gemini
    // Check if user wants to use OpenRouter (prefer env, fallback to file)
    const envOpenRouterConfig = readOpenRouterEnvConfig()
    const fileOpenRouterConfig = envOpenRouterConfig ? null : readOpenRouterConfig()
    const openRouterConfig = envOpenRouterConfig || fileOpenRouterConfig
    ProcessingHelper.openRouterConfig = openRouterConfig // Store for later use
    const useOpenRouter =
      process.env.USE_OPENROUTER !== "false" && openRouterConfig !== null;

    if (openRouterConfig) {
      const source = envOpenRouterConfig ? "Environment Variables" : "openrouter.txt";
      const maskedKey = openRouterConfig.apiKey ? `${openRouterConfig.apiKey.substring(0, 8)}...${openRouterConfig.apiKey.substring(openRouterConfig.apiKey.length - 4)}` : "undefined";
      console.log(`[ProcessingHelper] Loaded OpenRouter config from: ${source}`);
      console.log(`[ProcessingHelper] API Key (masked): ${maskedKey}`);
      console.log(`[ProcessingHelper] Models count: ${openRouterConfig.models.length}`);
    }

    if (useOpenRouter && openRouterConfig) {
      console.log(`[ProcessingHelper] Initializing with OpenRouter (${openRouterConfig.models.length} models)`)
      this.llmHelper = new LLMHelper(
        openRouterConfig.apiKey,
        false, // useOllama
        undefined, // ollamaModel
        undefined, // ollamaUrl
        true, // useOpenRouter
        openRouterConfig.models
      )

      // Configure Gemini fallback if key is available
      const geminiKey = process.env.GEMINI_API_KEY
      if (geminiKey) {
        this.llmHelper.setGeminiKey(geminiKey)
        console.log("[ProcessingHelper] Configured Gemini fallback")
      }
    } else {
      // Check if user wants to use Ollama
      const useOllama = process.env.USE_OLLAMA === "true"
      const ollamaModel = process.env.OLLAMA_MODEL // Don't set default here, let LLMHelper auto-detect
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434"

      if (useOllama) {
        console.log("[ProcessingHelper] Initializing with Ollama")
        this.llmHelper = new LLMHelper(undefined, true, ollamaModel, ollamaUrl)
      } else {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
          throw new Error("GEMINI_API_KEY not found in environment variables. Set GEMINI_API_KEY, enable Ollama with USE_OLLAMA=true, or provide openrouter.txt file")
        }
        console.log("[ProcessingHelper] Initializing with Gemini")
        this.llmHelper = new LLMHelper(apiKey, false)
      }
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const view = this.appState.getView()

    if (view === "queue") {
      const screenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      // Check if last screenshot is an audio file
      const allPaths = this.appState.getScreenshotHelper().getScreenshotQueue();
      const lastPath = allPaths[allPaths.length - 1];
      if (lastPath.endsWith('.mp3') || lastPath.endsWith('.wav')) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView('solutions');
        try {
          const audioResult = await this.llmHelper.analyzeAudioFile(lastPath);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, audioResult);
          this.appState.setProblemInfo({ problem_statement: audioResult.text, input_format: {}, output_format: {}, constraints: [], test_cases: [] });
          return;
        } catch (err: any) {
          console.error('Audio processing error:', err);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, err.message);
          return;
        }
      }

      // NEW: Handle screenshot as plain text (like audio)
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")
      this.currentProcessingAbortController = new AbortController()

      // Create conversation for this processing session
      const conversationId = this.conversationManager.createConversation('Screenshot Processing')

      try {
        // Try OCR first if available
        let ocrText = '';
        if (this.ocrHelper) {
          try {
            const ocrResult = await this.ocrHelper.extractTextEnhanced(lastPath);
            ocrText = ocrResult.text;
            logger.info('OCR extraction completed', {
              confidence: ocrResult.confidence,
              textLength: ocrText.length
            });

            // Add OCR text to conversation
            if (ocrText) {
              await this.conversationManager.addMessage('system', `OCR extracted text: ${ocrText}`, {
                // type: 'ocr' - removed as it's not in the type definition
              });
            }
          } catch (ocrError) {
            logger.warn('OCR extraction failed, continuing with image analysis', { error: ocrError });
          }
        }

        // Use error handling with retry
        const imageResult = await ErrorHandler.executeWithProtection(
          'image-analysis',
          () => this.llmHelper.analyzeImageFile(lastPath),
          {
            maxRetries: 2,
            initialDelay: 1000,
            retryableErrors: [Error]
          }
        );

        const problemInfo = {
          problem_statement: ocrText ? `${ocrText}\n\n${imageResult.text}` : imageResult.text,
          input_format: { description: "Generated from screenshot", parameters: [] as any[] },
          output_format: { description: "Generated from screenshot", type: "string", subtype: "text" },
          complexity: { time: "N/A", space: "N/A" },
          test_cases: [] as any[],
          validation_type: "manual",
          difficulty: "custom"
        };

        // Add to conversation
        await this.conversationManager.addMessage('user', 'Screenshot processed', {
          // screenshots: [lastPath],
          // ocrText: ocrText || undefined
        });
        await this.conversationManager.addMessage('assistant', problemInfo.problem_statement, {
          model: this.llmHelper.getCurrentModel(),
          provider: this.llmHelper.getCurrentProvider()
        });

        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfo);
        this.appState.setProblemInfo(problemInfo);

        // Generate the first solution immediately
        const rawSolution = await ErrorHandler.executeWithProtection(
          'solution-generation',
          () => this.llmHelper.generateSolution(problemInfo),
          {
            maxRetries: 2,
            initialDelay: 750,
            retryableErrors: [Error]
          }
        );

        const normalizedSolution = (rawSolution as any)?.solution
          ? rawSolution
          : { solution: rawSolution };

        await this.conversationManager.addMessage(
          'assistant',
          (normalizedSolution as any).solution?.code || 'Solution generated',
          {
            model: this.llmHelper.getCurrentModel(),
            provider: this.llmHelper.getCurrentProvider(),
            // type: 'solution'
          }
        );

        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          normalizedSolution
        );
      } catch (error: any) {
        const userMessage = ErrorHandler.getUserFriendlyError(error);
        logger.error("Image processing error", error, { screenshotPath: lastPath });
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, userMessage)
      } finally {
        this.currentProcessingAbortController = null
      }
      return;
    } else {
      // Debug mode
      const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)
      this.currentExtraProcessingAbortController = new AbortController()

      try {
        // Get problem info and current solution
        const problemInfo = this.appState.getProblemInfo()
        if (!problemInfo) {
          throw new Error("No problem info available")
        }

        // Get current solution from state
        const currentSolution = await this.llmHelper.generateSolution(problemInfo)
        const currentCode = currentSolution.solution.code

        // Debug the solution using vision model
        const debugResult = await this.llmHelper.debugSolutionWithImages(
          problemInfo,
          currentCode,
          extraScreenshotQueue
        )

        this.appState.setHasDebugged(true)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
          debugResult
        )

      } catch (error: any) {
        console.error("Debug processing error:", error)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
          error.message
        )
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  public async processClipboardText(text: string): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    // Switch view and notify start
    mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
    this.appState.setView("solutions")
    this.currentProcessingAbortController = new AbortController()

    // Create conversation
    const conversationId = this.conversationManager.createConversation('Clipboard Processing')

    try {
      // EXTRACT CODE STUB from clipboard text
      console.log(`[ProcessingHelper] Clipboard text length: ${text.length}`);
      console.log(`[ProcessingHelper] First 200 chars: ${text.substring(0, 200)}`);

      let codeStub = "";
      let problemDescription = text;

      // Python pattern: class Solution: followed by def methodName
      // Use \s+ to handle any whitespace (spaces, tabs, newlines, \r\n)
      const pythonMatch = text.match(/(class\s+\w+:\s+def\s+\w+\s*\([^)]*\)\s*->\s*[^:]+:)/s);
      if (pythonMatch) {
        codeStub = pythonMatch[1];
        console.log(`[ProcessingHelper] ✅ Extracted Python code stub: ${codeStub}`);
      } else {
        console.log(`[ProcessingHelper] ⚠️ Failed to extract Python stub, trying simpler pattern...`);

        // Try simpler pattern: just def methodName
        const simpleDefMatch = text.match(/(def\s+(\w+)\s*\([^)]*\)\s*->\s*[^:]+:)/);
        if (simpleDefMatch) {
          codeStub = simpleDefMatch[1];
          console.log(`[ProcessingHelper] ✅ Extracted simple Python stub: ${codeStub}`);
        }
      }

      // C++/Java pattern: public/static ReturnType methodName(...)
      if (!codeStub) {
        const cppJavaMatch = text.match(/((?:public|static|private)?\s*\w+\s+\w+\s*\([^)]*\))/);
        if (cppJavaMatch) {
          codeStub = cppJavaMatch[1];
          console.log(`[ProcessingHelper] ✅ Extracted C++/Java code stub: ${codeStub}`);
        }
      }

      if (!codeStub) {
        console.log(`[ProcessingHelper] ❌ NO CODE STUB EXTRACTED - Ghost Fixer will not work!`);
      }

      const problemInfo = {
        problem_statement: problemDescription,
        code_stub: codeStub || undefined, // Add extracted code stub
        input_format: { description: "Generated from clipboard text", parameters: [] as any[] },
        output_format: { description: "Generated from clipboard text", type: "string", subtype: "text" },
        complexity: { time: "N/A", space: "N/A" },
        test_cases: [] as any[],
        validation_type: "manual",
        difficulty: "custom"
      };

      console.log(`[ProcessingHelper] problemInfo.code_stub = ${problemInfo.code_stub || 'UNDEFINED'}`);

      // Add to conversation
      await this.conversationManager.addMessage('user', 'Clipboard text processed', {});
      await this.conversationManager.addMessage('assistant', problemInfo.problem_statement, {
        model: this.llmHelper.getCurrentModel(),
        provider: this.llmHelper.getCurrentProvider()
      });

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfo);
      this.appState.setProblemInfo(problemInfo);

      // Generate solution
      console.log("[ProcessingHelper] Generating solution...");
      const rawSolution = await ErrorHandler.executeWithProtection(
        'solution-generation',
        () => this.llmHelper.generateSolution(problemInfo),
        {
          maxRetries: 2,
          initialDelay: 750,
          retryableErrors: [Error]
        }
      );
      console.log("[ProcessingHelper] Raw solution received:", JSON.stringify(rawSolution, null, 2));

      const normalizedSolution = rawSolution?.solution
        ? rawSolution
        : { solution: rawSolution };

      console.log("[ProcessingHelper] Normalized solution:", JSON.stringify(normalizedSolution, null, 2));

      await this.conversationManager.addMessage(
        'assistant',
        (normalizedSolution as any).solution?.code || 'Solution generated',
        {
          model: this.llmHelper.getCurrentModel(),
          provider: this.llmHelper.getCurrentProvider(),
        }
      );

      console.log("[ProcessingHelper] Sending SOLUTION_SUCCESS to frontend");
      mainWindow.webContents.send(
        this.appState.PROCESSING_EVENTS.SOLUTION_SUCCESS,
        normalizedSolution
      );
      console.log("[ProcessingHelper] SOLUTION_SUCCESS sent");

    } catch (error: any) {
      const userMessage = ErrorHandler.getUserFriendlyError(error);
      logger.error("Clipboard processing error", error);
      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, userMessage)
    } finally {
      this.currentProcessingAbortController = null
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }

    this.appState.setHasDebugged(false)
  }

  public async processAudioBase64(data: string, mimeType: string) {
    // Directly use LLMHelper to analyze inline base64 audio
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType);
  }

  // Add audio file processing method
  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath);
  }

  public getLLMHelper() {
    return this.llmHelper;
  }

  public static getOpenRouterConfig(): { apiKey: string; models: string[] } | null {
    return ProcessingHelper.openRouterConfig;
  }
}
