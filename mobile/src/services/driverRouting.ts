export type RoutingPoint = {
  id: string;
  number: number;
  orderNumber?: number;
  cliente: string;
  latitud: number;
  longitud: number;
};

type RoutingOrigin = Pick<RoutingPoint, "latitud" | "longitud">;

export type DrivingRouteLeg = {
  segmentIndex: number;
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

export type DrivingRouteMissingLeg = {
  segmentIndex: number;
  reason: "unroutable-point" | "no-route" | "unavailable" | "retry-limit";
};

export type DrivingRoute = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  legs: DrivingRouteLeg[];
  partial?: {
    missingLegs: DrivingRouteMissingLeg[];
    message?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  return Array.isArray(value) ? "array" : typeof value;
}

type OrsPointReference =
  | { kind: "driver" }
  | { kind: "stop"; orderNumber: number };

type OrsRoutingFailure = {
  code: number;
  pointIndexes: number[];
  segmentIndexes: number[];
};

class OrsRoutingError extends Error {
  constructor(
    message: string,
    readonly failure: OrsRoutingFailure | null,
  ) {
    super(message);
    this.name = "OrsRoutingError";
  }
}

function getOrsRoutingFailure(payload: unknown): OrsRoutingFailure | null {
  const error =
    isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code = error?.code;
  if (typeof code !== "number" || !Number.isInteger(code)) {
    return null;
  }

  const message =
    typeof error?.message === "string" ? error.message : "";
  const pointIndexes: number[] = [];
  const segmentIndexes: number[] = [];
  if (code === 2010) {
    const pattern = /specified coordinate\s+(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) !== null) {
      pointIndexes.push(Number(match[1]));
    }
  } else if (code === 2009) {
    const pair =
      /between points\s+(\d+)\s+\([^)]*\)\s+and\s+(\d+)\s+\([^)]*\)/i.exec(
        message,
      );
    if (pair) {
      const firstPointIndex = Number(pair[1]) - 1;
      const secondPointIndex = Number(pair[2]) - 1;
      pointIndexes.push(firstPointIndex, secondPointIndex);
      if (secondPointIndex === firstPointIndex + 1) {
        segmentIndexes.push(firstPointIndex);
      }
    }
  }

  return {
    code,
    pointIndexes: [...new Set(pointIndexes)],
    segmentIndexes: [...new Set(segmentIndexes)],
  };
}

function getOrsPointReference(
  coordinateIndex: number,
  points: RoutingPoint[],
  hasOrigin: boolean,
): OrsPointReference | null {
  const coordinateCount = points.length + (hasOrigin ? 1 : 0);
  if (
    !Number.isInteger(coordinateIndex) ||
    coordinateIndex < 0 ||
    coordinateIndex >= coordinateCount
  ) {
    return null;
  }
  if (hasOrigin && coordinateIndex === 0) {
    return { kind: "driver" };
  }

  const point = points[coordinateIndex - (hasOrigin ? 1 : 0)];
  if (
    !point ||
    typeof point.orderNumber !== "number" ||
    !Number.isInteger(point.orderNumber)
  ) {
    return null;
  }
  return { kind: "stop", orderNumber: point.orderNumber };
}

function getPointReferenceLabel(reference: OrsPointReference) {
  return reference.kind === "driver"
    ? "el origen GPS del conductor"
    : `la parada de orden ${reference.orderNumber}`;
}

function getSafeOrsErrorMessage(
  status: number,
  payload: unknown,
  points: RoutingPoint[],
  hasOrigin: boolean,
) {
  const error =
    isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code = error?.code;
  const message =
    typeof error?.message === "string" ? error.message : "";
  if (typeof code !== "number" || !Number.isInteger(code)) {
    return `OpenRouteService respondió con el estado ${status}.`;
  }

  if (code === 2010) {
    const coordinateIndexes: number[] = [];
    const pattern = /specified coordinate\s+(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(message)) !== null) {
      coordinateIndexes.push(Number(match[1]));
    }

    const references = coordinateIndexes
      .map((index) => getOrsPointReference(index, points, hasOrigin))
      .filter(
        (reference): reference is OrsPointReference => reference !== null,
      );
    const uniqueReferences = references.filter(
      (reference, index) =>
        references.findIndex(
          (candidate) =>
            candidate.kind === reference.kind &&
            (candidate.kind === "driver" ||
              (reference.kind === "stop" &&
                candidate.orderNumber === reference.orderNumber)),
        ) === index,
    );
    if (uniqueReferences.length > 0) {
      return `OpenRouteService no pudo enrutar ${uniqueReferences.map(getPointReferenceLabel).join(", ")} (código 2010).`;
    }
    return "OpenRouteService no encontró un punto enrutable (código 2010); no se pudo asociar a una parada.";
  }

  if (code === 2009) {
    const pair = /between points\s+(\d+)\s+\([^)]*\)\s+and\s+(\d+)\s+\([^)]*\)/i.exec(
      message,
    );
    if (pair) {
      // ORS numbers the points from 1 in this message; the request array is 0-based.
      const first = getOrsPointReference(
        Number(pair[1]) - 1,
        points,
        hasOrigin,
      );
      const second = getOrsPointReference(
        Number(pair[2]) - 1,
        points,
        hasOrigin,
      );
      if (first && second && Number(pair[2]) === Number(pair[1]) + 1) {
        return `OpenRouteService no encontró ruta entre ${getPointReferenceLabel(first)} y ${getPointReferenceLabel(second)} (código 2009).`;
      }
    }
    return "OpenRouteService no encontró una ruta (código 2009); no se pudo asociar a un tramo.";
  }

  return `OpenRouteService respondió con el estado ${status} (código ORS ${code}).`;
}

