export type RoutingPoint = {
  id: string;
  number: number;
  cliente: string;
  latitud: number;
  longitud: number;
};

export type DrivingRoute = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  legs: {
    distanceMeters: number;
    durationSeconds: number;
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getDrivingRoute(
  points: RoutingPoint[],
): Promise<DrivingRoute | null> {
  if (points.length < 2) {
    return null;
  }

  const routingEndpoint = process.env.EXPO_PUBLIC_OSRM_ROUTING_URL?.trim();
  if (!routingEndpoint) {
    throw new Error(
      "Configura un endpoint OSRM aprobado por la empresa antes de enviarle coordenadas de entregas.",
    );
  }

  const coordinates = points
    .map(({ latitud, longitud }) => `${longitud},${latitud}`)
    .join(";");
  const response = await fetch(
    `${routingEndpoint.replace(/\/+$/, "")}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
  );
  if (!response.ok) {
    throw new Error(
      `El servicio de rutas respondió con el estado ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.code !== "Ok") {
    const message =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : "No se pudo calcular un recorrido vial para estas paradas.";
    throw new Error(message);
  }

  const routes = payload.routes;
  const firstRoute =
    Array.isArray(routes) && routes.length > 0 ? routes[0] : null;
  if (!isRecord(firstRoute) || !isRecord(firstRoute.geometry)) {
    throw new Error("El servicio de rutas devolvió un recorrido incompleto.");
  }

  const rawCoordinates = firstRoute.geometry.coordinates;
  if (!Array.isArray(rawCoordinates)) {
    throw new Error("El servicio de rutas devolvió coordenadas inválidas.");
  }

  const routeCoordinates: [number, number][] = [];
  for (const coordinate of rawCoordinates) {
    if (
      !Array.isArray(coordinate) ||
      typeof coordinate[0] !== "number" ||
      typeof coordinate[1] !== "number" ||
      !Number.isFinite(coordinate[0]) ||
      !Number.isFinite(coordinate[1])
    ) {
      throw new Error("El servicio de rutas devolvió coordenadas inválidas.");
    }
    routeCoordinates.push([coordinate[0], coordinate[1]]);
  }

  if (
    routeCoordinates.length < 2 ||
    typeof firstRoute.distance !== "number" ||
    typeof firstRoute.duration !== "number"
  ) {
    throw new Error("El servicio de rutas devolvió un recorrido incompleto.");
  }

  const rawLegs = firstRoute.legs;
  if (!Array.isArray(rawLegs)) {
    throw new Error("El servicio de rutas devolvió tramos incompletos.");
  }
  const legs = rawLegs.map((leg) => {
    if (
      !isRecord(leg) ||
      typeof leg.distance !== "number" ||
      !Number.isFinite(leg.distance) ||
      typeof leg.duration !== "number" ||
      !Number.isFinite(leg.duration)
    ) {
      throw new Error("El servicio de rutas devolvió tramos inválidos.");
    }
    return {
      distanceMeters: leg.distance,
      durationSeconds: leg.duration,
    };
  });

  return {
    coordinates: routeCoordinates,
    distanceMeters: firstRoute.distance,
    durationSeconds: firstRoute.duration,
    legs,
  };
}
