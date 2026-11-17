import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProductsSummary } from "@/src/components/RouteProductsSummary";
import { useAuth } from "@/src/hooks/useAuth";

export default function RouteLoadScreen() {
  const router = useRouter();
  const { session } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text accessibilityRole="header" style={styles.title}>
            Carga de la ruta
          </Text>
          <RouteProductsSummary conductorId={session?.user.id} />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
          </Pressable>
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
  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 24,
  },
  title: {
    color: "#20342a",
    fontSize: 24,
    fontWeight: "700",
  },
  footer: {
    backgroundColor: "#f7f9f7",
    borderTopColor: "#e8ede9",
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
});
