import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { getNearbyVenuesForZipcodes } from "@/lib/googlePlaces";
import { checkRateLimit, reserveBudget, getBudgetStatus } from "@/lib/apiGuard";

interface HappyHour {
  days: string[];
  startTime: string;
  endTime: string;
  deals?: string[];
}

interface ScrapedVenue {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  happyHours?: HappyHour[];
  type: string;
}

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

/**
 * Execute Python scraper script and return parsed result
 */
async function scrapeWithPython(url: string): Promise<HappyHour[]> {
  return new Promise((resolve, _reject) => {
    const scriptPath = path.join(process.cwd(), "scraper_simple.py");
    const timeout = 60000; // 60 seconds

    // Choose python: prefer venv, otherwise fallback to system 'python' or 'python3'
    const venvPython = path.join(process.cwd(), "venv", "Scripts", "python.exe");
    const candidates = [venvPython, "python", "python3"];
    let chosenPython: string | null = null;
    for (const p of candidates) {
      try {
        if (p === "python" || p === "python3") {
          chosenPython = p;
          break;
        }
        if (fs.existsSync(p)) {
          chosenPython = p;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    if (!chosenPython) chosenPython = "python";

    // Spawn python scraper process (do not log sensitive env values)
    console.log(`Spawning python scraper: ${chosenPython} ${scriptPath} ${url}`);

    const pythonProcess = spawn(chosenPython as string, [scriptPath, url], {
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
      },
    });

    let stdout = "";
    let stderr = "";

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      try {
        pythonProcess.kill();
      } catch (e) {}
      console.warn(`Python script timed out after ${timeout}ms for ${url}`);
      resolve([]);
    }, timeout);

    pythonProcess.on("close", (code) => {
      clearTimeout(timeoutId);

      if (code !== 0) {
        console.error(`Python script exited with code ${code} for ${url}`);
        console.error("stdout:", stdout || '<no stdout>');
        console.error("stderr:", stderr || '<no stderr>');
        // Fail softly: return empty result so whole scrape can proceed
        resolve([]);
        return;
      }

      try {
        const result = JSON.parse(stdout || "{}");

        if (result.error) {
          console.error("Python script returned error:", result.error);
          resolve([]);
          return;
        }

        const happyHours = result.happyHours || [];
        const normalized = happyHours
          .map((hh: any) => ({
            days: normalizeDays(hh.days ?? []),
            startTime: hh.startTime ?? "",
            endTime: hh.endTime ?? "",
            deals: Array.isArray(hh.deals) ? hh.deals : [],
          }))
          .filter((hh: HappyHour) => hh.days.length > 0 && hh.startTime && hh.endTime);

        resolve(normalized);
      } catch (parseError) {
        console.error("Failed to parse Python output for", url, "stdout:", stdout || '<no stdout>');
        resolve([]);
      }
    });

    pythonProcess.on("error", (error) => {
      clearTimeout(timeoutId);
      console.error("Failed to start Python process:", error);
      resolve([]);
    });
  });
}

/**
 * Scrape happy hour information using Python ScrapeGraphAI script
 */
