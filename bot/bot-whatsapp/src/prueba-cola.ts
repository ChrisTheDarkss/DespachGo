
import { ColaLocal } from "./cola/colaLocal.js";
import { ProcesadorCola } from "./cola/procesador.js";
import type { Mensajero } from "./mensajeria/interfaz.js";

// Simulador: no envía mensajes reales.
class MensajeroSimulado implements Mensajero {
  async enviarMensaje(
    telefono: string,
    texto: string
  ): Promise<void> {
    console.log(`\n📤 Simulando envío a ${telefono}`);
    console.log(`Mensaje: ${texto}`);

    // Simulamos un error para comprobar su registro.
    if (telefono === "+56900000000") {
      throw new Error("Número de prueba rechazado");
    }

    console.log("✅ Envío simulado correctamente");
  }
}

async function main(): Promise<void> {
  const cola = new ColaLocal();

  cola.agregar({
    id: "despacho-001",
    telefono: "+56911111111",
    texto: "🚚 Tu pedido va en camino. Responde 1, 2 o 3.",
    estado: "pendiente",
    intentos: 0
  });

  cola.agregar({
    id: "despacho-002",
    telefono: "+56900000000",
    texto: "🚚 Tu pedido va en camino.",
    estado: "pendiente",
    intentos: 0
  });

  cola.agregar({
    id: "despacho-003",
    telefono: "+56933333333",
    texto: "🚚 Tu pedido va en camino.",
    estado: "pendiente",
    intentos: 0
  });

  const mensajero = new MensajeroSimulado();
  const procesador = new ProcesadorCola(cola, mensajero);

  console.log("=== INICIANDO COLA ===");

  await procesador.procesar();

  console.log("\n=== RESULTADO FINAL ===");
  console.table(cola.listar());
}

main().catch(console.error);
