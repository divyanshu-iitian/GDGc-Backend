#!/usr/bin/env python3
"""Read `gform.csv`, extract Google Skills public_profiles URLs, and scrape them concurrently.

Usage: python batch_from_csv.py [--workers N] [--out output.json]

Defaults: workers=3, out=results_from_gform.json
"""
import csv
import sys
import json
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

CSV_PATH = Path('gform.csv')


def extract_urls_from_csv(path: Path) -> List[str]:
    urls = set()
    if not path.exists():
        print(f"CSV file not found: {path}")
        return []
    pattern = re.compile(r'(https?://[^\s"\'>]+/public_profiles/[^\s"\'>]+)')
    with path.open(newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            for cell in row:
                if not cell:
                    continue
                # try to find full URL in cell
                m = pattern.search(cell)
                if m:
                    u = m.group(1).split('?')[0].split('#')[0]
                    urls.add(u)
                else:
                    # maybe the cell itself is a path or contains /public_profiles/
                    if '/public_profiles/' in cell:
                        # try to normalize
                        part = cell.strip()
                        if part.startswith('http'):
                            u = part.split('?')[0].split('#')[0]
                            urls.add(u)
    return sorted(urls)


def scrape_profile_with_name(url: str, timeout: int = 180) -> dict:
    """Scrape profile name and badge titles using Playwright directly."""
    try:
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
            # Extra wait for shadow DOM to fully load
            page.wait_for_timeout(2000)
            
            # JS to extract name from h1.ql-display-small and titles from span.ql-title-medium
            js = r"""
            (function(){
              function collect(root){
                const out = {name: '', titles: []};
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
                let node = walker.currentNode;
                while(node){
                  try{
                    if(node.tagName && node.tagName.toLowerCase()==='h1'){
                      const cls = node.className || '';
                      if(cls.split(/\s+/).includes('ql-display-small') && !out.name){
                        out.name = node.innerText.trim();
                      }
                    }
                    if(node.tagName && node.tagName.toLowerCase()==='span'){
                      const cls = node.className || '';
                      if(cls.split(/\s+/).includes('ql-title-medium')){
                        const t = node.innerText.trim();
                        if(t) out.titles.push(t);
                      }
                    }
                    if(node.shadowRoot){
                      const sub = collect(node.shadowRoot);
                      if(sub.name && !out.name) out.name = sub.name;
                      out.titles.push(...sub.titles);
                    }
                  }catch(e){}
                  node = walker.nextNode();
                }
                return out;
              }
              return collect(document);
            })();
            """
            
            result = page.evaluate(js)
            browser.close()
            
            # deduplicate titles
            seen = set()
            dedup = []
            for t in result.get('titles', []):
                if t not in seen:
                    seen.add(t)
                    dedup.append(t)
            
            return {
                'name': result.get('name', ''),
                'titles': dedup
            }
    except Exception as e:
        return {'error': str(e)}


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--workers', '-w', type=int, default=3, help='Number of concurrent workers (default 3, reduced for memory)')
    parser.add_argument('--out', '-o', default='results_from_gform.json')
    parser.add_argument('--start', type=int, default=0, help='Start index for batch scraping')
    parser.add_argument('--limit', type=int, default=None, help='Number of profiles to scrape (for batching)')
    args = parser.parse_args()

    urls = extract_urls_from_csv(CSV_PATH)
    if not urls:
        print('No profile URLs found in gform.csv')
        sys.exit(1)

    # Apply batch slicing if specified
    total_urls = len(urls)
    if args.start > 0 or args.limit is not None:
        end_idx = args.start + args.limit if args.limit else total_urls
        urls = urls[args.start:end_idx]
        print(f'Batch mode: scraping profiles {args.start} to {args.start + len(urls)} (out of {total_urls} total)')
    
    workers = args.workers
    print(f'Found {len(urls)} profile URLs to scrape. Using {workers} workers...')

    # ALWAYS load existing results to merge/update (for persistence across restarts)
    out_path = Path(args.out)
    existing_results = []
    if out_path.exists():
        try:
            with out_path.open('r', encoding='utf-8') as f:
                existing_results = json.load(f)
                print(f'[Persistence] Loaded {len(existing_results)} existing entries from {out_path}')
        except Exception as e:
            print(f'[Warning] Could not load existing file: {e}')
    
    results = []
    
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(scrape_profile_with_name, url): url for url in urls}
        for fut in as_completed(futures):
            url = futures[fut]
            try:
                res = fut.result()
            except Exception as e:
                res = {'error': str(e)}
            
            entry = {'url': url}
            if 'error' in res:
                entry['error'] = res['error']
                entry['name'] = ''
                entry['titles'] = []
                print(f'ERR {url} -> {res["error"][:80]}')
            else:
                entry['name'] = res.get('name', '')
                entry['titles'] = res.get('titles', [])
                print(f'OK {url} -> {entry["name"]} ({len(entry["titles"])} titles)')
            
            results.append(entry)

    # Merge with existing results (update by URL)
    if existing_results:
        url_to_entry = {e['url']: e for e in existing_results}
        for new_entry in results:
            url_to_entry[new_entry['url']] = new_entry
        final_results = list(url_to_entry.values())
    else:
        final_results = results

    with out_path.open('w', encoding='utf-8') as f:
        json.dump(final_results, f, ensure_ascii=False, indent=2)

    print(f'Done. Wrote {out_path} with {len(final_results)} total entries ({len(results)} new/updated).')


if __name__ == '__main__':
    main()
