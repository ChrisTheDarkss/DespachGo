import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/src/hooks/useAuth";

function Navigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isOnLogin = segments[0] === "login";
    if (!session && !isOnLogin) {
      router.replace("/login");
    } else if (session && isOnLogin) {
      router.replace("/(tabs)");
    }
  }, [isLoading, router, segments, session]);

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
