
export function normalizarTelefono(crudo: string): string | null {
  const digitos = crudo.replace(/\D/g, "");

  if (/^569\d{8}$/.test(digitos)) {
    return `+${digitos}`;
  }

  if (/^9\d{8}$/.test(digitos)) {
    return `+56${digitos}`;
  }

  return null;
}

export function telefonoAJid(telefono: string): string {
  const normalizado = normalizarTelefono(telefono);

  if (!normalizado) {
    throw new Error("Número de teléfono chileno inválido");
  }

  return `${normalizado.slice(1)}@s.whatsapp.net`;
}

export function enmascarar(telefono: string): string {
  const normalizado = normalizarTelefono(telefono);

  if (!normalizado) return "***";

  return `${normalizado.slice(0, 5)}***${normalizado.slice(-4)}`;
  
}

export function telefonoDesdeJid(jid: string): string | null {
  if (!jid.endsWith("@s.whatsapp.net")) {
    return null;
  }

  const usuario = jid.split("@")[0]?.split(":")[0];

  if (!usuario) {
    return null;
  }

  return normalizarTelefono(usuario);
}
