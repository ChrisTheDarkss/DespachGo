import { StyleSheet, Text, View } from "react-native";
import type { MockStop } from "@/src/types/route";

type StopCardProps = {
  number: number;
  stop: MockStop;
};

const confirmationLabels = {
  confirmo: "Cliente confirmó",
  no_habra_nadie: "Cliente indicó que no habrá nadie",
  sin_respuesta: "Sin respuesta del cliente",
  quiere_hablar: "Cliente quiere hablar",
} satisfies Record<MockStop["confirmacion_cliente"], string>;

export function StopCard({ number, stop }: StopCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.number}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.customer}>{stop.cliente}</Text>
        <Text style={styles.address}>{stop.direccion}</Text>
        <Text style={styles.status}>Estado: {stop.estado}</Text>
        <Text style={styles.confirmation}>
          {confirmationLabels[stop.confirmacion_cliente]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: "#d6ddd8",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  number: {
    alignItems: "center",
    backgroundColor: "#174a39",
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
    gap: 5,
  },
  customer: {
    color: "#18211d",
    fontSize: 19,
    fontWeight: "700",
  },
  address: {
    color: "#344139",
    fontSize: 16,
    lineHeight: 22,
  },
  status: {
    color: "#344139",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 3,
  },
  confirmation: {
    color: "#52645a",
    fontSize: 15,
  },
});
