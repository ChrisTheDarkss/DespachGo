import { getTodaysDriverRoute } from "@/src/services/driverRoute";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import type { RouteProductTotal } from "@/src/types/routeProducts";

type RouteOrderItemRow = {
  producto_id: string;
  cantidad_pedida: number;
};

type RouteProductRow = {
  id: string;
  nombre: string;
  unidad: string;
};

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export async function getTodaysRouteProductTotals(
  conductorId: string,
): Promise<RouteProductTotal[]> {
  const route = await getTodaysDriverRoute(conductorId);
  if (!route) {
    return [];
  }

  const orderIds = [
    ...new Set(
      route.paradas.flatMap((stop) => stop.ordenes.map((order) => order.id)),
    ),
  ];
  if (orderIds.length === 0) {
    return [];
  }

  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("orden_items")
    .select("producto_id, cantidad_pedida")
    .in("orden_id", orderIds);

  throwIfError(itemsError);
  const items = (itemRows ?? []) as RouteOrderItemRow[];
  const productIds = [...new Set(items.map(({ producto_id }) => producto_id))];
  if (productIds.length === 0) {
    return [];
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
  const totalsByProduct = new Map<string, RouteProductTotal>();

  for (const item of items) {
    const product = productById.get(item.producto_id);
    if (!product) {
      throw new Error("No se pudo cargar un producto de la ruta.");
    }
    if (!Number.isFinite(item.cantidad_pedida)) {
      throw new Error("La ruta contiene una cantidad de producto inválida.");
    }

    const total = totalsByProduct.get(item.producto_id);
    if (total) {
      total.cantidad_total += item.cantidad_pedida;
    } else {
      totalsByProduct.set(item.producto_id, {
        producto_id: item.producto_id,
        nombre: product.nombre,
        unidad: product.unidad,
        cantidad_total: item.cantidad_pedida,
      });
    }
  }

  return [...totalsByProduct.values()];
}
