"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Maximize2 } from "lucide-react";
import AddVenueModal from "./AddVenueModal";
import ThemeToggle from "./ThemeToggle";

interface SearchHeaderProps {
  onSearch: (zip: string, radius: number) => void;
  isLoading?: boolean;
}

export function SearchHeader({ onSearch, isLoading = false }: SearchHeaderProps) {
  const [zip, setZip] = useState("75025");
  const [radius, setRadius] = useState(5);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editInitial, setEditInitial] = useState<any | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      // Allow editing of any venue (scraped or user); edits to scraped venues create a user entry server-side
      setEditInitial(detail);
      setShowAddModal(true);
    };
    window.addEventListener("edit-venue", handler as EventListener);
    return () => window.removeEventListener("edit-venue", handler as EventListener);
  }, []);

  const handleSearch = useCallback(() => {
    if (zip.length >= 5) {
      onSearch(zip, radius);
    }
  }, [zip, radius, onSearch]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Hero Section */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl md:text-5xl font-bold text-white title-glow">Happy Hour Finder</h1>
        <p className="text-white text-lg">Find happy hours at restaurants and breweries near you</p>
      </div>

      {/* Search Box */}
      <div className="relative glass rounded-xl p-6 space-y-4 ring-1 ring-amber-400/20 shadow-[0_8px_30px_rgba(250,204,21,0.08)]">
        {/* Zip Code Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Enter Your Zip Code</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-metallic opacity-60" size={20} />
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              onKeyPress={handleKeyPress}
              maxLength={5}
              placeholder="e.g., 75025"
              className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-metallic focus:bg-white/15 transition-all"
            />
          </div>
        </div>

        {/* Radius Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Search Radius</label>
            <span className="text-amber-metallic font-semibold">{radius} miles</span>
          </div>
          <div className="flex items-center gap-4">
            <Maximize2 size={16} className="text-gray-400" />
            <input
              type="range"
              min="1"
              max="25"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-metallic"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSearch}
            disabled={isLoading}
            className="ghost-button w-full sm:flex-1"
          >
            Find Happy Hours
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAddModal(true)}
            className="ghost-button w-full sm:w-40"
            type="button"
          >
            Add Brewery
          </motion.button>
        </div>

        <AddVenueModal
          open={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setEditInitial(null);
          }}
          initial={editInitial || undefined}
          onEdit={async (id, v) => {
            try {
              const resp = await fetch('/api/update-venue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...v }),
              });
              const data = await resp.json();
              if (resp.ok) {
                window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'success', message: 'Venue updated' } }));
                // Notify app to update UI without full reload. Include original id in case server created a new user- entry.
                window.dispatchEvent(new CustomEvent('venue-updated', { detail: { oldId: id, venue: data.venue || { id } } }));
                return true;
              } else {
                const msg = data?.error || data?.message || 'Failed to update venue';
                window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'error', message: msg } }));
                return false;
              }
            } catch (err) {
              console.error('Update venue error', err);
              window.dispatchEvent(new CustomEvent('show-toast', { detail: { type: 'error', message: 'Error updating venue' } }));
              return false;
            }
          }}
          onAdd={async (v) => {
            try {
              const resp = await fetch("/api/add-brewery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...v, zipcode: zip }),
              });
              const data = await resp.json();
              if (resp.ok) {
                console.log("Added venue:", data.venue);
                window.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "success", message: "Brewery added successfully" } }));
                window.dispatchEvent(new CustomEvent('venue-added', { detail: data.venue }));
                return true;
              } else {
                const msg = data?.error || data?.message || 'Failed to add brewery';
                console.warn("Failed to add venue:", data);
                window.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: msg } }));
                return false;
              }
            } catch (err) {
              console.error("Error adding venue:", err);
              window.dispatchEvent(new CustomEvent("show-toast", { detail: { type: "error", message: "Error adding brewery" } }));
              return false;
            }
          }}
        />
      </div>
    </motion.div>
  );
}

// (edit listener attached in component useEffect)
