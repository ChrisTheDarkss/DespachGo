import type {
  DrivingRoute,
  DrivingRouteLeg,
} from "@/src/services/driverRouting";

type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function getDistanceMeters(first: LatLng, second: LatLng) {
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) *
      Math.cos(toRadians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function getPathLengthMeters(coordinates: [number, number][]) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += getDistanceMeters(
      {
        latitude: coordinates[index - 1][1],
        longitude: coordinates[index - 1][0],
      },
      { latitude: coordinates[index][1], longitude: coordinates[index][0] },
    );
  }
  return total;
}

/**
 * Busca el segmento de la polilínea más cercano a la posición.
 * Las coordenadas son [longitud, latitud]. Usa una proyección plana local,
 * suficiente para distancias de pocos cientos de metros.
 */
function findNearestSegment(
  coordinates: [number, number][],
  position: LatLng,
  fromSegment: number,
) {
  const metersPerDegreeLatitude = 111_320;
  const metersPerDegreeLongitude =
    111_320 * Math.cos(toRadians(position.latitude));
  let best = { segmentIndex: fromSegment, distanceMeters: Infinity };

  for (let index = fromSegment; index < coordinates.length - 1; index += 1) {
    const ax = (coordinates[index][0] - position.longitude) * metersPerDegreeLongitude;
    const ay = (coordinates[index][1] - position.latitude) * metersPerDegreeLatitude;
    const bx = (coordinates[index + 1][0] - position.longitude) * metersPerDegreeLongitude;
    const by = (coordinates[index + 1][1] - position.latitude) * metersPerDegreeLatitude;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const distanceMeters = Math.hypot(ax + t * dx, ay + t * dy);
    if (distanceMeters < best.distanceMeters) {
      best = { segmentIndex: index, distanceMeters };
    }
  }
  return best;
}

export type RouteProgress = {
  route: DrivingRoute;
  /** Distancia del conductor a la línea de la ruta (m). Infinity si no se pudo medir. */
  offRouteMeters: number;
  /** Segmento alcanzado dentro del primer tramo; evita que el avance retroceda. */
  segmentIndex: number;
};

/**
 * Ajusta el primer tramo (conductor → siguiente parada) a la posición actual:
 * elimina lo ya recorrido, inicia la línea en el conductor y recalcula
 * distancia y duración restantes. No consulta ninguna API.
 */
export function trimRouteToLocation(
  route: DrivingRoute,
  location: LatLng,
  minSegmentIndex = 0,
): RouteProgress {
  const firstLeg = route.legs.find((leg) => leg.segmentIndex === 0);
  if (!firstLeg || firstLeg.coordinates.length < 2) {
    return { route, offRouteMeters: Infinity, segmentIndex: 0 };
  }

  const nearest = findNearestSegment(
    firstLeg.coordinates,
    location,
    Math.min(minSegmentIndex, firstLeg.coordinates.length - 2),
  );
  const remainingCoordinates: [number, number][] = [
    [location.longitude, location.latitude],
    ...firstLeg.coordinates.slice(nearest.segmentIndex + 1),
  ];
  const remainingLength = Math.min(
    getPathLengthMeters(remainingCoordinates),
    firstLeg.distanceMeters,
  );
  const ratio =
    firstLeg.distanceMeters > 0
      ? Math.min(remainingLength / firstLeg.distanceMeters, 1)
      : 1;
  const trimmedLeg: DrivingRouteLeg = {
    ...firstLeg,
    coordinates: remainingCoordinates,
    distanceMeters: remainingLength,
    durationSeconds: firstLeg.durationSeconds * ratio,
  };
  const legs = route.legs.map((leg) => (leg === firstLeg ? trimmedLeg : leg));

  return {
    route: {
      ...route,
      legs,
      coordinates: legs.flatMap((leg) => leg.coordinates),
      distanceMeters:
        route.distanceMeters - firstLeg.distanceMeters + trimmedLeg.distanceMeters,
      durationSeconds:
        route.durationSeconds -
        firstLeg.durationSeconds +
        trimmedLeg.durationSeconds,
    },
    offRouteMeters: nearest.distanceMeters,
    segmentIndex: nearest.segmentIndex,
  };
}
