import sys
import json
import os
import re
import io
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from openai import OpenAI

# Optional PDF support
try:
    from pdfminer.high_level import extract_text as extract_pdf_text
except Exception:
    extract_pdf_text = None

# Get OPENAI_API_KEY from environment
api_key = os.environ.get("OPENAI_API_KEY", "")
if not api_key:
    print(json.dumps({"error": "OPENAI_API_KEY environment variable not set"}))
    sys.exit(1)

# Get URL from command-line arguments
if len(sys.argv) < 2:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)

base_url = sys.argv[1]

# Initialize OpenAI client
client = OpenAI(api_key=api_key)

def extract_text_from_html(html_content):
    """Extract and clean text from HTML"""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Remove script and style elements
    for script in soup(["script", "style", "nav", "footer", "header"]):
        script.decompose()
    
    # Get text content
    text = soup.get_text()
    
    # Clean up whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = '\n'.join(chunk for chunk in chunks if chunk)
    
    return text, soup

def score_url(url: str) -> int:
    keywords = {
        "happy": 5,
        "hour": 5,
        "special": 3,
        "deal": 3,
        "menu": 2,
        "drink": 2,
        "food": 1,
    }
    score = 0
    lower = url.lower()
    for k, v in keywords.items():
        if k in lower:
            score += v
    if lower.endswith('.pdf'):
        score += 4
    return score


def find_related_pages(soup, base_url):
    """Find and score links to happy hour, specials, menu pages"""
    domain = urlparse(base_url).netloc
    candidates = []
    for link in soup.find_all('a', href=True):
        href = link.get('href', '')
        absolute_url = urljoin(base_url, href)
        if urlparse(absolute_url).netloc != domain:
            continue
        candidates.append(absolute_url)

    # Score and return top 3
    ranked = sorted(set(candidates), key=lambda u: score_url(u), reverse=True)
    return [u for u in ranked if score_url(u) > 0][:3]

def extract_text_from_pdf_url(url: str) -> str:
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        if extract_pdf_text:
            return extract_pdf_text(io.BytesIO(r.content))
        # Fallback: return empty if pdfminer unavailable
        return ""
    except Exception:
        return ""


def scrape_with_crawl(base_url):
    """Scrape main page and crawl related pages using scored BFS"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    visited = set()
    urls_to_visit = [base_url]
    all_snippets = []

    # BFS up to depth 2 or max 6 pages
    max_pages = 6
    while urls_to_visit and len(visited) < max_pages:
        current_url = urls_to_visit.pop(0)
        if current_url in visited:
            continue
        visited.add(current_url)

        try:
            # PDF handling
            if current_url.lower().endswith('.pdf'):
                pdf_text = extract_text_from_pdf_url(current_url)
                if pdf_text:
                    all_snippets.append((current_url, pdf_text))
                continue

            response = requests.get(current_url, headers=headers, timeout=10)
            response.raise_for_status()

            text, soup = extract_text_from_html(response.content)
            all_snippets.append((current_url, text))

            # On first page, enqueue top related links
            if current_url == base_url:
                related = find_related_pages(soup, base_url)
                # extend preserving score order
                for r in related:
                    if r not in visited and r not in urls_to_visit:
                        urls_to_visit.append(r)
            else:
                # also add other candidate links discovered on page (scored)
                for link in soup.find_all('a', href=True):
                    absolute_url = urljoin(current_url, link.get('href'))
                    if urlparse(absolute_url).netloc == urlparse(base_url).netloc and absolute_url not in visited:
                        if score_url(absolute_url) > 0 and absolute_url not in urls_to_visit:
                            urls_to_visit.append(absolute_url)
        except Exception as e:
            continue

    # Return list of (url, text) tuples
    return all_snippets

try:
    # Fetch main page and related pages (returns list of (url,text))
    snippets = scrape_with_crawl(base_url)

    # Pre-extract candidate blocks using regex to reduce LLM input
    HAPPY_HOUR_REGEX = re.compile(r"(happy hour|hh).*?(\d{1,2}(?::\d{2})?\s*(am|pm)?\s*[-–to]+\s*\d{1,2}(?::\d{2})?\s*(am|pm)?)", re.IGNORECASE | re.DOTALL)
    candidates = []
    for (u, txt) in snippets:
        for m in HAPPY_HOUR_REGEX.finditer(txt):
            excerpt = m.group(0)
            candidates.append({"url": u, "text": excerpt})

    # If no candidates found, fall back to short page snippets
    if not candidates:
        for (u, txt) in snippets:
            candidates.append({"url": u, "text": txt[:2000]})

    # Build compact prompt using candidates (limit to first 8 candidates)
    prompt_blocks = []
    for c in candidates[:8]:
        prompt_blocks.append(f"URL: {c['url']}\n---\n{c['text']}")
    user_payload = "\n\n".join(prompt_blocks)

    # Use GPT-4o-mini to extract happy hour information from candidate blocks
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant that extracts happy hour information from website text. Return valid JSON only."
            },
            {
                "role": "user",
                "content": f"""Extract ONLY explicit happy hour information from the following text blocks. For each happy hour period, return:
- days: Array of days of the week (use full names: Monday, Tuesday, etc.)
- startTime: Start time in 24-hour HH:MM format
- endTime: End time in 24-hour HH:MM format
- deals: Array of deal descriptions (optional)
- sourceUrl: the URL where this text came from

Return in this JSON format:
{{
    "happyHours": [
        {{
            "days": ["Monday", "Tuesday"],
            "startTime": "15:00",
            "endTime": "18:00",
            "deals": ["$5 select beers", "Half-price appetizers"],
            "sourceUrl": "https://..."
        }}
    ]
}}

If no happy hour information is found, return: {{"happyHours": []}}

Text blocks (only use these):
{user_payload}"""
            }
        ]
    )
    
    # Parse the response
    response_text = completion.choices[0].message.content
    
    # Try to extract JSON from the response
    try:
        result = json.loads(response_text)
    except:
        # Try to find JSON in markdown code blocks
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group(1))
        else:
            result = {"happyHours": []}
    
    print(json.dumps(result))
    
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
