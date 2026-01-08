"use client";

import { Venue } from "@/types";
import { VenueCard } from "./VenueCard";
import { checkHHStatus } from "@/lib/utils";
import { motion } from "framer-motion";
import { Beer, Utensils, Clock } from "lucide-react";

interface VenueListProps {
  venues: Venue[];
}

export function VenueList({ venues }: VenueListProps) {
  const breweries = venues.filter((v) => v.type === "brewery" || v.type === "bar");
  const restaurants = venues.filter((v) => v.type === "restaurant");

  const getVenueStatus = (venue: Venue) => {
    return checkHHStatus(venue.happyHours);
  };

  // Filter to only show ACTIVE, ENDING_SOON, or STARTING_SOON
  const isActiveNow = (venue: Venue) => {
    const status = getVenueStatus(venue);
    return status === "active" || status === "soon" || status === "ending";
  };

  const activeBreweries = breweries.filter(isActiveNow);
  const activeRestaurants = restaurants.filter(isActiveNow);

  const hasActiveVenues = activeBreweries.length > 0 || activeRestaurants.length > 0;

  const renderSection = (title: string, icon: React.ReactNode, list: Venue[]) => {
    if (list.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h2 className="text-2xl font-bold">{title}</h2>
          <span className="ml-auto text-sm text-gray-400">{list.length} found</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr items-stretch">
          {list
            .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
            .map((venue) => (
              <VenueCard key={venue.id} venue={venue} status={getVenueStatus(venue)} />
            ))}
        </div>
      </motion.div>
    );
  };

  // If there are no active venues, we'll show a centered message
  // but still render the rest of the page (including inactive HHs).

  return (
    <div className="space-y-8">
      {!hasActiveVenues && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center py-16 space-y-4"
        >
          <Clock size={48} className="mx-auto text-amber-metallic/40" />
          <div className="space-y-2">
            <p className="text-gray-300 text-lg font-medium">No happy hours right now</p>
            <p className="text-gray-500">Check back later or expand your radius to find more venues.</p>
          </div>
        </motion.div>
      )}
      {renderSection(
        "Breweries",
        <Beer size={24} className="text-amber-metallic" />,
        activeBreweries
      )}
      {renderSection(
        "Eateries",
        <Utensils size={24} className="text-emerald-glass" />,
        activeRestaurants
      )}
      {/* Inactive happy hours: venues that have happyHours but are currently closed */}
      {(() => {
        const inactive = venues.filter((v) => v.happyHours && v.happyHours.length > 0 && getVenueStatus(v) === "closed");
        if (inactive.length === 0) return null;

        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock size={24} className="text-gray-400" />
              <h2 className="text-2xl font-bold">Inactive Happy Hours</h2>
              <span className="ml-auto text-sm text-gray-400">{inactive.length} found</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr items-stretch">
              {inactive
                .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
                .map((venue) => (
                  <VenueCard key={venue.id} venue={venue} status={getVenueStatus(venue)} noGlow />
                ))}
            </div>
          </motion.div>
        );
      })()}
    </div>
  );
}
