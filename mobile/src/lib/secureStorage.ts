import AsyncStorage from "@react-native-async-storage/async-storage";
import * as aesjs from "aes-js";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Almacenamiento para la sesión de Supabase con cifrado en reposo.
 *
 * SecureStore (Keystore de Android / Keychain de iOS) tiene un límite de tamaño
 * por valor y una sesión de Supabase puede superarlo. Por eso:
 *   - la clave AES-256 se guarda en SecureStore (hardware/Keystore);
 *   - la sesión cifrada (AES-256-CTR con IV aleatorio) se guarda en AsyncStorage.
 * Robarse solo el AsyncStorage (backup, root, etc.) no revela la sesión.
 *
 * Migración: si hay una sesión antigua sin cifrar en AsyncStorage, se lee,
 * se vuelve a guardar cifrada y se reemplaza, así nadie tiene que volver a
 * iniciar sesión.
 *
 * En web no existe SecureStore: se usa AsyncStorage tal cual (localStorage).
 */

const ENCRYPTED_PREFIX = "enc:v1:";
const isSecureStoreAvailable = Platform.OS === "android" || Platform.OS === "ios";

// SecureStore solo admite [A-Za-z0-9._-] en las claves.
function aesKeyName(key: string) {
  return `${key.replace(/[^A-Za-z0-9._-]/g, "_")}.aeskey`;
}

async function getOrCreateAesKey(key: string): Promise<Uint8Array> {
  const name = aesKeyName(key);
  const stored = await SecureStore.getItemAsync(name);
  if (stored) {
    return aesjs.utils.hex.toBytes(stored);
  }
  const fresh = getRandomBytes(32);
  await SecureStore.setItemAsync(name, aesjs.utils.hex.fromBytes(fresh), {
    // Accesible con el teléfono desbloqueado al menos una vez: necesario para
    // que el seguimiento GPS en segundo plano pueda leer la sesión.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return fresh;
}

async function encrypt(key: string, plain: string): Promise<string> {
  const aesKey = await getOrCreateAesKey(key);
  // IV aleatorio por escritura: reutilizar el contador con la misma clave
  // repetiría el flujo de cifrado en CTR y lo debilitaría.
  const iv = getRandomBytes(16);
  const cipher = new aesjs.ModeOfOperation.ctr(aesKey, iv);
  const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(plain));
  return (
    ENCRYPTED_PREFIX +
    aesjs.utils.hex.fromBytes(iv) +
    aesjs.utils.hex.fromBytes(encrypted)
  );
}

async function decrypt(key: string, stored: string): Promise<string | null> {
  const keyHex = await SecureStore.getItemAsync(aesKeyName(key));
  if (!keyHex) {
    // Perdimos la clave (p. ej. restauración de backup): el dato es ilegible.
    return null;
  }
  const payload = aesjs.utils.hex.toBytes(
    stored.slice(ENCRYPTED_PREFIX.length),
  );
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    payload.slice(0, 16),
  );
  const decrypted = cipher.decrypt(payload.slice(16));
  return aesjs.utils.utf8.fromBytes(decrypted);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (stored === null || !isSecureStoreAvailable) {
      return stored;
    }

    if (!stored.startsWith(ENCRYPTED_PREFIX)) {
      // Sesión antigua sin cifrar: migrarla.
      try {
        await AsyncStorage.setItem(key, await encrypt(key, stored));
      } catch {
        // Si falla la migración, se devuelve igualmente; se reintenta luego.
      }
      return stored;
    }

    try {
      const plain = await decrypt(key, stored);
      if (plain === null) {
        await AsyncStorage.removeItem(key);
      }
      return plain;
    } catch {
      // Dato corrupto: se descarta y el usuario inicia sesión de nuevo.
      await AsyncStorage.removeItem(key);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isSecureStoreAvailable) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, await encrypt(key, value));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(aesKeyName(key));
    }
  },
};
