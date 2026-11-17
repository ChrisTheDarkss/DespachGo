import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getTodaysRouteProductsSummary } from "@/src/services/routeProducts";
import type { RouteProductsSummary as RouteProductsSummaryData } from "@/src/types/routeProducts";

type RouteProductsSummaryProps = {
  conductorId: string | undefined;
};

const quantityFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export function RouteProductsSummary({
  conductorId,
}: RouteProductsSummaryProps) {
  const [summary, setSummary] = useState<RouteProductsSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setIsLoading(true);
      setError(null);
      if (!conductorId) {
        setError("No se encontró la sesión del conductor.");
        setIsLoading(false);
        return;
      }

      try {
        const routeSummary = await getTodaysRouteProductsSummary(conductorId);
        if (active) {
          setSummary(routeSummary);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el resumen de productos.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();
    return () => {
      active = false;
    };
  }, [conductorId, retryCount]);

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Total general
      </Text>

      {isLoading ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color="#176447" size="large" />
          <Text style={styles.statusText}>Cargando productos...</Text>
        </View>
      ) : error ? (
        <View style={styles.status}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetryCount((count) => count + 1)}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : summary?.total_general.length ? (
        <>
          <View style={styles.productList}>
            {summary.total_general.map((product) => (
              <View key={product.producto_id} style={styles.productRow}>
                <Text style={styles.productName}>{product.nombre}</Text>
                <Text style={styles.quantity}>
                  {quantityFormatter.format(product.cantidad_total)}{" "}
                  {product.unidad}
                </Text>
              </View>
            ))}
          </View>

          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Productos por parada
          </Text>
          {summary.paradas.map((stop) => (
            <View key={stop.parada_id} style={styles.stopCard}>
              <Text style={styles.customer}>
                Parada {stop.posicion}: {stop.cliente}
              </Text>
              {stop.productos.length > 0 ? (
                stop.productos.map((product) => (
                  <View
                    key={product.producto_id}
                    style={styles.productRow}
                  >
                    <Text style={styles.productName}>{product.nombre}</Text>
                    <Text style={styles.quantity}>
                      {quantityFormatter.format(product.cantidad_total)}{" "}
                      {product.unidad}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.statusText}>
                  Sin productos registrados para esta parada.
                </Text>
              )}
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.statusText}>
          No hay productos registrados para esta ruta.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionTitle: {
    color: "#20342a",
    fontSize: 20,
    fontWeight: "700",
  },
  status: {
    alignItems: "flex-start",
    gap: 12,
  },
  statusText: {
    color: "#52645a",
    fontSize: 16,
    lineHeight: 23,
  },
  error: {
    color: "#a3352c",
    fontSize: 16,
    lineHeight: 23,
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#176447",
    borderRadius: 9,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  productList: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e9e3",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  productRow: {
    alignItems: "center",
    borderTopColor: "#e8ede9",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingTop: 8,
  },
  productName: {
    color: "#263c31",
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  quantity: {
    color: "#176447",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
    textAlign: "right",
  },
  stopCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e9e3",
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  customer: {
    color: "#20342a",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
  },
});
