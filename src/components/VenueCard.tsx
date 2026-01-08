"use client";

import { Venue, HHStatus } from "@/types";
import { checkHHStatus } from "@/lib/utils";
import { motion } from "framer-motion";
import { Clock, MapPin, Phone } from "lucide-react";

interface VenueCardProps {
  venue: Venue;
  status: HHStatus;
  noGlow?: boolean;
}

export function VenueCard({ venue, status, noGlow }: VenueCardProps) {
  const getDayName = () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[new Date().getDay()];
  };

  const todayHH = venue.happyHours?.find((hh) => hh.days?.includes(getDayName()));

  const getStatusShadow = () => {
    switch (status) {
      case "active":
        return "";
      case "soon":
        return "shadow-[0_0_15px_rgba(212,175,55,0.3)]";
      case "ending":
        return "shadow-[0_0_15px_rgba(239,68,68,0.3)]";
      case "closed":
        return "";
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case "active":
        return "Active";
      case "soon":
        return "Starts Soon";
      case "ending":
        return "Ending Soon";
      case "closed":
        return "Closed";
    }
  };

  const getStatusBgColor = () => {
    switch (status) {
      case "active":
        return "bg-emerald-600/20 text-emerald-200";
      case "soon":
        return "bg-amber-metallic/20 text-amber-100";
      case "ending":
        return "bg-red-500/20 text-red-100";
      case "closed":
        return "bg-gray-700/20 text-gray-300";
    }
  };

  const statusGlow = () => {
    switch (status) {
      case "active":
        // active -> yellow glow + pulse
        return "ring-1 ring-amber-400/40 shadow-[0_0_22px_rgba(250,204,21,0.18)] animate-pulse";
      case "ending":
        // closing soon -> red glow + pulse
        return "ring-1 ring-red-500/40 shadow-[0_0_22px_rgba(239,68,68,0.18)] animate-pulse";
      case "soon":
        return "ring-1 ring-amber-300/20";
      case "closed":
        return "ring-1 ring-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.06)]";
      default:
        return "";
    }
  };

  const formatTime12 = (t?: string) => {
    if (!t) return "";
    // If already contains am/pm, return as-is
    if (/am|pm|AM|PM/.test(t)) return t;
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return t;
    let hh = parseInt(m[1], 10);
    const mm = m[2];
    const period = hh >= 12 ? "PM" : "AM";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${period}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.04 }}
      transition={{ duration: 0.12 }}
      className="relative h-full"
    >
      {!noGlow && <div className={`absolute inset-0 rounded-lg pointer-events-none ${statusGlow()}`} />}

      <div
        className={`relative z-10 glass rounded-lg p-4 space-y-3 transition-all transform will-change-transform ${getStatusShadow()} ${status === 'closed' && venue.happyHours && venue.happyHours.length > 0 ? 'border border-red-700/10' : ''} h-full flex flex-col justify-between`}
        onClick={() => {
          window.dispatchEvent(new CustomEvent("edit-venue", { detail: venue }));
        }}
        role="button"
        title="Click to edit venue"
      >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg text-white group-hover:text-amber-metallic transition-colors truncate">
            {venue.name}
          </h3>
          <div className="flex items-center gap-1 text-sm text-gray-400 mt-1">
            <MapPin size={14} />
            <span>{venue.distance !== undefined ? `${venue.distance.toFixed(1)} mi away` : "Distance unavailable"}</span>
          </div>

          <div className="mt-2 text-sm text-gray-400 space-y-1">
            <p className="line-clamp-1">{venue.address}</p>
            {venue.phone && <p className="line-clamp-1">{venue.phone}</p>}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusBgColor()}`}>
          {getStatusLabel()}
        </span>
      </div>

      {/* Happy Hour Info */}
      {todayHH ? (
        <div className={`rounded-md p-3 border ${status === 'active' ? 'border-amber-400/20 bg-amber-900/6' : status === 'ending' ? 'border-red-500/20 bg-red-900/6' : status === 'soon' ? 'border-amber-300/15 bg-amber-900/4' : 'border-red-400/10 bg-red-900/3'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-amber-metallic" />
            <span className="text-sm font-medium">
              {formatTime12(todayHH.startTime)} - {formatTime12(todayHH.endTime)}
            </span>
          </div>
          {todayHH.deals && todayHH.deals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {todayHH.deals.map((deal, i) => (
                <span key={i} className="text-xs bg-amber-metallic/20 text-amber-100 px-2 py-1 rounded">
                  {deal}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No happy hour today</p>
      )}
      </div>
    </motion.div>
  );
}
