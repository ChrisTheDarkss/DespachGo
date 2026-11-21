import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";

export type ActiveGpsRoute = {
  userId: string;
  routeId: string;
  consentedAt: string;
};

export type GpsLocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export type GpsTrackingState = {
  active: boolean;
  routeId: string | null;
  lastUploadedAt: string | null;
  error: string | null;
  latestLocation: GpsLocationFix | null;
};

export const GPS_LOCATION_MAX_AGE_MS = 90_000;

const activeKey = (userId: string) => `@despachgo/gps-active/${userId}`;
const activeUserKey = "@despachgo/gps-active-user";
const consentKey = (userId: string, routeId: string) =>
  `@despachgo/gps-consent/${userId}/${routeId}`;
const pendingKey = (userId: string) => `@despachgo/gps-pending/${userId}`;
const stateKey = (userId: string) => `@despachgo/gps-state/${userId}`;
const latestLocationListeners = new Map<
  string,
  Set<(location: GpsLocationFix | null) => void>
>();

const initialState: GpsTrackingState = {
  active: false,
  routeId: null,
  lastUploadedAt: null,
  error: null,
  latestLocation: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidGpsLocationFix(
  value: unknown,
): value is GpsLocationFix {
  return (
    isRecord(value) &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    (value.accuracy === null ||
      (typeof value.accuracy === "number" &&
        Number.isFinite(value.accuracy))) &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) &&
    value.timestamp >= 0
  );
}

export function isGpsLocationFixFresh(
  value: GpsLocationFix | null | undefined,
  now = Date.now(),
): value is GpsLocationFix {
  return (
    isValidGpsLocationFix(value) &&
    value.timestamp <= now &&
    now - value.timestamp <= GPS_LOCATION_MAX_AGE_MS
  );
}

export function subscribeToGpsLocation(
  userId: string,
  listener: (location: GpsLocationFix | null) => void,
) {
  const listeners =
    latestLocationListeners.get(userId) ?? new Set<(location: GpsLocationFix | null) => void>();
  listeners.add(listener);
  latestLocationListeners.set(userId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      latestLocationListeners.delete(userId);
    }
  };
}

function notifyGpsLocationListeners(
  userId: string,
  location: GpsLocationFix | null,
) {
  latestLocationListeners.get(userId)?.forEach((listener) => listener(location));
}

async function updateLatestGpsLocation(
  userId: string,
  location: GpsLocationFix,
) {
  const currentState = await getGpsTrackingState(userId);
  if (
    currentState.latestLocation &&
    currentState.latestLocation.timestamp >= location.timestamp
  ) {
    return;
  }

  await setGpsTrackingState(userId, { latestLocation: location });
  notifyGpsLocationListeners(userId, location);
}

function parseJson(value: string, description: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    throw new Error(`${description} guardado está dañado.`);
  }
}

export async function saveGpsConsent(userId: string, routeId: string) {
  const consent = {
    userId,
    routeId,
    acceptedAt: new Date().toISOString(),
    version: 1,
  };
  await AsyncStorage.setItem(
    consentKey(userId, routeId),
    JSON.stringify(consent),
  );
  return consent.acceptedAt;
}

export async function getActiveGpsRoute(userId: string) {
  const value = await AsyncStorage.getItem(activeKey(userId));
  if (!value) {
    return null;
  }

  const parsed = parseJson(value, "El estado de seguimiento GPS");
  if (
    !isRecord(parsed) ||
    parsed.userId !== userId ||
    typeof parsed.routeId !== "string" ||
    typeof parsed.consentedAt !== "string"
  ) {
    throw new Error("El estado de seguimiento GPS tiene un formato inválido.");
  }
  return {
    userId,
    routeId: parsed.routeId,
    consentedAt: parsed.consentedAt,
  };
}

export async function setActiveGpsRoute(route: ActiveGpsRoute) {
  await AsyncStorage.setItem(
    activeKey(route.userId),
    JSON.stringify(route),
  );
  await AsyncStorage.setItem(activeUserKey, route.userId);
  await setGpsTrackingState(route.userId, {
    active: true,
    routeId: route.routeId,
    lastUploadedAt: null,
    error: null,
    latestLocation: null,
  });
  notifyGpsLocationListeners(route.userId, null);
}

export async function clearActiveGpsRoute(
  userId: string,
  error: string | null = null,
) {
  await AsyncStorage.removeItem(activeKey(userId));
  if ((await AsyncStorage.getItem(activeUserKey)) === userId) {
    await AsyncStorage.removeItem(activeUserKey);
  }
  await setGpsTrackingState(userId, {
    active: false,
    routeId: null,
    error,
    latestLocation: null,
  });
  notifyGpsLocationListeners(userId, null);
}

export async function getCurrentActiveGpsRoute() {
  const userId = await AsyncStorage.getItem(activeUserKey);
  return userId ? getActiveGpsRoute(userId) : null;
}

