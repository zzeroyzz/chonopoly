import type { Metadata, Viewport } from "next";
import { Playfair_Display, IBM_Plex_Sans, IBM_Plex_Mono, Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Playfair Display, Syne, DM Sans and JetBrains Mono are variable fonts. Asking
// next/font/google for explicit `weight` arrays on a variable font makes
// Turbopack's font resolver emit one @font-face per weight, which it then fails
// to resolve ("next/font/google queries have exactly one entry") — the build
// error that broke the first cache-less deploy. Omitting `weight` uses the
// font's variable axis instead, which covers every weight we were asking for.
// IBM Plex Mono is a static family, so its explicit weights are required.
// IBM Plex Sans is variable but keeps its weight array deliberately: it builds
// clean today and dropping it would change how that family loads. Worth
// revisiting if the resolver error ever surfaces for ibm_plex_sans.
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
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
  title: "Park Hawkins Properties",
  description: "Park Hawkins Properties — Real Estate Investment & Acquisition",
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
