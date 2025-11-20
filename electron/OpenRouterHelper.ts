import fs from "fs";

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export class OpenRouterHelper {
  private apiKey: string;
  private apiUrl: string = "https://openrouter.ai/api/v1/chat/completions";
  private models: string[] = [];
  private currentModelIndex: number = 0;
  private modelStats: Map<string, { success: number; failures: number; avgLatency: number }> = new Map();

  // Model capabilities mapping - helps with intelligent routing
  private modelCapabilities: Map<string, {
    supportsVision: boolean;
    supportsAudio: boolean;
    maxTokens: number;
    bestFor: string[];
  }> = new Map();

  constructor(apiKey: string, models: string[]) {
    this.apiKey = apiKey;
    this.models = models;
    this.initializeModelCapabilities();
  }

  private initializeModelCapabilities(): void {
    // Initialize capabilities for each model based on research
    // This helps with intelligent routing
    this.modelCapabilities.set("kwaipilot/kat-coder-pro:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["coding", "technical", "problem-solving"]
    });

    this.modelCapabilities.set("nvidia/nemotron-nano-12b-v2-vl:free", {
      supportsVision: true,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["vision", "image-analysis", "multimodal"]
    });

    this.modelCapabilities.set("alibaba/tongyi-deepresearch-30b-a3b:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 8192,
      bestFor: ["research", "analysis", "deep-thinking"]
    });

    this.modelCapabilities.set("meituan/longcat-flash-chat:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["chat", "general", "fast-responses"]
    });



    this.modelCapabilities.set("openai/gpt-oss-20b:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["general", "chat", "conversation"]
    });

    this.modelCapabilities.set("z-ai/glm-4.5-air:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["general", "chat", "multilingual"]
    });

    this.modelCapabilities.set("qwen/qwen3-coder:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 8192,
      bestFor: ["coding", "technical", "programming"]
    });



    this.modelCapabilities.set("cognitivecomputations/dolphin-mistral-24b-venice-edition:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 4096,
      bestFor: ["general", "chat", "creative"]
    });

    this.modelCapabilities.set("google/gemma-3n-e2b-it:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 8192,
      bestFor: ["instruction-following", "general"]
    });

    this.modelCapabilities.set("mistralai/mistral-small-3.2-24b-instruct:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 32768,
      bestFor: ["instruction-following", "reasoning", "general"]
    });

    this.modelCapabilities.set("nousresearch/hermes-3-llama-3.1-405b:free", {
      supportsVision: false,
      supportsAudio: false,
      maxTokens: 8192,
      bestFor: ["reasoning", "analysis", "complex-tasks"]
    });




  }

  /**
   * Select the best model for a given task type
   */
  private selectBestModel(taskType: string = "general", modelList?: string[]): string {
    const modelsToUse = modelList || this.models;

    // Find models that are best for this task
    const suitableModels = modelsToUse.filter(model => {
      const capabilities = this.modelCapabilities.get(model);
      return capabilities?.bestFor.includes(taskType);
    });

    if (suitableModels.length > 0) {
      // Select the one with best stats
      return this.getBestPerformingModel(suitableModels);
    }

    // Fallback to round-robin from available models
    const availableIndex = this.currentModelIndex % modelsToUse.length;
    return modelsToUse[availableIndex];
  }

  /**
   * Get the best performing model from a list
   */
  private getBestPerformingModel(modelList: string[]): string {
    let bestModel = modelList[0];
    let bestScore = -1;

    for (const model of modelList) {
      const stats = this.modelStats.get(model) || { success: 0, failures: 0, avgLatency: 0 };
      const successRate = stats.success / (stats.success + stats.failures + 1);
      const score = successRate * 100 - stats.avgLatency;

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    return bestModel;
  }

  /**
   * Call OpenRouter API with a specific model
   */
  private async callModel(
    model: string,
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
    options?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/Prat011/free-cluely",
          "X-Title": "Free Cluely"
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: options?.temperature || 0.7,
          max_tokens: options?.max_tokens || 4096
        })
      });

      if (!response.ok) {
        const errorData: OpenRouterError = await response.json().catch(() => ({ error: { message: response.statusText, type: "unknown" } }));
        throw new Error(`OpenRouter API error: ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenRouterResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error("No response from model");
      }

      const latency = Date.now() - startTime;
      this.updateModelStats(model, true, latency);

      return data.choices[0].message.content;
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.updateModelStats(model, false, latency);
      throw error;
    }
  }

  /**
   * Update model statistics
   */
  private updateModelStats(model: string, success: boolean, latency: number): void {
    const stats = this.modelStats.get(model) || { success: 0, failures: 0, avgLatency: 0 };

    if (success) {
      stats.success++;
    } else {
      stats.failures++;
    }

    // Update average latency (simple moving average)
    stats.avgLatency = (stats.avgLatency * (stats.success + stats.failures - 1) + latency) / (stats.success + stats.failures);

    this.modelStats.set(model, stats);
  }

  /**
   * Orchestrate request across multiple models with fallback
   */
  public async orchestrateRequest(
    prompt: string | Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
    taskType: string = "general",
    options?: { temperature?: number; max_tokens?: number }
  ): Promise<{ response: string; model: string }> {
    const selectedModel = this.selectBestModel(taskType);
    // Filter out known problematic models (data policy issues)
    const knownUnavailableModels = [
      "deepseek/deepseek-chat-v3.1:free",
      "moonshotai/kimi-k2:free",
      "huggingfaceh4/zephyr-7b-beta:free",
      "microsoft/phi-3-mini-128k-instruct:free"
    ];
    const availableModels = this.models.filter(m => !knownUnavailableModels.includes(m));

    // If selected model is unavailable, pick best from available
    const bestModel = availableModels.includes(selectedModel)
      ? selectedModel
      : this.selectBestModel(taskType, availableModels);

    const modelsToTry = [bestModel, ...availableModels.filter(m => m !== bestModel)];

    let lastError: Error | null = null;
    let triedCount = 0;

    for (const model of modelsToTry) {
      triedCount++;
      try {
        let messages;
        if (typeof prompt === 'string') {
          messages = [{ role: "user", content: prompt }];
        } else {
          messages = prompt;
        }

        const response = await this.callModel(
          model,
          messages,
          options
        );
        return { response, model };
      } catch (error: any) {
        // Skip data policy errors silently (known issue)
        if (error.message?.includes("data policy") || error.message?.includes("404")) {
          console.warn(`[OpenRouterHelper] Model ${model} unavailable (data policy): skipping`);
        } else {
          console.warn(`[OpenRouterHelper] Model ${model} failed: ${error.message}`);
        }
        lastError = error;
        // Continue to next model
      }
    }

    throw new Error(`All ${triedCount} available models failed. Last error: ${lastError?.message}`);
  }


  /**
   * Chat with orchestrated models
   */
  public async chat(message: string, conversationHistory: Array<{ role: string; content: string }> = []): Promise<string> {
    const messages = [
      ...conversationHistory,
      { role: "user", content: message }
    ];

    const selectedModel = this.selectBestModel("chat");
    const response = await this.callModel(selectedModel, messages);
    return response;
  }

  /**
   * Analyze image with vision-capable models
   */
  public async analyzeImage(imagePath: string, prompt: string): Promise<string> {
    const imageData = await fs.promises.readFile(imagePath);
    const base64Image = imageData.toString("base64");

    // Find vision-capable models
    const visionModels = this.models.filter(model => {
      const capabilities = this.modelCapabilities.get(model);
      return capabilities?.supportsVision === true;
    });

    if (visionModels.length === 0) {
      // Fallback: try all models (some might support vision even if not documented)
      return this.orchestrateRequest(
        `${prompt}\n\n[Image data: ${base64Image.substring(0, 100)}...]`,
        "vision"
      ).then(result => result.response);
    }

    // Try vision models first
    for (const model of visionModels) {
      try {
        const messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }
        ];

        const response = await this.orchestrateRequest(
          messages,
          "vision"
        );
        return response.response;
      } catch (error) {
        console.warn(`Vision model ${model} failed, trying next...`);
      }
    }

    throw new Error("Image analysis failed on all models");
  }

  /**
   * Generate solution with orchestration
   */
  public async generateSolution(problemInfo: any): Promise<any> {
    const prompt = `You are Wingman AI, a helpful, proactive assistant. Given this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`;

    const result = await this.orchestrateRequest(prompt, "problem-solving", { max_tokens: 4096 });

    // Clean and parse JSON response
    let text = result.response;
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '').trim();

    try {
      return JSON.parse(text);
    } catch (error) {
      // If JSON parsing fails, wrap the response
      return {
        solution: {
          code: text,
          problem_statement: problemInfo.problem_statement || "",
          context: "",
          suggested_responses: [],
          reasoning: "Response generated by AI model"
        }
      };
    }
  }

  /**
   * Get model statistics
   */
  public getModelStats(): Map<string, { success: number; failures: number; avgLatency: number }> {
    return new Map(this.modelStats);
  }

  /**
   * Get available models
   */
  public getAvailableModels(): string[] {
    return [...this.models];
  }

  /**
   * Test connection to OpenRouter
   */
  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.orchestrateRequest("Hello", "general");
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

