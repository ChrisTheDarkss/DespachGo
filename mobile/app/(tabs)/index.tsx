import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StopCard } from "@/src/components/StopCard";
import { mockStops } from "@/src/data/mockStops";
import { useAuth } from "@/src/hooks/useAuth";

export default function TodayRouteScreen() {
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "No se pudo cerrar la sesión.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={mockStops}
        keyExtractor={(stop) => stop.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>DESPACHOS</Text>
              <Text style={styles.title}>Mi ruta de hoy</Text>
            </View>
            <Text style={styles.mockLabel}>Datos de prueba</Text>
            <Text style={styles.count}>
              {mockStops.length} paradas
            </Text>
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <StopCard number={index + 1} stop={item} />
        )}
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            disabled={isSigningOut}
            onPress={handleSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutPressed,
            ]}
          >
            {isSigningOut ? (
              <ActivityIndicator color="#174a39" />
            ) : (
              <Text style={styles.signOutText}>Cerrar sesión</Text>
            )}
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f7f8f6",
    flex: 1,
  },
  listContent: {
    gap: 12,
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: "#52645a",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: "#18211d",
    fontSize: 28,
    fontWeight: "700",
  },
  mockLabel: {
    alignSelf: "flex-start",
    backgroundColor: "#e5eee8",
    borderRadius: 6,
    color: "#174a39",
    fontSize: 14,
    fontWeight: "600",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  count: {
    color: "#46534c",
    fontSize: 17,
    marginTop: 4,
  },
  error: {
    color: "#a12622",
    fontSize: 16,
  },
  signOutButton: {
    alignItems: "center",
    borderColor: "#174a39",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 56,
  },
  signOutPressed: {
    backgroundColor: "#e5eee8",
  },
  signOutText: {
    color: "#174a39",
    fontSize: 18,
    fontWeight: "700",
  },
});