function parseCoordinates(
  value: unknown,
  fieldName: string,
): [number, number][] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${fieldName}: tipo recibido ${getValueType(value)}; esperado array con al menos 2 coordenadas; conteo recibido no disponible.`,
    );
  }
  if (value.length < 2) {
    throw new Error(
      `${fieldName}: tipo recibido array; se esperaban al menos 2 coordenadas y se recibieron ${value.length}.`,
    );
  }

  return value.map((coordinate, index) => {
    const coordinateField = `${fieldName}[${index}]`;
    if (!Array.isArray(coordinate)) {
      throw new Error(
        `${coordinateField}: tipo recibido ${getValueType(coordinate)}; esperado array [longitud, latitud].`,
      );
    }
    if (coordinate.length < 2) {
      throw new Error(
        `${coordinateField}: tipo recibido array; se esperaban al menos 2 valores y se recibieron ${coordinate.length}.`,
      );
    }

    const longitude = coordinate[0];
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(
        `${coordinateField}[0] (longitud): tipo recibido ${getValueType(longitude)}; esperado número finito entre -180 y 180.`,
      );
    }

    const latitude = coordinate[1];
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error(
        `${coordinateField}[1] (latitud): tipo recibido ${getValueType(latitude)}; esperado número finito entre -90 y 90.`,
      );
    }

    return [longitude, latitude];
  });
}

function parseDrivingRoute(
  payload: unknown,
  expectedLegCount: number,
  segmentOffset = 0,
): DrivingRoute {
  const features = isRecord(payload) ? payload.features : undefined;
  if (!Array.isArray(features)) {
    throw new Error(
      `features: tipo recibido ${getValueType(features)}; esperado array con al menos 1 elemento; conteo recibido no disponible.`,
    );
  }
  if (features.length === 0) {
    throw new Error(
      "features: tipo recibido array; se esperaba al menos 1 elemento y se recibieron 0.",
    );
  }

  const feature = features[0];
  if (!isRecord(feature)) {
    throw new Error(
      `features[0]: tipo recibido ${getValueType(feature)}; esperado object con geometry y properties.`,
    );
  }

  const geometry = feature.geometry;
  if (!isRecord(geometry)) {
    throw new Error(
      `features[0].geometry: tipo recibido ${getValueType(geometry)}; esperado object con coordinates.`,
    );
  }
  const coordinates = parseCoordinates(
    geometry.coordinates,
    "features[0].geometry.coordinates",
  );

  const properties = feature.properties;
  if (!isRecord(properties)) {
    throw new Error(
      `features[0].properties: tipo recibido ${getValueType(properties)}; esperado object con summary, segments y way_points.`,
    );
  }

  const summary = properties.summary;
  if (!isRecord(summary)) {
    throw new Error(
      `features[0].properties.summary: tipo recibido ${getValueType(summary)}; esperado object con distance y duration.`,
    );
  }

  const { distance, duration } = summary;
  if (
    typeof distance !== "number" ||
    !Number.isFinite(distance) ||
    distance < 0
  ) {
    throw new Error(
      `features[0].properties.summary.distance: tipo recibido ${getValueType(distance)}; esperado número finito mayor o igual a 0.`,
    );
  }
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 0
  ) {
    throw new Error(
      `features[0].properties.summary.duration: tipo recibido ${getValueType(duration)}; esperado número finito mayor o igual a 0.`,
    );
  }

  const segments = properties.segments;
  if (!Array.isArray(segments)) {
    throw new Error(
      `features[0].properties.segments: tipo recibido ${getValueType(segments)}; se esperaban ${expectedLegCount} tramos; conteo recibido no disponible.`,
    );
  }
  if (segments.length !== expectedLegCount) {
    throw new Error(
      `features[0].properties.segments: tipo recibido array; se esperaban ${expectedLegCount} tramos y se recibieron ${segments.length}.`,
    );
  }

  const wayPoints = properties.way_points;
  const expectedWaypointCount = expectedLegCount + 1;
  if (!Array.isArray(wayPoints)) {
    throw new Error(
      `features[0].properties.way_points: tipo recibido ${getValueType(wayPoints)}; se esperaban ${expectedWaypointCount} índices; conteo recibido no disponible.`,
    );
  }
  if (wayPoints.length !== expectedWaypointCount) {
    throw new Error(
      `features[0].properties.way_points: tipo recibido array; se esperaban ${expectedWaypointCount} índices y se recibieron ${wayPoints.length}.`,
    );
  }

  const waypointIndexes = wayPoints.map((index, waypointIndex) => {
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= coordinates.length
    ) {
      throw new Error(
        `features[0].properties.way_points[${waypointIndex}]: tipo recibido ${getValueType(index)}; esperado índice entero dentro de geometry.coordinates (conteo: ${coordinates.length}).`,
      );
    }
    return index;
  });

  const legs = segments.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(
        `features[0].properties.segments[${index}]: tipo recibido ${getValueType(segment)}; esperado object con distance y duration.`,
      );
    }
    if (
      typeof segment.distance !== "number" ||
      !Number.isFinite(segment.distance) ||
      segment.distance < 0
    ) {
      throw new Error(
        `features[0].properties.segments[${index}].distance: tipo recibido ${getValueType(segment.distance)}; esperado número finito mayor o igual a 0.`,
      );
    }
    if (
      typeof segment.duration !== "number" ||
      !Number.isFinite(segment.duration) ||
      segment.duration < 0
    ) {
      throw new Error(
        `features[0].properties.segments[${index}].duration: tipo recibido ${getValueType(segment.duration)}; esperado número finito mayor o igual a 0.`,
      );
    }

    const start = waypointIndexes[index];
    const end = waypointIndexes[index + 1];
    if (end < start) {
      throw new Error(
        `features[0].properties.way_points[${index + 1}]: tipo recibido number; se esperaba un índice mayor o igual a way_points[${index}].`,
      );
    }
    const legCoordinates = coordinates.slice(start, end + 1);
    if (legCoordinates.length === 1) {
      legCoordinates.push(legCoordinates[0]);
    }

    return {
      segmentIndex: segmentOffset + index,
      coordinates: legCoordinates,
      distanceMeters: segment.distance,
      durationSeconds: segment.duration,
    };
  });

  return {
    coordinates,
    distanceMeters: distance,
    durationSeconds: duration,
    legs,
  };
}

async function requestDrivingRoute(
  points: RoutingPoint[],
  origin?: RoutingOrigin,
  segmentOffset = 0,
): Promise<DrivingRoute> {
  const routingPoints = origin ? [origin, ...points] : points;
  if (
    routingPoints.some(
      ({ latitud, longitud }) =>
        !Number.isFinite(latitud) ||
        latitud < -90 ||
        latitud > 90 ||
        !Number.isFinite(longitud) ||
        longitud < -180 ||
        longitud > 180,
    )
  ) {
    throw new Error("El origen o una parada tienen coordenadas inválidas.");
  }

  const apiKey = process.env.EXPO_PUBLIC_ORS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta configurar EXPO_PUBLIC_ORS_API_KEY para calcular rutas con OpenRouteService.",
    );
  }

  let response: Response;
  try {
    response = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: routingPoints.map(({ longitud, latitud }) => [
            longitud,
            latitud,
          ]),
          instructions: true,
        }),
      },
    );
  } catch {
    throw new Error(
      "No se pudo conectar con OpenRouteService. Verifica tu conexión e inténtalo nuevamente.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "OpenRouteService rechazó la clave de API. Verifica su configuración y permisos.",
    );
  }
  if (response.status === 429) {
    throw new Error(
      "Se alcanzó la cuota de solicitudes de OpenRouteService. Inténtalo más tarde.",
    );
  }
  if (!response.ok) {
    if (response.status === 404) {
      let errorPayload: unknown;
      try {
        errorPayload = await response.json();
      } catch {
        throw new Error(
          "OpenRouteService respondió con el estado 404 y un cuerpo de error inválido.",
        );
      }
      throw new OrsRoutingError(
        getSafeOrsErrorMessage(
          response.status,
          errorPayload,
          points,
          origin !== undefined,
        ),
        getOrsRoutingFailure(errorPayload),
      );
    }
    throw new Error(
      `OpenRouteService respondió con el estado ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      "OpenRouteService devolvió una respuesta JSON inválida.",
    );
  }

  return parseDrivingRoute(
    payload,
    routingPoints.length - 1,
    segmentOffset,
  );
}

