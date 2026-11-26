
import type { RespuestaCliente } from "./entrante.js";
import { RepositorioSupabase } from "../cola/repositorioSupabase.js";
import { obtenerSupabase } from "../lib/supabase.js";
import { enmascarar } from "../utils/telefono.js";

export interface RegistroRespuesta {
  telefono: string;
  mensaje: string;
  tipo: string;
  fecha: string;
}

export async function procesarRespuesta(
  respuesta: RespuestaCliente
): Promise<RegistroRespuesta> {

  const registro: RegistroRespuesta = {
    telefono: respuesta.telefono,
    mensaje: respuesta.mensaje,
    tipo: respuesta.tipo,
    fecha: respuesta.fecha.toISOString()
  };

  // Evitar guardar respuestas sin identificador
  if (!respuesta.idExterno) {
    console.warn(
      "Respuesta omitida: mensaje sin identificador externo."
    );

    return registro;
  }

  // Conexión con Supabase
  const supabase = obtenerSupabase();

  const repositorio = new RepositorioSupabase(supabase);

  // Registrar respuesta en la base de datos
  await repositorio.registrarRespuesta(
    respuesta.telefono,
    respuesta.mensaje,
    respuesta.idExterno
  );

  console.log("Respuesta registrada en Supabase:", {
    telefono: enmascarar(respuesta.telefono),
    tipo: respuesta.tipo,
    fecha: registro.fecha
  });

  return registro;
}
