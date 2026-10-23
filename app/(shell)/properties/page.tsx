import { PropertiesPage } from "@/components/properties/PropertiesPage";

export default function PropertiesRoute() {
  // Read on the server so the name needs no NEXT_PUBLIC_ prefix. It still
  // reaches the browser: Carto's basemap key rides on every tile URL, which
  // is how their keys are meant to be used.
  return <PropertiesPage mapTilesKey={process.env.CARTO_API_KEY ?? null} />;
}
