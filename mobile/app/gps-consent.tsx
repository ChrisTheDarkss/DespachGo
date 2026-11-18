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
          <Text style={styles.intro}>Validando la ruta...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero} accessibilityElementsHidden>
            <View style={styles.heroRing}>
              <View style={styles.heroIcon}>
                <Text style={styles.pinGlyph}>⌖</Text>
              </View>
              <View style={styles.shieldBadge}>
                <Text style={styles.shieldGlyph}>✓</Text>
              </View>
            </View>
          </View>

          <Text style={styles.eyebrow}>TU UBICACIÓN, CON UN PROPÓSITO</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Activa el GPS para acompañar tu ruta
          </Text>
          <Text style={styles.intro}>
            Usamos tu ubicación durante la ruta activa para orientar tus
            entregas y mantener informado al equipo.
          </Text>

          <View style={styles.featureList}>
            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureGlyph}>↗</Text>
              </View>
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>Llega a cada cliente</Text>
                <Text style={styles.featureText}>
                  Se actualiza aproximadamente cada 30 segundos o al avanzar
                  100 metros.
                </Text>
              </View>
            </View>
            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureGlyph}>◉</Text>
              </View>
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>
                  Coordina con operaciones
                </Text>
                <Text style={styles.featureText}>
                  Se conserva solo tu última posición, no un historial de
                  recorridos.
                </Text>
              </View>
            </View>
            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureGlyph}>✓</Text>
              </View>
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>Solo durante tu jornada</Text>
                <Text style={styles.featureText}>
                  El seguimiento se detiene al finalizar la ruta. Si lo
                  detienes desde los ajustes del dispositivo, la ruta seguirá
                  activa hasta que la finalices en la app.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoNote}>
            <Text style={styles.infoGlyph}>ⓘ</Text>
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle}>Tú decides</Text>
              <Text style={styles.infoText}>
                Se requiere permiso de ubicación en primer plano y, en móviles,
                en segundo plano para mantener el seguimiento con la app
                minimizada. Si eliges «Ahora no», podrás revisar tu ruta sin
                iniciar el seguimiento.
              </Text>
            </View>
          </View>

          {Platform.OS === "web" ? (
            <Text style={styles.webNotice}>
              En navegador, la ubicación solo se actualiza mientras esta
              pestaña permanezca abierta.
            </Text>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          {canOpenSettings ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openSettings()}
              style={styles.settingsButton}
            >
              <Text style={styles.settingsButtonText}>
                Abrir ajustes de ubicación
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={isWorking || !isRouteValid}
            onPress={() =>
              void (routeIsStarted
                ? handleRetryTracking()
                : handleConsent())
            }
            style={[
              styles.primaryButton,
              (isWorking || !isRouteValid) && styles.disabledButton,
            ]}
          >
            {isWorking ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {routeIsStarted
                  ? "Reintentar GPS"
                  : "⌖  Aceptar y activar GPS"}
              </Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isWorking}
            onPress={() => router.replace("/(tabs)")}
            style={[
              styles.secondaryButton,
              isWorking && styles.disabledButton,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              {routeIsStarted ? "Volver a mi ruta" : "Ahora no"}
            </Text>
          </Pressable>
          <Text style={styles.footerHint}>
            Puedes cambiar este permiso en Ajustes del teléfono.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f7f9f7",
    flex: 1,
  },
  screen: {
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  eyebrow: {
    color: "#176447",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  title: {
    color: "#20342a",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 29,
  },
  intro: {
    color: "#52645a",
    fontSize: 13,
    lineHeight: 19,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    marginTop: 2,
  },
  heroRing: {
    alignItems: "center",
    backgroundColor: "#eaf4ef",
    borderColor: "#d7e9df",
    borderRadius: 80,
    borderWidth: 1,
    height: 136,
    justifyContent: "center",
    width: 136,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 18,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  pinGlyph: {
    color: "#ffffff",
    fontSize: 37,
    lineHeight: 44,
  },
  shieldBadge: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    bottom: 18,
    height: 30,
    justifyContent: "center",
    position: "absolute",
    right: 24,
    width: 30,
  },
  shieldGlyph: {
    color: "#176447",
    fontSize: 17,
    fontWeight: "700",
  },
  featureList: {
    gap: 16,
    marginTop: 4,
  },
  feature: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: "#edf5f0",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    marginTop: 1,
    width: 28,
  },
  featureGlyph: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
  },
  featureCopy: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    color: "#263c31",
    fontSize: 12,
    fontWeight: "700",
  },
  featureText: {
    color: "#52645a",
    fontSize: 11,
    lineHeight: 16,
  },
  infoNote: {
    alignItems: "flex-start",
    backgroundColor: "#eaf4ef",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
    padding: 10,
  },
  infoGlyph: {
    color: "#176447",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 1,
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    color: "#263c31",
    fontSize: 11,
    fontWeight: "700",
  },
  infoText: {
    color: "#52645a",
    fontSize: 10,
    lineHeight: 14,
  },
  webNotice: {
    backgroundColor: "#fff0e3",
    borderRadius: 8,
    color: "#8c4a1b",
    fontSize: 11,
    lineHeight: 16,
    padding: 8,
  },
  error: {
    color: "#a3352c",
    fontSize: 12,
    lineHeight: 18,
  },
  settingsButton: {
    alignItems: "center",
    borderColor: "#176447",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    padding: 10,
  },
  settingsButtonText: {
    color: "#176447",
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#f7f9f7",
    borderTopColor: "#e8ede9",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e0e8e2",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    padding: 9,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 12,
  },
  footerHint: {
    color: "#78877e",
    fontSize: 9,
    lineHeight: 13,
    paddingBottom: 2,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
