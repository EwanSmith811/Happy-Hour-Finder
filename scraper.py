import sys
import json
import os
from scrapegraphai.graphs import SmartScraperGraph

def run_scrape(target_url):
    # Get API key from environment variable
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print(json.dumps({"error": "OPENAI_API_KEY not found in environment"}), file=sys.stderr)
        sys.exit(1)
    
    # This config uses the cheap 4o-mini model
    graph_config = {
        "llm": {
            "api_key": api_key,
            "model": "openai/gpt-4o-mini",
            "temperature": 0,
        },
        "verbose": False,  # Set to True for debugging
        "headless": True,
    }

    # The prompt is Goal-Oriented, not Step-Oriented
    prompt = (
        "Extract happy hour information. Return a JSON object with this structure: "
        '{"happyHours": [{"days": ["Mon", "Tue"], "startTime": "15:00", "endTime": "18:00", "deals": ["Pints $3"]}]}. '
        "Days must use 3-letter abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun). "
        "Times must be 24-hour format HH:MM. If no happy hour found, return empty array."
    )

    try:
        smart_scraper_graph = SmartScraperGraph(
            prompt=prompt,
            source=target_url,
            config=graph_config
        )

        result = smart_scraper_graph.run()
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.unionbear.com/"
    run_scrape(url)