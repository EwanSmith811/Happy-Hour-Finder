# Project: Happy Hour Finder (Weekly Scrape Edition)

## 1. Data Strategy
- Create a file at `data/venues.json` to act as the "Local Cache".
- Create a script `scripts/refresh-data.ts`.
- The script uses Firecrawl (AI scraping) to visit a `URL_LIST` and output structured JSON.
- FRONTEND: Reads `venues.json` directly. No database calls.

## 2. The Logic (lib/utils.ts)
- `checkHHStatus(venue)`: Logic to see if 'now' matches the venue's HH window.
- `haversineDistance(zipCoords, venueCoords)`: Logic to filter by radius.

## 3. The Visuals
- Obsidian Dark Theme.
- Glassmorphism Cards.
- Pulse Animation: 
  - Red Pulse = Closing in < 30m.
  - Amber Pulse = Starting in < 30m.

## 4. The Implementation Task
1. Build the `scripts/refresh-data.ts` using Firecrawl.
2. Build a Next.js Server Component that imports `venues.json` and filters it.
3. Integrate Google Maps with a dark theme style.