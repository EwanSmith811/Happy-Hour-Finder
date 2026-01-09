"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchHeader } from "@/components/SearchHeader";
import { VenueList } from "@/components/VenueList";
import { Map } from "@/components/Map";
import { Venue } from "@/types";
import { calculateDistance, getHHStatus } from "@/lib/utils";
import { getCoordinatesFromZip } from "@/lib/googlePlaces";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MapPin, List, RefreshCw } from "lucide-react";
import Toast from "@/components/Toast";

export default function HomeClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [filteredVenues, setFilteredVenues] = useState<Venue[]>([]);
  
  const [searchLoading, setSearchLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshLabel, setRefreshLabel] = useState<string | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<{ current: number; total: number; done?: boolean } | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [currentZip, setCurrentZip] = useState("75025");
  const [currentRadius, setCurrentRadius] = useState(3);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Load venues data on mount
  useEffect(() => {
    const loadVenues = async () => {
      try {
        const response = await fetch("/data/venues.json");
        if (response.ok) {
          const data = await response.json();
          console.log(`Loaded ${data.length} venues`);
          setAllVenues(data);
        } else {
          console.warn("venues.json not found. Run 'npm run scrape' to generate it.");
        }
      } catch (error) {
        console.error("Failed to load venues:", error);
      }
    };

    loadVenues();
  }, []);

  

  // Load from URL params
  useEffect(() => {
    const zipParam = searchParams.get("zip");
    const radiusParam = searchParams.get("radius");
    // Do not auto-run search on initial page load unless a zip or radius is present
    if (!zipParam && !radiusParam) return;

    const zip = zipParam || "75025";
    const radius = parseInt(radiusParam || "3");
    setCurrentZip(zip);
    setCurrentRadius(radius);
    performSearch(zip, radius);
  }, [searchParams]);

  const performSearch = useCallback(
    async (zip: string, radius: number, venuesOverride?: Venue[]) => {
      setSearchLoading(true);
      try {
        // Get coordinates from zip
        const coords = await getCoordinatesFromZip(zip);
        if (!coords) {
          window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'error', message: 'Zip code not found. Please try another.' } }));
          setSearchLoading(false);
          return;
        }

        setUserCoords(coords);

        const source = venuesOverride ?? allVenues;

        // Filter venues within radius (miles)
        const radiusMiles = radius;
        const filtered = source
          .map((venue) => {
            const distance = calculateDistance(coords.lat, coords.lng, venue.lat, venue.lng);
            const status = getHHStatus(venue.happyHours || []);
            return { ...venue, distance, hhStatus: status } as Venue & { hhStatus: string };
          })
          .filter((venue) => venue.distance! <= radiusMiles)
          // Keep all venues in the radius (active and inactive). The list component
          // will render active venues first and an "Inactive Happy Hours" section below.
          .sort((a, b) => (a.distance || 0) - (b.distance || 0));

        setFilteredVenues(filtered);

        // No extra count needed here; the list component handles rendering.

        // Update URL without page reload
        router.push(`/?zip=${zip}&radius=${radius}`, { scroll: false });
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearchLoading(false);
      }
    },
    [allVenues, router]
  );

    // Listen for venue add/update events to update UI without reload
    useEffect(() => {
      const onAdded = (e: any) => {
        const venue = e?.detail;
        if (!venue) return;
        setAllVenues((prev) => {
          const next = [venue, ...prev];
          performSearch(currentZip, currentRadius, next);
          return next;
        });
      };
      const onUpdated = (e: any) => {
        const detail = e?.detail;
        if (!detail) return;
        const updatedVenue = detail.venue || detail;
        const oldId = detail.oldId;
        setAllVenues((prev) => {
          let next: Venue[];
          // If updatedVenue.id matches an existing one, replace in-place
          if (prev.some((v) => v.id === updatedVenue.id)) {
            next = prev.map((v) => (v.id === updatedVenue.id ? updatedVenue : v));
          } else if (oldId && prev.some((v) => v.id === oldId)) {
            // Replace old scraped id with new user-provided venue
            next = prev.map((v) => (v.id === oldId ? updatedVenue : v));
          } else {
            // Fallback: add to front
            next = [updatedVenue, ...prev];
          }
          // Re-run search using the new list immediately
          performSearch(currentZip, currentRadius, next);
          return next;
        });
      };
      window.addEventListener('venue-added', onAdded as EventListener);
      window.addEventListener('venue-updated', onUpdated as EventListener);
      return () => {
        window.removeEventListener('venue-added', onAdded as EventListener);
        window.removeEventListener('venue-updated', onUpdated as EventListener);
      };
    }, [performSearch, currentZip, currentRadius]);

  const refreshVenues = useCallback(async () => {
    setRefreshLoading(true);
    setRefreshLabel(null);
    // Start by fetching the current progress once so we can detect a change
    // in `runId`. This lets the client ignore stale progress from a previous
    // run until a new run's progress appears.
    let initialRunId: string | null = null;
    try {
      const r0 = await fetch('/api/scrape-progress');
      if (r0.ok) {
        const j0 = await r0.json();
        initialRunId = j0.runId || null;
      }
    } catch (e) {}

    let pollId: any = null;
    // Track seen run and last seen current to avoid showing later counts
    // before the first increment and to update only when current increases.
    let seenRunId: string | null = null;
    let seenCurrent = 0;
    const startPolling = () => {
      pollId = setInterval(async () => {
        try {
          const r = await fetch('/api/scrape-progress');
          if (r.ok) {
            const j = await r.json();
            // If we haven't observed a runId for this start, capture the first
            // runId that differs from the initialRunId (this will be the new run).
            if (!seenRunId && j.runId && j.runId !== initialRunId) {
              seenRunId = j.runId;
            }

            // Only update progress for the currently observed runId.
            if (j.runId && seenRunId && j.runId === seenRunId) {
              // Reveal progress once we see the first positive current value.
              if (j.current && j.current > 0 && j.current > seenCurrent) {
                seenCurrent = j.current;
                setScrapeProgress(j);
              }
              // If the run finished, show final state immediately.
              if (j.done) {
                setScrapeProgress(j);
                clearInterval(pollId);
              }
            }
          }
        } catch (e) {}
      }, 800);
    };
    startPolling();
    try {
      // Send current zipcode and radius to the scrape API
      const response = await fetch("/api/scrape-venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zipcode: currentZip,
          radiusMeters: currentRadius * 1609.34, // Convert miles to meters
        }),
      });
      if (response.ok) {
        const result = await response.json();
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'success', message: `✓ Successfully scraped ${result.count} venues!` } }));
        // Reload venues
        window.location.reload();
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'error', message: `Failed to scrape venues: ${error.error || 'Unknown error'}` } }));
      }
    } catch (error) {
      console.error("Refresh error:", error);
      window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'error', message: 'Error refreshing venues' } }));
    } finally {
      setRefreshLoading(false);
      // small delay to allow final progress write
      setTimeout(() => setScrapeProgress(null), 1000);
    }
  }, [currentZip, currentRadius]);

  const formatProgressPhrase = (current: number, total: number) => {
    const templates = [
      "beers drank",
      "pints poured",
      "rounds served",
      "bottoms upped",
      "brews sipped",
      "kegs tapped",
      "pints downed",
      "stouts enjoyed",
      "pours logged",
      "toasts made",
    ];
    const idx = total > 0 ? (current % templates.length) : 0;
    const phrase = templates[idx] || "scraped";
    return `${current}/${total} ${phrase}`;
  };

  // Cycling refresh label while refreshLoading is true
  useEffect(() => {
    if (!refreshLoading) {
      setRefreshLabel(null);
      return;
    }

    const phrases = [
      "Refreshing...",
      "Hitting the interwebs",
      "Assembling happy hour detectives",
      "Almost there",
      "Still fetching tasty deals",
    ];

    let idx = 0;
    setRefreshLabel(phrases[idx]);

    const interval = setInterval(() => {
      idx = (idx + 1) % phrases.length;
      setRefreshLabel(phrases[idx]);
    }, 4000);

    // After 30s show the special reassurance message
    const longTimeout = setTimeout(() => {
      setRefreshLabel("This is still working I promise");
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(longTimeout);
    };
  }, [refreshLoading]);

  return (
    <main className="min-h-screen bg-obsidian text-white overflow-x-hidden flex flex-col">
      {/* Background gradient effect */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-amber-metallic/3 via-obsidian to-emerald-glass/3 pointer-events-none" />

      {/* Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <Toast />
        {/* Search Header */}
        <SearchHeader onSearch={performSearch} isLoading={searchLoading} />

        {/* Refresh Button + Progress */}
        <div className="flex justify-center items-center gap-4">
          <div className="w-80">
            <button
              onClick={refreshVenues}
              disabled={refreshLoading}
              className="relative w-full h-10 overflow-hidden rounded-lg border border-white/20 bg-white/[0.03]"
            >
              {/* Progress fill */}
              <div
                className="absolute inset-0 left-0 top-0 h-full bg-amber-metallic/60"
                style={{ width: `${scrapeProgress && scrapeProgress.total ? (scrapeProgress.current / scrapeProgress.total) * 100 : (refreshLoading ? 4 : 0)}%`, transition: 'width 300ms ease' }}
              />
              <div className="relative z-10 flex items-center justify-center gap-2 h-full text-sm text-white">
                <RefreshCw size={16} className={refreshLoading ? "animate-spin" : ""} />
                {scrapeProgress ? formatProgressPhrase(scrapeProgress.current || 0, scrapeProgress.total || 0) : (refreshLoading ? (refreshLabel || "Refreshing...") : "Refresh Venues Data")}
              </div>
            </button>
          </div>

          {/* No additional icon - progress shown inside button only */}
        </div>

        {/* Results Section */}
        {filteredVenues.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* View Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  viewMode === "list"
                    ? "bg-white/10 border border-amber-metallic/50 text-amber-metallic"
                    : "glass hover:border-amber-metallic/50"
                }`}
              >
                <List size={18} />
                List
              </button>
              <button
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  viewMode === "map"
                    ? "bg-white/10 border border-emerald-glass/50 text-emerald-glass"
                    : "glass hover:border-emerald-glass/50"
                }`}
              >
                <MapPin size={18} />
                Map
              </button>
            </div>

            {/* List View */}
            {viewMode === "list" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <VenueList venues={filteredVenues} />
              </motion.div>
            )}

            {/* Map View */}
            {viewMode === "map" && userCoords && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="h-96 md:h-[600px] rounded-lg overflow-hidden glass"
              >
                <Map venues={filteredVenues} center={{ lat: userCoords.lat, lng: userCoords.lng }} />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Empty State */}
        {allVenues.length === 0 && !searchLoading && !refreshLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-4"
          >
            <p className="text-gray-300 text-lg">No venues loaded yet</p>
            <p className="text-gray-500 text-sm">
              Run <code className="bg-white/10 px-2 py-1 rounded">npm run scrape</code> to discover venues
            </p>
          </motion.div>
        )}

        {/* No Results State */}
        {filteredVenues.length === 0 && allVenues.length > 0 && !searchLoading && !refreshLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-4"
          >
            <p className="text-gray-300 text-lg">No happy hours right now</p>
            <p className="text-gray-500 text-sm">Try a different zip code or expand your radius</p>
          </motion.div>
        )}
      </div>
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-auto text-center py-8 text-gray-500 text-sm border-t border-white/5"
      >
        <p>Happy Hour Finder • {allVenues.length} venues available</p>
      </motion.footer>
    </main>
  );
}
