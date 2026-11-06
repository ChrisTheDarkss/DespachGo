import {
  supabase,
  supabaseConfigurationError,
} from "@/src/lib/supabase";
import NetInfo from "@react-native-community/netinfo";
import {
  cacheDriverRoute,
  cacheDriverStop,
  clearCachedDriverRoute,
  getCachedDriverRoute,
  getCachedDriverStop,
} from "@/src/services/driverCache";
import type {
  CustomerConfirmation,
  DriverRoute,
  OmissionReason,
  RouteStop,
  StopDetail,
  StopOrder,
  StopStatus,
} from "@/src/types/route";

type RouteRow = Pick<DriverRoute, "id" | "fecha" | "estado">;
type StopRow = {
  id: string;
  posicion_final: number | null;
  posicion_sugerida: number | null;
  estado: StopStatus;
  confirmacion_cliente: CustomerConfirmation;
};
type StopOrderRow = {
  parada_id: string;
  orden_id: string;
};
type OrderRow = {
  id: string;
  cliente_nombre: string;
  direccion: string;
  comuna: string;
  numero_guia: string;
  cliente_telefono: string;
  latitud: number | null;
  longitud: number | null;
  notas: string | null;
};
type DetailStopRow = {
  id: string;
  ruta_id: string;
  estado: StopStatus;
  posicion_final: number | null;
  posicion_sugerida: number | null;
  confirmacion_cliente: CustomerConfirmation;
  motivo_omision: OmissionReason | null;
  comentario_omision: string | null;
};
type DetailOrderItemRow = {
  id: string;
  orden_id: string;
  producto_id: string;
  cantidad_pedida: number;
};
type ProductRow = {
  id: string;
  nombre: string;
  unidad: string;
};

export type RouteFinalSummary = {
  ruta_id: string;
  entregadas: number;
  parciales: number;
  fallidas: number;
  omitidas: number;
  sin_visitar: number;
  entregas_sin_foto: number;
};

function getTodayInSantiago() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

async function fetchTodaysDriverRoute(
  conductorId: string,
): Promise<DriverRoute | null> {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data: route, error: routeError } = await supabase
    .from("rutas")
    .select("id, fecha, estado")
    .eq("conductor_id", conductorId)
    .eq("fecha", getTodayInSantiago())
    .in("estado", ["asignada", "en_curso"])
    .maybeSingle();

  throwIfError(routeError);
  if (!route) {
    return null;
  }

  const routeRow = route as RouteRow;
  const { data: stopRows, error: stopsError } = await supabase
    .from("paradas")
    .select(
      "id, posicion_final, posicion_sugerida, estado, confirmacion_cliente",
    )
    .eq("ruta_id", routeRow.id)
    .order("posicion_final", { ascending: true, nullsFirst: false });

  throwIfError(stopsError);
  const stops = (stopRows ?? []) as StopRow[];
  if (stops.length === 0) {
    return { ...routeRow, paradas: [] };
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("parada_ordenes")
    .select("parada_id, orden_id")
    .in(
      "parada_id",
      stops.map((stop) => stop.id),
    );

  throwIfError(assignmentsError);
  const stopOrderRows = (assignments ?? []) as StopOrderRow[];
  const orderIds = [...new Set(stopOrderRows.map(({ orden_id }) => orden_id))];
  if (orderIds.length === 0) {
    throw new Error("La ruta tiene paradas sin órdenes asociadas.");
  }

  const { data: orderRows, error: ordersError } = await supabase
    .from("ordenes")
    .select(
      "id, cliente_nombre, direccion, comuna, numero_guia, cliente_telefono, latitud, longitud, notas",
    )
    .in("id", orderIds);

  throwIfError(ordersError);
  const orders = (orderRows ?? []) as OrderRow[];
  if (orders.length !== orderIds.length) {
    throw new Error("No se pudieron cargar todas las guías de la ruta.");
  }

  const orderById = new Map<string, StopOrder>(
    orders.map((order) => [
      order.id,
      {
        id: order.id,
        cliente: order.cliente_nombre,
        direccion: order.direccion,
        comuna: order.comuna,
        numero_guia: order.numero_guia,
        telefono: order.cliente_telefono,
        latitud: order.latitud,
        longitud: order.longitud,
        notas: order.notas,
      },
    ]),
  );
  const ordersByStop = new Map<string, StopOrder[]>();

  for (const { parada_id, orden_id } of stopOrderRows) {
    const order = orderById.get(orden_id);
    if (!order) {
      continue;
    }
    const stopOrders = ordersByStop.get(parada_id) ?? [];
    stopOrders.push(order);
    ordersByStop.set(parada_id, stopOrders);
  }

  const routeStops: RouteStop[] = stops.map((stop, index) => ({
    id: stop.id,
    posicion: stop.posicion_final ?? stop.posicion_sugerida ?? index + 1,
    estado: stop.estado,
    confirmacion_cliente: stop.confirmacion_cliente,
    ordenes: ordersByStop.get(stop.id) ?? [],
  }));

  return { ...routeRow, paradas: routeStops };
}

