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
}

export class KnowledgeBaseHelper {
    private kb: Record<string, KBProblem> = {};
    private isLoaded: boolean = false;
    private kbPath: string;

    constructor() {
        // In production, resources are in a different path
        if (app.isPackaged) {
            this.kbPath = path.join(process.resourcesPath, 'leetcode_kb.json');
        } else {
            // In dev, try dist-electron first, then fallback to source electron folder
            const distPath = path.join(__dirname, 'leetcode_kb.json');
            const sourcePath = path.join(__dirname, '..', 'electron', 'leetcode_kb.json');

            if (fs.existsSync(sourcePath)) {
                this.kbPath = sourcePath;
            } else {
                this.kbPath = distPath;
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
        // This is a simple implementation. For better results, we could use a library like fuse.js
        // but for now, simple inclusion check is fast and effective for exact LeetCode titles.
        const keys = Object.keys(this.kb);
        const match = keys.find(k => k.includes(normalizedQuery) || normalizedQuery.includes(k));

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
