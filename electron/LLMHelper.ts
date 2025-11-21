import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"
import { OpenRouterHelper } from "./OpenRouterHelper"
import { KnowledgeBaseHelper } from "./KnowledgeBaseHelper"

interface OllamaResponse {
  response: string
  done: boolean
}

export class LLMHelper {
  private model: GenerativeModel | null = null
  private readonly systemPrompt = `You are Wingman AI, a World-Class Principal Engineer and Polymath. You possess deep expertise in:
- **Blockchain & Web3**: Solidity, Rust, DeFi, Smart Contracts, Cryptography.
- **Full Stack Engineering**: React, Node.js, TypeScript, Go, Python, Java.
- **Cloud & DevOps**: AWS, GCP, Azure, Kubernetes, CI/CD.
- **AI & ML**: LLMs, RAG, Computer Vision, Data Science.
- **Algorithms**: Competitive Programming, System Design, Optimization.

For any user input:
1. Analyze the situation with the depth of a Staff+ Engineer.
2. Provide a clear, technical problem statement.
3. Suggest actionable, high-impact next steps or solutions.
4. Always explain your reasoning, focusing on trade-offs, complexity, and best practices.
5. Be proactive and anticipate edge cases or future scalability issues.

CRITICAL INSTRUCTION FOR LEETCODE:
- You MUST use the EXACT method name required by the problem (e.g., \`maximumScore\`, \`twoSum\`).
- Look for the method signature in the user's input or image.
- If the user provides an error like "AttributeError: 'Solution' object has no attribute 'X'", it means you used the wrong name. CORRECT IT immediately.
- Do NOT invent method names based on the title (e.g., do NOT use \`maximizeCyclicPartitionScore\` if the signature is \`maximumScore\`).`
  private useOllama: boolean = false
  private useOpenRouter: boolean = false
  private ollamaModel: string = "llama3.2"
  private ollamaUrl: string = "http://localhost:11434"
  private openRouterHelper: OpenRouterHelper | null = null
  private kbHelper: KnowledgeBaseHelper
  private geminiApiKey: string | null = null

  public setGeminiKey(key: string) {
    this.geminiApiKey = key;
  }

