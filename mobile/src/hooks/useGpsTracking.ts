import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  getGpsTrackingState,
  type GpsTrackingState,
} from "@/src/services/gpsStore";
import {
  isLocationTrackingActive,
  syncGpsLocation,
} from "@/src/services/gpsTracking";

const initialState: GpsTrackingState = {
  active: false,
  routeId: null,
  lastUploadedAt: null,
  error: null,
};

export function useGpsTracking(
  userId: string | undefined,
  routeId?: string,
) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(initialState);
      setError(null);
      return;
    }

    try {
      await syncGpsLocation(userId);
      if (routeId) {
        await isLocationTrackingActive(userId, routeId);
      }
      setState(await getGpsTrackingState(userId));
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "No se pudo consultar el estado del GPS.",
      );
    }
  }, [routeId, userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refresh();
      }
    });
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [refresh]);

  return { state, error, refresh };
}
