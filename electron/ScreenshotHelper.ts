// ScreenshotHelper.ts

import path from "node:path"
import fs from "node:fs"
import { app, screen } from "electron"
import { v4 as uuidv4 } from "uuid"
import screenshot from "screenshot-desktop"
import sharp from "sharp"
import { OCRHelper, OCRResult } from "./OCRHelper"
import { ConfigManager } from "./ConfigManager"

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  private view: "queue" | "solutions" = "queue"
  private ocrHelper: OCRHelper | null = null
  private configManager: ConfigManager

  constructor(view: "queue" | "solutions" = "queue") {
    this.view = view
    this.configManager = ConfigManager.getInstance()

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true })
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir, { recursive: true })
    }

    // Initialize OCR if enabled
    if (this.configManager.getSection('advanced').enableOCR) {
      this.ocrHelper = new OCRHelper()
    }
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void,
    options?: {
      displayId?: number;
      format?: 'png' | 'jpg' | 'webp';
      quality?: number;
      compress?: boolean;
    }
  ): Promise<string> {
    try {
      hideMainWindow()
      
      // Add a small delay to ensure window is hidden
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const config = this.configManager.getSection('screenshot');
      const format = options?.format || config.format;
      const quality = options?.quality || config.quality;
      const compress = options?.compress !== undefined ? options.compress : config.compression;
      
      let screenshotPath = ""
      const fileId = uuidv4();

      // Determine target directory
      const targetDir = this.view === "queue" ? this.screenshotDir : this.extraScreenshotDir;
      const extension = format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'webp';
      screenshotPath = path.join(targetDir, `${fileId}.${extension}`)

      // Take screenshot from specific display or primary
      if (options?.displayId !== undefined) {
        const displays = screen.getAllDisplays();
        const display = displays[options.displayId];
        if (display) {
          await screenshot({ filename: screenshotPath, screen: display.id });
        } else {
          await screenshot({ filename: screenshotPath });
        }
      } else {
        await screenshot({ filename: screenshotPath });
      }

      // Compress if enabled
      if (compress && format !== 'png') {
        await this.compressImage(screenshotPath, format, quality);
      }

      // Add to appropriate queue
      if (this.view === "queue") {
        this.screenshotQueue.push(screenshotPath)
        if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.screenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      } else {
        this.extraScreenshotQueue.push(screenshotPath)
        if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.extraScreenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      }

      return screenshotPath
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      // Ensure window is always shown again
      showMainWindow()
    }
  }

  /**
   * Compress image
   */
  private async compressImage(filePath: string, format: 'jpg' | 'webp', quality: number): Promise<void> {
    try {
      const buffer = await sharp(filePath)
        .toFormat(format, { quality })
        .toBuffer();
      
      await fs.promises.writeFile(filePath, buffer);
    } catch (error) {
      console.error('[ScreenshotHelper] Error compressing image:', error);
      // Continue with original if compression fails
    }
  }

  /**
   * Extract text from screenshot using OCR
   */
  public async extractTextFromScreenshot(imagePath: string): Promise<OCRResult | null> {
    if (!this.ocrHelper) {
      return null;
    }

    try {
      return await this.ocrHelper.extractTextEnhanced(imagePath);
    } catch (error) {
      console.error('[ScreenshotHelper] Error extracting text:', error);
      return null;
    }
  }

  /**
   * Get all available displays
   */
  public getAvailableDisplays(): Array<{ id: number; bounds: { x: number; y: number; width: number; height: number } }> {
    return screen.getAllDisplays().map((display, index) => ({
      id: index,
      bounds: display.bounds
    }));
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.promises.unlink(path)
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: error.message }
    }
  }
}
