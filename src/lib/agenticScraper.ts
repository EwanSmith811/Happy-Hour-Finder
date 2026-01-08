import OpenAI from "openai";
import { z } from "zod";

interface HappyHourResult {
  days: string[];
  startTime: string;
  endTime: string;
  deals?: string[];
}

interface ScrapeResult {
  happyHours: HappyHourResult[];
  cost: number;
}

let totalCost = 0;
const MAX_BUDGET = 1.0; // $1.00 maximum per run

/**
 * Prune HTML to reduce tokens: remove scripts, styles, SVGs, and comments
 */
function pruneHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert HTML to simplified markdown-like text for lower token usage
 */
function htmlToSimpleText(html: string): string {
  const pruned = pruneHtml(html);
  // Strip all remaining tags but keep text
  return pruned
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // Cap at ~8k chars to limit tokens
}

/**
 * Extract candidate links from HTML that look relevant (menu, happy, special, deals)
 */
function extractCandidateLinks(html: string, baseUrl: string): string[] {
  const matches = [...html.matchAll(/href=["']([^"']+)["']/gi)];
  const links = matches.map((m) => m[1]);
  const keywords = ["happy", "hour", "menu", "special", "deal", "offer"];
  const resolved: string[] = [];
  for (const l of links) {
    try {
      const lower = l.toLowerCase();
      if (!keywords.some((k) => lower.includes(k))) continue;
      const url = new URL(l, baseUrl).toString();
      if (!resolved.includes(url)) resolved.push(url);
    } catch (e) {
      continue;
    }
    if (resolved.length >= 3) break;
  }
  return resolved;
}

/**
 * Normalize time strings to HH:MM 24-hour format. Returns null if cannot parse.
 */
function normalizeTime(input: string | undefined | null): string | null {
  if (!input) return null;
  const m = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridian = m[3] ? m[3].toLowerCase() : undefined;
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

/**
 * Fetch with timeout and one retry
 */
async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    clearTimeout(id);
    // one retry
    const controller2 = new AbortController();
    const id2 = setTimeout(() => controller2.abort(), timeoutMs);
    try {
      const res2 = await fetch(url, { signal: controller2.signal, headers: { "User-Agent": "Mozilla/5.0" } });
      clearTimeout(id2);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      return res2;
    } catch (err2) {
      clearTimeout(id2);
      throw err2;
    }
  }
}

/**
 * Calculate approximate cost for GPT-4o-mini
 * Input: $0.150 / 1M tokens
 * Output: $0.600 / 1M tokens
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 0.15;
  const outputCost = (outputTokens / 1_000_000) * 0.6;
  return inputCost + outputCost;
}

/**
 * Scrape happy hour data using GPT-4o-mini with cost tracking
 */
