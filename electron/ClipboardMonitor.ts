import { clipboard } from 'electron';
import { EventEmitter } from 'events';

export interface CodeDetectionResult {
  isCode: boolean;
  language: string | null;
  confidence: number;
  snippet: string;
}

export class ClipboardMonitor extends EventEmitter {
  private isMonitoring: boolean = false;
  private lastClipboardContent: string = '';
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 100; // 100ms polling

  // Code patterns for detection
  private readonly CODE_PATTERNS = {
    // Common programming language keywords
    keywords: /\b(function|class|const|let|var|def|import|export|return|if|else|for|while|switch|case|try|catch|async|await|public|private|protected|static|void|int|string|bool|float|double)\b/g,
    
    // Brackets and braces
    brackets: /[\{\}\[\]\(\)]/g,
    
    // Semicolons and operators
    operators: /[;:=><\+\-\*\/\%\&\|\^]/g,
    
    // Function calls
    functionCalls: /\w+\s*\(/g,
    
    // Comments
    comments: /(\/\/|\/\*|\*\/|#|<!--)/g,
  };

  // Language-specific patterns
  private readonly LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
    javascript: [
      /\b(const|let|var|function|=>|async|await|import|export)\b/,
      /console\.(log|error|warn)/,
      /\.(map|filter|reduce|forEach)/,
    ],
    typescript: [
      /\b(interface|type|enum|namespace|implements|extends)\b/,
      /:\s*(string|number|boolean|any|void)/,
      /<.*>/,
    ],
    python: [
      /\b(def|class|import|from|as|lambda|yield|with)\b/,
      /\bprint\s*\(/,
      /\b(self|cls)\b/,
    ],
    java: [
      /\b(public|private|protected|static|final|class|interface)\b/,
      /\b(void|int|String|boolean|double|float)\b/,
      /System\.(out|err)\.print/,
    ],
    cpp: [
      /\b(#include|using|namespace|std|cout|cin)\b/,
      /\b(int|char|float|double|void|bool)\s+\w+\s*[\(;=]/,
      /::/,
    ],
    csharp: [
      /\b(using|namespace|class|interface|public|private|static)\b/,
      /\b(void|int|string|bool|double|float)\s+\w+\s*[\(;=]/,
      /Console\.(WriteLine|Write)/,
    ],
    go: [
      /\b(package|import|func|var|const|type|struct|interface)\b/,
      /fmt\.(Print|Println)/,
      /:=/,
    ],
    rust: [
      /\b(fn|let|mut|pub|use|mod|struct|enum|impl|trait)\b/,
      /println!\(/,
      /->/,
    ],
    ruby: [
      /\b(def|class|module|require|include|attr_accessor|end)\b/,
      /\bputs\s/,
      /@\w+/,
    ],
    php: [
      /<\?php/,
      /\$\w+/,
      /\b(function|class|public|private|protected|static)\b/,
    ],
  };

  constructor() {
    super();
  }

  /**
   * Start monitoring clipboard
   */
  public start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.lastClipboardContent = clipboard.readText();

    this.monitorInterval = setInterval(() => {
      this.checkClipboard();
    }, this.POLL_INTERVAL_MS);

    console.log('[ClipboardMonitor] Started monitoring clipboard');
  }

  /**
   * Stop monitoring clipboard
   */
  public stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    console.log('[ClipboardMonitor] Stopped monitoring clipboard');
  }

  /**
   * Check clipboard for changes
   */
  private checkClipboard(): void {
    try {
      const currentContent = clipboard.readText();

      // Check if content has changed
      if (currentContent && currentContent !== this.lastClipboardContent) {
        this.lastClipboardContent = currentContent;

        // Detect if it's code
        const detection = this.detectCode(currentContent);

        if (detection.isCode) {
          this.emit('code-detected', detection);
        }

        this.emit('clipboard-changed', currentContent);
      }
    } catch (error) {
      console.error('[ClipboardMonitor] Error checking clipboard:', error);
    }
  }

  /**
   * Detect if text is code
   */
  public detectCode(text: string): CodeDetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        isCode: false,
        language: null,
        confidence: 0,
        snippet: text,
      };
    }

    // Calculate code score
    let score = 0;
    const maxScore = 100;

    // Check for keywords (30 points)
    const keywordMatches = text.match(this.CODE_PATTERNS.keywords);
    if (keywordMatches) {
      score += Math.min(30, keywordMatches.length * 5);
    }

    // Check for brackets (20 points)
    const bracketMatches = text.match(this.CODE_PATTERNS.brackets);
    if (bracketMatches) {
      score += Math.min(20, bracketMatches.length * 2);
    }

    // Check for operators (15 points)
    const operatorMatches = text.match(this.CODE_PATTERNS.operators);
    if (operatorMatches) {
      score += Math.min(15, operatorMatches.length * 1);
    }

    // Check for function calls (20 points)
    const functionMatches = text.match(this.CODE_PATTERNS.functionCalls);
    if (functionMatches) {
      score += Math.min(20, functionMatches.length * 5);
    }

    // Check for comments (15 points)
    const commentMatches = text.match(this.CODE_PATTERNS.comments);
    if (commentMatches) {
      score += Math.min(15, commentMatches.length * 5);
    }

    // Detect language
    const language = this.detectLanguage(text);

    // Normalize score
    const confidence = Math.min(100, score) / 100;

    // Consider it code if confidence > 30%
    const isCode = confidence > 0.3;

    return {
      isCode,
      language,
      confidence,
      snippet: text.substring(0, 500), // First 500 chars
    };
  }

  /**
   * Detect programming language
   */
  private detectLanguage(text: string): string | null {
    const scores: Record<string, number> = {};

    // Check each language pattern
    for (const [language, patterns] of Object.entries(this.LANGUAGE_PATTERNS)) {
      let languageScore = 0;

      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          languageScore += matches.length;
        }
      }

      if (languageScore > 0) {
        scores[language] = languageScore;
      }
    }

    // Find language with highest score
    let bestLanguage: string | null = null;
    let bestScore = 0;

    for (const [language, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestLanguage = language;
      }
    }

    return bestLanguage;
  }

  /**
   * Get current monitoring status
   */
  public isActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get last clipboard content
   */
  public getLastContent(): string {
    return this.lastClipboardContent;
  }
}
