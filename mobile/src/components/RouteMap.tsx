import { StyleSheet, Text, View } from "react-native";
import type { RouteMapProps } from "@/src/components/RouteMap.types";

export function RouteMap({ points, compact = false }: RouteMapProps) {
  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <Text style={styles.title}>
        El mapa interactivo está disponible en la app móvil.
      </Text>
      {points.map((point) => (
        <Text key={point.id} style={styles.stop}>
          {point.number}. {point.cliente}
        </Text>
      ))}
      <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  compactContainer: {
    padding: 12,
  },
  title: {
    color: "#20342a",
    fontSize: 15,
    fontWeight: "700",
  },
  stop: {
    color: "#52645a",
    fontSize: 14,
  },
  attribution: {
    color: "#68766d",
    fontSize: 11,
    marginTop: 4,
  },
});
