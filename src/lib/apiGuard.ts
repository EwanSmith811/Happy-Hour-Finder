import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

// Simple in-memory rate limiter map: key -> { count, windowStart }
const rateMap = new Map<string, { count: number; windowStart: number }>();

function getClientKey(req: NextRequest) {
  // Prefer X-Forwarded-For header (when behind proxy), else fall back to ip-like header
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "unknown";
}

export function checkRateLimit(req: NextRequest, maxRequests = 10, windowMs = 60_000) {
  try {
    const key = getClientKey(req);
    const now = Date.now();
    const entry = rateMap.get(key);
    if (!entry) {
      rateMap.set(key, { count: 1, windowStart: now });
      return { allowed: true, count: 1 };
    }
    if (now - entry.windowStart > windowMs) {
      // reset
      rateMap.set(key, { count: 1, windowStart: now });
      return { allowed: true, count: 1 };
    }
    if (entry.count >= maxRequests) return { allowed: false, count: entry.count };
    entry.count += 1;
    rateMap.set(key, entry);
    return { allowed: true, count: entry.count };
  } catch (e) {
    // Fail-open on unexpected errors
    return { allowed: true, count: 0 };
  }
}

const budgetPath = path.join(process.cwd(), "public", "data", "api-budget.json");

export function readBudget() {
  try {
    if (!fs.existsSync(budgetPath)) {
      const initial = { spent: 0, limit: 1.0, currency: "USD" };
      fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
      fs.writeFileSync(budgetPath, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(budgetPath, "utf-8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    console.error("Failed to read api budget", e);
    return { spent: 0, limit: 1.0, currency: "USD" };
  }
}

export function reserveBudget(amountUsd: number) {
  try {
    const cur = readBudget();
    const spent = Number(cur.spent || 0);
    const limit = Number(cur.limit || 1.0);
    if (spent + amountUsd > limit) return false;
    const updated = { ...cur, spent: +(spent + amountUsd).toFixed(4) };
    fs.writeFileSync(budgetPath, JSON.stringify(updated, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to reserve budget", e);
    return false;
  }
}

export function resetBudget() {
  try {
    const initial = { spent: 0, limit: 1.0, currency: "USD" };
    fs.writeFileSync(budgetPath, JSON.stringify(initial, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

export function getBudgetStatus() {
  return readBudget();
}
