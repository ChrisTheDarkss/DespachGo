
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MensajeCola } from "./tipos.js";

interface MensajeSupabase {
  id: string;
  telefono: string;
  texto: string;
  estado: string;
  intentos: number;
  parada_id: string | null;
}

export type EstadoMensajeWhatsApp =
  | "pendiente"
  | "enviado"
  | "error";

export class RepositorioSupabase {
  constructor(
    private readonly supabase: SupabaseClient
  ) {}

  // ==========================================
  // 1. RESERVAR MENSAJES
  // ==========================================

  async reservarMensajes(
    limite = 1
  ): Promise<MensajeCola[]> {
    const { data, error } = await this.supabase.rpc(
      "bot_reservar_mensajes",
      {
        p_limite: limite,
        p_max_intentos: 3
      }
    );

    if (error) {
      throw new Error(
        `Error al reservar mensajes: ${error.message}`
      );
    }

    return ((data ?? []) as MensajeSupabase[]).map(
      (mensaje) => ({
        id: mensaje.id,
        telefono: mensaje.telefono,
        texto: mensaje.texto,
        estado: "pendiente",
        intentos: mensaje.intentos
      })
    );
  }

  // ==========================================
  // INICIAR ENVÍO
  // ==========================================

  async iniciarEnvio(id: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(
      "bot_iniciar_envio",
      {
        p_mensaje: id
      }
    );

    if (error) {
      throw new Error(
        `Error al iniciar envío: ${error.message}`
      );
    }

    return data === true;
  }


  // ==========================================
  // 2. MARCAR MENSAJE COMO ENVIADO
  // ==========================================

  async marcarEnviado(id: string): Promise<void> {
    const { error } = await this.supabase.rpc(
      "bot_marcar_enviado",
      {
        p_mensaje: id
      }
    );

    if (error) {
      throw new Error(
        `Error al marcar enviado (${id}): ${error.message}`
      );
    }
  }

  // ==========================================
  // 3. REGISTRAR ERROR
  // ==========================================

  async marcarError(
    id: string,
    detalle: string,
    definitivo = false
  ): Promise<void> {
    const { error } = await this.supabase.rpc(
      "bot_marcar_error",
      {
        p_mensaje: id,
        p_detalle: detalle,
        p_definitivo: definitivo,
        p_max_intentos: 3
      }
    );

    if (error) {
      throw new Error(
        `Error al registrar fallo (${id}): ${error.message}`
      );
    }
  }

  // ==========================================
  // 4. REGISTRAR RESPUESTA DEL CLIENTE
  // ==========================================

  async registrarRespuesta(
    telefono: string,
    texto: string,
    idExterno: string
  ): Promise<void> {
    const { error } = await this.supabase.rpc(
      "bot_registrar_respuesta",
      {
        p_telefono: telefono,
        p_texto: texto,
        p_id_externo: idExterno
      }
    );

    if (error) {
      throw new Error(
        `Error al registrar respuesta: ${error.message}`
      );
    }
  }

  // ==========================================
  // 5. CONSULTAR MENSAJES PENDIENTES
  // ==========================================

  async consultarPendientes(): Promise<number> {
    const { count, error } = await this.supabase
      .from("mensajes_whatsapp")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq("direccion", "enviado")
      .eq("estado", "pendiente");

    if (error) {
      throw new Error(
        `Error al consultar pendientes: ${error.message}`
      );
    }

    return count ?? 0;
  }

  // ==========================================
  // 6. CONSULTAR ESTADO DE UNA RUTA
  // ==========================================

  async consultarEstadoRuta(
    mensajeId: string
  ): Promise<string | null> {
    const { data: mensaje, error: errorMensaje } =
      await this.supabase
        .from("mensajes_whatsapp")
        .select("parada_id")
        .eq("id", mensajeId)
        .single();

    if (errorMensaje) {
      throw new Error(
        `Error al consultar mensaje: ${errorMensaje.message}`
      );
    }

    if (!mensaje?.parada_id) {
      return null;
    }

    const { data: parada, error: errorParada } =
      await this.supabase
        .from("paradas")
        .select("ruta_id")
        .eq("id", mensaje.parada_id)
        .single();

    if (errorParada) {
      throw new Error(
        `Error al consultar parada: ${errorParada.message}`
      );
    }

    if (!parada?.ruta_id) {
      return null;
    }

    const { data: ruta, error: errorRuta } =
      await this.supabase
        .from("rutas")
        .select("estado")
        .eq("id", parada.ruta_id)
        .single();

    if (errorRuta) {
      throw new Error(
        `Error al consultar ruta: ${errorRuta.message}`
      );
    }

    return ruta?.estado ?? null;
  }

  // ==========================================
  // 7. CONSULTAR ESTADO DE UN MENSAJE
  // ==========================================

  async consultarEstadoMensaje(
    id: string
  ): Promise<EstadoMensajeWhatsApp | null> {
    const { data, error } = await this.supabase
      .from("mensajes_whatsapp")
      .select("estado")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Error al consultar estado del mensaje: ${error.message}`
      );
    }

    if (!data) {
      return null;
    }

    const estado = data.estado;

    if (
      estado !== "pendiente" &&
      estado !== "enviado" &&
      estado !== "error"
    ) {
      throw new Error(
        `Estado de mensaje desconocido: ${estado}`
      );
    }

    return estado;
  }
}