export async function getDrivingRoute(
  points: RoutingPoint[],
  origin?: RoutingOrigin,
): Promise<DrivingRoute | null> {
  if (points.length + (origin ? 1 : 0) < 2) {
    return null;
  }
  return requestDrivingRoute(points, origin);
}

type RouteLegRun = {
  startSegment: number;
  endSegment: number;
};

const MAX_PARTIAL_ROUTE_REQUESTS = 4;

function getValidRouteLegRuns(
  segmentCount: number,
  failedPointIndexes: Set<number>,
  missingLegReasons: Map<number, DrivingRouteMissingLeg["reason"]>,
  completedLegIndexes: Set<number>,
): RouteLegRun[] {
  const runs: RouteLegRun[] = [];
  let segmentIndex = 0;
  while (segmentIndex < segmentCount) {
    const isValidSegment = (index: number) =>
      !failedPointIndexes.has(index) &&
      !failedPointIndexes.has(index + 1) &&
      !missingLegReasons.has(index) &&
      !completedLegIndexes.has(index);
    if (!isValidSegment(segmentIndex)) {
      segmentIndex += 1;
      continue;
    }

    const startSegment = segmentIndex;
    while (
      segmentIndex + 1 < segmentCount &&
      isValidSegment(segmentIndex + 1)
    ) {
      segmentIndex += 1;
    }
    runs.push({ startSegment, endSegment: segmentIndex });
    segmentIndex += 1;
  }
  return runs;
}

