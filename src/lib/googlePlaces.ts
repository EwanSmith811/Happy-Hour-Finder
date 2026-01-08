import { z } from "zod";

const PlaceSchema = z.object({
  place_id: z.string(),
  name: z.string(),
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  website: z.string().optional(),
  vicinity: z.string().optional(),
  formatted_address: z.string().optional(),
  opening_hours: z
    .object({
      open_now: z.boolean().optional(),
      weekday_text: z.array(z.string()).optional(),
    })
    .optional(),
  rating: z.number().optional(),
  user_ratings_total: z.number().optional(),
});

type Place = z.infer<typeof PlaceSchema>;

export interface VenueLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: "brewery" | "restaurant" | "bar";
  website?: string;
  rating?: number;
  userRatingsTotal?: number;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
}

/**
 * Get coordinates from zip code using Google Geocoding API
 */
export async function getCoordinatesFromZip(zipcode: string): Promise<{
  lat: number;
  lng: number;
} | null> {
  try {
    // Format zipcode with country code for better accuracy
    const formattedAddress = `${zipcode}, USA`;
    const encodedAddress = encodeURIComponent(formattedAddress);
    
    const geoApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    if (!geoApiKey) {
      console.error("Missing GOOGLE_MAPS_API_KEY/NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for geocoding");
      return null;
    }

    // Use retrying fetch to avoid transient network/connect timeouts
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${geoApiKey}`;
    const response = await fetchWithRetry(url, { method: 'GET' }, 3, 8000);
    if (!response) {
      console.error("Geocoding fetch failed after retries");
      return null;
    }

    if (!response.ok) {
      console.error(`Geocoding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    }

    console.warn(`No results found for zip: ${zipcode}`);
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

/**
 * Helper: fetch with retries and timeout using AbortController
 */
async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, retries = 3, timeoutMs = 8000): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(id);
      return resp;
    } catch (err: any) {
      clearTimeout(id);
      const isLast = attempt === retries - 1;
      // If aborted due to timeout or network error, retry unless last
      console.warn(`fetch attempt ${attempt + 1} failed: ${err?.message || err}. ${isLast ? 'No more retries.' : 'Retrying...'} `);
      if (isLast) return null;
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      continue;
    }
  }
  return null;
}

/**
 * Find nearby venues (breweries and bars) using Google Places API (New) v1
 */
