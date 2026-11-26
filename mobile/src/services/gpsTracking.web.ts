import * as Location from "expo-location";
import {
  clearActiveGpsRoute,
  clearPendingGpsLocation,
  getCurrentActiveGpsRoute,
  processGpsLocation,
  setActiveGpsRoute,
  setGpsTrackingState,
  syncPendingGpsLocation,
} from "@/src/services/gpsStore";

let watchId: number | null = null;

export async function requestRouteLocationPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  return {
    foregroundGranted: foreground.granted,
    backgroundGranted: foreground.granted,
    backgroundSupported: false,
    canAskAgain: foreground.canAskAgain,
  };
}

export async function startLocationTracking(
  userId: string,
  routeId: string,
  consentedAt: string,
) {
  if (!navigator.geolocation) {
    throw new Error("Este navegador no ofrece acceso a la ubicación.");
  }

  const activeRoute = await getCurrentActiveGpsRoute();
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (activeRoute) {
    await clearActiveGpsRoute(activeRoute.userId);
  }

  await clearPendingGpsLocation(userId);
  await setActiveGpsRoute({ userId, routeId, consentedAt });
  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        void processGpsLocation(userId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        })
          .then((result) => {
            if (result === "inactive" && watchId !== null) {
              navigator.geolocation.clearWatch(watchId);
              watchId = null;
            }
          })
          .catch((error: unknown) =>
            setGpsTrackingState(userId, {
              active: true,
              routeId,
              error:
                error instanceof Error
                  ? error.message
                  : "No se pudo guardar la ubicación GPS.",
            }),
          );
      },
      (error) => {
        void setGpsTrackingState(userId, {
          active: true,
          routeId,
          error: error.message,
        });
      },
      {
        // Tiempo real: GPS de alta precisión y nunca una lectura en caché.
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10_000,
      },
    );
  } catch (error) {
    await clearActiveGpsRoute(
      userId,
      error instanceof Error ? error.message : "No se pudo iniciar el GPS.",
    );
    throw error;
  }
}

export async function stopLocationTracking(userId: string) {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  await clearActiveGpsRoute(userId);
  await clearPendingGpsLocation(userId);
}

export async function syncGpsLocation(userId: string) {
  return syncPendingGpsLocation(userId);
}

export async function isLocationTrackingActive(
  userId: string,
  routeId: string,
) {
  const activeRoute = await getCurrentActiveGpsRoute();
  const isActive =
    watchId !== null &&
    activeRoute?.userId === userId &&
    activeRoute.routeId === routeId;
  if (!isActive) {
    await clearActiveGpsRoute(
      userId,
      activeRoute?.userId === userId
        ? "El seguimiento GPS dejó de ejecutarse en esta pestaña."
        : null,
    );
  }
  return isActive;
}
