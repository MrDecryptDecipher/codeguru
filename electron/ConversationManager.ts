import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: number;
    latency?: number;
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  metadata?: {
    problemType?: string;
    screenshots?: string[];
    audioFiles?: string[];
  };
}

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();
  private currentConversationId: string | null = null;
  private storagePath: string;
  private maxConversations: number = 100;
  private maxMessagesPerConversation: number = 1000;

  constructor() {
    this.storagePath = path.join(app.getPath('userData'), 'conversations');
    this.ensureStorageDirectory();
    this.loadConversations();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Load all conversations from disk
   */
  private loadConversations(): void {
    try {
      const files = fs.readdirSync(this.storagePath);
      const conversationFiles = files.filter(f => f.endsWith('.json'));

      for (const file of conversationFiles) {
        try {
          const filePath = path.join(this.storagePath, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const conversation: Conversation = JSON.parse(data);
          this.conversations.set(conversation.id, conversation);
        } catch (error) {
          console.error(`[ConversationManager] Error loading conversation ${file}:`, error);
        }
      }

      console.log(`[ConversationManager] Loaded ${this.conversations.size} conversations`);
    } catch (error) {
      console.error('[ConversationManager] Error loading conversations:', error);
    }
  }

  /**
   * Save conversation to disk
   */
  private async saveConversation(conversation: Conversation): Promise<void> {
    try {
      const filePath = path.join(this.storagePath, `${conversation.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[ConversationManager] Error saving conversation ${conversation.id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new conversation
   */
  public createConversation(title?: string, metadata?: Conversation['metadata']): string {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const conversation: Conversation = {
      id,
      title: title || `Conversation ${new Date().toLocaleString()}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata
    };

    this.conversations.set(id, conversation);
    this.currentConversationId = id;
    this.saveConversation(conversation);

    // Enforce max conversations limit
    if (this.conversations.size > this.maxConversations) {
      this.deleteOldestConversations(this.conversations.size - this.maxConversations);
    }

    return id;
  }

  /**
   * Get current conversation
   */
  public getCurrentConversation(): Conversation | null {
    if (!this.currentConversationId) {
      return null;
    }
    return this.conversations.get(this.currentConversationId) || null;
  }

  /**
   * Set current conversation
   */
  public setCurrentConversation(conversationId: string): boolean {
    if (this.conversations.has(conversationId)) {
      this.currentConversationId = conversationId;
      return true;
    }
    return false;
  }

  /**
   * Add message to current conversation
   */
  public async addMessage(
    role: Message['role'],
    content: string,
    metadata?: Message['metadata']
  ): Promise<string> {
    if (!this.currentConversationId) {
      this.createConversation();
    }

    const conversation = this.getCurrentConversation();
    if (!conversation) {
      throw new Error('No active conversation');
    }

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      metadata
    };

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    // Enforce max messages limit
    if (conversation.messages.length > this.maxMessagesPerConversation) {
      conversation.messages = conversation.messages.slice(-this.maxMessagesPerConversation);
    }

    // Update title from first user message if not set
    if (conversation.messages.length === 1 && role === 'user') {
      conversation.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    }

    await this.saveConversation(conversation);
    return message.id;
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(conversationId?: string, limit?: number): Message[] {
    const convId = conversationId || this.currentConversationId;
    if (!convId) {
      return [];
    }

    const conversation = this.conversations.get(convId);
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages;
    if (limit && limit > 0) {
      return messages.slice(-limit);
    }
    return messages;
  }

  /**
   * Get all conversations
   */
  public getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Search conversations
   */
  public searchConversations(query: string): Conversation[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.conversations.values())
      .filter(conv => {
        const titleMatch = conv.title.toLowerCase().includes(lowerQuery);
        const contentMatch = conv.messages.some(msg => 
          msg.content.toLowerCase().includes(lowerQuery)
        );
        const tagMatch = conv.tags?.some(tag => 
          tag.toLowerCase().includes(lowerQuery)
        );
        return titleMatch || contentMatch || tagMatch;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Delete conversation
   */
  public async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.storagePath, `${conversationId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.conversations.delete(conversationId);
      
      if (this.currentConversationId === conversationId) {
        this.currentConversationId = null;
      }
      
      return true;
    } catch (error) {
      console.error(`[ConversationManager] Error deleting conversation ${conversationId}:`, error);
      return false;
    }
  }

  /**
   * Delete oldest conversations
   */
  private deleteOldestConversations(count: number): void {
    const sorted = Array.from(this.conversations.values())
      .sort((a, b) => a.updatedAt - b.updatedAt);
    
    for (let i = 0; i < count && i < sorted.length; i++) {
      this.deleteConversation(sorted[i].id);
    }
  }

  /**
   * Export conversation
   */
  public exportConversation(conversationId: string, format: 'json' | 'txt' | 'md' = 'json'): string {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    switch (format) {
      case 'json':
        return JSON.stringify(conversation, null, 2);
      
      case 'txt':
        return this.formatConversationAsText(conversation);
      
      case 'md':
        return this.formatConversationAsMarkdown(conversation);
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private formatConversationAsText(conversation: Conversation): string {
    let text = `Conversation: ${conversation.title}\n`;
    text += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
    text += `Updated: ${new Date(conversation.updatedAt).toLocaleString()}\n\n`;
    text += '='.repeat(80) + '\n\n';

    for (const message of conversation.messages) {
      text += `[${message.role.toUpperCase()}] ${new Date(message.timestamp).toLocaleString()}\n`;
      text += message.content + '\n\n';
    }

    return text;
  }

  private formatConversationAsMarkdown(conversation: Conversation): string {
    let md = `# ${conversation.title}\n\n`;
    md += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`;
    md += `**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}\n\n`;
    md += '---\n\n';

    for (const message of conversation.messages) {
      const role = message.role === 'user' ? '👤 User' : 
                   message.role === 'assistant' ? '🤖 Assistant' : 
                   '⚙️ System';
      md += `## ${role}\n\n`;
      md += `*${new Date(message.timestamp).toLocaleString()}*\n\n`;
      md += message.content + '\n\n';
    }

    return md;
  }

  /**
   * Get conversation context for AI (last N messages)
   */
  public getContextForAI(conversationId?: string, messageCount: number = 10): Array<{ role: string; content: string }> {
    const messages = this.getConversationHistory(conversationId, messageCount);
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  /**
   * Clear all conversations
   */
  public async clearAllConversations(): Promise<void> {
    const conversationIds = Array.from(this.conversations.keys());
    for (const id of conversationIds) {
      await this.deleteConversation(id);
    }
    this.currentConversationId = null;
  }
}









