import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const zip = searchParams.get("zip");
    if (!zip) return NextResponse.json({ error: "missing zip" }, { status: 400 });

    const geoApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!geoApiKey) {
      console.error("server missing GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
      return NextResponse.json({ error: "server missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
    }

    const formatted = `${zip}, USA`;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(formatted)}&key=${geoApiKey}`;

    const resp = await fetch(url);
    const text = await resp.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error('Failed parsing geocode response text', e, text);
    }
    if (!resp.ok) {
      console.error('Geocode API responded with error', resp.status, text);
      return NextResponse.json({ error: `geocode failed: ${resp.status}`, details: text }, { status: 502 });
    }

    if (data && data.results && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      return NextResponse.json({ lat: loc.lat, lng: loc.lng });
    }

    console.warn(`No geocode results for zip: ${zip}`, data);
    return NextResponse.json({ error: "no results", details: data }, { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: "exception", details: String(err?.message || err) }, { status: 500 });
  }
}
