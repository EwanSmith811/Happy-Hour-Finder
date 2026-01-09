"use client";

import { useEffect, useRef } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Venue, HHStatus } from "@/types";
import { checkHHStatus } from "@/lib/utils";

// Google Maps JS API loads a global `google` object after the loader completes
// Declare it for TypeScript so we don't need DOM globals here.
declare const google: any;

interface MapProps {
  venues: Venue[];
  center?: { lat: number; lng: number };
}

export function Map({ venues, center = { lat: 37.7749, lng: -122.4194 } }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const legendRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initMap = async () => {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        version: "weekly",
      });

      try {
        await loader.load();

        if (!mapRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            zoom: 14,
            center,
            styles: [
            { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            {
              featureType: "administrative.locality",
              elementType: "labels.text.fill",
              stylers: [{ color: "#d59563" }],
            },
            {
              featureType: "poi",
              elementType: "labels.text.fill",
              stylers: [{ color: "#d59563" }],
            },
            {
              featureType: "poi.park",
              elementType: "geometry",
              stylers: [{ color: "#263c3f" }],
            },
            {
              featureType: "road",
              elementType: "geometry",
              stylers: [{ color: "#38414e" }],
            },
            {
              featureType: "road",
              elementType: "geometry.stroke",
              stylers: [{ color: "#212a37" }],
            },
            {
              featureType: "road.arterial",
              elementType: "geometry",
              stylers: [{ color: "#756b54" }],
            },
            {
              featureType: "road.highway",
              elementType: "geometry",
              stylers: [{ color: "#746855" }],
            },
            {
              featureType: "transit",
              elementType: "geometry",
              stylers: [{ color: "#2f3948" }],
            },
            {
              featureType: "water",
              elementType: "geometry",
              stylers: [{ color: "#17263c" }],
            },
            {
              featureType: "water",
              elementType: "labels.text.fill",
              stylers: [{ color: "#515c6d" }],
            },
          ],
        });
          // Create legend control
          if (legendRef.current) {
            try { legendRef.current.remove(); } catch (e) {}
            legendRef.current = null;
          }
          const legend = document.createElement("div");
          legend.style.background = "rgba(10,10,10,0.85)";
          legend.style.color = "white";
          legend.style.padding = "8px";
          legend.style.borderRadius = "8px";
          legend.style.fontSize = "12px";
          legend.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
          legend.innerHTML = `
            <div style="font-weight:600;margin-bottom:6px">Legend</div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="width:12px;height:12px;background:#FFBF00;border-radius:3px;display:inline-block"></span><span>Breweries</span></div>
            <div style="display:flex;align-items:center;gap:8px"><span style="width:12px;height:12px;background:#10B981;border-radius:3px;display:inline-block"></span><span>Restaurants</span></div>
          `;
          mapInstanceRef.current.controls[google.maps.ControlPosition.TOP_RIGHT].push(legend);
          legendRef.current = legend;
        }

        // Clear existing markers
        if (markersRef.current.length) {
          markersRef.current.forEach((m) => m.setMap(null));
          markersRef.current = [];
        }

        // Add markers for venues
        venues.forEach((venue) => {
          // Only add markers for venues that have happy hours
          if (!venue.happyHours || !(venue.happyHours.length > 0)) return;

          const status = checkHHStatus(venue.happyHours);

          // Create custom SVG marker
          const markerColor = venue.type === "brewery" ? "#FFBF00" : "#10B981";
          const svgMarker = `
            <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 0C8.27 0 2 6.27 2 14c0 11 14 26 14 26s14-15 14-26c0-7.73-6.27-14-14-14z" 
                    fill="${markerColor}" stroke="#1a1a1a" stroke-width="1"/>
              <circle cx="16" cy="13" r="5" fill="#1a1a1a"/>
            </svg>
          `;

          const marker = new google.maps.Marker({
            position: { lat: venue.lat, lng: venue.lng },
            map: mapInstanceRef.current,
            title: venue.name,
            icon: {
              url: `data:image/svg+xml;base64,${btoa(svgMarker)}`,
              scaledSize: new google.maps.Size(32, 40),
              origin: new google.maps.Point(0, 0),
              anchor: new google.maps.Point(16, 40),
            },
          });

          markersRef.current.push(marker);

          // Add info window
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div class="bg-obsidian text-white p-3 rounded-lg text-sm max-w-xs">
                <h3 class="font-semibold mb-1">${venue.name}</h3>
                <p class="text-gray-300 text-xs mb-2">${venue.type === "brewery" ? "🍺 Brewery" : "🍽️ Restaurant"}</p>
                <p class="text-xs text-gray-400">${venue.distance !== undefined ? `${venue.distance.toFixed(1)} mi away` : "Distance unavailable"}</p>
              </div>
            `,
          });

          marker.addListener("click", () => {
            infoWindow.open(mapInstanceRef.current, marker);
          });
        });
      } catch (error) {
        console.error("Failed to load Google Maps:", error);
      }
    };

    if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      initMap();
    }
    // If key missing, log and leave the blank container so we can show a message
    else {
      console.error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — map will not load');
    }

    return () => {
      // Cleanup markers
      if (markersRef.current && markersRef.current.length) {
        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
      }
      // Remove legend if present
      if (legendRef.current) {
        try {
          legendRef.current.remove();
        } catch (e) {}
        legendRef.current = null;
      }
    };
  }, [venues, center]);

  return <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden" />;
}

export function MapFallbackMissingKey() {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden flex items-center justify-center bg-black/60 text-white p-4">
      <div className="text-center">
        <div className="font-semibold mb-2">Map unavailable</div>
        <div className="text-sm text-gray-300">Missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in this environment.</div>
        <div className="text-xs text-gray-400 mt-2">Set the env var and redeploy to enable the map.</div>
      </div>
    </div>
  );
}
