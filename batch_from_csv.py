#!/usr/bin/env python3
"""Read `gform.csv`, extract Google Skills public_profiles URLs, and scrape them concurrently.

Usage: python batch_from_csv.py [--workers N] [--out output.json]

Defaults: workers=3, out=results_from_gform.json
"""
import csv
import sys
import json
import re
import subprocess
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
                        else:
                            # not a full URL, skip
                            pass
    return sorted(urls)


def scrape_profile_with_name(url: str, timeout: int = 180) -> dict:
    """Scrape profile name and badge titles using Playwright directly."""
    try:
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
            
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
    parser.add_argument('--workers', '-w', type=int, default=5, help='Number of concurrent workers (default 5)')
    parser.add_argument('--out', '-o', default='results_from_gform.json')
    args = parser.parse_args()

    urls = extract_urls_from_csv(CSV_PATH)
    if not urls:
        print('No profile URLs found in gform.csv')
        sys.exit(1)

    workers = args.workers
    print(f'Found {len(urls)} profile URLs. Starting scraping with {workers} workers...')

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

    out_path = Path(args.out)
    with out_path.open('w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f'Done. Wrote {out_path} with {len(results)} entries.')


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""Read `gform.csv`, find all public_profiles URLs, and scrape each profile.

Usage: python batch_from_csv.py [gform.csv]
Writes `results_from_gform.json` in the current folder.
"""
import sys
import re
import csv
import json
from typing import List, Set

from scraper import scrape_playwright


def extract_urls_from_csv(path: str) -> List[str]:
    urls: Set[str] = set()
    pattern = re.compile(r'https?://[^\"]*/public_profiles/[0-9a-fA-F-]+')

    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
        for m in pattern.findall(text):
            urls.add(m.split('?')[0].strip())

    return sorted(urls)


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'gform.csv'
    urls = extract_urls_from_csv(csv_path)
    if not urls:
        print('No public_profiles URLs found in', csv_path)
        return

    results = {}
    total = len(urls)
    print(f'Found {total} unique profiles; scraping one-by-one (this can take several minutes)...')

    for i, url in enumerate(urls, start=1):
        print(f'[{i}/{total}] {url}')
        try:
            titles = scrape_playwright(url)
            results[url] = titles
        except Exception as e:
            results[url] = {'error': str(e)}

    out_file = 'results_from_gform.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print('Done. Results written to', out_file)


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""Read `gform.csv`, extract public profile URLs, and scrape each one.

Usage: python batch_from_csv.py
"""
import csv
import json
from typing import List, Set
from urllib.parse import urlparse

from scraper import scrape_playwright


CSV_PATH = 'gform.csv'
OUT_PATH = 'results_from_gform.json'


def extract_urls_from_csv(path: str) -> List[str]:
    urls = []
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            for cell in row:
                if '/public_profiles/' in cell:
                    # normalize: remove params and whitespace
                    u = cell.strip().split('?')[0]
                    urls.append(u)
    # deduplicate while preserving order
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def main():
    profiles = extract_urls_from_csv(CSV_PATH)
    results = {}
    for p in profiles:
        try:
            titles = scrape_playwright(p)
            results[p] = titles
        except Exception as e:
            results[p] = {"error": str(e)}

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUT_PATH} with {len(results)} profiles")


if __name__ == '__main__':
    main()
