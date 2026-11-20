import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RouteProductTotal } from "@/src/types/routeProducts";

type RouteLoadChecklistProps = {
  products: RouteProductTotal[];
  selectedProductIds: string[];
  isLoading: boolean;
  isConfirmed: boolean;
  error: string | null;
  onInteractionStart?: () => void;
  onToggleProduct: (productId: string) => void;
};

const quantityFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export function RouteLoadChecklist({
  products,
  selectedProductIds,
  isLoading,
  isConfirmed,
  error,
  onInteractionStart,
  onToggleProduct,
}: RouteLoadChecklistProps) {
  if (isLoading) {
    return (
      <View style={styles.status}>
        <ActivityIndicator color="#176447" />
        <Text style={styles.statusText}>Cargando productos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>
        Marca los productos que llevas en el vehículo. Puedes dejar productos
        sin marcar si no se entregarán.
      </Text>
      {products.length === 0 ? (
        <Text style={styles.statusText}>
          No hay productos registrados para esta ruta.
        </Text>
      ) : (
        <View style={styles.productList}>
          {products.map((product) => {
            const checked = selectedProductIds.includes(product.producto_id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                key={product.producto_id}
                onTouchStart={onInteractionStart}
                onPress={() => onToggleProduct(product.producto_id)}
                style={styles.productRow}
              >
                <View
                  style={[styles.checkbox, checked && styles.checkboxChecked]}
                >
                  {checked ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={styles.productName}>{product.nombre}</Text>
                <Text style={styles.quantity}>
                  {quantityFormatter.format(product.cantidad_total)}{" "}
                  {product.unidad}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {isConfirmed ? (
        <Text style={styles.confirmedNote}>
          La carga confirmada será el límite para registrar las entregas.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  instruction: {
    color: "#52645a",
    fontSize: 12,
    lineHeight: 18,
  },
  productList: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e9e3",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  productRow: {
    alignItems: "center",
    borderBottomColor: "#e8ede9",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 9,
    minHeight: 44,
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#84948a",
    borderRadius: 4,
    borderWidth: 1,
    height: 18,
    justifyContent: "center",
    width: 18,
  },
  checkboxChecked: {
    backgroundColor: "#176447",
    borderColor: "#176447",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
  },
  productName: {
    color: "#263c31",
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  quantity: {
    color: "#176447",
    fontSize: 12,
    fontWeight: "700",
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  statusText: {
    color: "#52645a",
    fontSize: 13,
  },
  error: {
    color: "#a3352c",
    fontSize: 12,
    lineHeight: 17,
  },
  confirmedNote: {
    color: "#176447",
    fontSize: 11,
    textAlign: "center",
  },
});