export async function scrapeWithGPT4oMini(url: string): Promise<ScrapeResult> {
  if (totalCost >= MAX_BUDGET) {
    throw new Error(`Budget exceeded: $${totalCost.toFixed(4)} >= $${MAX_BUDGET}`);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    // Fetch the HTML for the main page
    let html = "";
    try {
      const response = await fetchWithTimeout(url, 15000);
      html = await response.text();
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err);
      return { happyHours: [], cost: 0 };
    }

    // Find up to 3 candidate links and fetch them too
    const candidateLinks = extractCandidateLinks(html, url);
    const pagesText: string[] = [html];
    for (const link of candidateLinks) {
      try {
        const r = await fetchWithTimeout(link, 15000);
        const t = await r.text();
        pagesText.push(t);
      } catch (err) {
        console.warn(`Could not fetch candidate link ${link}:`, err);
      }
    }

    // Also collect image alt text for possible menu indicators
    const imgAlts: string[] = [];
    try {
      const imgMatches = [...html.matchAll(/<img[^>]+>/gi)];
      for (const m of imgMatches) {
        const tag = m[0];
        const altMatch = tag.match(/alt=["']([^"']+)["']/i);
        if (altMatch) imgAlts.push(altMatch[1]);
      }
    } catch (e) {}

    // Simplify texts and extract candidate blocks using regex
    const simplifiedBlocks: string[] = [];
    const HAPPY_HOUR_REGEX = /(happy hour|hh)[\s\S]{0,120}?(\d{1,2}(:\d{2})?\s*(am|pm)?\s*[-–to]+\s*\d{1,2}(:\d{2})?\s*(am|pm)?)/gi;
    for (const p of pagesText) {
      const s = htmlToSimpleText(p);
      // push any regex matches as candidates
      const matches = [...s.matchAll(HAPPY_HOUR_REGEX)];
      if (matches.length) {
        for (const mm of matches) simplifiedBlocks.push(mm[0]);
      } else {
        simplifiedBlocks.push(s.slice(0, 2000)); // fallback snippet
      }
    }
    // include image alt text as small candidates
    for (const a of imgAlts) simplifiedBlocks.push(a.slice(0, 400));

    const combinedCandidates = simplifiedBlocks.slice(0, 8).join("\n\n");
    console.log(`  Candidates length: ${combinedCandidates.length}`);

    // Call GPT-4o-mini with strict JSON mode asking for sourceText and confidence
    const systemPrompt = `You are a happy hour extraction expert. Extract ONLY happy hour information from the provided text blocks. Return a JSON object with this exact structure:\n{\n  "happyHours": [\n    {\n      "days": ["Mon", "Tue"],\n      "startTime": "3pm",            // original text ok\n      "endTime": "6pm",\n      "normalizedStart": "15:00",   // normalized HH:MM (24-hour)\n      "normalizedEnd": "18:00",\n      "deals": ["Pints $3"],\n      "sourceText": "Exact quoted text from page",\n      "sourceUrl": "https://...",\n      "confidence": 0.0\n    }\n  ]\n}\n\nRules:\n- days must use 3-letter abbreviations: Mon, Tue, Wed, Thu, Fri, Sat, Sun\n- times may be raw but MUST include normalizedStart/normalizedEnd in HH:MM\n- include sourceText (quote) and sourceUrl for provenance\n- include confidence between 0.0 and 1.0\n- if no happy hour is found, return {"happyHours": []}\n- return ONLY valid JSON, no markdown or explanations`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Text blocks (only use these):\n\n${combinedCandidates}` },
      ],
      response_format: { type: "json_object" },
    });

    const choices = (completion as any).choices || [];
    const content = choices[0]?.message?.content;
    const usage = (completion as any).usage;

    if (!usage) {
      return { happyHours: [], cost: 0 };
    }

    const cost = calculateCost(usage.prompt_tokens, usage.completion_tokens);
    totalCost += cost;

    console.log(`  Tokens: ${usage.prompt_tokens} in, ${usage.completion_tokens} out`);
    console.log(`  Cost: $${cost.toFixed(4)} | Total: $${totalCost.toFixed(4)}`);

    // Parse result which may already be an object
    let parsed: any = null;
    if (typeof content === "object") parsed = content;
    else {
      try {
        parsed = JSON.parse(String(content || ""));
      } catch (e) {
        console.error("Failed to parse GPT response:", content);
        return { happyHours: [], cost };
      }
    }

    // Validate with Zod
    const HappyHourSchemaZ = z.object({
      days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])),
      startTime: z.string(),
      endTime: z.string(),
      normalizedStart: z.string().regex(/^\d{2}:\d{2}$/),
      normalizedEnd: z.string().regex(/^\d{2}:\d{2}$/),
      deals: z.array(z.string()).optional(),
      sourceText: z.string().min(1),
      sourceUrl: z.string().url().optional(),
      confidence: z.number().min(0).max(1),
    });
    const RootSchema = z.object({ happyHours: z.array(HappyHourSchemaZ) });

    try {
      const validated = RootSchema.parse(parsed);
      // Filter by confidence >= 0.6
      const finalHH = validated.happyHours.filter((hh: any) => hh.confidence >= 0.6);
      // final normalization enforcement (if model didn't provide normalized fields)
      const out: HappyHourResult[] = finalHH.map((hh: any) => ({
        days: hh.days,
        startTime: hh.normalizedStart || normalizeTime(hh.startTime) || hh.startTime,
        endTime: hh.normalizedEnd || normalizeTime(hh.endTime) || hh.endTime,
        deals: hh.deals,
      }));
      // ensure normalized format
      const filtered = out.filter((hh) => normalizeTime(hh.startTime) && normalizeTime(hh.endTime));
      return { happyHours: filtered, cost };
    } catch (valErr) {
      console.error("Validation failed for GPT output:", valErr);
      return { happyHours: [], cost };
    }
  } catch (error: any) {
    console.error(`Error scraping with GPT-4o-mini:`, error);
    return { happyHours: [], cost: 0 };
  }
}

/**
 * Reset cost tracker (call at the start of each scrape run)
 */
export function resetCostTracker() {
  totalCost = 0;
}

/**
 * Get current total cost
 */
export function getTotalCost(): number {
  return totalCost;
}
