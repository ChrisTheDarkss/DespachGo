// Claves de user_metadata (Supabase Auth) donde puede venir el nombre.
const NAME_METADATA_KEYS = ["nombre", "full_name", "name", "display_name"];

/** Primer nombre del conductor, o null si la sesión no lo trae. */
export function getDriverFirstName(
  session: { user?: { user_metadata?: unknown } | null } | null | undefined,
): string | null {
  const metadata = session?.user?.user_metadata as
    | Record<string, unknown>
    | undefined;
  if (!metadata) {
    return null;
  }
  for (const key of NAME_METADATA_KEYS) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().split(/\s+/)[0];
    }
  }
  return null;
}
