import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import {
  clearActiveGpsRoute,
  clearPendingGpsLocation,
  getCurrentActiveGpsRoute,
  processGpsLocation,
  setActiveGpsRoute,
  setGpsTrackingState,
  syncPendingGpsLocation,
} from "@/src/services/gpsStore";

const locationTaskName = "despachgo-active-route-location";

type LocationTaskPayload = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask<LocationTaskPayload>(
  locationTaskName,
  async ({ data, error }) => {
    const activeRoute = await getCurrentActiveGpsRoute();
    if (!activeRoute) {
      const isRunning =
        await Location.hasStartedLocationUpdatesAsync(locationTaskName);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(locationTaskName);
      }
      return;
    }

    if (error) {
      await setGpsTrackingState(activeRoute.userId, {
        active: true,
        routeId: activeRoute.routeId,
        error: error.message,
      });
      return;
    }

    const location = data?.locations?.at(-1);
    if (!location) {
      return;
    }

    const result = await processGpsLocation(activeRoute.userId, {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp,
    });

    if (result === "inactive") {
      const isRunning =
        await Location.hasStartedLocationUpdatesAsync(locationTaskName);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(locationTaskName);
      }
    }
  },
);

export async function requestRouteLocationPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    return {
      foregroundGranted: false,
      backgroundGranted: false,
      backgroundSupported: true,
      canAskAgain: foreground.canAskAgain,
    };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return {
    foregroundGranted: true,
    backgroundGranted: background.granted,
    backgroundSupported: true,
    canAskAgain: background.canAskAgain,
  };
}

export async function startLocationTracking(
  userId: string,
  routeId: string,
  consentedAt: string,
) {
  if (!(await TaskManager.isAvailableAsync())) {
    throw new Error(
      "El seguimiento en segundo plano necesita instalar y abrir la versión de desarrollo de la app.",
    );
  }

  const isRunning =
    await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  const activeRoute = await getCurrentActiveGpsRoute();
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(locationTaskName);
  }
  if (activeRoute) {
    await clearActiveGpsRoute(activeRoute.userId);
  }

  await clearPendingGpsLocation(userId);
  await setActiveGpsRoute({ userId, routeId, consentedAt });
  try {
    await Location.startLocationUpdatesAsync(locationTaskName, {
      // Tiempo real: una posición por segundo (o cada metro recorrido),
      // sin agrupar lecturas (no usar deferredUpdates*) y sin pausas
      // automáticas del sistema.
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.AutomotiveNavigation,
      distanceInterval: 1,
      timeInterval: 1_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "DespachGo · ruta en curso",
        notificationBody: "El GPS se comparte con la empresa durante tu ruta.",
        notificationColor: "#176447",
        killServiceOnDestroy: false,
      },
    });
  } catch (error) {
    await clearActiveGpsRoute(
      userId,
      error instanceof Error ? error.message : "No se pudo iniciar el GPS.",
    );
    throw error;
  }
}

export async function stopLocationTracking(userId: string) {
  await clearActiveGpsRoute(userId);
  const isRunning =
    await Location.hasStartedLocationUpdatesAsync(locationTaskName);
  if (isRunning) {
    try {
      await Location.stopLocationUpdatesAsync(locationTaskName);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo detener el servicio de ubicación.";
      await setGpsTrackingState(userId, {
        active: false,
        routeId: null,
        error: message,
      });
      throw error;
    }
  }
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
  const isRunning =
    activeRoute?.userId === userId &&
    activeRoute.routeId === routeId &&
    (await Location.hasStartedLocationUpdatesAsync(locationTaskName));
  if (!isRunning) {
    await clearActiveGpsRoute(
      userId,
      activeRoute?.userId === userId
        ? "El seguimiento GPS dejó de ejecutarse en el dispositivo."
        : null,
    );
  }
  return isRunning;
}
