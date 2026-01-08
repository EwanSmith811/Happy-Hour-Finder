import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Happy Hour Finder",
  description: "Find brewery and restaurant happy hours near you. Fast. No login. No data collection.",
};

export const viewport = "width=device-width, initial-scale=1";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <meta name="viewport" content={viewport} />
        <link rel="icon" href="/beer.png" type="image/png" />
        <link rel="apple-touch-icon" href="/beer.png" />
      </head>
      <body className="bg-obsidian text-white antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
