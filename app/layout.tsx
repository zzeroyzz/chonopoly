import type { Metadata, Viewport } from "next";
import { Playfair_Display, IBM_Plex_Sans, IBM_Plex_Mono, Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Every variable family here omits `weight` on purpose.
//
// Asking next/font/google for an explicit `weight` array on a variable font
// makes the font resolver emit one @font-face per weight and then fail to
// resolve each one, with "next/font/google queries have exactly one entry"
// against the generated <family>.module.css.
//
// It only fails on Vercel, and not for the reason you would guess. The module
// it cannot resolve is `@vercel/turbopack-next/internal/font/google/font` —
// Vercel's own build pipeline. `next build` and `next build --turbopack` run a
// different resolver locally and both pass with the array in place, cache or
// no cache, so this is not reproducible on a developer machine. Verified by
// trying: clean builds both ways, array restored, zero errors.
//
// IBM Plex Sans was the last family still carrying a weight array. A comment
// here flagged it as worth revisiting if the error ever surfaced for it; it
// surfaced, so the array is gone. Its wght axis spans 100-700, which covers
// the 300/400/500/600 that array asked for, so nothing about how the family
// renders changes.
//
// IBM Plex Mono is the one genuinely static family in this list — no variable
// axis — so its explicit weights are required and must stay.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Park Hawkins Capital",
  description: "Park Hawkins Capital — Real Estate Investment & Acquisition",
  icons: {
    icon: [
      { url: "/favicons/favicon.ico", sizes: "any" },
      { url: "/favicons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/favicons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable} ${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')` }} />
      </head>
      <body className="antialiased" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
