import FirecrawlApp from "firecrawl";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { getNearbyVenuesForZipcodes, VenueLocation } from "../src/lib/googlePlaces";

const HappyHourSchema = z.object({
  hasHappyHour: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  day: z.string().optional(),
  days: z.array(z.string()).optional(),
  deals: z.array(z.string()).optional(),
  locationName: z.string().optional(),
  happyHour: z.any().optional(), // Allow any format
  happyHours: z.any().optional(), // Allow flexible array formats
});

const dayMap: Record<string, string> = {
  sunday: "Sun",
  sun: "Sun",
  monday: "Mon",
  mon: "Mon",
  tuesday: "Tue",
  tue: "Tue",
  wednesday: "Wed",
  wed: "Wed",
  thursday: "Thu",
  thu: "Thu",
  friday: "Fri",
  fri: "Fri",
  saturday: "Sat",
  sat: "Sat",
};

const normalizeDays = (raw: any): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((d) => (typeof d === "string" ? d : ""))
      .map((d) => d.trim())
      .map((d) => dayMap[d.toLowerCase()] || d)
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return normalizeDays(raw.split(/[,\/]|\s+/));
  }
  return [];
};

const ScrapedVenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  website: z.string().optional(),
  rating: z.number().optional(),
  userRatingsTotal: z.number().optional(),
  happyHours: z
    .array(
      z.object({
        days: z.array(z.string()),
        startTime: z.string(),
        endTime: z.string(),
        deals: z.array(z.string()).optional(),
      })
    )
    .optional(),
  type: z.enum(["brewery", "bar", "restaurant"]).default("bar"),
});

type ScrapedVenue = z.infer<typeof ScrapedVenueSchema>;

/**
 * Scrape happy hour information from a website using Firecrawl
 */
async function scrapeHappyHourData(venueName: string, website: string) {
  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY || "" });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Keep the path list short to reduce 429s from Firecrawl; expand only if needed
  const candidatePaths = [
    "",
    "/happy-hour",
    "/happyhour",
    "/specials",
    "/menu",
    "/menus",
    "/drinks",
  ];
  const targets = Array.from(
    new Set(
      candidatePaths.map((p) => {
        try {
          return new URL(p || "/", website).toString();
        } catch {
          return website;
        }
      })
    )
  );

  let rateLimitHits = 0;

  for (const target of targets) {
    try {
      console.log(`  Scraping: ${target}`);

      const result = await app.scrapeUrl(target, {
        formats: ["json"],
        jsonOptions: { schema: HappyHourSchema as any },
        timeout: 30000,
        waitFor: 3000,
        onlyMainContent: false,
      });

      const payload = Array.isArray((result as any)?.data?.json)
        ? (result as any).data.json[0]
        : (result as any)?.data?.json;

      const parsed = HappyHourSchema.safeParse(payload ?? {});
      if (!parsed.success) continue;

      const source = parsed.data;
      const happyHours = source.happyHours
        ? source.happyHours
        : source.startTime && source.endTime
          ? [
              {
                days: source.days ?? (source.day ? [source.day] : []),
                startTime: source.startTime,
                endTime: source.endTime,
                deals: source.deals ?? [],
              },
            ]
          : [];

      const normalized = happyHours
        .map((hh) => ({
          days: normalizeDays(hh.days ?? (hh.day ? [hh.day] : [])),
          startTime: hh.startTime ?? "",
          endTime: hh.endTime ?? "",
          deals: Array.isArray(hh.deals) ? hh.deals : [],
        }))
        .filter((hh) => hh.days.length > 0 && hh.startTime && hh.endTime);

      if (normalized.length) {
        console.log(`    ✓ Found ${normalized.length} happy hour periods`);
        return normalized;
      }
    } catch (error: any) {
      const status = error?.statusCode;
      console.error(`    ✗ Error scraping ${target}:`, error);
      if (status === 429) {
        rateLimitHits += 1;
        await sleep(4000);
        if (rateLimitHits >= 2) {
          console.warn("    Stopping scrape early due to repeated 429s");
          break;
        }
      }
      continue;
    }
  }

  console.log(`    ⚠ No happy hour data found`);
  return null;
}

/**
 * Main refresh function
 */
async function refreshData() {
  console.log("🔄 Starting Happy Hour Data Refresh...\n");

  const targetZipcodes = ["75025"];
  const radiusMeters = 5000; // 5km (~3 miles)

  console.log(`📍 Searching for venues in zipcodes: ${targetZipcodes.join(", ")}`);
  console.log(`📏 Search radius: ${radiusMeters}m\n`);

  // Step 1: Discover venues using Google Places API
  const discoveredVenues = await getNearbyVenuesForZipcodes(targetZipcodes, radiusMeters);

  if (discoveredVenues.length === 0) {
    console.error("❌ No venues found. Check your API keys and zipcodes.");
    process.exit(1);
  }

  console.log(`\n✓ Discovered ${discoveredVenues.length} venues\n`);

  // Step 2: Scrape happy hour data for each venue
  console.log("🕷️  Scraping happy hour data...\n");
  const scrapedVenues: ScrapedVenue[] = [];

  for (let i = 0; i < discoveredVenues.length; i++) {
    const venue = discoveredVenues[i];
    if (!venue.website) {
      console.log(`  ⚠ Skipping ${venue.name} (no website to scrape)`);
      continue;
    }
    console.log(`[${i + 1}/${discoveredVenues.length}] ${venue.name}`);

    const scrapedVenue: ScrapedVenue = {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      website: venue.website,
      rating: venue.rating,
      userRatingsTotal: venue.userRatingsTotal,
      type: (venue as any).type ?? "bar",
    };

    // Try to scrape happy hour data if website is available
    if (venue.website) {
      const happyHours = await scrapeHappyHourData(venue.name, venue.website);
      if (happyHours) {
        scrapedVenue.happyHours = happyHours;
      }
    } else {
      console.log(`  ⚠ No website found, skipping scraping`);
    }

    scrapedVenues.push(scrapedVenue);

    // Rate limiting: Wait 2 seconds between scrapes
    if (i < discoveredVenues.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Step 3: Save to venues.json
  const outputDir = path.join(process.cwd(), "public", "data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "venues.json");
  fs.writeFileSync(outputPath, JSON.stringify(scrapedVenues, null, 2));

  console.log(`\n✅ Success!`);
  console.log(`   Scraped ${scrapedVenues.length} venues`);
  console.log(`   Saved to: ${outputPath}`);
}

// Run the script
refreshData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
