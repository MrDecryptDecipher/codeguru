import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface KBProblem {
    id: string;
    title: string;
    difficulty: string;
    tags: string[];
    description: string;
    solution: string;
    // Enhanced fields from HuggingFace dataset
    method_name?: string;
    method_signature?: string;
    solution_code?: string;
}

export class KnowledgeBaseHelper {
    private kb: Record<string, KBProblem> = {};
    private isLoaded: boolean = false;
    private kbPath: string;

    constructor() {
        try {
            // Safe access to electron app
            const electron = require('electron');
            this.isPackaged = electron.app ? electron.app.isPackaged : false;
            this.userDataPath = electron.app ? electron.app.getPath("userData") : path.join(__dirname, '../userData');
        } catch (e) {
            console.log("[KnowledgeBaseHelper] Running in non-electron environment");
            this.isPackaged = false;
            this.userDataPath = path.join(__dirname, '../userData');
        }

        // In production, resources are in a different path
        if (this.isPackaged) {
            // Try enhanced KB first, fallback to basic KB
            const enhancedPath = path.join(process.resourcesPath, 'leetcode_solutions_kb.json');
            const basicPath = path.join(process.resourcesPath, 'leetcode_kb.json');
            this.kbPath = fs.existsSync(enhancedPath) ? enhancedPath : basicPath;
        } else {
            // In dev, try enhanced KB first, then fallback to source folder
            const enhancedSourcePath = path.join(__dirname, '..', 'electron', 'leetcode_solutions_kb.json');
            const basicSourcePath = path.join(__dirname, '..', 'electron', 'leetcode_kb.json');
            const enhancedDistPath = path.join(__dirname, 'leetcode_solutions_kb.json');
            const basicDistPath = path.join(__dirname, 'leetcode_kb.json');

            if (fs.existsSync(enhancedSourcePath)) {
                this.kbPath = enhancedSourcePath;
            } else if (fs.existsSync(enhancedDistPath)) {
                this.kbPath = enhancedDistPath;
            } else if (fs.existsSync(basicSourcePath)) {
                this.kbPath = basicSourcePath;
            } else {
                this.kbPath = basicDistPath;
            }
        }
    }

    public loadKnowledgeBase(): void {
        try {
            if (fs.existsSync(this.kbPath)) {
                console.log(`[KnowledgeBase] Loading KB from ${this.kbPath}...`);
                const data = fs.readFileSync(this.kbPath, 'utf-8');
                this.kb = JSON.parse(data);
                this.isLoaded = true;
                console.log(`[KnowledgeBase] Loaded ${Object.keys(this.kb).length} problems.`);
            } else {
                console.warn(`[KnowledgeBase] KB file not found at ${this.kbPath}. Run 'npm run ingest:leetcode' to generate it.`);
            }
        } catch (error) {
            console.error('[KnowledgeBase] Failed to load KB:', error);
        }
    }

    public findProblem(query: string): KBProblem | null {
        if (!this.isLoaded) return null;

        const normalizedQuery = query.toLowerCase().trim();

        // 1. Exact Title Match
        if (this.kb[normalizedQuery]) {
            return this.kb[normalizedQuery];
        }

        // 2. Fuzzy / Substring Match
        // We need to be careful not to match short common words.
        const keys = Object.keys(this.kb);
        const match = keys.find(k => {
            // Ignore very short keys to avoid false positives
            if (k.length < 5) return false;

            // Check if key is contained in query
            if (normalizedQuery.includes(k)) return true;

            // Check if query is contained in key (only if query is substantial)
            if (normalizedQuery.length > 5 && k.includes(normalizedQuery)) return true;

            return false;
        });

        if (match) {
            return this.kb[match];
        }

        return null;
    }

    public getRelatedProblems(tags: string[], limit: number = 3): KBProblem[] {
        if (!this.isLoaded || !tags || tags.length === 0) return [];

        const related: KBProblem[] = [];
        const normalizedTags = tags.map(t => t.toLowerCase());

        for (const key in this.kb) {
            const problem = this.kb[key];
            // Check intersection of tags
            const sharedTags = problem.tags.filter(t => normalizedTags.includes(t.toLowerCase()));

            if (sharedTags.length > 0) {
                related.push(problem);
                if (related.length >= limit) break;
            }
        }

        return related;
    }
}
