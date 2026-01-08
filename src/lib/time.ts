import { HappyHour } from "@/types";
import { getHHStatus } from "./utils";

/**
 * Convenience wrapper for frontends: returns ACTIVE/ENDING_SOON/STARTING_SOON/CLOSED
 * based on the venue's happy hour periods. Uses the robust multi-period logic in utils.
 */
export function getHappyHourStatus(venue: { happyHours?: HappyHour[] }) {
  return getHHStatus(venue.happyHours ?? []);
}