function getPointsForRun(
  points: RoutingPoint[],
  origin: RoutingOrigin | undefined,
  run: RouteLegRun,
) {
  if (!origin) {
    return {
      points: points.slice(run.startSegment, run.endSegment + 2),
      origin: undefined,
    };
  }
  if (run.startSegment === 0) {
    return {
      points: points.slice(0, run.endSegment + 1),
      origin,
    };
  }
  return {
    points: points.slice(run.startSegment - 1, run.endSegment + 1),
    origin: undefined,
  };
}

function addMissingPoint(
  pointIndex: number,
  segmentCount: number,
  failedPointIndexes: Set<number>,
  missingLegReasons: Map<number, DrivingRouteMissingLeg["reason"]>,
) {
  failedPointIndexes.add(pointIndex);
  for (const segmentIndex of [pointIndex - 1, pointIndex]) {
    if (segmentIndex >= 0 && segmentIndex < segmentCount) {
      missingLegReasons.set(segmentIndex, "unroutable-point");
    }
  }
}

function applyOrsFailure(
  error: OrsRoutingError,
  runStart: number,
  runPointCount: number,
  segmentCount: number,
  failedPointIndexes: Set<number>,
  missingLegReasons: Map<number, DrivingRouteMissingLeg["reason"]>,
) {
  const failure = error.failure;
  if (!failure || (failure.code !== 2010 && failure.code !== 2009)) {
    return false;
  }

  if (failure.code === 2010) {
    const pointIndexes = failure.pointIndexes.filter(
      (index) => index >= 0 && index < runPointCount,
    );
    if (pointIndexes.length === 0) {
      return false;
    }
    pointIndexes.forEach((index) =>
      addMissingPoint(
        runStart + index,
        segmentCount,
        failedPointIndexes,
        missingLegReasons,
      ),
    );
    return true;
  }

  const segmentIndexes = failure.segmentIndexes.filter(
    (index) => index >= 0 && index < runPointCount - 1,
  );
  if (segmentIndexes.length === 0) {
    return false;
  }
  segmentIndexes.forEach((index) =>
    missingLegReasons.set(runStart + index, "no-route"),
  );
  return true;
}