function isOffline(
  state: Awaited<ReturnType<typeof NetInfo.fetch>>,
) {
  return state.isConnected === false || state.isInternetReachable === false;
}

export async function getTodaysDriverRoute(
  conductorId: string,
): Promise<DriverRoute | null> {
  const routeDate = getTodayInSantiago();
  try {
    const route = await fetchTodaysDriverRoute(conductorId);
    if (route) {
      await cacheDriverRoute(conductorId, routeDate, route);
    } else {
      await clearCachedDriverRoute(conductorId, routeDate);
    }
    return route;
  } catch (error) {
    if (isOffline(await NetInfo.fetch())) {
      const cachedRoute = await getCachedDriverRoute(conductorId, routeDate);
      if (cachedRoute) {
        return { ...cachedRoute, offlineCopy: true };
      }
    }
    throw error;
  }
}

export async function startDriverRoute(routeId: string) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { error } = await supabase.rpc("iniciar_ruta", { p_ruta: routeId });
  throwIfError(error);
}

export async function finalizeDriverRoute(
  routeId: string,
): Promise<RouteFinalSummary> {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data, error } = await supabase.rpc("finalizar_ruta", {
    p_ruta: routeId,
  });
  throwIfError(error);

  if (
    !data ||
    typeof data !== "object" ||
    !("ruta_id" in data) ||
    data.ruta_id !== routeId ||
    !("entregadas" in data) ||
    !("parciales" in data) ||
    !("fallidas" in data) ||
    !("omitidas" in data) ||
    !("sin_visitar" in data) ||
    !("entregas_sin_foto" in data) ||
    ![
      data.entregadas,
      data.parciales,
      data.fallidas,
      data.omitidas,
      data.sin_visitar,
      data.entregas_sin_foto,
    ].every((value) => typeof value === "number" && Number.isFinite(value))
  ) {
    throw new Error("Supabase devolvió un resumen de ruta inválido.");
  }

  return {
    ruta_id: routeId,
    entregadas: data.entregadas,
    parciales: data.parciales,
    fallidas: data.fallidas,
    omitidas: data.omitidas,
    sin_visitar: data.sin_visitar,
    entregas_sin_foto: data.entregas_sin_foto,
  };
}

