import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import { getDriverFirstName } from "@/src/utils/driverName";

type AuthContextValue = {
  initializationError: string | null;
  configurationError: string | null;
  isLoading: boolean;
  session: Session | null;
  /** Mensaje de bienvenida que se muestra una vez, justo después de iniciar sesión. */
  welcomeMessage: string | null;
  dismissWelcome: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const dismissWelcome = useCallback(() => setWelcomeMessage(null), []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }
        if (error) {
          throw error;
        }
        setSession(data.session);
        setIsLoading(false);
      })
      .catch(() => {
        if (isMounted) {
          setInitializationError(
            "No se pudo recuperar la sesión guardada. Comprueba tu conexión e inténtalo nuevamente.",
          );
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initializationError,
      configurationError: supabaseConfigurationError,
      isLoading,
      session,
      welcomeMessage,
      dismissWelcome,
      async signIn(email, password) {
        if (!supabase) {
          throw new Error(
            supabaseConfigurationError ?? "Supabase no está configurado.",
          );
        }
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          throw new Error("No se pudo iniciar sesión. Revisa tus datos e inténtalo otra vez.");
        }
        // Solo al iniciar sesión a mano; no al restaurar una sesión guardada.
        const driverName = getDriverFirstName(
          data.session ?? { user: data.user },
        );
        setWelcomeMessage(driverName ? `Bienvenido ${driverName}` : "Bienvenido");
      },
      async signOut() {
        if (!supabase) {
          throw new Error(
            supabaseConfigurationError ?? "Supabase no está configurado.",
          );
        }
        const { error } = await supabase.auth.signOut();
        if (error) {
          throw new Error(`No se pudo cerrar la sesión: ${error.message}`);
        }
        setWelcomeMessage(null);
      },
    }),
    [dismissWelcome, initializationError, isLoading, session, welcomeMessage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }
  return context;
}