export async function getDrivingRouteWithPartialSegments(
  points: RoutingPoint[],
  origin?: RoutingOrigin,
): Promise<DrivingRoute | null> {
  const nodeCount = points.length + (origin ? 1 : 0);
  const segmentCount = nodeCount - 1;
  if (segmentCount < 1) {
    return null;
  }

  let initialError: unknown;
  try {
    return await requestDrivingRoute(points, origin);
  } catch (error) {
    initialError = error;
  }

  const failedPointIndexes = new Set<number>();
  const missingLegReasons = new Map<
    number,
    DrivingRouteMissingLeg["reason"]
  >();
  if (
    !(initialError instanceof OrsRoutingError) ||
    !applyOrsFailure(
      initialError,
      0,
      nodeCount,
      segmentCount,
      failedPointIndexes,
      missingLegReasons,
    )
  ) {
    throw initialError;
  }

  const completedLegIndexes = new Set<number>();
  const legs: DrivingRouteLeg[] = [];
  let fallbackMessage: string | undefined;
  let fallbackRequestCount = 0;

  while (fallbackRequestCount < MAX_PARTIAL_ROUTE_REQUESTS) {
    const runs = getValidRouteLegRuns(
      segmentCount,
      failedPointIndexes,
      missingLegReasons,
      completedLegIndexes,
    );
    if (runs.length === 0) {
      break;
    }

    const batch = runs.slice(
      0,
      Math.min(2, MAX_PARTIAL_ROUTE_REQUESTS - fallbackRequestCount),
    );
    fallbackRequestCount += batch.length;
    let stopFallback = false;
    const results = await Promise.all(
      batch.map(async (run) => {
        const requestPoints = getPointsForRun(points, origin, run);
        try {
          return {
            run,
            status: "success" as const,
            route: await requestDrivingRoute(
              requestPoints.points,
              requestPoints.origin,
              run.startSegment,
            ),
          };
        } catch (error) {
          return { run, status: "error" as const, error };
        }
      }),
    );

    for (const result of results) {
      const { startSegment, endSegment } = result.run;
      if (result.status === "success") {
        result.route.legs.forEach((leg) => {
          legs.push(leg);
          completedLegIndexes.add(leg.segmentIndex);
        });
        continue;
      }

      const runPointCount = endSegment - startSegment + 2;
      if (
        result.error instanceof OrsRoutingError &&
        applyOrsFailure(
          result.error,
          startSegment,
          runPointCount,
          segmentCount,
          failedPointIndexes,
          missingLegReasons,
        )
      ) {
        continue;
      }

      for (
        let segmentIndex = startSegment;
        segmentIndex <= endSegment;
        segmentIndex += 1
      ) {
        missingLegReasons.set(segmentIndex, "unavailable");
      }
      fallbackMessage =
        result.error instanceof Error
          ? result.error.message
          : "No se pudo calcular uno de los tramos con OpenRouteService.";
      if (!(result.error instanceof OrsRoutingError)) {
        stopFallback = true;
      }
    }

    if (stopFallback) {
      getValidRouteLegRuns(
        segmentCount,
        failedPointIndexes,
        missingLegReasons,
        completedLegIndexes,
      ).forEach(({ startSegment, endSegment }) => {
        for (
          let segmentIndex = startSegment;
          segmentIndex <= endSegment;
          segmentIndex += 1
        ) {
          missingLegReasons.set(segmentIndex, "unavailable");
        }
      });
      break;
    }
  }

  const remainingRuns = getValidRouteLegRuns(
    segmentCount,
    failedPointIndexes,
    missingLegReasons,
    completedLegIndexes,
  );
  if (remainingRuns.length > 0) {
    remainingRuns.forEach(({ startSegment, endSegment }) => {
      for (
        let segmentIndex = startSegment;
        segmentIndex <= endSegment;
        segmentIndex += 1
      ) {
        missingLegReasons.set(segmentIndex, "retry-limit");
      }
    });
    fallbackMessage ??=
      "Se alcanzó el límite de solicitudes de recuperación para esta ruta.";
  }

  const missingLegs = Array.from({ length: segmentCount }, (_, segmentIndex) => {
    const reason =
      missingLegReasons.get(segmentIndex) ??
      (completedLegIndexes.has(segmentIndex) ? null : "unavailable");
    return reason === null ? null : { segmentIndex, reason };
  }).filter(
    (
      leg,
    ): leg is DrivingRouteMissingLeg => leg !== null,
  );

  legs.sort((first, second) => first.segmentIndex - second.segmentIndex);
  return {
    coordinates: [],
    distanceMeters: legs.reduce((total, leg) => total + leg.distanceMeters, 0),
    durationSeconds: legs.reduce(
      (total, leg) => total + leg.durationSeconds,
      0,
    ),
    legs,
    partial: {
      missingLegs,
      ...(fallbackMessage ? { message: fallbackMessage } : {}),
    },
  };
}
