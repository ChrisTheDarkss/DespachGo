import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  getQueuedDeliveries,
  type QueuedDelivery,
} from "@/src/services/deliveryOutbox";
import { syncPendingDeliveries } from "@/src/services/deliverySync";

export function useDeliveryOutbox(userId: string | undefined) {
  const [queue, setQueue] = useState<QueuedDelivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const requestId = useRef(0);

  const refresh = useCallback(
    async (retryFailed = false) => {
      const currentRequestId = ++requestId.current;
      if (!userId) {
        setQueue([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        await syncPendingDeliveries(userId, retryFailed);
        const nextQueue = await getQueuedDeliveries(userId);
        if (requestId.current === currentRequestId) {
          setQueue(nextQueue);
          setError(null);
        }
      } catch (refreshError) {
        if (requestId.current === currentRequestId) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "No se pudo revisar la cola de entregas pendientes.",
          );
        }
      } finally {
        if (requestId.current === currentRequestId) {
          setIsLoading(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    requestId.current += 1;
    setQueue([]);
    setError(null);
    setIsLoading(Boolean(userId));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void refresh();
      }
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    return () => {
      unsubscribeNetwork();
      subscription.remove();
    };
  }, [refresh]);

  return { queue, error, isLoading, refresh };
}
