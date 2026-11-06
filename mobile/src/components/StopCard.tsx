import { StyleSheet, Text, View } from "react-native";
import type {
  CustomerConfirmation,
  RouteStop,
  StopStatus,
} from "@/src/types/route";

type StopCardProps = {
  number: number;
  stop: RouteStop;
  hasPendingDelivery?: boolean;
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

export function StopCard({
  number,
  stop,
  hasPendingDelivery = false,
}: StopCardProps) {
  const firstOrder = stop.ordenes[0];
  const customer =
    stop.ordenes.length > 1
      ? `${firstOrder?.cliente ?? "Cliente"} y ${stop.ordenes.length - 1} más`
      : firstOrder?.cliente ?? "Cliente no disponible";
  const address = firstOrder
    ? `${firstOrder.direccion}, ${firstOrder.comuna}`
    : "Dirección no disponible";

  return (
    <View style={styles.card}>
      <View style={styles.number}>
        <Text style={styles.numberText}>{number || stop.posicion}</Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.customer}>{customer}</Text>
        <Text style={styles.address}>{address}</Text>
        <Text style={styles.guides}>
          {stop.ordenes.length}{" "}
          {stop.ordenes.length === 1 ? "guía" : "guías"}
        </Text>
        <Text style={[styles.status, stop.estado === "entregada" && styles.done]}>
          {statusLabels[stop.estado]}
        </Text>
        <Text style={styles.confirmation}>
          {confirmationLabels[stop.confirmacion_cliente]}
        </Text>
        {hasPendingDelivery ? (
          <Text style={styles.pending}>Entrega pendiente de sincronización</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#e0e5e1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  number: {
    alignItems: "center",
    backgroundColor: "#176447",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  numberText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  details: {
    flex: 1,
    gap: 6,
  },
  customer: {
    color: "#20342a",
    fontSize: 19,
    fontWeight: "700",
  },
  address: {
    color: "#4b5a51",
    fontSize: 16,
    lineHeight: 22,
  },
  guides: {
    color: "#78847d",
    fontSize: 13,
  },
  status: {
    color: "#bd641f",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
  },
  done: {
    color: "#176447",
  },
  confirmation: {
    color: "#637168",
    fontSize: 13,
  },
  pending: {
    color: "#a84f14",
    fontSize: 12,
    fontWeight: "700",
  },
});
