import FirecrawlApp from "firecrawl";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["brewery", "restaurant", "bar"]).default("restaurant"),
  address: z.string().optional(),
  phone: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  happyHours: z.array(
    z.object({
      days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])),
      startTime: z.string(), // "HH:MM"
      endTime: z.string(), // "HH:MM"
      deals: z.array(z.string()).optional(),
    })
  ),
});

type Venue = z.infer<typeof VenueSchema>;

// Venue coordinates (for demo - in production, use Google Geocoding API)
const venueCoordinates: Record<string, { lat: number; lng: number }> = {
  "Union Bear": { lat: 40.7489, lng: -73.9680 }, // NYC
  "Holy Grail": { lat: 40.75, lng: -73.98 }, // NYC
  "Legacy Food Hall": { lat: 40.7128, lng: -74.006 }, // NYC
  "Armor Brewing": { lat: 42.7335, lng: -73.6974 }, // Troy, NY
  "Unlawful Assembly": { lat: 42.6526, lng: -73.7562 }, // Albany, NY
};

async function scrapeVenues() {
  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY || "" });

  const urls = [
    "https://www.unionbear.com/happy-hour",
    "https://www.holygrailpub.com/",
    "https://www.legacyfoodhall.com/bars/",
    "https://www.armorbrewing.com/",
    "https://www.unlawfulassembly.com/",
  ];

  const venues: Venue[] = [];
  let venueId = 1;

  for (const url of urls) {
    try {
      console.log(`Scraping ${url}...`);

      const scrapeResult = await app.scrapeUrl(url, {
        formats: ["json"],
        jsonOptions: {
          schema: z.object({
            venueName: z.string().optional(),
            type: z.enum(["brewery", "restaurant", "bar"]).optional(),
            address: z.string().optional(),
            phone: z.string().optional(),
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
          }) as any,
        },
      });

      const payload = Array.isArray((scrapeResult as any)?.data?.json)
        ? (scrapeResult as any).data.json[0]
        : (scrapeResult as any)?.data?.json;

      if (payload) {
        const parsed = payload as any;
        const venueName = parsed.venueName || `Venue ${venueId}`;
        const coords = venueCoordinates[venueName] || { lat: 40.7128, lng: -74.006 };

        const venue: Venue = {
          id: `venue-${venueId}`,
          name: venueName,
          type: parsed.type || "restaurant",
          address: parsed.address,
          phone: parsed.phone,
          lat: coords.lat,
          lng: coords.lng,
          happyHours: parsed.happyHours || [],
        };

        venues.push(venue);
        venueId++;
        console.log(`✓ Scraped: ${venueName}`);
      }
    } catch (error) {
      console.error(`✗ Error scraping ${url}:`, error);
    }
  }

  // Ensure output directory exists
  const outputDir = path.join(process.cwd(), "public", "data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write to venues.json
  const outputPath = path.join(outputDir, "venues.json");
  fs.writeFileSync(outputPath, JSON.stringify(venues, null, 2));
  console.log(`\n✓ Scraped ${venues.length} venues`);
  console.log(`✓ Data saved to ${outputPath}`);
}

scrapeVenues().catch(console.error);
