import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";
import {
  getTodaysDriverRoute,
  startDriverRoute,
} from "@/src/services/driverRoute";
import {
  requestRouteLocationPermissions,
  startLocationTracking,
} from "@/src/services/gpsTracking";
import { saveGpsConsent } from "@/src/services/gpsStore";

export default function GpsConsentScreen() {
  const { routeId: routeIdParam, resume: resumeParam } =
    useLocalSearchParams<{ routeId: string; resume?: string }>();
  const routeId = Array.isArray(routeIdParam)
    ? routeIdParam[0]
    : routeIdParam;
  const shouldResume = resumeParam === "1";
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [isLoadingRoute, setIsLoadingRoute] = useState(true);
  const [isRouteValid, setIsRouteValid] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [routeIsStarted, setRouteIsStarted] = useState(shouldResume);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consentLock = useRef(false);

  useEffect(() => {
    let active = true;

    async function validateRoute() {
      if (!routeId || !userId) {
        setError("No se encontró la sesión del conductor o la ruta.");
        setIsLoadingRoute(false);
        return;
      }

      try {
        const route = await getTodaysDriverRoute(userId);
        if (
          !route ||
          route.id !== routeId ||
          route.offlineCopy ||
          (shouldResume
            ? route.estado !== "en_curso"
            : route.estado !== "asignada")
        ) {
          throw new Error(
            "La ruta cambió de estado. Actualiza la lista antes de continuar.",
          );
        }
        if (active) {
          setIsRouteValid(true);
        }
      } catch (routeError) {
        if (active) {
          setError(
            routeError instanceof Error
              ? routeError.message
              : "No se pudo validar la ruta.",
          );
        }
      } finally {
        if (active) {
          setIsLoadingRoute(false);
        }
      }
    }

    void validateRoute();
    return () => {
      active = false;
    };
  }, [routeId, shouldResume, userId]);

  async function activateTracking(consentedAt: string) {
    if (!userId || !routeId) {
      throw new Error("No se encontró la sesión o ruta para iniciar el GPS.");
    }

    const permissions = await requestRouteLocationPermissions();
    if (!permissions.foregroundGranted) {
      setCanOpenSettings(!permissions.canAskAgain);
      throw new Error(
        "Debes permitir el acceso a la ubicación para compartir tu posición durante la ruta.",
      );
    }
    if (permissions.backgroundSupported && !permissions.backgroundGranted) {
      setCanOpenSettings(!permissions.canAskAgain);
      throw new Error(
        "Para iniciar una ruta, permite la ubicación en segundo plano. Se usará solo mientras la ruta esté activa.",
      );
    }

    if (!shouldResume && !routeIsStarted) {
      await startDriverRoute(routeId);
      setRouteIsStarted(true);
    }
    await startLocationTracking(userId, routeId, consentedAt);
    router.replace("/(tabs)");
  }

  async function handleConsent() {
    if (consentLock.current || isWorking || !isRouteValid) {
      return;
    }

    consentLock.current = true;
    setIsWorking(true);
    setError(null);
    setCanOpenSettings(false);
    try {
      if (!userId || !routeId) {
        throw new Error("No se encontró la sesión o ruta.");
      }
      const consentedAt = await saveGpsConsent(userId, routeId);
      await activateTracking(consentedAt);
    } catch (consentError) {
      setError(
        consentError instanceof Error
          ? consentError.message
          : "No se pudo activar el seguimiento GPS.",
      );
    } finally {
      consentLock.current = false;
      setIsWorking(false);
    }
  }

  async function handleRetryTracking() {
    if (
      consentLock.current ||
      isWorking ||
      !isRouteValid ||
      !userId ||
      !routeId
    ) {
      return;
    }

    consentLock.current = true;
    setIsWorking(true);
    setError(null);
    setCanOpenSettings(false);
    try {
      const consentedAt = await saveGpsConsent(userId, routeId);
      await activateTracking(consentedAt);
    } catch (trackingError) {
      setError(
        trackingError instanceof Error
          ? trackingError.message
          : "No se pudo activar el seguimiento GPS.",
      );
    } finally {
      consentLock.current = false;
      setIsWorking(false);
    }
  }

  if (isLoadingRoute) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#176447" />
          <Text style={styles.bodyText}>Validando la ruta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹  Volver</Text>
        </Pressable>
        <Text style={styles.eyebrow}>PRIVACIDAD Y SEGURIDAD</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Consentimiento de ubicación
        </Text>
        <Text style={styles.bodyText}>
          Para iniciar y completar tu ruta, DespachGo compartirá tu ubicación
          con la empresa mientras la ruta esté activa.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cómo se usará el GPS</Text>
          <Text style={styles.bullet}>
            • Se actualizará aproximadamente cada 30 segundos o al avanzar 100 metros.
          </Text>
          <Text style={styles.bullet}>
            • La base de datos conserva solo la última posición del conductor, no un historial de recorridos.
          </Text>
          <Text style={styles.bullet}>
            • El seguimiento se detiene al finalizar la ruta. Puedes detenerlo desde los ajustes del dispositivo, pero la ruta seguirá activa hasta que la finalices en la app.
          </Text>
          <Text style={styles.bullet}>
            • Se requiere permiso de ubicación en primer plano y, en móviles, en segundo plano para mantener el seguimiento con la app minimizada.
          </Text>
          {Platform.OS === "web" ? (
            <Text style={styles.webNotice}>
              En navegador, la ubicación solo se actualiza mientras esta pestaña permanezca abierta.
            </Text>
          ) : null}
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        {canOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openSettings()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Abrir ajustes de ubicación
            </Text>
          </Pressable>
        ) : null}

        {routeIsStarted ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={isWorking || !isRouteValid}
              onPress={() => void handleRetryTracking()}
              style={[
                styles.primaryButton,
                (isWorking || !isRouteValid) && styles.disabledButton,
              ]}
            >
              {isWorking ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Reintentar GPS</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/(tabs)")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Volver a mi ruta</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={isWorking || !isRouteValid}
            onPress={() => void handleConsent()}
            style={[
              styles.primaryButton,
              (isWorking || !isRouteValid) && styles.disabledButton,
            ]}
          >
            {isWorking ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Acepto y {shouldResume ? "activar GPS" : "comenzar ruta"}
              </Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f5f7f5",
    flex: 1,
  },
  loading: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 40,
  },
  backText: {
    color: "#176447",
    fontSize: 15,
    fontWeight: "700",
  },
  eyebrow: {
    color: "#bd641f",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#20342a",
    fontSize: 26,
    fontWeight: "700",
  },
  bodyText: {
    color: "#52645a",
    fontSize: 15,
    lineHeight: 23,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "700",
  },
  bullet: {
    color: "#52645a",
    fontSize: 14,
    lineHeight: 21,
  },
  webNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 8,
    color: "#8c4a1b",
    fontSize: 13,
    lineHeight: 20,
    padding: 10,
  },
  error: {
    color: "#a3352c",
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 52,
    padding: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#eaf2ed",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 46,
    padding: 12,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
