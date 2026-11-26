import {
  ImageManipulator,
  SaveFormat,
} from "expo-image-manipulator";
import type { QueuedGuidePhoto } from "@/src/services/deliveryOutbox";

const maxPhotoDimension = 1000;
const databaseName = "despachgo-delivery-outbox";
const objectStoreName = "photos";
const photoUriPrefix = "indexeddb://";

function openPhotoDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(objectStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("No se pudo abrir la base local de fotos."));
  });
}

async function storePhoto(key: string, photo: Blob) {
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      transaction.objectStore(objectStoreName).put(photo, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("No se pudo guardar una foto localmente."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Se canceló el guardado de una foto."),
        );
    });
  } finally {
    database.close();
  }
}

async function readPhoto(key: string) {
  const database = await openPhotoDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readonly");
      const request = transaction.objectStore(objectStoreName).get(key);
      request.onsuccess = () => {
        const result: unknown = request.result;
        if (result !== undefined && !(result instanceof Blob)) {
          reject(new Error("La foto guardada localmente tiene un formato inválido."));
          return;
        }
        resolve(result);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("No se pudo leer una foto local."));
    });
  } finally {
    database.close();
  }
}

async function deletePhoto(key: string) {
  const database = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(objectStoreName, "readwrite");
      transaction.objectStore(objectStoreName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("No se pudo quitar una foto local."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("Se canceló la eliminación de una foto."),
        );
    });
  } finally {
    database.close();
  }
}

function getPhotoKey(uri: string) {
  if (!uri.startsWith(photoUriPrefix)) {
    throw new Error("La foto pendiente no está guardada en el dispositivo.");
  }
  return uri.slice(photoUriPrefix.length);
}

export async function compressGuidePhoto(uri: string) {
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: maxPhotoDimension,
    maxHeight: maxPhotoDimension,
  });
  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.72,
      });
      return { uri: result.uri, width: result.width, height: result.height };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

export async function persistGuidePhotos(
  deliveryId: string,
  photos: { ordenId: string; uri: string }[],
): Promise<QueuedGuidePhoto[]> {
  const persisted: QueuedGuidePhoto[] = [];
  try {
    for (const photo of photos) {
      const response = await fetch(photo.uri);
      if (!response.ok) {
        throw new Error("No se pudo leer una foto seleccionada.");
      }
      const blob = await response.blob();
      const key = `${deliveryId}-${photo.ordenId}`;
      await storePhoto(key, blob);
      persisted.push({
        ordenId: photo.ordenId,
        uri: `${photoUriPrefix}${key}`,
        mimeType: "image/jpeg",
      });
    }
    return persisted;
  } catch (error) {
    await removePersistedGuidePhotos(persisted);
    throw error;
  }
}

export async function getQueuedGuidePhotoContents(
  photo: QueuedGuidePhoto,
) {
  const blob = await readPhoto(getPhotoKey(photo.uri));
  if (!blob) {
    throw new Error("No se encontró una foto pendiente en el dispositivo.");
  }
  return blob;
}

export async function getQueuedGuidePhotoPreviewUri(
  photo: QueuedGuidePhoto,
) {
  const blob = await readPhoto(getPhotoKey(photo.uri));
  if (!blob) {
    throw new Error("No se encontró una foto pendiente en el dispositivo.");
  }
  return URL.createObjectURL(blob);
}

export function releaseQueuedGuidePhotoPreview(uri: string) {
  if (uri.startsWith("blob:")) {
    URL.revokeObjectURL(uri);
  }
}

export async function removePersistedGuidePhotos(
  photos: QueuedGuidePhoto[],
) {
  for (const photo of photos) {
    await deletePhoto(getPhotoKey(photo.uri));
  }
}

export async function removeTemporaryPhoto(uri: string) {
  if (uri.startsWith("blob:")) {
    URL.revokeObjectURL(uri);
  }
}
