import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getTodaysRouteProductTotals } from "@/src/services/routeProducts";
import type { RouteProductTotal } from "@/src/types/routeProducts";

type RouteProductsSummaryProps = {
  conductorId: string;
};

const quantityFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export function RouteProductsSummary({
  conductorId,
}: RouteProductsSummaryProps) {
  const [products, setProducts] = useState<RouteProductTotal[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setIsLoading(true);
      setError(null);
      try {
        const totals = await getTodaysRouteProductTotals(conductorId);
        if (active) {
          setProducts(totals);
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

    void loadProducts();
    return () => {
      active = false;
    };
  }, [conductorId, retryCount]);

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Productos que llevas
      </Text>

      {isLoading ? (
        <View accessibilityLiveRegion="polite" style={styles.status}>
          <ActivityIndicator color="#176447" size="large" />
          <Text style={styles.statusText}>Cargando el total de productos...</Text>
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
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Reintentar carga</Text>
          </Pressable>
        </View>
      ) : products?.length ? (
        <View style={styles.productList}>
          {products.map((product) => (
            <View key={product.producto_id} style={styles.productRow}>
              <Text style={styles.productName}>{product.nombre}</Text>
              <Text style={styles.quantity}>
                {quantityFormatter.format(product.cantidad_total)}{" "}
                {product.unidad}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.statusText}>
          No hay productos registrados para esta ruta.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dce8df",
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  title: {
    color: "#20342a",
    fontSize: 18,
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
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  productList: {
    gap: 10,
  },
  productRow: {
    alignItems: "flex-start",
    borderTopColor: "#e8ede9",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    paddingTop: 9,
  },
  productName: {
    color: "#263c31",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  quantity: {
    color: "#176447",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
  },
});
