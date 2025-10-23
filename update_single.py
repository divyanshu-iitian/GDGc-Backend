#!/usr/bin/env python3
"""Quick script to update a single profile in results.json"""

import json
import sys
from scraper import scrape_profile

def update_profile(url):
    # Scrape the profile
    print(f"🎯 Scraping {url}...")
    profile_data = scrape_profile(url)
    
    if not profile_data:
        print("❌ Failed to scrape profile")
        return False
    
    print(f"✅ Scraped: {profile_data.get('name', 'Unknown')}")
    print(f"🏆 Badges: {len(profile_data.get('titles', []))}")
    
    # Load existing results
    results_file = "data/results.json"
    try:
        with open(results_file, 'r', encoding='utf-8') as f:
            results = json.load(f)
    except:
        results = []
    
    # Find and update the profile
    updated = False
    for i, profile in enumerate(results):
        if profile.get('url') == url:
            results[i] = profile_data
            updated = True
            print(f"💾 Updated profile at index {i}")
            break
    
    if not updated:
        results.append(profile_data)
        print(f"💾 Added new profile")
    
    # Save back
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Saved to {results_file}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python update_single.py <profile_url>")
        sys.exit(1)
    
    url = sys.argv[1]
    success = update_profile(url)
    sys.exit(0 if success else 1)
