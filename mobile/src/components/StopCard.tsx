import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useRef, useState } from "react";
import type {
  CustomerConfirmation,
  RouteStop,
  StopStatus,
} from "@/src/types/route";
import type { RouteProductTotal } from "@/src/types/routeProducts";

type StopCardProps = {
  number: number;
  stop: RouteStop;
  products?: RouteProductTotal[];
  hasPendingDelivery?: boolean;
  onInteractionStart?: () => void;
  onPress: () => void;
};

const confirmationLabels: Record<CustomerConfirmation, string> = {
  confirmo: "Cliente confirmó",
  no_habra_nadie: "Cliente indicó que no habrá nadie",
  sin_respuesta: "Sin respuesta del cliente",
  quiere_hablar: "Cliente quiere hablar",
  otro: "Respuesta recibida",
};

const statusLabels: Record<StopStatus, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  parcial: "Entrega parcial",
  fallida_por_reintentar: "Fallida · Reintentar",
  fallida: "Fallida",
  omitida: "Omitida",
};

const quantityFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

export function StopCard({
  number,
  stop,
  products = [],
  hasPendingDelivery = false,
  onInteractionStart,
  onPress,
}: StopCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const longPressRef = useRef(false);
  const firstOrder = stop.ordenes[0];
  const customer =
    stop.ordenes.length > 1
      ? `${firstOrder?.cliente ?? "Cliente"} y ${stop.ordenes.length - 1} más`
      : firstOrder?.cliente ?? "Cliente no disponible";
  const address = firstOrder
    ? `${firstOrder.direccion}, ${firstOrder.comuna}`
    : "Dirección no disponible";
  const visibleProducts =
    products.length > 2 && !isExpanded ? products.slice(0, 2) : products;

  function handleLongPress() {
    if (products.length <= 2) {
      return;
    }
    longPressRef.current = true;
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((expanded) => !expanded);
  }

  return (
    <Pressable
      accessibilityLabel={`Ver detalle de la parada ${number}`}
      accessibilityRole="button"
      onTouchStart={onInteractionStart}
      onLongPress={handleLongPress}
      onPressIn={() => {
        longPressRef.current = false;
      }}
      onPress={() => {
        if (longPressRef.current) {
          longPressRef.current = false;
          return;
        }
        onPress();
      }}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.number}>
        <Text style={styles.numberText}>{number || stop.posicion}</Text>
      </View>
      <View style={styles.details}>
        <View style={styles.customerRow}>
          <Text numberOfLines={1} style={styles.customer}>
            {customer}
          </Text>
          <Text
            style={[
              styles.status,
              stop.estado === "entregada" && styles.done,
            ]}
          >
            {statusLabels[stop.estado]}
          </Text>
        </View>
        <Text style={styles.address}>{address}</Text>
        <Text
          style={[
            styles.confirmation,
            stop.confirmacion_cliente === "confirmo" &&
              styles.confirmationConfirmed,
            stop.confirmacion_cliente === "no_habra_nadie" &&
              styles.confirmationNobody,
          ]}
        >
          {confirmationLabels[stop.confirmacion_cliente]}
        </Text>
        {products.length > 0 ? (
          <View style={styles.products}>
            <Text style={styles.productsHeading}>PRODUCTOS</Text>
            {visibleProducts.map((product) => (
              <View key={product.producto_id} style={styles.productRow}>
                <Text style={styles.productQuantity}>
                  {quantityFormatter.format(product.cantidad_total)}{" "}
                  {product.unidad}
                </Text>
                <Text numberOfLines={1} style={styles.productName}>
                  {product.nombre}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {hasPendingDelivery ? (
          <Text style={styles.pending}>Entrega pendiente de sincronización</Text>
        ) : null}
        <Text style={styles.guides}>
          {stop.ordenes.length}{" "}
          {stop.ordenes.length === 1 ? "guía" : "guías"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#dce5df",
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
    padding: 9,
  },
  cardPressed: {
    backgroundColor: "#f7faf8",
  },
  number: {
    alignItems: "center",
    backgroundColor: "#eaf4ef",
    borderRadius: 6,
    height: 23,
    justifyContent: "center",
    width: 23,
  },
  numberText: {
    color: "#2850c7",
    fontSize: 11,
    fontWeight: "700",
  },
  details: {
    flex: 1,
    gap: 3,
  },
  customerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  customer: {
    color: "#20342a",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  address: {
    color: "#4b5a51",
    fontSize: 10,
    lineHeight: 14,
  },
  guides: {
    alignSelf: "flex-end",
    color: "#78847d",
    fontSize: 9,
    marginTop: 1,
  },
  status: {
    backgroundColor: "#fff1e5",
    borderRadius: 6,
    color: "#a84f14",
    fontSize: 8,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  done: {
    backgroundColor: "#eaf4ef",
    color: "#176447",
  },
  confirmation: {
    color: "#637168",
    fontSize: 9,
  },
  confirmationConfirmed: {
    color: "#176447",
    fontWeight: "700",
  },
  confirmationNobody: {
    color: "#c62828",
    fontWeight: "700",
  },
  pending: {
    color: "#a84f14",
    fontSize: 9,
    fontWeight: "700",
  },
  products: {
    gap: 4,
    marginTop: 4,
  },
  productsHeading: {
    color: "#52645a",
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 2,
  },
  productRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  productQuantity: {
    color: "#20342a",
    fontSize: 9,
    fontWeight: "700",
    minWidth: 48,
  },
  productName: {
    color: "#4b5a51",
    flex: 1,
    fontSize: 9,
  },
});
