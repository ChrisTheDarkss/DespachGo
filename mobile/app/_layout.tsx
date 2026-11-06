import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/src/hooks/useAuth";
import "@/src/services/gpsTracking";

function Navigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (isLoading || !rootNavigationState?.key) {
      return;
    }

    const isOnLogin = segments[0] === "login";
    if (!session && !isOnLogin) {
      router.replace("/login");
    } else if (session && isOnLogin) {
      router.replace("/(tabs)");
    }
  }, [isLoading, rootNavigationState?.key, router, segments, session]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Navigation />
    </AuthProvider>
  );
}
