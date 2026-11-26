import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";

const WELCOME_DURATION_MS = 4000;

// Aviso breve que confirma que el inicio de sesión funcionó. Vive en el layout
// raíz para seguir visible cuando la app pasa del login a la pantalla de ruta.
export function WelcomeBanner() {
  const { welcomeMessage, dismissWelcome } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!welcomeMessage) {
      return;
    }
    const timer = setTimeout(dismissWelcome, WELCOME_DURATION_MS);
    return () => clearTimeout(timer);
  }, [dismissWelcome, welcomeMessage]);

  if (!welcomeMessage) {
    return null;
  }

  return (
    <Pressable
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      onPress={dismissWelcome}
      style={[styles.banner, { top: insets.top + 8 }]}
    >
      <Text style={styles.icon}>✓</Text>
      <Text style={styles.text}>{welcomeMessage}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#176447",
    borderRadius: 12,
    elevation: 8,
    flexDirection: "row",
    gap: 10,
    maxWidth: "90%",
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    zIndex: 1000,
  },
  icon: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  text: {
    color: "#ffffff",
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
  },
});
