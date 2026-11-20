import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";

export default function LoginScreen() {
  const { configurationError, initializationError, signIn } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 640;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function handleSignIn() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Ingresa tu correo electrónico y contraseña.");
      return;
    }

    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      await signIn(normalizedEmail, password);
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : "No se pudo iniciar sesión. Inténtalo nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isDesktop && styles.desktopScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, isDesktop && styles.desktopCard]}>
            <View style={styles.hero}>
              <View pointerEvents="none" style={styles.heroGlow} />
              <View pointerEvents="none" style={styles.heroRoad} />
              <View style={styles.heroBrandRow}>
                <Text style={styles.brandMark}>↗</Text>
                <Text style={styles.brand}>DespachGo</Text>
              </View>
              <View style={styles.heroCopy}>
                <Text accessibilityRole="header" style={styles.heroTitle}>
                  Tu día, bien encaminado.
                </Text>
                <Text style={styles.heroSubtitle}>
                  Cada parada cuenta. Vamos juntos.
                </Text>
              </View>
            </View>

            <View style={styles.form}>
              <Text accessibilityRole="header" style={styles.title}>
                Inicia sesión
              </Text>
              <Text style={styles.subtitle}>
                Ingresa con tu cuenta de conductor.
              </Text>

              <Text style={styles.label}>Correo electrónico</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel="Correo electrónico"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    setNotice(null);
                  }}
                  placeholder="conductor@ejemplo.cl"
                  placeholderTextColor="#77827c"
                  returnKeyType="next"
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
                <Text accessibilityElementsHidden style={styles.inputSymbol}>
                  @
                </Text>
              </View>

              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel="Contraseña"
                  autoCapitalize="none"
                  autoComplete="password"
                  onChangeText={setPassword}
                  onSubmitEditing={() => void handleSignIn()}
                  placeholder="Tu contraseña"
                  placeholderTextColor="#77827c"
                  returnKeyType="done"
                  secureTextEntry={!isPasswordVisible}
                  style={styles.input}
                  textContentType="password"
                  value={password}
                />
                <Pressable
                  accessibilityLabel={
                    isPasswordVisible
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  accessibilityRole="button"
                  onPress={() => setIsPasswordVisible((visible) => !visible)}
                  style={styles.visibilityButton}
                >
                  <Text style={styles.visibilityText}>
                    {isPasswordVisible ? "Ocultar" : "Mostrar"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  setNotice(
                    "Para recuperar tu contraseña, contacta a tu supervisor.",
                  )
                }
                style={styles.forgotButton}
              >
                <Text style={styles.forgotText}>Olvidé mi contraseña</Text>
              </Pressable>

              {configurationError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {configurationError}
                </Text>
              ) : null}
              {initializationError ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {initializationError}
                </Text>
              ) : null}
              {error ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              ) : null}
              {notice ? (
                <Text accessibilityLiveRegion="polite" style={styles.notice}>
                  {notice}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting || Boolean(configurationError)}
                onPress={() => void handleSignIn()}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  (isSubmitting || configurationError) &&
                    styles.buttonDisabled,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.buttonArrow}>→</Text>
                    <Text style={styles.buttonText}>Ingresar</Text>
                  </View>
                )}
              </Pressable>

              <View style={styles.secureNote}>
                <Text style={styles.secureIcon}>✓</Text>
                <Text style={styles.secureText}>
                  Acceso seguro · Solo personal autorizado
                </Text>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                ¿Necesitas ayuda? Contacta a tu supervisor
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#edf1ed",
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  desktopScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  card: {
    backgroundColor: "#f7f8f6",
    flexGrow: 1,
    width: "100%",
  },
  desktopCard: {
    borderRadius: 18,
    flexGrow: 0,
    maxWidth: 460,
    minHeight: 700,
    overflow: "hidden",
    shadowColor: "#173d2e",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 5,
  },
  hero: {
    backgroundColor: "#174a39",
    justifyContent: "space-between",
    minHeight: 242,
    overflow: "hidden",
    paddingHorizontal: 26,
    paddingTop: 24,
    paddingBottom: 24,
  },
  heroGlow: {
    backgroundColor: "#286b50",
    borderRadius: 160,
    height: 320,
    opacity: 0.5,
    position: "absolute",
    right: -120,
    top: -155,
    width: 320,
  },
  heroRoad: {
    backgroundColor: "#0f382b",
    bottom: -132,
    height: 270,
    opacity: 0.5,
    position: "absolute",
    right: 48,
    transform: [{ rotate: "18deg" }],
    width: 74,
  },
  heroBrandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  brand: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  brandMark: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "600",
  },
  heroCopy: {
    gap: 6,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "700",
    lineHeight: 29,
  },
  heroSubtitle: {
    color: "#e1ece5",
    fontSize: 13,
  },
  form: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 25,
    paddingBottom: 22,
  },
  title: {
    color: "#1d3329",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#6d7972",
    fontSize: 13,
    marginTop: 5,
    marginBottom: 20,
  },
  label: {
    color: "#26382f",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 7,
  },
  inputContainer: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8dfda",
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 15,
    minHeight: 50,
    paddingHorizontal: 13,
  },
  input: {
    color: "#24352c",
    flex: 1,
    fontSize: 14,
    minHeight: 48,
    paddingVertical: 10,
  },
  inputSymbol: {
    color: "#64746a",
    fontSize: 16,
    marginLeft: 8,
  },
  visibilityButton: {
    justifyContent: "center",
    marginLeft: 8,
    minHeight: 44,
    paddingLeft: 4,
  },
  visibilityText: {
    color: "#52675b",
    fontSize: 12,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 14,
    paddingVertical: 3,
  },
  forgotText: {
    color: "#176447",
    fontSize: 12,
    fontWeight: "600",
  },
  error: {
    color: "#a12622",
    fontSize: 12,
    marginBottom: 8,
  },
  notice: {
    color: "#52675b",
    fontSize: 12,
    marginBottom: 8,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 2,
    minHeight: 52,
  },
  buttonPressed: {
    backgroundColor: "#104b35",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  buttonArrow: {
    color: "#ffffff",
    fontSize: 18,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  secureNote: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 14,
  },
  secureIcon: {
    borderColor: "#718078",
    borderRadius: 8,
    borderWidth: 1,
    color: "#52675b",
    fontSize: 9,
    height: 15,
    lineHeight: 13,
    overflow: "hidden",
    textAlign: "center",
    width: 15,
  },
  secureText: {
    color: "#78847d",
    fontSize: 10,
  },
  footer: {
    backgroundColor: "#eff2ef",
    paddingHorizontal: 26,
    paddingVertical: 16,
  },
  footerText: {
    color: "#78847d",
    fontSize: 10,
  },
});