  constructor(
    apiKey?: string,
    useOllama: boolean = false,
    ollamaModel?: string,
    ollamaUrl?: string,
    useOpenRouter: boolean = false,
    openRouterModels?: string[]
  ) {
    this.kbHelper = new KnowledgeBaseHelper()
    this.kbHelper.loadKnowledgeBase()

    this.useOllama = useOllama
    this.useOpenRouter = useOpenRouter

    if (useOpenRouter && apiKey) {
      if (!openRouterModels || openRouterModels.length === 0) {
        throw new Error("OpenRouter models list is required when using OpenRouter")
      }
      this.openRouterHelper = new OpenRouterHelper(apiKey, openRouterModels)
      console.log(`[LLMHelper] Using OpenRouter with ${openRouterModels.length} models`)
    } else if (useOllama) {
      this.ollamaUrl = ollamaUrl || "http://localhost:11434"
      this.ollamaModel = ollamaModel || "gemma:latest" // Default fallback
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel} `)

      // Auto-detect and use first available model if specified model doesn't exist
      this.initializeOllamaModel()
    } else if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey)
      this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
      console.log("[LLMHelper] Using Google Gemini")
    } else {
      throw new Error("Either provide API key for Gemini/OpenRouter or enable Ollama mode")
    }
  }

  // ... (existing methods) ...

  public async generateSolution(problemInfo: any): Promise<any> {
    // Enhance problem info with Knowledge Base context
    let enhancedInfo = { ...problemInfo };

    // Try to find the problem in KB
    const problemTitle = problemInfo.title || problemInfo.problem_statement?.split('\\n')[0] || "";
    if (problemTitle) {
      const kbProblem = this.kbHelper.findProblem(problemTitle);
      if (kbProblem) {
        console.log(`[LLMHelper] Found problem in KB: ${kbProblem.title} `);
        enhancedInfo.kb_context = {
          official_title: kbProblem.title,
          difficulty: kbProblem.difficulty,
          tags: kbProblem.tags,
          official_description: kbProblem.description,
          similar_problems: this.kbHelper.getRelatedProblems(kbProblem.tags).map(p => p.title)
        };
      }
    }

    const prompt = `${this.systemPrompt} \n\nGiven this problem or situation: \n${JSON.stringify(enhancedInfo, null, 2)} \n\nPlease provide your response in the following JSON format: \n{
  "solution": {
    "code": "The code or main answer here.",
      "problem_statement": "Restate the problem or situation.",
        "context": "Relevant background/context.",
          "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
            "reasoning": "Explanation of why these suggestions are appropriate."
  }
} \nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling LLM for solution...");
    try {
      if (this.useOpenRouter && this.openRouterHelper) {
        try {
          const result = await this.openRouterHelper.generateSolution(enhancedInfo)
          console.log("[LLMHelper] OpenRouter returned result.");
          return result
        } catch (orError) {
          console.error("[LLMHelper] OpenRouter failed:", orError);
          if (this.geminiApiKey) {
            console.log("[LLMHelper] Falling back to Gemini...");
            await this.switchToGemini(this.geminiApiKey);
            // Recursive call with Gemini now active
            return this.generateSolution(problemInfo);
          }
          throw orError;
        }
      } else if (this.model) {
        const result = await this.model.generateContent(prompt)
        console.log("[LLMHelper] Gemini LLM returned result.");
        const response = await result.response
        const text = this.cleanJsonResponse(response.text())
        const parsed = JSON.parse(text)
        console.log("[LLMHelper] Parsed LLM response:", parsed)
        return parsed
      } else {
        throw new Error("No LLM provider configured")
      }
    } catch (error) {
      console.error("Error generating solution:", error)
      throw error
    }
  }

  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: "image/png"
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    text = text.replace(/^```(?: json) ?\n /, '').replace(/\n```$/, '');
    // Remove any leading/trailing whitespace
    text = text.trim();
    return text;
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data: OllamaResponse = await response.json()
      return data.response
    } catch (error) {
      console.error("[LLMHelper] Error calling Ollama:", error)
      throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`)
    }
  }

  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  private async initializeOllamaModel(): Promise<void> {
    try {
      const availableModels = await this.getOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found")
        return
      }

      // Check if current model exists, if not use the first available
      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      // Test the selected model works
      const testResult = await this.callOllama("Hello")
      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
      // Try to use first available model as fallback
      try {
        const models = await this.getOllamaModels()
        if (models.length > 0) {
          this.ollamaModel = models[0]
          console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
        }
      } catch (fallbackError) {
        console.error(`[LLMHelper] Fallback also failed: ${fallbackError.message}`)
      }
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))

      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }



  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))

      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: "audio/mp3"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
    try {
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe this audio clip in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the audio. Do not return a structured JSON object, just answer naturally as you would to a user and be concise.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      if (this.useOpenRouter && this.openRouterHelper) {
        const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
        const text = await this.openRouterHelper.analyzeImage(imagePath, prompt);
        return { text, timestamp: Date.now() };
      } else if (this.model) {
        const imageData = await fs.promises.readFile(imagePath);
        const imagePart = {
          inlineData: {
            data: imageData.toString("base64"),
            mimeType: "image/png"
          }
        };
        const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
        const result = await this.model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        return { text, timestamp: Date.now() };
      } else {
        throw new Error("No LLM provider configured for image analysis");
      }
    } catch (error) {
      console.error("Error analyzing image file:", error);
      throw error;
    }
  }

  public async chatWithGemini(message: string): Promise<string> {
    try {
      if (this.useOpenRouter && this.openRouterHelper) {
        return await this.openRouterHelper.chat(message);
      } else if (this.useOllama) {
        return this.callOllama(message);
      } else if (this.model) {
        const result = await this.model.generateContent(message);
        const response = await result.response;
        return response.text();
      } else {
        throw new Error("No LLM provider configured");
      }
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error);
      throw error;
    }
  }

  public async chat(message: string): Promise<string> {
    return this.chatWithGemini(message);
  }

  public async generateRealtimeSuggestion(prompt: string, maxTokens: number): Promise<string> {
    try {
      if (this.useOpenRouter && this.openRouterHelper) {
        const result = await this.openRouterHelper.orchestrateRequest(prompt, 'chat', {
          max_tokens: maxTokens
        })
        return result.response.trim()
      }

      if (this.useOllama) {
        const result = await this.callOllama(prompt)
        return result.trim()
      }

      if (this.model) {
        const result = await this.model.generateContent(prompt)
        const response = await result.response
        return response.text().trim()
      }

      throw new Error('No LLM configured for realtime suggestions')
    } catch (error) {
      console.error('[LLMHelper] Realtime suggestion error:', error)
      throw error
    }
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    if (!this.useOllama) return [];

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error("[LLMHelper] Error fetching Ollama models:", error);
      return [];
    }
  }

  public getCurrentProvider(): "ollama" | "gemini" | "openrouter" {
    if (this.useOpenRouter) return "openrouter";
    return this.useOllama ? "ollama" : "gemini";
  }

  public getCurrentModel(): string {
    if (this.useOpenRouter) {
      return `OpenRouter (${this.openRouterHelper?.getAvailableModels().length || 0} models)`;
    }
    return this.useOllama ? this.ollamaModel : "gemini-2.0-flash";
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;

    if (model) {
      this.ollamaModel = model;
    } else {
      // Auto-detect first available model
      await this.initializeOllamaModel();
    }

    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  public async switchToGemini(apiKey?: string): Promise<void> {
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    if (!this.model && !apiKey) {
      throw new Error("No Gemini API key provided and no existing model instance");
    }

    this.useOllama = false;
    this.useOpenRouter = false;
    this.openRouterHelper = null;
    console.log("[LLMHelper] Switched to Gemini");
  }

  public async switchToOpenRouter(apiKey: string, models: string[]): Promise<void> {
    if (!apiKey || !models || models.length === 0) {
      throw new Error("OpenRouter API key and models list are required");
    }

    this.openRouterHelper = new OpenRouterHelper(apiKey, models);
    this.useOpenRouter = true;
    this.useOllama = false;
    this.model = null;
    console.log(`[LLMHelper] Switched to OpenRouter with ${models.length} models`);
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOpenRouter && this.openRouterHelper) {
        return await this.openRouterHelper.testConnection();
      } else if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        // Test with a simple prompt
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (!this.model) {
          return { success: false, error: "No Gemini model configured" };
        }
        // Test with a simple prompt
        const result = await this.model.generateContent("Hello");
        const response = await result.response;
        const text = response.text(); // Ensure the response is valid
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  public isUsingOpenRouter(): boolean {
    return this.useOpenRouter;
  }

  public getOpenRouterModels(): string[] {
    if (!this.openRouterHelper) return [];
    return this.openRouterHelper.getAvailableModels();
  }
} 