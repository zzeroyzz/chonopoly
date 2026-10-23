/**
 * The Properties map's pins, from the same rows as the cards.
 *
 * Pure and kept out of the map component, which imports Leaflet and cannot
 * load outside a browser, so the labels and the "not on the map" count are
 * tested without one.
 */

export interface PinnableHouse {
  propertyId: string;
  listPrice: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MapPin {
  propertyId: string;
  latitude: number;
  longitude: number;
  label: string;
}

/** Said on the pin when nobody has entered an asking price. */
export const NO_PRICE_PIN_LABEL = "No price";

/**
 * Short enough to sit on a pin: "$135k", "$1.2M".
 *
 * Rounded to the nearest thousand below a million, so two houses $400 apart
 * read the same — the card beside it carries the exact figure.
 */
export function pinLabel(listPrice: number | null): string {
  if (listPrice === null || !Number.isFinite(listPrice) || listPrice <= 0) {
    return NO_PRICE_PIN_LABEL;
  }
  if (listPrice >= 1_000_000) {
    const millions = Math.round(listPrice / 100_000) / 10;
    return `$${millions}M`;
  }
  if (listPrice >= 1_000) return `$${Math.round(listPrice / 1_000)}k`;
  return `$${Math.round(listPrice)}`;
}

/** Every house that can be placed, and how many cannot. */
export function mapPins(houses: PinnableHouse[]): { pins: MapPin[]; unplaced: number } {
  const pins: MapPin[] = [];
  for (const house of houses) {
    if (house.latitude === null || house.longitude === null) continue;
    pins.push({
      propertyId: house.propertyId,
      latitude: house.latitude,
      longitude: house.longitude,
      label: pinLabel(house.listPrice),
    });
  }
  return { pins, unplaced: houses.length - pins.length };
}
