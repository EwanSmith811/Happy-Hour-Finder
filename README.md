# Happy Hour Finder

Find brewery and restaurant happy hours near you. Fast. No login. No data collection.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Google Maps API Key

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env.local` and add your Google Maps API key
3. Install dependencies:

```bash
npm install
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 Features

### Search Flow
- **Minimalist Design**: Large zip code input with radius slider
- **URL-Based State**: Share searches via URL parameters
- **Instant Results**: Real-time filtering with Haversine distance calculation

### Filtering
- **Breweries** (Amber/Gold #FFBF00): 🍺
- **Eateries** (Emerald/Glass #10B981): 🍽️
- Separate organized lists with distance sorting

### Happy Hour Status
- **Active**: Fully lit emerald glow
- **Starting Soon** (<30m): Pulsing amber animation
- **Closing Soon** (<30m): Pulsing red animation
- **Closed**: Dim gray state

### Map Integration
- Dark-themed Google Map with custom SVG markers
- Color-coded by venue type (amber for breweries, emerald for restaurants)
- Click markers for venue details

## 🛠️ Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Styling**: Tailwind CSS 3.4+
- **Animations**: Framer Motion 11+
- **Icons**: Lucide React
- **Maps**: Google Maps JS API
- **Language**: TypeScript

## 📐 Key Utilities

### `checkHHStatus(start, end)`
Determines happy hour status based on current time:
- Returns: `'active'`, `'soon'`, `'ending'`, or `'closed'`

### `calculateDistance(lat1, lon1, lat2, lon2)`
Uses Haversine formula to calculate distance in miles between two coordinates.

### `getCoordinatesFromZip(zip)`
Converts zip code to coordinates (mock implementation for demo).

## 🎨 Design System

### Colors
- **Background**: Deep Charcoal (#121212)
- **Breweries**: Amber/Gold (#FFBF00)
- **Restaurants**: Emerald/Glass (#10B981)
- **Glass**: `bg-white/5 backdrop-blur-md border-white/10`

### Components
- **VenueCard**: Individual venue info with HH details
- **VenueList**: Organized brewery/eatery sections
- **SearchHeader**: Zip + radius input with hero text
- **Map**: Dark-themed Google Maps with markers

## 📦 Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   ├── SearchHeader.tsx    # Search UI
│   ├── VenueCard.tsx       # Individual venue
│   ├── VenueList.tsx       # Breweries/Eateries lists
│   └── Map.tsx             # Google Maps integration
├── lib/
│   ├── utils.ts            # Haversine, status logic
│   └── mockData.ts         # Sample venues
└── types/
    └── index.ts            # TypeScript interfaces
```

## 🔑 Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## 📝 Mock Data

The app includes sample breweries and restaurants for San Francisco (94102). To add more venues:

1. Edit `src/lib/mockData.ts`
2. Add venue objects with the `Venue` interface
3. Update zip coordinates in `getCoordinatesFromZip()`

## 🚀 Deployment

### Vercel (Recommended)

```bash
npm run build
vercel deploy
```

### Docker

```bash
docker build -t happy-hour-finder .
docker run -p 3000:3000 happy-hour-finder
```

## 📱 Responsive Design

- **Mobile**: Single column, full-width cards
- **Tablet**: 2-column grid
- **Desktop**: 3-column grid with side map toggle

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT - Feel free to use this for personal or commercial projects.

---

**Made with ❤️ for finding the best happy hours**
