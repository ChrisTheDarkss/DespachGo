import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/hooks/useAuth";

export default function LoginScreen() {
  const { configurationError, initializationError, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }

    setError(null);
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.brand}>DespachGo</Text>
          <Text style={styles.title}>Inicio de sesión</Text>
          <Text style={styles.subtitle}>Acceso para conductores</Text>

          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            accessibilityLabel="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="conductor@ejemplo.cl"
            placeholderTextColor="#68736d"
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            accessibilityLabel="Contraseña"
            autoCapitalize="none"
            onChangeText={setPassword}
            onSubmitEditing={handleSignIn}
            placeholder="Tu contraseña"
            placeholderTextColor="#68736d"
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />

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

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || Boolean(configurationError)}
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (isSubmitting || configurationError) && styles.buttonDisabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Entrar</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f7f8f6",
    flex: 1,
  },
  keyboard: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brand: {
    color: "#174a39",
    fontSize: 20,
    fontWeight: "700",
  },
  title: {
    color: "#18211d",
    fontSize: 30,
    fontWeight: "700",
    marginTop: 16,
  },
  subtitle: {
    color: "#46534c",
    fontSize: 18,
    marginBottom: 20,
  },
  label: {
    color: "#18211d",
    fontSize: 17,
    fontWeight: "600",
    marginTop: 4,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#7a8780",
    borderRadius: 10,
    borderWidth: 1,
    color: "#18211d",
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#174a39",
    borderRadius: 10,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 60,
  },
  buttonPressed: {
    backgroundColor: "#103729",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  error: {
    color: "#a12622",
    fontSize: 16,
  },
});