export async function getGpsTrackingState(
  userId: string,
): Promise<GpsTrackingState> {
  const value = await AsyncStorage.getItem(stateKey(userId));
  if (!value) {
    return initialState;
  }

  const parsed = parseJson(value, "El estado de seguimiento GPS");
  const latestLocation =
    isRecord(parsed) && parsed.latestLocation === undefined
      ? null
      : isRecord(parsed)
        ? parsed.latestLocation
        : undefined;
  if (
    !isRecord(parsed) ||
    typeof parsed.active !== "boolean" ||
    (parsed.routeId !== null && typeof parsed.routeId !== "string") ||
    (parsed.lastUploadedAt !== null &&
      typeof parsed.lastUploadedAt !== "string") ||
    (parsed.error !== null && typeof parsed.error !== "string") ||
    (latestLocation !== null && !isValidGpsLocationFix(latestLocation))
  ) {
    throw new Error("El estado de seguimiento GPS tiene un formato inválido.");
  }
  return {
    active: parsed.active,
    routeId: parsed.routeId,
    lastUploadedAt: parsed.lastUploadedAt,
    error: parsed.error,
    latestLocation,
  };
}

export async function setGpsTrackingState(
  userId: string,
  update: Partial<GpsTrackingState>,
) {
  const current = await getGpsTrackingState(userId);
  await AsyncStorage.setItem(
    stateKey(userId),
    JSON.stringify({ ...current, ...update }),
  );
}

async function savePendingFix(userId: string, fix: GpsLocationFix) {
  await AsyncStorage.setItem(pendingKey(userId), JSON.stringify(fix));
}

async function getPendingFix(userId: string): Promise<GpsLocationFix | null> {
  const value = await AsyncStorage.getItem(pendingKey(userId));
  if (!value) {
    return null;
  }

  const parsed = parseJson(value, "La ubicación GPS pendiente");
  if (
    !isRecord(parsed) ||
    typeof parsed.latitude !== "number" ||
    !Number.isFinite(parsed.latitude) ||
    typeof parsed.longitude !== "number" ||
    !Number.isFinite(parsed.longitude) ||
    (parsed.accuracy !== null &&
      (typeof parsed.accuracy !== "number" ||
        !Number.isFinite(parsed.accuracy))) ||
    typeof parsed.timestamp !== "number" ||
    !Number.isFinite(parsed.timestamp)
  ) {
    throw new Error("La ubicación GPS pendiente tiene un formato inválido.");
  }
  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    accuracy: parsed.accuracy,
    timestamp: parsed.timestamp,
  };
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "No se pudo actualizar la ubicación GPS.";
}

export async function processGpsLocation(
  userId: string,
  fix: GpsLocationFix,
): Promise<"uploaded" | "pending" | "inactive"> {
  const activeRoute = await getActiveGpsRoute(userId);
  if (!activeRoute) {
    return "inactive";
  }
  if (isValidGpsLocationFix(fix)) {
    await updateLatestGpsLocation(userId, fix);
  }

  if (!supabase) {
    const message =
      supabaseConfigurationError ?? "Supabase no está configurado.";
    await savePendingFix(userId, fix);
    await setGpsTrackingState(userId, { active: true, error: message });
    return "pending";
  }

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (session?.user.id !== userId) {
      await AsyncStorage.removeItem(pendingKey(userId));
      await clearActiveGpsRoute(
        userId,
        "Se detuvo el GPS porque la sesión del conductor ya no está activa.",
      );
      return "inactive";
    }

    const { data: route, error: routeError } = await supabase
      .from("rutas")
      .select("estado")
      .eq("id", activeRoute.routeId)
      .eq("conductor_id", userId)
      .maybeSingle();
    if (routeError) {
      throw routeError;
    }
    if (route?.estado !== "en_curso") {
      await AsyncStorage.removeItem(pendingKey(userId));
      await clearActiveGpsRoute(userId);
      return "inactive";
    }

    const { error: locationError } = await supabase
      .from("ubicaciones_conductor")
      .upsert(
        {
          conductor_id: userId,
          latitud: fix.latitude,
          longitud: fix.longitude,
          precision_m: fix.accuracy,
        },
        { onConflict: "conductor_id" },
      );
    if (locationError) {
      throw locationError;
    }

    await AsyncStorage.removeItem(pendingKey(userId));
    await setGpsTrackingState(userId, {
      active: true,
      routeId: activeRoute.routeId,
      lastUploadedAt: new Date(fix.timestamp).toISOString(),
      error: null,
    });
    return "uploaded";
  } catch (error) {
    await savePendingFix(userId, fix);
    await setGpsTrackingState(userId, {
      active: true,
      routeId: activeRoute.routeId,
      error: errorText(error),
    });
    return "pending";
  }
}

export async function syncPendingGpsLocation(userId: string) {
  const activeRoute = await getActiveGpsRoute(userId);
  if (!activeRoute) {
    const hasPendingFix = Boolean(await getPendingFix(userId));
    await AsyncStorage.removeItem(pendingKey(userId));
    return !hasPendingFix;
  }

  const pendingFix = await getPendingFix(userId);
  if (!pendingFix) {
    return true;
  }

  const result = await processGpsLocation(userId, pendingFix);
  return result === "uploaded";
}

export async function clearPendingGpsLocation(userId: string) {
  await AsyncStorage.removeItem(pendingKey(userId));
}
