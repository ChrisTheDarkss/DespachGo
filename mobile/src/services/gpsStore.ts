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

// --- Tiempo real -----------------------------------------------------------
// Estado en memoria para que la posición llegue a la pantalla y a Supabase sin
// esperar lecturas/escrituras de AsyncStorage ni consultas repetidas.
const ROUTE_VERIFY_INTERVAL_MS = 60_000;
const STATE_PERSIST_INTERVAL_MS = 5_000;
const GPS_UPLOAD_TIMEOUT_MS = 8_000;

type GpsUploadResult = "uploaded" | "pending" | "inactive";

const latestFixInMemory = new Map<string, GpsLocationFix>();
const lastLocationPersistedAt = new Map<string, number>();
const lastUploadStatePersistedAt = new Map<string, number>();
const routeVerifiedAt = new Map<string, { routeId: string; at: number }>();
const uploadChannels = new Map<
  string,
  { inFlight: boolean; queued: GpsLocationFix | null }
>();
let stateWriteQueue: Promise<unknown> = Promise.resolve();

function resetLiveGpsState(userId: string) {
  latestFixInMemory.delete(userId);
  lastLocationPersistedAt.delete(userId);
  lastUploadStatePersistedAt.delete(userId);
  routeVerifiedAt.delete(userId);
  const channel = uploadChannels.get(userId);
  if (channel) {
    channel.queued = null;
  }
}

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
  const known = latestFixInMemory.get(userId);
  if (known && known.timestamp >= location.timestamp) {
    return;
  }

  latestFixInMemory.set(userId, location);
  // 1) La pantalla se entera al instante (sin pasar por AsyncStorage).
  notifyGpsLocationListeners(userId, location);

  // 2) Se persiste solo de vez en cuando: es únicamente para recuperar la
  //    última posición si la app se reinicia.
  const now = Date.now();
  if (now - (lastLocationPersistedAt.get(userId) ?? 0) < STATE_PERSIST_INTERVAL_MS) {
    return;
  }
  lastLocationPersistedAt.set(userId, now);
  await setGpsTrackingState(userId, (current) =>
    current.active ? { latestLocation: location } : null,
  );
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
  resetLiveGpsState(route.userId);
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
  resetLiveGpsState(userId);
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

// Las escrituras del estado se serializan: con posiciones cada segundo, dos
// escrituras simultáneas (leer-modificar-escribir) se pisarían entre sí.
// `update` puede ser una función que devuelve null para omitir la escritura.
export function setGpsTrackingState(
  userId: string,
  update:
    | Partial<GpsTrackingState>
    | ((current: GpsTrackingState) => Partial<GpsTrackingState> | null),
) {
  const run = stateWriteQueue.then(async () => {
    const current = await getGpsTrackingState(userId);
    const patch = typeof update === "function" ? update(current) : update;
    if (!patch) {
      return;
    }
    await AsyncStorage.setItem(
      stateKey(userId),
      JSON.stringify({ ...current, ...patch }),
    );
  });
  stateWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
): Promise<GpsUploadResult> {
  const activeRoute = await getActiveGpsRoute(userId);
  if (!activeRoute) {
    return "inactive";
  }

  // La notificación a la pantalla ocurre de forma síncrona dentro de
  // updateLatestGpsLocation; la subida a Supabase arranca en paralelo.
  const persisted = isValidGpsLocationFix(fix)
    ? updateLatestGpsLocation(userId, fix)
    : Promise.resolve();
  const upload = enqueueGpsUpload(userId, activeRoute.routeId, fix);
  const [, result] = await Promise.all([persisted, upload]);
  return result;
}

// Solo hay una subida en curso por conductor. Si llegan posiciones mientras
// tanto, se conserva únicamente la más reciente: así nunca se forma una cola
// y el mapa del despachador siempre recibe la posición más actual.
async function enqueueGpsUpload(
  userId: string,
  routeId: string,
  fix: GpsLocationFix,
): Promise<GpsUploadResult> {
  const channel = uploadChannels.get(userId) ?? {
    inFlight: false,
    queued: null,
  };
  uploadChannels.set(userId, channel);

  if (channel.inFlight) {
    if (!channel.queued || channel.queued.timestamp <= fix.timestamp) {
      channel.queued = fix;
    }
    return "pending";
  }

  channel.inFlight = true;
  let result: GpsUploadResult = "pending";
  let current: GpsLocationFix | null = fix;
  try {
    while (current) {
      result = await uploadGpsFix(userId, routeId, current);
      if (result === "inactive") {
        channel.queued = null;
        break;
      }
      current = channel.queued;
      channel.queued = null;
    }
  } finally {
    channel.inFlight = false;
  }
  return result;
}

async function uploadGpsFix(
  userId: string,
  routeId: string,
  fix: GpsLocationFix,
): Promise<GpsUploadResult> {
  if (!supabase) {
    const message =
      supabaseConfigurationError ?? "Supabase no está configurado.";
    await savePendingFix(userId, fix);
    await setGpsTrackingState(userId, { active: true, error: message });
    return "pending";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GPS_UPLOAD_TIMEOUT_MS);
  try {
    // Sesión y estado de la ruta se verifican como máximo una vez por minuto
    // (antes se consultaban en cada posición).
    const verified = routeVerifiedAt.get(userId);
    if (
      !verified ||
      verified.routeId !== routeId ||
      Date.now() - verified.at >= ROUTE_VERIFY_INTERVAL_MS
    ) {
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
        .eq("id", routeId)
        .eq("conductor_id", userId)
        .abortSignal(controller.signal)
        .maybeSingle();
      if (routeError) {
        throw routeError;
      }
      if (route?.estado !== "en_curso") {
        await AsyncStorage.removeItem(pendingKey(userId));
        await clearActiveGpsRoute(userId);
        return "inactive";
      }
      routeVerifiedAt.set(userId, { routeId, at: Date.now() });
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
      )
      .abortSignal(controller.signal);
    if (locationError) {
      throw locationError;
    }

    await AsyncStorage.removeItem(pendingKey(userId));
    const now = Date.now();
    if (
      now - (lastUploadStatePersistedAt.get(userId) ?? 0) >=
      STATE_PERSIST_INTERVAL_MS
    ) {
      lastUploadStatePersistedAt.set(userId, now);
      await setGpsTrackingState(userId, (current) =>
        current.routeId === routeId
          ? {
              active: true,
              lastUploadedAt: new Date(fix.timestamp).toISOString(),
              error: null,
            }
          : null,
      );
    }
    return "uploaded";
  } catch (error) {
    await savePendingFix(userId, fix);
    // Para que el aviso de error se limpie en cuanto vuelva la conexión.
    lastUploadStatePersistedAt.delete(userId);
    const message = controller.signal.aborted
      ? "El servidor no respondió a tiempo. Reintentando…"
      : errorText(error);
    await setGpsTrackingState(userId, (current) =>
      current.routeId === routeId ? { active: true, error: message } : null,
    );
    return "pending";
  } finally {
    clearTimeout(timeout);
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

  // Si ya hay una posición más nueva, la pendiente es obsoleta: subirla haría
  // que el marcador "retroceda" en el mapa del despachador.
  const known = latestFixInMemory.get(userId);
  if (known && known.timestamp > pendingFix.timestamp) {
    await AsyncStorage.removeItem(pendingKey(userId));
    return true;
  }

  const result = await processGpsLocation(userId, pendingFix);
  return result === "uploaded";
}

export async function clearPendingGpsLocation(userId: string) {
  await AsyncStorage.removeItem(pendingKey(userId));
}
