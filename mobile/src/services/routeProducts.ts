import { getTodaysDriverRoute } from "@/src/services/driverRoute";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import type {
  RouteProductTotal,
  RouteProductsSummary,
  RouteStopProducts,
} from "@/src/types/routeProducts";
import type { DriverRoute } from "@/src/types/route";

type RouteOrderItemRow = {
  orden_id: string;
  producto_id: string;
  cantidad_pedida: number;
};

type RouteProductRow = {
  id: string;
  nombre: string;
  unidad: string;
};

function addProductQuantity(
  totals: Map<string, RouteProductTotal>,
  product: RouteProductRow,
  quantity: number,
) {
  const total = totals.get(product.id);
  if (total) {
    total.cantidad_total += quantity;
  } else {
    totals.set(product.id, {
      producto_id: product.id,
      nombre: product.nombre,
      unidad: product.unidad,
      cantidad_total: quantity,
    });
  }
}
function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function getTodaysRouteProductsSummary(
  conductorId: string,
  knownRoute?: DriverRoute | null,
): Promise<RouteProductsSummary> {
  const route =
    knownRoute === undefined
      ? await getTodaysDriverRoute(conductorId)
      : knownRoute;
  if (!route) {
    return { paradas: [], total_general: [] };
  }

  const productsByStop: RouteStopProducts[] = route.paradas.map((stop) => {
    const orders = stop.ordenes;
    const clientes = [...new Set(orders.map((order) => order.cliente))];
    const direcciones = [
      ...new Set(
        orders.map((order) => `${order.direccion}, ${order.comuna}`),
      ),
    ];

    return {
      parada_id: stop.id,
      posicion: stop.posicion,
      cliente: clientes.join(" · ") || "Cliente no disponible",
      direccion: direcciones.join(" · ") || "Dirección no disponible",
      guias: [...new Set(orders.map((order) => order.numero_guia))],
      productos: [],
    };
  });
  const stopIdByOrderId = new Map<string, string>();

  for (const stop of route.paradas) {
    for (const order of stop.ordenes) {
      stopIdByOrderId.set(order.id, stop.id);
    }
  }

  const orderIds = [...stopIdByOrderId.keys()];
  if (orderIds.length === 0) {
    return { paradas: productsByStop, total_general: [] };
  }

  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("orden_items")
    .select("orden_id, producto_id, cantidad_pedida")
    .in("orden_id", orderIds);

  throwIfError(itemsError);
  const items = (itemRows ?? []) as RouteOrderItemRow[];
  const productIds = [...new Set(items.map(({ producto_id }) => producto_id))];
  if (productIds.length === 0) {
    return { paradas: productsByStop, total_general: [] };
  }

  const { data: productRows, error: productsError } = await supabase
    .from("productos")
    .select("id, nombre, unidad")
    .in("id", productIds);

  throwIfError(productsError);
  const products = (productRows ?? []) as RouteProductRow[];
  const productById = new Map(
    products.map((product) => [product.id, product]),
  );
  const totalsByStop = new Map<string, Map<string, RouteProductTotal>>(
    productsByStop.map(({ parada_id }) => [parada_id, new Map()]),
  );
  const totalGeneral = new Map<string, RouteProductTotal>();

  for (const item of items) {
    const product = productById.get(item.producto_id);
    if (!product) {
      throw new Error("No se pudo cargar un producto de la ruta.");
    }
    if (!Number.isFinite(item.cantidad_pedida)) {
      throw new Error("La ruta contiene una cantidad de producto inválida.");
    }

    const stopId = stopIdByOrderId.get(item.orden_id);
    if (!stopId) {
      throw new Error("No se pudo asociar un producto con su parada.");
    }
    const stopTotals = totalsByStop.get(stopId);
    if (!stopTotals) {
      throw new Error("No se encontró la parada asociada a un producto.");
    }

    addProductQuantity(stopTotals, product, item.cantidad_pedida);
    addProductQuantity(totalGeneral, product, item.cantidad_pedida);
  }

  return {
    paradas: productsByStop.map((stop) => ({
      ...stop,
      productos: [...(totalsByStop.get(stop.parada_id)?.values() ?? [])],
    })),
    total_general: [...totalGeneral.values()],
  };
}
