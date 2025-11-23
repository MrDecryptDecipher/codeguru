import os
import json
import re
from datasets import load_dataset

# Configuration - Use absolute paths from project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "electron/leetcode_solutions_kb.json")
EXISTING_KB_FILE = os.path.join(PROJECT_ROOT, "electron/leetcode_kb.json")

def extract_method_signature(code):
    """Extract the method name and signature from Python code"""
    if not code:
        return None
    
    # Match patterns like: def methodName(self, param1: Type, ...) -> ReturnType:
    method_pattern = r'def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:'
    match = re.search(method_pattern, code)
    
    if match:
        return {
            'method_name': match.group(1),
            'full_signature': match.group(0).rstrip(':')
        }
    return None

def process_hf_dataset():
    """Download and process HuggingFace leetcode-solutions dataset"""
    print("Loading HuggingFace dataset: cassanof/leetcode-solutions...")
    
    try:
        # Load the dataset
        ds = load_dataset("cassanof/leetcode-solutions")
        print(f"✅ Dataset loaded successfully!")
        
        # Access the train split
        train_data = ds['train']
        print(f"📊 Total solutions: {len(train_data)}")
        
        # Load existing Kaggle KB for merging
        existing_kb = {}
        if os.path.exists(EXISTING_KB_FILE):
            with open(EXISTING_KB_FILE, 'r', encoding='utf-8') as f:
                existing_kb = json.load(f)
            print(f"📚 Loaded existing KB with {len(existing_kb)} problems")
        
        # Process and merge
        solutions_kb = {}
        method_signature_count = 0
        
        for idx, item in enumerate(train_data):
            try:
                # Extract fields based on schema:
                # Keys: ['post_href', 'python_solutions', 'slug', 'post_title', 'user', 'upvotes', 'views', 'problem_title', 'number', 'acceptance', 'difficulty']
                
                title = str(item.get('problem_title', '')).strip()
                if not title:
                    continue
                
                title_key = title.lower()
                
                # Get or create entry
                if title_key in existing_kb:
                    entry = existing_kb[title_key].copy()
                else:
                    entry = {
                        'id': str(item.get('number', '')),
                        'title': title,
                        'difficulty': str(item.get('difficulty', 'Medium')),
                        'tags': [],
                        'description': str(item.get('post_title', ''))
                    }
                
                # Add solution code
                code = str(item.get('python_solutions', ''))
                if code:
                    entry['solution_code'] = code
                    
                    # Extract method signature
                    sig_info = extract_method_signature(code)
                    if sig_info:
                        entry['method_name'] = sig_info['method_name']
                        entry['method_signature'] = sig_info['full_signature']
                        method_signature_count += 1
                
                solutions_kb[title_key] = entry
                
                if (idx + 1) % 5000 == 0:
                    print(f"⏳ Processed {idx + 1}/{len(train_data)} solutions...")
                    
            except Exception as e:
                # print(f"⚠️  Skipping row {idx} due to error: {e}")
                continue
        
        print(f"\n✅ Processing complete!")
        print(f"📊 Total problems in merged KB: {len(solutions_kb)}")
        print(f"🔍 Method signatures extracted: {method_signature_count}")
        
        # Save to JSON
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(solutions_kb, f, indent=2)
        
        print(f"💾 Enhanced Knowledge Base saved to {OUTPUT_FILE}")
        print(f"📈 Coverage: {method_signature_count}/{len(solutions_kb)} problems have method signatures")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    try:
        success = process_hf_dataset()
        if success:
            print("\n🎉 SUCCESS: Enhanced LeetCode Knowledge Base created!")
            exit(0)
        else:
            exit(1)
    except Exception as e:
        print(f"❌ FATAL ERROR: {e}")
        exit(1)
