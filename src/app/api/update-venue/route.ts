import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id?.toString();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const allowedFields = ["name", "address", "website", "weeklySchedule", "selectedDays", "master"];

    const updates: any = {};
    for (const k of allowedFields) {
      if (k in body) updates[k] = body[k];
    }

    // If weeklySchedule/selectedDays/master provided, convert to happyHours (same logic as add-brewery)
    if (updates.weeklySchedule && updates.selectedDays) {
      try {
        const weeklySchedule = updates.weeklySchedule as Record<string, any>;
        const selectedDays = updates.selectedDays as Record<string, boolean>;
        const master = updates.master as { start?: string; end?: string; deals?: any[] } | undefined;

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

          if (!start || !end) continue;
          const key = `${start}__${end}__${deals.join("||")}`;
          if (!groups[key]) groups[key] = { days: [], start, end, deals };
          groups[key].days.push(d);
        }

        const happyHours: any[] = [];
        for (const k of Object.keys(groups)) {
          const g = groups[k];
          happyHours.push({ days: g.days, startTime: g.start, endTime: g.end, deals: g.deals.length ? g.deals : undefined });
        }

        updates.happyHours = happyHours.length ? happyHours : [];
      } catch (e) {
        // if conversion fails, don't block update
        console.warn('Failed to convert weeklySchedule to happyHours', e);
      }
    }

    const dataPath = path.join(process.cwd(), "public", "data", "venues.json");
    if (!fs.existsSync(dataPath)) {
      return NextResponse.json({ error: "venues.json not found" }, { status: 404 });
    }

    const content = fs.readFileSync(dataPath, "utf-8");
    let venues: any;
    try {
      venues = JSON.parse(content || "[]");
    } catch (e) {
      // Attempt a safe cleanup of any accidental leading characters (BOM, stray quotes, logs)
      const cleaned = content.replace(/^[^\[{]*/, "").trim();
      try {
        venues = JSON.parse(cleaned || "[]");
      } catch (e2) {
        console.error("Failed to parse venues.json", e, e2);
        return NextResponse.json({ error: "Invalid venues.json format" }, { status: 500 });
      }
    }

    // Prevent duplicate names
    if (updates.name) {
      const dup = venues.find((v: any) => v.name?.trim().toLowerCase() === updates.name.trim().toLowerCase() && v.id !== id);
      if (dup) {
        return NextResponse.json({ error: "Duplicate venue name" }, { status: 400 });
      }
    }

    // If editing a user-provided venue, update it in-place
    if (id.startsWith("user-")) {
      let found = false;
      const next = venues.map((v: any) => {
        if (v.id === id) {
          found = true;
          return { ...v, ...updates };
        }
        return v;
      });
      if (!found) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
      fs.writeFileSync(dataPath, JSON.stringify(next, null, 2));
      const updated = next.find((v: any) => v.id === id);
      return NextResponse.json({ success: true, venue: updated });
    }

    // If editing a scraped venue (non-user id), create a new user-provided venue and remove the scraped one
    const existing = venues.find((v: any) => v.id === id);
    if (!existing) return NextResponse.json({ error: "Original venue not found" }, { status: 404 });

    // Prevent duplicate names against other user entries
    if (updates.name) {
      const dup = venues.find((v: any) => v.name?.trim().toLowerCase() === updates.name.trim().toLowerCase() && v.id !== id);
      if (dup && dup.id?.toString().startsWith("user-")) {
        return NextResponse.json({ error: "A user-provided venue with that name already exists" }, { status: 400 });
      }
    }

    // Build new user venue preserving lat/lng from existing scraped entry
    const newVenue: any = {
      id: `user-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: (updates.name || existing.name || "").toString(),
      address: (updates.address || existing.address || "").toString(),
      website: (updates.website || existing.website) || undefined,
      lat: existing.lat || null,
      lng: existing.lng || null,
      distanceMiles: existing.distanceMiles,
      type: "brewery",
      happyHours: updates.happyHours ?? existing.happyHours ?? [],
      weeklySchedule: updates.weeklySchedule ?? undefined,
      selectedDays: updates.selectedDays ?? undefined,
      master: updates.master ?? undefined,
    };

    // Remove original scraped entry and add new user entry to front
    const filtered = venues.filter((v: any) => v.id !== id);
    filtered.unshift(newVenue);
    fs.writeFileSync(dataPath, JSON.stringify(filtered, null, 2));
    return NextResponse.json({ success: true, venue: newVenue });
  } catch (err) {
    console.error("update-venue error", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
