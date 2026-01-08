import { Venue } from "@/types";

// Mock venue database
export const mockVenues: Venue[] = [
  // Breweries
  {
    id: "brew-1",
    name: "Golden State Brewing Co.",
    type: "brewery",
    lat: 37.7749,
    lng: -122.4194,
    distance: 0.5,
    address: "123 Brewery St, San Francisco, CA 94102",
    phone: "(415) 555-0101",
    happyHours: [
      {
        days: ["Mon"],
        startTime: "16:00",
        endTime: "18:00",
        deals: ["Pints $3", "Wings $1"],
      },
      {
        days: ["Fri"],
        startTime: "15:00",
        endTime: "19:00",
        deals: ["Pints $4", "Appetizers 50% off"],
      },
    ],
  },
  {
    id: "brew-2",
    name: "Hoppy Mountain Brewery",
    type: "brewery",
    lat: 37.7849,
    lng: -122.4094,
    distance: 1.2,
    address: "456 Peak Road, San Francisco, CA 94103",
    phone: "(415) 555-0102",
    happyHours: [
      {
        days: ["Tue"],
        startTime: "17:00",
        endTime: "19:00",
        deals: ["Beer $2", "Nachos $5"],
      },
      {
        days: ["Wed"],
        startTime: "16:30",
        endTime: "18:30",
        deals: ["House Beer $3"],
      },
    ],
  },
  {
    id: "brew-3",
    name: "Craft & Cork",
    type: "brewery",
    lat: 37.7649,
    lng: -122.4294,
    distance: 2.1,
    address: "789 Tap Lane, San Francisco, CA 94101",
    phone: "(415) 555-0103",
    happyHours: [
      {
        days: ["Thu"],
        startTime: "16:00",
        endTime: "20:00",
        deals: ["All Taps $3", "Sliders $4"],
      },
    ],
  },
  // Restaurants
  {
    id: "rest-1",
    name: "The Bay Restaurant",
    type: "restaurant",
    lat: 37.7799,
    lng: -122.4244,
    distance: 0.8,
    address: "321 Market St, San Francisco, CA 94102",
    phone: "(415) 555-0201",
    happyHours: [
      {
        days: ["Mon"],
        startTime: "16:00",
        endTime: "19:00",
        deals: ["Cocktails $5", "Appetizers 50% off"],
      },
      {
        days: ["Fri"],
        startTime: "16:00",
        endTime: "20:00",
        deals: ["Wine $6", "Small Plates $8"],
      },
    ],
  },
  {
    id: "rest-2",
    name: "Urban Table",
    type: "restaurant",
    lat: 37.7709,
    lng: -122.4344,
    distance: 1.5,
    address: "654 Gourmet Ave, San Francisco, CA 94103",
    phone: "(415) 555-0202",
    happyHours: [
      {
        days: ["Wed"],
        startTime: "17:00",
        endTime: "19:00",
        deals: ["Margheritas $7", "Calamari $5"],
      },
      {
        days: ["Sat"],
        startTime: "15:00",
        endTime: "18:00",
        deals: ["Sangria $4", "Tapas $6"],
      },
    ],
  },
  {
    id: "rest-3",
    name: "Moonlight Bistro",
    type: "restaurant",
    lat: 37.7849,
    lng: -122.4144,
    distance: 1.3,
    address: "987 Dine St, San Francisco, CA 94101",
    phone: "(415) 555-0203",
    happyHours: [
      {
        days: ["Tue"],
        startTime: "16:30",
        endTime: "18:30",
        deals: ["Cocktails $6", "Shareable Plates $7"],
      },
      {
        days: ["Sun"],
        startTime: "17:00",
        endTime: "19:00",
        deals: ["Beer $3", "Bruschetta $4"],
      },
    ],
  },
];
