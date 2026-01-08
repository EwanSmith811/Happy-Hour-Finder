import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return km * 0.621371; // miles
}

async function geocodeAddress(address: string) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
      console.error("Missing Google Maps API key for geocoding");
      return null;
    }
    const encoded = encodeURIComponent(address);
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch (error) {
    console.error("Geocode error:", error);
    return null;
  }
}

async function geocodeZip(zipcode: string) {
  return geocodeAddress(`${zipcode}, USA`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name: string = (body.name || "").trim();
    const address: string = (body.address || "").trim();
    const website: string | undefined = body.website ? String(body.website).trim() : undefined;
    const days: string[] = Array.isArray(body.days) ? body.days : [];
    const zipcode: string | undefined = body.zipcode ? String(body.zipcode) : undefined;

    if (!name || !address) {
      return NextResponse.json({ error: "Name and address required" }, { status: 400 });
    }

    // Try to geocode the provided address
    const coords = await geocodeAddress(address);

    let distanceMiles: number | null = null;
    if (coords && zipcode) {
      const zipCoords = await geocodeZip(zipcode);
      if (zipCoords) {
        const d = haversineDistanceMiles(coords.lat, coords.lng, zipCoords.lat, zipCoords.lng);
        distanceMiles = Math.round(d * 10) / 10;
      }
    }

    // If address invalid, set placeholder distance 10 miles
    if (!coords) {
      distanceMiles = 10;
    }

    // Build happyHours from weeklySchedule/master/selectedDays if provided, otherwise fall back to `days`.
    const weeklySchedule = body.weeklySchedule as Record<string, any> | undefined;
    const selectedDays = body.selectedDays as Record<string, boolean> | undefined;
    const master = body.master as { start?: string; end?: string; deals?: any[] } | undefined;

    const happyHours: Array<{ days: string[]; startTime: string; endTime: string; deals?: string[] }> = [];

    if (weeklySchedule && selectedDays) {
      // Group days by identical schedule (start/end/deals) so they can be merged into a single HappyHour entry
      const groups: Record<string, { days: string[]; start: string; end: string; deals: string[] }> = {};
      const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      for (const d of DAYS) {
        if (!selectedDays[d]) continue;
        const sch = weeklySchedule[d];
        let start = "";
        let end = "";
        let deals: string[] = [];

        if (sch && sch.mode === "override") {
          start = sch.start || "";
          end = sch.end || "";
          deals = Array.isArray(sch.deals) ? sch.deals.map((x: any) => String(x.description || x)) : [];
        } else if (master) {
          start = master.start || "";
          end = master.end || "";
          deals = Array.isArray(master.deals) ? master.deals.map((x: any) => String(x.description || x)) : [];
        }

        if (!start || !end) continue; // skip incomplete entries

        const key = `${start}__${end}__${deals.join("||")}`;
        if (!groups[key]) groups[key] = { days: [], start, end, deals };
        groups[key].days.push(d);
      }

      for (const k of Object.keys(groups)) {
        const g = groups[k];
        happyHours.push({ days: g.days, startTime: g.start, endTime: g.end, deals: g.deals.length ? g.deals : undefined });
      }
    }

    const newVenue: any = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name,
      address,
      website: website || undefined,
      // legacy days field kept for compatibility
      days: days || [],
      happyHours: happyHours.length ? happyHours : undefined,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      distanceMiles: distanceMiles,
      type: "brewery",
    };

    const outputDir = path.join(process.cwd(), "public", "data");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "venues.json");

    let existing = [] as any[];
    try {
      if (fs.existsSync(outputPath)) {
        const content = fs.readFileSync(outputPath, "utf-8");
        existing = JSON.parse(content || "[]");
      }
    } catch (err) {
      console.error("Failed to read venues.json, proceeding with empty list", err);
      existing = [];
    }

    // Prevent duplicate names (case-insensitive), but allow replacing scraped entries
    const nameKey = name.trim().toLowerCase();
    const dupIndex = existing.findIndex((v: any) => (v.name || "").trim().toLowerCase() === nameKey);
    if (dupIndex !== -1) {
      const dup = existing[dupIndex];
      const isUser = dup.id && dup.id.toString().startsWith("user-");
      if (isUser) {
        return NextResponse.json({ error: "A user-provided venue with that name already exists" }, { status: 400 });
      }

      // Existing is a scraped entry: replace it with the new user-provided venue and move to front
      existing.splice(dupIndex, 1);
      existing.unshift(newVenue);
    } else {
      // No duplicate: insert user venue at front
      existing.unshift(newVenue);
    }

    fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2));

    return NextResponse.json({ success: true, venue: newVenue });
  } catch (error) {
    console.error("add-brewery error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
