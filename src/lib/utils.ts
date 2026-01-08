// Haversine formula to calculate distance between two coordinates (in miles)
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const getDistance = calculateDistance;

// Evaluate happy hours for current time across multiple periods
import { HappyHour } from "@/types";

export function getHHStatus(
  happyHours: HappyHour[] | undefined
): "ACTIVE" | "ENDING_SOON" | "STARTING_SOON" | "CLOSED" {
  if (!happyHours || happyHours.length === 0) return "CLOSED";
  // Use the device's current local date/time to evaluate happy hours
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = days[now.getDay()];

  const todays = happyHours.filter((hh) => hh.days?.includes(today));
  if (!todays.length) return "CLOSED";
  // Debugging info to help diagnose timing issues in development
  try {
    console.debug("getHHStatus: now=", now.toString(), "today=", today, "currentMinutes=", currentMinutes, "todaysCount=", todays.length);
  } catch (e) {
    /* ignore */
  }

  for (const hh of todays) {
    const [sh, sm] = (hh.startTime || "").split(":").map(Number);
    const [eh, em] = (hh.endTime || "").split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(eh)) continue;

    const start = sh * 60 + sm;
    const end = eh * 60 + em;

    try {
      console.debug(`getHHStatus: venue hh days=${hh.days} start=${start} end=${end}`);
    } catch (e) {}

    const inRange = start <= end
      ? currentMinutes >= start && currentMinutes < end
      : currentMinutes >= start || currentMinutes < end; // crosses midnight

    if (inRange) {
      const minsToEnd = end > start
        ? end - currentMinutes
        : (24 * 60 - currentMinutes) + end;
      // Consider ending soon if within 60 minutes
      if (minsToEnd <= 60) return "ENDING_SOON";
      return "ACTIVE";
    }

    const minsToStart = start >= currentMinutes
      ? start - currentMinutes
      : (24 * 60 - currentMinutes) + start;
    if (minsToStart <= 30) return "STARTING_SOON";
  }

  return "CLOSED";
}

export function checkHHStatus(happyHours: HappyHour[] | undefined): "active" | "soon" | "ending" | "closed" {
  const status = getHHStatus(happyHours);
  switch (status) {
    case "ACTIVE":
      return "active";
    case "STARTING_SOON":
      return "soon";
    case "ENDING_SOON":
      return "ending";
    default:
      return "closed";
  }
}
