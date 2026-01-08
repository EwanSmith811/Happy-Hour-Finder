import { scrapeWithGPT4oMini, resetCostTracker } from "../src/lib/agenticScraper";

async function main() {
  resetCostTracker();
  const url = process.argv[2] || "https://www.unionbear.com/";
  console.log(`Running agentic scraper for: ${url}`);
  try {
    const res = await scrapeWithGPT4oMini(url);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Scrape failed:', err);
    process.exit(1);
  }
}

main();