async function fetchDriverStopDetails(
  stopId: string,
): Promise<StopDetail> {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data: stop, error: stopError } = await supabase
    .from("paradas")
    .select(
      "id, ruta_id, estado, posicion_final, posicion_sugerida, confirmacion_cliente, motivo_omision, comentario_omision",
    )
    .eq("id", stopId)
    .maybeSingle();

  throwIfError(stopError);
  if (!stop) {
    throw new Error("No se encontró la parada.");
  }
  const stopRow = stop as DetailStopRow;

  const { data: route, error: routeError } = await supabase
    .from("rutas")
    .select("estado")
    .eq("id", stopRow.ruta_id)
    .maybeSingle();

  throwIfError(routeError);
  if (!route) {
    throw new Error("No se encontró la ruta de esta parada.");
  }
  const routeState = route.estado as DriverRoute["estado"];

  const { data: links, error: linksError } = await supabase
    .from("parada_ordenes")
    .select("orden_id")
    .eq("parada_id", stopId);

  throwIfError(linksError);
  const orderIds = [...new Set((links ?? []).map(({ orden_id }) => orden_id))];
  if (orderIds.length === 0) {
    throw new Error("La parada no tiene guías asociadas.");
  }

  const { data: orderRows, error: ordersError } = await supabase
    .from("ordenes")
    .select(
      "id, cliente_nombre, direccion, comuna, numero_guia, cliente_telefono, latitud, longitud, notas",
    )
    .in("id", orderIds);

  throwIfError(ordersError);
  const orders = (orderRows ?? []) as OrderRow[];
  if (orders.length !== orderIds.length) {
    throw new Error("No se pudieron cargar todas las guías de la parada.");
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("orden_items")
    .select("id, orden_id, producto_id, cantidad_pedida")
    .in("orden_id", orderIds);

  throwIfError(itemsError);
  const items = (itemRows ?? []) as DetailOrderItemRow[];
  const productIds = [...new Set(items.map(({ producto_id }) => producto_id))];
  const { data: productRows, error: productsError } = await supabase
    .from("productos")
    .select("id, nombre, unidad")
    .in("id", productIds);

  throwIfError(productsError);
  const products = (productRows ?? []) as ProductRow[];
  const productById = new Map(
    products.map((product) => [product.id, product]),
  );
  const itemsByOrder = new Map<
    string,
    NonNullable<StopDetail["ordenes"][number]["items"]>
  >();

  for (const item of items) {
    const product = productById.get(item.producto_id);
    if (!product) {
      throw new Error("No se pudo cargar un producto de esta parada.");
    }
    const orderItems = itemsByOrder.get(item.orden_id) ?? [];
    orderItems.push({
      id: item.id,
      producto: product.nombre,
      unidad: product.unidad,
      cantidad_pedida: item.cantidad_pedida,
    });
    itemsByOrder.set(item.orden_id, orderItems);
  }

  return {
    id: stopRow.id,
    ruta_id: stopRow.ruta_id,
    estado: stopRow.estado,
    ruta_estado: routeState,
    posicion: stopRow.posicion_final ?? stopRow.posicion_sugerida ?? 1,
    confirmacion_cliente: stopRow.confirmacion_cliente,
    motivo_omision: stopRow.motivo_omision,
    comentario_omision: stopRow.comentario_omision,
    ordenes: orders.map((order) => ({
      id: order.id,
      cliente: order.cliente_nombre,
      direccion: order.direccion,
      comuna: order.comuna,
      numero_guia: order.numero_guia,
      telefono: order.cliente_telefono,
      latitud: order.latitud,
      longitud: order.longitud,
      notas: order.notas,
      items: itemsByOrder.get(order.id) ?? [],
    })),
  };
}

export async function getDriverStopDetails(
  stopId: string,
  conductorId: string,
): Promise<StopDetail> {
  try {
    const stop = await fetchDriverStopDetails(stopId);
    await cacheDriverStop(conductorId, stop);
    return stop;
  } catch (error) {
    if (isOffline(await NetInfo.fetch())) {
      const cachedStop = await getCachedDriverStop(conductorId, stopId);
      if (cachedStop) {
        return { ...cachedStop, offlineCopy: true };
      }
    }
    throw error;
  }
}

export async function reorderDriverStops(
  routeId: string,
  stopIds: string[],
) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { error } = await supabase.rpc("reordenar_paradas", {
    p_ruta: routeId,
    p_paradas: stopIds,
  });
  throwIfError(error);
}

export async function omitDriverStop(
  stopId: string,
  reason: OmissionReason,
  comment: string | null,
) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { error } = await supabase.rpc("omitir_parada", {
    p_parada: stopId,
    p_motivo: reason,
    p_comentario: comment,
  });
  throwIfError(error);
}

export async function retryDriverStop(stopId: string) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { error } = await supabase.rpc("reintentar_parada", {
    p_parada: stopId,
  });
  throwIfError(error);
}
