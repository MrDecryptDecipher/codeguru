import os
import json
import pandas as pd
from kaggle.api.kaggle_api_extended import KaggleApi
import zipfile

# Configuration
DATASET_NAME = "ashutoshpapnoi/latest-complete-leetcode-problems-dataset-2025"
DOWNLOAD_PATH = "temp_kaggle_data"
OUTPUT_FILE = "electron/leetcode_kb.json"

def download_dataset():
    """Authenticate and download dataset from Kaggle"""
    print(f"Authenticating with Kaggle...")
    api = KaggleApi()
    api.authenticate()
    
    print(f"Downloading dataset: {DATASET_NAME}...")
    if not os.path.exists(DOWNLOAD_PATH):
        os.makedirs(DOWNLOAD_PATH)
        
    api.dataset_download_files(DATASET_NAME, path=DOWNLOAD_PATH, unzip=True)
    print("Download complete.")

def process_data():
    """Process CSV data into a structured Knowledge Base"""
    print("Processing data...")
    
    # Find the CSV file
    csv_file = None
    for root, dirs, files in os.walk(DOWNLOAD_PATH):
        for file in files:
            if file.endswith(".csv"):
                csv_file = os.path.join(root, file)
                break
    
    if not csv_file:
        raise FileNotFoundError("No CSV file found in downloaded dataset")
        
    print(f"Reading {csv_file}...")
    df = pd.read_csv(csv_file)
    
    # Create Knowledge Base structure
    kb = {}
    
    # Iterate through rows and build KB
    # Assuming standard columns, but we'll print columns to be safe if needed
    # Common columns: id, title, description, difficulty, tags, solution, etc.
    
    # Normalize column names to lowercase
    df.columns = [c.lower() for c in df.columns]
    
    count = 0
    for _, row in df.iterrows():
        try:
            # Extract relevant fields (adjust based on actual CSV structure)
            # We try to be flexible with column names
            title = str(row.get('title', '') or row.get('question title', '')).strip()
            if not title: continue
            
            problem_id = str(row.get('id', '') or row.get('frontend question id', '')).strip()
            
            entry = {
                "id": problem_id,
                "title": title,
                "difficulty": str(row.get('difficulty', 'Medium')),
                "tags": str(row.get('tags', '') or row.get('topic tags', '')).split(','),
                "description": str(row.get('description', '') or row.get('question text', '')),
                "solution": str(row.get('solution', '') or row.get('python solution', ''))
            }
            
            # Clean up tags
            entry['tags'] = [t.strip() for t in entry['tags'] if t.strip()]
            
            # Add to KB (indexed by title for easy lookup)
            kb[title.lower()] = entry
            count += 1
            
        except Exception as e:
            print(f"Skipping row due to error: {e}")
            continue
            
    print(f"Processed {count} problems.")
    
    # Save to JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(kb, f, indent=2)
        
    print(f"Knowledge Base saved to {OUTPUT_FILE}")

def cleanup():
    """Remove temporary files"""
    import shutil
    if os.path.exists(DOWNLOAD_PATH):
        shutil.rmtree(DOWNLOAD_PATH)
    print("Cleanup complete.")

if __name__ == "__main__":
    try:
        download_dataset()
        process_data()
        cleanup()
        print("SUCCESS: LeetCode Knowledge Base created!")
    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)
