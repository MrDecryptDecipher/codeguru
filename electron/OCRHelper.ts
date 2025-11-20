import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  processingTime: number;
}

export class OCRHelper {
  private worker: Tesseract.Worker | null = null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize Tesseract worker (lazy initialization)
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized && this.worker) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('[OCRHelper] Initializing Tesseract worker...');
        this.worker = await Tesseract.createWorker('eng', 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`[OCRHelper] Progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        });
        this.isInitialized = true;
        console.log('[OCRHelper] Tesseract worker initialized');
      } catch (error) {
        console.error('[OCRHelper] Failed to initialize:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Extract text from image file
   */
  public async extractText(imagePath: string, options?: {
    language?: string;
    psm?: number; // Page segmentation mode
    oem?: number; // OCR Engine mode
  }): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.worker) {
        throw new Error('OCR worker not initialized');
      }

      // Set language if specified
      if (options?.language && options.language !== 'eng') {
        await (this.worker as any).reinitialize(options.language);
      }

      // Set page segmentation mode if specified
      if (options?.psm !== undefined) {
        await this.worker.setParameters({
          tessedit_pageseg_mode: options.psm.toString() as any
        });
      }

      // Perform OCR
      const { data } = await this.worker.recognize(imagePath);

      const processingTime = Date.now() - startTime;

      // Extract word-level information
      const words = data.words.map(word => ({
        text: word.text,
        confidence: word.confidence || 0,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1
        }
      }));

      return {
        text: data.text.trim(),
        confidence: data.confidence || 0,
        words,
        processingTime
      };
    } catch (error) {
      console.error('[OCRHelper] Error extracting text:', error);
      throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from base64 image
   */
  public async extractTextFromBase64(base64Image: string, options?: {
    language?: string;
    psm?: number;
  }): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.worker) {
        throw new Error('OCR worker not initialized');
      }

      // Convert base64 to buffer
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Set language if specified
      if (options?.language && options.language !== 'eng') {
        // In v5, we might need to recreate worker or use reinitialize if supported
        // Casting to any to avoid type issues with specific worker version
        await (this.worker as any).reinitialize(options.language);
      }

      // Set page segmentation mode if specified
      if (options?.psm !== undefined) {
        await this.worker.setParameters({
          tessedit_pageseg_mode: options.psm.toString() as any
        });
      }

      // Perform OCR
      const { data } = await this.worker.recognize(imageBuffer);

      const processingTime = Date.now() - startTime;

      const words = data.words.map(word => ({
        text: word.text,
        confidence: word.confidence || 0,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1
        }
      }));

      return {
        text: data.text.trim(),
        confidence: data.confidence || 0,
        words,
        processingTime
      };
    } catch (error) {
      console.error('[OCRHelper] Error extracting text from base64:', error);
      throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect language automatically
   */
  public async detectLanguage(imagePath: string): Promise<string> {
    try {
      await this.initialize();

      if (!this.worker) {
        throw new Error('OCR worker not initialized');
      }

      // Try common languages
      const languages = ['eng', 'spa', 'fra', 'deu', 'chi_sim', 'jpn', 'kor'];

      for (const lang of languages) {
        try {
          await (this.worker as any).reinitialize(lang);
          const { data } = await this.worker.recognize(imagePath);

          // If we get reasonable confidence, assume this is the language
          if (data.confidence && data.confidence > 50) {
            return lang;
          }
        } catch (error) {
          // Try next language
          continue;
        }
      }

      return 'eng'; // Default to English
    } catch (error) {
      console.error('[OCRHelper] Error detecting language:', error);
      return 'eng'; // Default fallback
    }
  }

  /**
   * Extract text with enhanced preprocessing
   */
  public async extractTextEnhanced(imagePath: string): Promise<OCRResult> {
    try {
      // Try different PSM modes for better accuracy
      const psmModes = [6, 3, 11]; // 6: uniform block, 3: fully automatic, 11: sparse text

      let bestResult: OCRResult | null = null;
      let bestConfidence = 0;

      for (const psm of psmModes) {
        try {
          const result = await this.extractText(imagePath, { psm });
          if (result.confidence > bestConfidence) {
            bestConfidence = result.confidence;
            bestResult = result;
          }
        } catch (error) {
          console.warn(`[OCRHelper] PSM mode ${psm} failed:`, error);
          continue;
        }
      }

      if (!bestResult) {
        throw new Error('All PSM modes failed');
      }

      return bestResult;
    } catch (error) {
      console.error('[OCRHelper] Enhanced extraction failed:', error);
      // Fallback to basic extraction
      return this.extractText(imagePath);
    }
  }

  /**
   * Cleanup worker
   */
  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.initializationPromise = null;
      console.log('[OCRHelper] Worker terminated');
    }
  }
}









