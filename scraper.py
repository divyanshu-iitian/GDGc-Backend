#!/usr/bin/env python3
"""Scrape span.ql-title-medium from a Google Skills public profile.

Usage: python scraper.py <url> [--playwright]
"""
import sys
import json
from typing import List

import requests
from bs4 import BeautifulSoup


def scrape_static(url: str) -> List[str]:
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    # find spans that have ql-title-medium
    results: List[str] = []
    for span in soup.find_all("span", class_=True):
        classes = span.get("class") or []
        # match any span that has the ql-title-medium class (some pages use 'l-mts' vs '1-mts')
        if "ql-title-medium" in classes:
            text = span.get_text(strip=True)
            if text:
                results.append(text)
    return results


def scrape_playwright(url: str) -> List[str]:
    # Lazy import so playwright isn't required for static-only runs
    from playwright.sync_api import sync_playwright

    results: List[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")

        # The site uses shadow DOM. Run a JS snippet that walks the DOM and collects matching spans.
        js = r"""
        (function(){
          function collect(root){
            const out = [];
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node = walker.currentNode;
            while(node){
              try{
                if(node.tagName && node.tagName.toLowerCase()==='span'){
                  const cls = node.className || '';
                  if(cls.split(/\s+/).includes('ql-title-medium')){
                    out.push(node.innerText.trim());
                  }
                }
                if(node.shadowRoot){
                  out.push(...collect(node.shadowRoot));
                }
              }catch(e){}
              node = walker.nextNode();
            }
            return out;
          }
          return collect(document);
        })();
        """

        try:
            values = page.evaluate(js)
            for v in values:
                if v and isinstance(v, str):
                    s = v.strip()
                    if s:
                        results.append(s)
        finally:
            browser.close()
    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: python scraper.py <url> [--playwright]")
        sys.exit(2)
    url = sys.argv[1]
    use_pw = "--playwright" in sys.argv

    out: List[str] = []
    try:
        out = scrape_static(url)
    except Exception as e:
        print(f"Static fetch failed: {e}")

    # Always try Playwright if static returns empty (shadow DOM issue)
    if not out:
        try:
            out = scrape_playwright(url)
        except Exception as e:
            print(f"Playwright fetch failed: {e}")

    # Deduplicate while preserving order
    seen = set()
    dedup: List[str] = []
    for t in out:
        if t not in seen:
            seen.add(t)
            dedup.append(t)

    print(json.dumps(dedup, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
