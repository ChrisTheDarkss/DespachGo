import { useState } from "react";
import { RouteMap as LeafletRouteMap } from "@/src/components/RouteMap.leaflet.native";
import { RouteMap as MapLibreRouteMap } from "@/src/components/RouteMap.maplibre.native";
import type { RouteMapProps } from "@/src/components/RouteMap.types";

export function RouteMap(props: RouteMapProps) {
  const [useMapLibre, setUseMapLibre] = useState(false);

  if (useMapLibre) {
    return <MapLibreRouteMap {...props} />;
  }

  return (
    <LeafletRouteMap
      {...props}
      onLoadError={() => setUseMapLibre(true)}
    />
  );
}
