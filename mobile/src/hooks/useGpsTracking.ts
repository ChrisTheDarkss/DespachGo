import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getGpsTrackingState,
  subscribeToGpsLocation,
  type GpsTrackingState,
} from "@/src/services/gpsStore";
import {
  isLocationTrackingActive,
  stopLocationTracking,
  syncGpsLocation,
} from "@/src/services/gpsTracking";

const initialState: GpsTrackingState = {
  active: false,
  routeId: null,
  lastUploadedAt: null,
  error: null,
  latestLocation: null,
};

export function useGpsTracking(
  userId: string | undefined,
  routeId?: string,
) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);
  const previousTrackingRef = useRef({ userId, routeId });

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
      const refreshedState = await getGpsTrackingState(userId);
      setState((currentState) => {
        const latestLocation =
          currentState.latestLocation &&
          (!refreshedState.latestLocation ||
            currentState.latestLocation.timestamp >
              refreshedState.latestLocation.timestamp)
            ? currentState.latestLocation
            : refreshedState.latestLocation;
        return { ...refreshedState, latestLocation };
      });
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
    setState(initialState);
    setError(null);
    if (!userId) {
      return;
    }

    return subscribeToGpsLocation(userId, (latestLocation) => {
      setState((currentState) => {
        if (!latestLocation) {
          return { ...currentState, latestLocation: null };
        }
        return currentState.latestLocation &&
          currentState.latestLocation.timestamp >= latestLocation.timestamp
          ? currentState
          : { ...currentState, latestLocation };
      });
    });
  }, [userId]);

  useEffect(() => {
    const previous = previousTrackingRef.current;
    previousTrackingRef.current = { userId, routeId };

    const userChanged = Boolean(previous.userId && previous.userId !== userId);
    const routeChanged = Boolean(
      previous.userId &&
        previous.userId === userId &&
        previous.routeId &&
        previous.routeId !== routeId,
    );
    if (!previous.userId || (!userChanged && !routeChanged)) {
      return;
    }

    setState(initialState);
    setError(null);
    void stopLocationTracking(previous.userId).catch((stopError: unknown) => {
      setError(
        stopError instanceof Error
          ? stopError.message
          : "No se pudo detener el seguimiento GPS anterior.",
      );
    });
  }, [routeId, userId]);

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
