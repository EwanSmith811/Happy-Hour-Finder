export interface Venue {
  id: string;
  name: string;
  type: "brewery" | "restaurant" | "bar";
  lat: number;
  lng: number;
  distance?: number; // calculated dynamically
  address: string;
  website?: string;
  phone?: string;
  rating?: number;
  userRatingsTotal?: number;
  happyHours?: HappyHour[];
}

export interface HappyHour {
  days: string[]; // e.g., ["Mon", "Tue"]
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  deals?: string[];
}

export type HHStatus = "active" | "soon" | "ending" | "closed";