async function scrapeHappyHourData(website: string): Promise<HappyHour[] | null> {
  try {
    const serviceUrl = process.env.SCRAPER_SERVICE_URL;
    if (serviceUrl) {
      try {
        const res = await fetch(serviceUrl.replace(/\/$/, "") + "/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: website }),
        });
        if (!res.ok) {
          console.warn(`Scraper service responded ${res.status} for ${website}`);
          return null;
        }
        const data = await res.json();
        const hh = data?.happyHours || [];
        return Array.isArray(hh) && hh.length > 0 ? hh : null;
      } catch (err) {
        console.warn("Failed to call external scraper service, falling back to local python", err);
        // fallthrough to python fallback
      }
    }

    const result = await scrapeWithPython(website);
    return result.length > 0 ? result : null;
  } catch (error: any) {
    console.error(`Error scraping ${website}:`, error?.message || error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get zipcode and radius from request body
    const body = await request.json();
    const zipcode = body.zipcode || "75025";
    const radiusMeters = body.radiusMeters || 5000;

    console.log(`🔄 Starting venue scrape for zipcode: ${zipcode}, radius: ${radiusMeters}m`);

    // Basic rate limiting: be permissive, only stop on extreme abuse.
    try {
      const rl = checkRateLimit(request, 120, 60_000); // hard cap 120 requests/min
      if (!rl.allowed) {
        // Block only when truly egregious
        return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
      // Warn if client is making a lot of requests but still under the hard cap
      if (rl.count > 60) {
        console.warn(`High request rate from client: ${rl.count} requests in window`);
      }
    } catch (e) {
      console.warn("Rate limit check failed, proceeding:", e);
    }

    // Step 1: Discover venues using Google Places API (just search the single zipcode)
    const discoveredVenues = await getNearbyVenuesForZipcodes([zipcode], radiusMeters);

    if (discoveredVenues.length === 0) {
      return NextResponse.json(
        { error: "No venues found", count: 0 },
        { status: 400 }
      );
    }

    console.log(`✓ Discovered ${discoveredVenues.length} venues`);

    // Budget protection: estimate cost per scraped site and reserve budget up-front
    // Estimation: $0.05 per website scrape + $0.10 fixed for Places call
    const perSiteUsd = 0.05;
    const placesUsd = 0.1;
    const estimatedTotal = Number((discoveredVenues.length * perSiteUsd + placesUsd).toFixed(4));
    const budget = getBudgetStatus();
    if (budget && typeof budget.spent !== 'undefined') {
      // Only abort when estimated cost would exceed twice the configured budget.
      const limit = Number(budget.limit || 1.0);
      if (budget.spent + estimatedTotal > limit * 2) {
        console.warn(`Aborting scrape: estimated cost $${estimatedTotal} would exceed 2x budget limit $${limit}`);
        return NextResponse.json({ error: "Scrape would exceed API budget limit" }, { status: 402 });
      }
    }
    const reserved = reserveBudget(estimatedTotal);
    if (!reserved) {
      // If reservation fails, log a warning but proceed; this is a soft guard.
      console.warn("Warning: failed to reserve estimated API budget, proceeding anyway.");
    }

    // Create a runId for this scrape run to help clients ignore stale progress
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Initialize progress file so clients don't pick up stale progress from
    // previous runs. Include runId and set current to 0 and done false before starting scraping.
    try {
      const progPath = path.join(process.cwd(), "public", "data", "scrape-progress.json");
      fs.writeFileSync(progPath, JSON.stringify({ runId, current: 0, total: discoveredVenues.length, done: false }, null, 2));
    } catch (e) {
      console.warn("Failed to initialize scrape progress file", e);
    }

    // Step 2: Scrape happy hour data
    const scrapedVenues: ScrapedVenue[] = [];

    for (let i = 0; i < discoveredVenues.length; i++) {
      const venue = discoveredVenues[i];
      console.log(`Scraping [${i + 1}/${discoveredVenues.length}] ${venue.name}`);

      const scrapedVenue: ScrapedVenue = {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        lat: venue.lat,
        lng: venue.lng,
        website: venue.website,
        rating: venue.rating,
        userRatingsTotal: venue.userRatingsTotal,
        type: (venue as any).type || "bar",
      };

      // Scrape happy hour data if website exists
      if (venue.website) {
        const happyHours = await scrapeHappyHourData(venue.website);
        if (happyHours && happyHours.length > 0) {
          scrapedVenue.happyHours = happyHours;
        } else {
          scrapedVenue.happyHours = [];
        }
      } else {
        scrapedVenue.happyHours = [];
      }

      scrapedVenues.push(scrapedVenue);

      // Write progress file so clients can poll progress
      try {
        const progPath = path.join(process.cwd(), "public", "data", "scrape-progress.json");
        const prog = { runId, current: i + 1, total: discoveredVenues.length };
        fs.writeFileSync(progPath, JSON.stringify(prog, null, 2));
      } catch (e) {
        console.warn("Failed to write scrape progress", e);
      }

      // Rate limiting
      if (i < discoveredVenues.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Step 3: Merge with existing venues.json and save
    const outputDir = path.join(process.cwd(), "public", "data");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "venues.json");

    let existing: any[] = [];
    try {
      if (fs.existsSync(outputPath)) {
        const content = fs.readFileSync(outputPath, "utf-8");
        try {
          existing = JSON.parse(content || "[]");
        } catch (e) {
          // Attempt safe cleanup of accidental leading/trailing characters
          const cleaned = (content || "").replace(/^[^\[{]*/, "").trim();
          try {
            existing = JSON.parse(cleaned || "[]");
            // Overwrite the corrupted file with cleaned JSON as a backup
            fs.writeFileSync(outputPath + ".repair", JSON.stringify(existing, null, 2));
            console.warn("Recovered venues.json content and wrote a .repair backup");
          } catch (e2) {
            console.error("Failed to parse existing venues.json, aborting scrape to avoid data loss", e, e2);
            return NextResponse.json({ error: "Invalid venues.json - aborting scrape to avoid overwriting existing data" }, { status: 500 });
          }
        }
      }
    } catch (err) {
      console.warn("Failed to read existing venues.json, proceeding with empty list", err);
      existing = [];
    }

    // Build map of existing by normalized name
    const normalize = (s: string) => (s || "").trim().toLowerCase();
    const existingMap: Record<string, any> = {};
    for (const v of existing) {
      const key = normalize(v.name || v.displayName || "");
      if (!key) continue;
      existingMap[key] = v;
    }

    // Merge: user-provided entries (id startsWith 'user-') are sacred; scraped entries can replace other scraped entries
    for (const sv of scrapedVenues) {
      const key = normalize(sv.name);
      if (!key) continue;
      const existingEntry = existingMap[key];

      // Preserve user-provided entries
      if (existingEntry && existingEntry.id && existingEntry.id.toString().startsWith("user-")) {
        continue;
      }

      const isRestaurant = (sv.type || "").toString().toLowerCase() === "restaurant";
      const hasHappyHours = Array.isArray(sv.happyHours) && sv.happyHours.length > 0;
      if (isRestaurant && !hasHappyHours) {
        console.log(`- Skipping scraped restaurant without happy hours: ${sv.name}`);
        continue;
      }

      // If we already have a scraped entry, only replace it when the new
      // happyHours are meaningfully different (and avoid overwriting with empty arrays)
      if (existingEntry && !(existingEntry.id && existingEntry.id.toString().startsWith("user-"))) {
        const oldHH = existingEntry.happyHours || [];
        const newHH = sv.happyHours || [];
        const oldStr = JSON.stringify(oldHH || []);
        const newStr = JSON.stringify(newHH || []);

        if (!hasHappyHours) {
          // Don't replace existing scraped entry with an empty result
          continue;
        }

        if (oldStr === newStr) {
          // No change detected, skip replacing
          continue;
        }
        // otherwise proceed to replace
      }

      // Add or replace scraped entry
      const entry: any = {
        id: sv.id,
        name: sv.name,
        address: sv.address,
        lat: sv.lat,
        lng: sv.lng,
        website: sv.website,
        rating: sv.rating,
        userRatingsTotal: sv.userRatingsTotal,
        type: sv.type || "bar",
      };

      if (hasHappyHours) entry.happyHours = sv.happyHours;

      existingMap[key] = entry;
    }

    // Build final arrays: user entries first (preserve original order), then scraped entries sorted by brewery priority and rating
    const userEntries = existing.filter((v: any) => v.id && v.id.toString().startsWith("user-"));
    const scrapedMapKeys = Object.keys(existingMap).filter((k) => !userEntries.some((u: any) => normalize(u.name) === k));
    const scrapedEntries = scrapedMapKeys.map((k) => existingMap[k]);

    const isBreweryRelated = (name: string) => {
      const lowerName = (name || "").toLowerCase();
      return (
        lowerName.includes("brewery") ||
        lowerName.includes("brewing") ||
        lowerName.includes("brewpub") ||
        lowerName.includes("taproom") ||
        lowerName.includes("tap room") ||
        lowerName.includes("brew") ||
        lowerName.includes("beer")
      );
    };

    scrapedEntries.sort((a: any, b: any) => {
      const aIsB = isBreweryRelated(a.name);
      const bIsB = isBreweryRelated(b.name);
      if (aIsB && !bIsB) return -1;
      if (!aIsB && bIsB) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });

    const merged = [...userEntries, ...scrapedEntries];

    fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));

    // mark progress complete
    try {
      const progPath = path.join(process.cwd(), "public", "data", "scrape-progress.json");
      fs.writeFileSync(progPath, JSON.stringify({ runId, current: scrapedVenues.length, total: discoveredVenues.length, done: true }, null, 2));
    } catch (e) {}

    console.log(`✅ Saved ${merged.length} venues to venues.json (${userEntries.length} user entries)`);

    return NextResponse.json({ success: true, count: merged.length, message: `Successfully scraped ${scrapedVenues.length} venues` });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to scrape venues", details: String(error) },
      { status: 500 }
    );
  }
}