export async function getNearbyVenues(
  zipcode: string,
  radiusMeters: number = 5000
): Promise<VenueLocation[]> {
  try {
    // Step 1: Get coordinates from zip
    const coords = await getCoordinatesFromZip(zipcode);
    if (!coords) {
      console.error(`Could not find coordinates for zip: ${zipcode}`);
      return [];
    }

    console.log(`Found coordinates for ${zipcode}: ${coords.lat}, ${coords.lng}`);

    // Step 2: Search for bars, restaurants, and pubs using Places API (New) v1
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

    const buildBody = (usePrimary: boolean, maxResults: number = 20) =>
      usePrimary
        ? {
            // NOTE: the Places v1 API rejects unsupported types like 'brewery'.
            // Avoid asking for brewery/microbrewery/brewpub here; instead request
            // broader venue types and filter/score brewery candidates client-side.
            includedPrimaryTypes: ["bar", "pub", "american_restaurant", "restaurant", "cafe"],
            // Exclude obvious non-drinking place categories (use valid place types)
            excludedPrimaryTypes: ["fast_food_restaurant", "sandwich_shop", "coffee_shop"],
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: {
                  latitude: coords.lat,
                  longitude: coords.lng,
                },
                radius: radiusMeters,
              },
            },
          }
        : {
            // Fallback: avoid brewery-specific type tokens; use broad place types
            includedTypes: ["bar", "pub", "restaurant", "cafe"],
            excludedTypes: ["fast_food_restaurant", "sandwich_shop", "coffee_shop"],
            maxResultCount: 20,
            locationRestriction: {
              circle: {
                center: {
                  latitude: coords.lat,
                  longitude: coords.lng,
                },
                radius: radiusMeters,
              },
            },
          };

    const fetchPlaces = async (usePrimary: boolean) => {
      const resp = await fetchWithRetry(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.types",
          },
          body: JSON.stringify(buildBody(usePrimary)),
        },
        3,
        10000
      );
      if (!resp) {
        console.error(`Places API fetch failed after retries (${usePrimary ? "primary" : "types"})`);
        return null;
      }
      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Places API error (${usePrimary ? "primary" : "types"}): ${resp.status}`, errorText);
        return null;
      }
      return await resp.json();
    };

    let data = await fetchPlaces(true);
    if (!data || !Array.isArray((data as any).places) || (data as any).places.length === 0) {
      console.warn("Primary type search returned no places; retrying with includedTypes fallback");
      data = await fetchPlaces(false);
    }

    // If we received the capped number of results (e.g., 20) and later filtering
    // (e.g., removing Indian venues) would drop us below 20, attempt a larger
    // fetch to compensate for filtered-out entries, up to a safe cap.
    const placesArray = (data && Array.isArray((data as any).places)) ? (data as any).places : [];
    const looksIndianQuick = (p: any) => {
      try {
        const name = (p.displayName?.text || "").toString();
        const primaryType = (p as any).primaryType || "";
        const types = (p as any).types || [];
        const looksIndianType = (primaryType || "").toString().toLowerCase().includes("indian") || types.some((t: string) => (t || "").toLowerCase().includes("indian"));
        const looksIndianName = /\b(indian|biryani|tandoor|desi|bharat|curry)\b/i.test(name);
        return looksIndianType || looksIndianName;
      } catch (e) {
        return false;
      }
    };

    const totalReturned = placesArray.length;
    const filteredRemaining = placesArray.filter((p: any) => !looksIndianQuick(p)).length;
    if (totalReturned >= 20 && filteredRemaining < 20) {
      const expandTo = 60; // safe upper bound to request more
      console.log(`Results after quick filtering would be ${filteredRemaining} (<20). Expanding fetch to ${expandTo} results to compensate.`);
      const expanded = await fetchPlaces(true).catch(() => null);
      // If primary expanded didn't work, try types fallback expanded
      if (!expanded || !Array.isArray((expanded as any).places) || (expanded as any).places.length === 0) {
        console.log("Expanded primary fetch empty; trying expanded types fallback");
        data = await fetchPlaces(false).catch(() => null);
      } else {
        data = expanded;
      }
      // Note: fetchPlaces currently defaults to 20; if API supports larger max, buildBody uses param.
      // To actually request more, call fetchPlaces with second arg - but our helper above didn't pass it.
      // We'll attempt explicit expanded calls below using buildBody directly via fetchWithRetry.
      try {
        // Try explicit expanded primary call
        const expandedResp = await fetchWithRetry(
          "https://places.googleapis.com/v1/places:searchNearby",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.types",
            },
            body: JSON.stringify(buildBody(true, expandTo)),
          },
          3,
          12000
        );
        if (expandedResp && expandedResp.ok) {
          const expandedData = await expandedResp.json();
          if (expandedData && Array.isArray(expandedData.places) && expandedData.places.length > placesArray.length) {
            console.log(`Expanded fetch returned ${expandedData.places.length} places; using expanded results`);
            data = expandedData;
          }
        }
      } catch (e) {
        console.warn('Expanded fetch attempt failed:', e);
      }
    }

    if (!data || !Array.isArray((data as any).places)) {
      console.error("No places returned from Places API after both attempts");
      return [];
    }

    const allVenues: VenueLocation[] = [];

    // Debug: log all raw places returned
    if (data.places && Array.isArray(data.places)) {
      console.log(`Raw places returned: ${data.places.length}`);
      for (const place of data.places.slice(0, 5)) {
        console.log(`  - ${place.displayName?.text || 'Unknown'} (${(place as any).primaryType || 'no-type'})`);
      }
    }

    // Stronger brewery heuristic: check name, primary type, types array and website/url hints
    const isBreweryRelated = (name: string, primaryType?: string, types?: string[], website?: string) => {
      const lowerName = (name || "").toLowerCase();
      const lowerWebsite = (website || "").toLowerCase();
      const keywords = ["brewery", "brewing", "brewpub", "microbrew", "taproom", "tap room", "brewpub", "brewpubs", "craft brewery", "ale house", "brewing co", "brewing company", "brew works"];

      // direct name match
      if (keywords.some(k => lowerName.includes(k))) return true;

      // primary/type signals
      if (primaryType && (primaryType || "").toString().toLowerCase().includes("brew")) return true;
      if (Array.isArray(types) && types.some(t => (t || "").toLowerCase().includes("brew"))) return true;

      // website/url contains brew-related token
      if (lowerWebsite && lowerWebsite.includes("brew")) return true;

      // otherwise not brewery-related
      return false;
    };

    const isLikelyBar = (name: string) => {
      const lower = name.toLowerCase();
      return (
        lower.includes("bar") ||
        lower.includes(" pub") ||
        lower.includes("-pub") ||
        lower.includes("pub ") ||
        lower.includes("tavern") ||
        lower.includes("saloon") ||
        lower.includes("lounge") ||
        lower.includes("icehouse") ||
        lower.includes("ice house") ||
        lower.includes("grill")
      );
    };

    const disallowed = ["walmart", "costco", "target", "in-n-out", "in-n-out burger", "in n out", "king buffet", "king-buffet", "kingbuffet"];
    const isDisallowed = (name: string) => disallowed.some((w) => name.toLowerCase().includes(w));

    if (data.places && Array.isArray(data.places)) {
      for (const place of data.places) {
        try {
          const venueName = place.displayName?.text || "Unknown";
          if (isDisallowed(venueName)) continue;

          const primaryType = (place as any).primaryType as string | undefined;
          const types = (place as any).types as string[] | undefined;

          const primarySuggestsRestaurant = primaryType === "american_restaurant" || primaryType === "restaurant";
          const primarySuggestsBar = primaryType === "bar" || primaryType === "pub";
          const typesIncludeBrewery = types?.some((t) => t.includes("brew"));

          const venueType: "brewery" | "restaurant" | "bar" = typesIncludeBrewery || isBreweryRelated(venueName)
            ? "brewery"
            : primarySuggestsBar || isLikelyBar(venueName)
              ? "bar"
              : "restaurant";

          // Filter out Indian restaurants (e.g., primary/type contains 'indian' or name suggests it)
          const looksIndianType = (primaryType || "").toLowerCase().includes("indian") || (types || []).some(t => (t || "").toLowerCase().includes("indian"));
          const looksIndianName = /\b(indian|biryani|tandoor|desi|bharat|curry)\b/i.test(venueName);
          if (looksIndianType || looksIndianName) {
            // skip Indian establishments per user preference
            console.log(`- Skipping Indian venue: ${venueName}`);
            continue;
          }

          // Inclusive policy: accept most venue types unless explicitly disallowed.
          // We'll still compute `venueType` so we can prioritize breweries later.

          const venue: VenueLocation = {
            id: place.id || place.name,
            name: venueName,
            address: place.formattedAddress || "Address not available",
            lat: place.location?.latitude || coords.lat,
            lng: place.location?.longitude || coords.lng,
            type: venueType,
            website: place.websiteUri,
            rating: place.rating,
            userRatingsTotal: place.userRatingCount,
          };

          allVenues.push(venue);
          console.log(`✓ Found: ${venue.name}`);
        } catch (parseError) {
          console.warn("Could not parse place:", parseError);
          continue;
        }
      }
    }

    // Deduplicate by id
    const deduped = Array.from(new Map(allVenues.map((v) => [v.id, v])).values());

    // Score venues: brewery signal + rating to prefer real breweries
    const scoreVenue = (v: VenueLocation) => {
      let score = 0;
      if (isBreweryRelated(v.name, undefined, undefined, v.website)) score += 100;
      if (v.rating) score += Math.round((v.rating || 0) * 10);
      if (v.userRatingsTotal) score += Math.min(50, Math.round((v.userRatingsTotal || 0) / 10));
      return score;
    };

    const sortedVenues = deduped.sort((a, b) => {
      const sa = scoreVenue(a);
      const sb = scoreVenue(b);
      if (sa !== sb) return sb - sa;
      return (b.rating || 0) - (a.rating || 0);
    });

    console.log(`\n✓ Found ${sortedVenues.length} venues total (${sortedVenues.filter(v => v.type === "brewery").length} brewery-related)`);
    return sortedVenues;
  } catch (error) {
    console.error("getNearbyVenues error:", error);
    return [];
  }
}

/**
 * Get multiple nearby venues for multiple zip codes
 */
export async function getNearbyVenuesForZipcodes(
  zipcodes: string[],
  radiusMeters: number = 5000
): Promise<VenueLocation[]> {
  const allVenues: VenueLocation[] = [];
  const seenIds = new Set<string>();

  for (const zipcode of zipcodes) {
    console.log(`\nSearching for venues in ${zipcode}...`);
    const venues = await getNearbyVenues(zipcode, radiusMeters);

    // Deduplicate by place_id
    for (const venue of venues) {
      if (!seenIds.has(venue.id)) {
        seenIds.add(venue.id);
        allVenues.push(venue);
      }
    }

    // Rate limiting: Google Places API has rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return allVenues;
}
