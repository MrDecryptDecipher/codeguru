// ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState } from "./main"
import { ProcessingHelper } from "./ProcessingHelper"
import { ConversationManager } from "./ConversationManager"
import { ConfigManager } from "./ConfigManager"
import { CodeExecutor } from "./CodeExecutor"
import { OCRHelper } from "./OCRHelper"
import { logger } from "./Logger"

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      const mainWindow = appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("screenshot-taken", {
          path: screenshotPath,
          preview
        })
      }
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("process-screenshots", async () => {
    try {
      await appState.processingHelper.processScreenshots()
      return { success: true }
    } catch (error: any) {
      logger.error("Error processing screenshots via IPC", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("realtime-start", async () => {
    try {
      await appState.realtimeAssistant.start()
      return { success: true }
    } catch (error: any) {
      logger.error("Error starting realtime assistant", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("realtime-stop", async () => {
    try {
      appState.realtimeAssistant.stop()
      return { success: true }
    } catch (error: any) {
      logger.error("Error stopping realtime assistant", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("realtime-status", async () => {
    return appState.realtimeAssistant.status
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("gemini-chat", async (event, message: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message);
      return result;
    } catch (error: any) {
      console.error("Error in gemini-chat handler:", error);
      throw error;
    }
  });

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  // Window movement handlers
  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  ipcMain.handle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  ipcMain.handle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  // LLM Model Management Handlers
  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama(),
        isOpenRouter: llmHelper.isUsingOpenRouter()
      };
    } catch (error: any) {
      console.error("Error getting current LLM config:", error);
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = await llmHelper.getOllamaModels();
      return models;
    } catch (error: any) {
      console.error("Error getting Ollama models:", error);
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Ollama:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-gemini", async (_, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Gemini:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-openrouter", async (_, apiKey?: string, models?: string[]) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      // If API key and models not provided, try to get from config file
      let finalApiKey = apiKey;
      let finalModels = models;
      
      if (!finalApiKey || !finalModels || finalModels.length === 0) {
        const config = ProcessingHelper.getOpenRouterConfig();
        if (config) {
          finalApiKey = finalApiKey || config.apiKey;
          finalModels = finalModels || config.models;
        }
      }
      
      if (!finalApiKey || !finalModels || finalModels.length === 0) {
        return { success: false, error: "OpenRouter API key and models are required" };
      }
      
      await llmHelper.switchToOpenRouter(finalApiKey, finalModels);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to OpenRouter:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-openrouter-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = llmHelper.getOpenRouterModels();
      return models;
    } catch (error: any) {
      console.error("Error getting OpenRouter models:", error);
      return [];
    }
  });

  ipcMain.handle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const result = await llmHelper.testConnection();
      return result;
    } catch (error: any) {
      console.error("Error testing LLM connection:", error);
      return { success: false, error: error.message };
    }
  });

  // Conversation Management Handlers
  ipcMain.handle("conversation-create", async (_, title?: string) => {
    try {
      const convManager = new ConversationManager();
      const id = convManager.createConversation(title);
      return { success: true, conversationId: id };
    } catch (error: any) {
      logger.error("Error creating conversation", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("conversation-get-all", async () => {
    try {
      const convManager = new ConversationManager();
      return convManager.getAllConversations();
    } catch (error: any) {
      logger.error("Error getting conversations", error);
      return [];
    }
  });

  ipcMain.handle("conversation-get-history", async (_, conversationId?: string, limit?: number) => {
    try {
      const convManager = new ConversationManager();
      return convManager.getConversationHistory(conversationId, limit);
    } catch (error: any) {
      logger.error("Error getting conversation history", error);
      return [];
    }
  });

  ipcMain.handle("conversation-search", async (_, query: string) => {
    try {
      const convManager = new ConversationManager();
      return convManager.searchConversations(query);
    } catch (error: any) {
      logger.error("Error searching conversations", error);
      return [];
    }
  });

  ipcMain.handle("conversation-export", async (_, conversationId: string, format: 'json' | 'txt' | 'md' = 'json') => {
    try {
      const convManager = new ConversationManager();
      return convManager.exportConversation(conversationId, format);
    } catch (error: any) {
      logger.error("Error exporting conversation", error);
      throw error;
    }
  });

  ipcMain.handle("conversation-delete", async (_, conversationId: string) => {
    try {
      const convManager = new ConversationManager();
      const success = await convManager.deleteConversation(conversationId);
      return { success };
    } catch (error: any) {
      logger.error("Error deleting conversation", error);
      return { success: false, error: error.message };
    }
  });

  // OCR Handlers
  ipcMain.handle("ocr-extract-text", async (_, imagePath: string) => {
    try {
      const ocrHelper = new OCRHelper();
      const result = await ocrHelper.extractTextEnhanced(imagePath);
      return { success: true, result };
    } catch (error: any) {
      logger.error("Error extracting text with OCR", error);
      return { success: false, error: error.message };
    }
  });

  // Code Execution Handlers
  ipcMain.handle("code-execute-python", async (_, code: string, input?: string) => {
    try {
      const executor = new CodeExecutor();
      const result = await executor.executePython(code, input);
      return result;
    } catch (error: any) {
      logger.error("Error executing Python code", error);
      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: -1,
        executionTime: 0
      };
    }
  });

  ipcMain.handle("code-execute-javascript", async (_, code: string, input?: string) => {
    try {
      const executor = new CodeExecutor();
      const result = await executor.executeJavaScript(code, input);
      return result;
    } catch (error: any) {
      logger.error("Error executing JavaScript code", error);
      return {
        success: false,
        output: '',
        error: error.message,
        exitCode: -1,
        executionTime: 0
      };
    }
  });

  ipcMain.handle("code-run-tests", async (_, code: string, testCases: any[], language: 'python' | 'javascript' = 'python') => {
    try {
      const executor = new CodeExecutor();
      const results = await executor.runTests(code, testCases, language);
      return results;
    } catch (error: any) {
      logger.error("Error running tests", error);
      return [];
    }
  });

  ipcMain.handle("code-validate-syntax", async (_, code: string, language: 'python' | 'javascript') => {
    try {
      const executor = new CodeExecutor();
      const result = await executor.validateSyntax(code, language);
      return result;
    } catch (error: any) {
      logger.error("Error validating syntax", error);
      return { valid: false, errors: [error.message] };
    }
  });

  // Configuration Handlers
  ipcMain.handle("config-get", async () => {
    try {
      const configManager = ConfigManager.getInstance();
      return configManager.getConfig();
    } catch (error: any) {
      logger.error("Error getting config", error);
      return null;
    }
  });

  ipcMain.handle("config-get-value", async (_, path: string) => {
    try {
      const configManager = ConfigManager.getInstance();
      return configManager.getValue(path);
    } catch (error: any) {
      logger.error("Error getting config value", error);
      return null;
    }
  });

  ipcMain.handle("config-set-value", async (_, path: string, value: any) => {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.setValue(path, value);
      return { success: true };
    } catch (error: any) {
      logger.error("Error setting config value", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("config-update-section", async (_, section: string, values: any) => {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.updateSection(section as any, values);
      return { success: true };
    } catch (error: any) {
      logger.error("Error updating config section", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("config-export", async () => {
    try {
      const configManager = ConfigManager.getInstance();
      return configManager.exportConfig();
    } catch (error: any) {
      logger.error("Error exporting config", error);
      return null;
    }
  });

  ipcMain.handle("config-import", async (_, configJson: string) => {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.importConfig(configJson);
      return { success: true };
    } catch (error: any) {
      logger.error("Error importing config", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("config-reset", async () => {
    try {
      const configManager = ConfigManager.getInstance();
      await configManager.reset();
      return { success: true };
    } catch (error: any) {
      logger.error("Error resetting config", error);
      return { success: false, error: error.message };
    }
  });

  // Window/Display Handlers
  ipcMain.handle("window-get-displays", async () => {
    try {
      const windowHelper = appState.getWindowHelper();
      return windowHelper.getAvailableDisplays();
    } catch (error: any) {
      logger.error("Error getting displays", error);
      return [];
    }
  });

  ipcMain.handle("window-move-to-display", async (_, displayId: number) => {
    try {
      const windowHelper = appState.getWindowHelper();
      windowHelper.moveToDisplay(displayId);
      return { success: true };
    } catch (error: any) {
      logger.error("Error moving window to display", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("window-set-opacity", async (_, opacity: number) => {
    try {
      const windowHelper = appState.getWindowHelper();
      windowHelper.setOpacity(opacity);
      return { success: true };
    } catch (error: any) {
      logger.error("Error setting window opacity", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("window-save-state", async () => {
    try {
      const windowHelper = appState.getWindowHelper();
      windowHelper.saveWindowState();
      return { success: true };
    } catch (error: any) {
      logger.error("Error saving window state", error);
      return { success: false, error: error.message };
    }
  });

  // Screenshot Handlers (Enhanced)
  ipcMain.handle("screenshot-get-displays", async () => {
    try {
      const screenshotHelper = appState.getScreenshotHelper();
      return screenshotHelper.getAvailableDisplays();
    } catch (error: any) {
      logger.error("Error getting displays for screenshot", error);
      return [];
    }
  });

  ipcMain.handle("screenshot-extract-text", async (_, imagePath: string) => {
    try {
      const screenshotHelper = appState.getScreenshotHelper();
      const result = await screenshotHelper.extractTextFromScreenshot(imagePath);
      return { success: true, result };
    } catch (error: any) {
      logger.error("Error extracting text from screenshot", error);
      return { success: false, error: error.message };
    }
  });

  // Clipboard Monitoring Handlers
  ipcMain.handle("clipboard-start", async () => {
    try {
      const clipboardMonitor = appState.getClipboardMonitor();
      clipboardMonitor.start();
      return { success: true };
    } catch (error: any) {
      logger.error("Error starting clipboard monitor", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("clipboard-stop", async () => {
    try {
      const clipboardMonitor = appState.getClipboardMonitor();
      clipboardMonitor.stop();
      return { success: true };
    } catch (error: any) {
      logger.error("Error stopping clipboard monitor", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("clipboard-status", async () => {
    try {
      const clipboardMonitor = appState.getClipboardMonitor();
      return { active: clipboardMonitor.isActive() };
    } catch (error: any) {
      logger.error("Error getting clipboard status", error);
      return { active: false };
    }
  });
}
