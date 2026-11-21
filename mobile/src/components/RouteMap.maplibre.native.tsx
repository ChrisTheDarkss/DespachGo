import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  RasterSource,
  type InitialViewState,
  type StyleSpecification,
} from "@maplibre/maplibre-react-native";
import type { FeatureCollection, LineString } from "geojson";
import type { RouteMapProps } from "@/src/components/RouteMap.types";
import {
  isGpsLocationFixFresh,
  isValidGpsLocationFix,
  type GpsLocationFix,
} from "@/src/services/gpsStore";

const routeColors = ["#2563EB", "#F97316", "#9333EA", "#0D9488"];

const openStreetMapStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f5f7f5" },
    },
  ],
};

function getInitialViewState(
  points: RouteMapProps["points"],
  driverLocation: GpsLocationFix | null,
): InitialViewState {
  const coordinates: [number, number][] = points.map(
    ({ longitud, latitud }) => [longitud, latitud],
  );
  if (driverLocation) {
    coordinates.push([driverLocation.longitude, driverLocation.latitude]);
  }
  if (coordinates.length === 1) {
    return {
      center: coordinates[0],
      zoom: 14,
    };
  }

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const longitudePadding = west === east ? 0.002 : 0;
  const latitudePadding = south === north ? 0.002 : 0;

  return {
    bounds: [
      west - longitudePadding,
      south - latitudePadding,
      east + longitudePadding,
      north + latitudePadding,
    ],
    padding: { top: 50, right: 50, bottom: 60, left: 50 },
  };
}

export function RouteMap({
  points,
  drivingRoute,
  currentLocation = null,
  gpsTrackingActive = false,
  compact = false,
}: RouteMapProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const driverLocation =
    gpsTrackingActive &&
    isValidGpsLocationFix(currentLocation) &&
    currentLocation.timestamp <= now
      ? currentLocation
      : null;
  const driverLocationIsRecent =
    driverLocation !== null && isGpsLocationFixFresh(driverLocation, now);
  const legData = useMemo(() => {
    if (!drivingRoute) {
      return [];
    }

    return drivingRoute.legs.map((leg) => ({
      segmentIndex: leg.segmentIndex,
      data: {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: leg.coordinates,
            },
          },
        ],
      } satisfies FeatureCollection<LineString>,
    }));
  }, [drivingRoute]);
  const initialViewState = useMemo(
    () => getInitialViewState(points, driverLocation),
    [driverLocation, points],
  );

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <Map
        mapStyle={openStreetMapStyle}
        style={styles.map}
        logo
        attribution
        scaleBar
      >
        <Camera initialViewState={initialViewState} />
        <RasterSource
          id="open-street-map"
          attribution="© OpenStreetMap contributors"
          tileSize={256}
          tiles={["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]}
        >
          <Layer id="open-street-map-tiles" type="raster" />
        </RasterSource>
        {legData.map(({ segmentIndex, data }) => (
          <GeoJSONSource
            data={data}
            id={`driving-route-${segmentIndex}`}
            key={segmentIndex}
          >
            <Layer
              id={`driving-route-line-${segmentIndex}`}
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color":
                  routeColors[segmentIndex % routeColors.length],
                "line-width": 5,
              }}
            />
          </GeoJSONSource>
        ))}
        {points.map((point) => (
          <Marker
            anchor="bottom"
            id={point.id}
            key={point.id}
            lngLat={[point.longitud, point.latitud]}
          >
            <View style={styles.marker}>
              <Text style={styles.markerText}>{point.number}</Text>
            </View>
          </Marker>
        ))}
        {driverLocation ? (
          <Marker
            anchor="center"
            id="driver-location"
            lngLat={[driverLocation.longitude, driverLocation.latitude]}
          >
            <View
              accessibilityLabel={
                driverLocationIsRecent
                  ? "Ubicación reciente del conductor"
                  : "Última ubicación conocida del conductor"
              }
              style={[
                styles.driverMarker,
                !driverLocationIsRecent && styles.staleDriverMarker,
              ]}
            />
          </Marker>
        ) : null}
      </Map>
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    flex: 1,
    minHeight: 420,
    overflow: "hidden",
  },
  compactContainer: {
    flex: 0,
    height: 230,
    minHeight: 230,
  },
  map: {
    flex: 1,
  },
  marker: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  markerText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  driverMarker: {
    backgroundColor: "#0891b2",
    borderColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 3,
    height: 20,
    width: 20,
  },
  staleDriverMarker: {
    backgroundColor: "#64748b",
  },
  attribution: {
    backgroundColor: "rgba(255,255,255,0.9)",
    bottom: 5,
    color: "#33443a",
    fontSize: 10,
    left: 6,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 3,
    position: "absolute",
  },
});
