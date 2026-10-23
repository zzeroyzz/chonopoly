"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
// Leaflet positions tiles and markers with its own stylesheet; without it the
// map renders as scattered squares. The one non-Tailwind style in the app,
// named as a stack exception in plans/properties-design-change.md.
import "leaflet/dist/leaflet.css";
import { type MapPin } from "@/lib/screen/mapPins";

/**
 * The houses as price pins, under the Properties row.
 *
 * Client-only: Leaflet reads `window` when it loads, so PropertiesPage brings
 * this in through `next/dynamic` with `ssr: false`.
 *
 * CartoDB's dark tiles, because the app is dark-only and a light map would be
 * a white hole in the page. Carto now wants a key on every tile request;
 * without one the tiles still load but carry an "API KEY REQUIRED"
 * watermark, which is at least a visible sign the key is missing.
 */

const TILES = "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png";

function tilesUrl(key: string | null): string {
  return key ? `${TILES}?key=${encodeURIComponent(key)}` : TILES;
}
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Where the map opens when no house can be placed yet: Atlanta. */
const FALLBACK_CENTRE: [number, number] = [33.749, -84.388];
const FALLBACK_ZOOM = 10;
/** Close enough to see the street when there is only one house. */
const SINGLE_HOUSE_ZOOM = 14;
/** Room for the price pill, which stands above its point. */
const FIT_PADDING: [number, number] = [48, 48];

/**
 * The pin is HTML so it can be Tailwind and carry the price. A zero-size icon
 * anchored at the point, with the pill lifted above it, puts the pill's
 * bottom edge on the house.
 */
function pinIcon(label: string, selected: boolean) {
  const tone = selected
    ? "bg-(--color-accent) text-(--color-base) border-(--color-accent)"
    : "bg-(--color-overlay) text-(--color-text-primary) border-(--color-border-strong)";
  return divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<span class="absolute -translate-x-1/2 -translate-y-full -mt-1 whitespace-nowrap rounded-(--radius-pill) border px-2.5 py-1 font-(--font-display) text-[14px] leading-[18px] font-semibold shadow-(--shadow-md) ${tone}">${label}</span>`,
  });
}

/**
 * Frames every pin when the places change, not on every render.
 *
 * Keyed on the coordinates as a string because the rows are rebuilt whenever
 * anything on a card changes — starring a house would otherwise throw away
 * the owner's pan and zoom.
 */
function FitToPins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const placesKey = pins.map((pin) => `${pin.latitude},${pin.longitude}`).join(";");

  useEffect(() => {
    if (!placesKey) return;
    const points = placesKey
      .split(";")
      .map((place) => place.split(",").map(Number) as [number, number]);
    if (points.length === 1) {
      map.setView(points[0], SINGLE_HOUSE_ZOOM);
      return;
    }
    map.fitBounds(latLngBounds(points), { padding: FIT_PADDING });
  }, [map, placesKey]);

  return null;
}

/**
 * Brings a newly chosen house into view, only if it is out of view.
 *
 * Not on the first choice: the map has just framed every house, and the
 * first card's pin sits near that frame's edge, so panning to it pushed the
 * others off the screen.
 */
function PanToSelected({ pin }: { pin: MapPin | null }) {
  const map = useMap();
  const previousId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const id = pin?.propertyId ?? null;
    const firstChoice = previousId.current === undefined;
    previousId.current = id;
    if (!pin || firstChoice) return;

    const point: [number, number] = [pin.latitude, pin.longitude];
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [map, pin]);

  return null;
}

export function HouseMap({
  pins,
  selectedId,
  onSelect,
  tilesKey,
}: {
  pins: MapPin[];
  selectedId: string | null;
  onSelect: (propertyId: string) => void;
  /** Carto's basemap key. Null shows watermarked tiles rather than none. */
  tilesKey: string | null;
}) {
  const selectedPin = useMemo(
    () => pins.find((pin) => pin.propertyId === selectedId) ?? null,
    [pins, selectedId]
  );

  return (
    <MapContainer
      center={FALLBACK_CENTRE}
      zoom={FALLBACK_ZOOM}
      scrollWheelZoom={false}
      // Leaflet's controls are white by default; these bring the zoom buttons
      // and the attribution onto the app's dark tokens. Marked important
      // because leaflet.css is unlayered and Tailwind's utilities are layered,
      // so without it Leaflet wins whatever the specificity.
      className="size-full bg-(--color-surface)! [&_.leaflet-control-attribution]:bg-(--color-base)/80! [&_.leaflet-control-attribution]:text-(--color-text-secondary)! [&_.leaflet-control-attribution_a]:text-(--color-text-secondary)! [&_.leaflet-bar]:border-(--color-border-strong)! [&_.leaflet-bar_a]:bg-(--color-overlay)! [&_.leaflet-bar_a]:text-(--color-text-primary)! [&_.leaflet-bar_a]:border-(--color-border-default)!"
    >
      <TileLayer url={tilesUrl(tilesKey)} attribution={ATTRIBUTION} />
      {pins.map((pin) => {
        const selected = pin.propertyId === selectedId;
        return (
          <Marker
            key={pin.propertyId}
            position={[pin.latitude, pin.longitude]}
            icon={pinIcon(pin.label, selected)}
            // The chosen pin draws over its neighbours.
            zIndexOffset={selected ? 1000 : 0}
            title={pin.label}
            eventHandlers={{ click: () => onSelect(pin.propertyId) }}
          />
        );
      })}
      <FitToPins pins={pins} />
      <PanToSelected pin={selectedPin} />
    </MapContainer>
  );
}
