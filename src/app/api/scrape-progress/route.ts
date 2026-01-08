import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET(req: NextRequest) {
  try {
    const p = path.join(process.cwd(), "public", "data", "scrape-progress.json");
    if (!fs.existsSync(p)) return NextResponse.json({ runId: null, current: 0, total: 0, done: false });
    const content = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(content || "{}");
    return NextResponse.json({ runId: parsed.runId || null, current: parsed.current || 0, total: parsed.total || 0, done: !!parsed.done });
  } catch (err) {
    console.error("scrape-progress error", err);
    return NextResponse.json({ current: 0, total: 0, done: false });
  }
}
