import { useMemo } from "react";
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

function getInitialViewState(points: RouteMapProps["points"]): InitialViewState {
  if (points.length === 1) {
    return {
      center: [points[0].longitud, points[0].latitud],
      zoom: 14,
    };
  }

  const longitudes = points.map(({ longitud }) => longitud);
  const latitudes = points.map(({ latitud }) => latitud);
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
  compact = false,
}: RouteMapProps) {
  const lineData = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!drivingRoute) {
      return null;
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: drivingRoute.coordinates,
          },
        },
      ],
    };
  }, [drivingRoute]);
  const initialViewState = useMemo(
    () => getInitialViewState(points),
    [points],
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
        {lineData ? (
          <GeoJSONSource id="driving-route" data={lineData}>
            <Layer
              id="driving-route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#176447", "line-width": 5 }}
            />
          </GeoJSONSource>
        ) : null}
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
