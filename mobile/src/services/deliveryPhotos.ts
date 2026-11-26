import { Directory, File, Paths } from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat,
} from "expo-image-manipulator";
import type { QueuedGuidePhoto } from "@/src/services/deliveryOutbox";

const maxPhotoDimension = 1000;
const photoDirectory = new Directory(Paths.document, "delivery-outbox");

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
  if (!photoDirectory.exists) {
    photoDirectory.create({ intermediates: true, idempotent: true });
  }

  const persisted: QueuedGuidePhoto[] = [];
  try {
    for (const photo of photos) {
      const source = new File(photo.uri);
      if (!source.exists) {
        throw new Error("No se encontró una foto seleccionada para la guía.");
      }

      const destination = new File(
        photoDirectory,
        `${deliveryId}-${photo.ordenId}.jpg`,
      );
      await source.copy(destination);
      persisted.push({
        ordenId: photo.ordenId,
        uri: destination.uri,
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
  const file = new File(photo.uri);
  if (!file.exists) {
    throw new Error("No se encontró una foto pendiente en el dispositivo.");
  }
  return file.arrayBuffer();
}

export async function getQueuedGuidePhotoPreviewUri(
  photo: QueuedGuidePhoto,
) {
  const file = new File(photo.uri);
  if (!file.exists) {
    throw new Error("No se encontró una foto pendiente en el dispositivo.");
  }
  return file.uri;
}

export function releaseQueuedGuidePhotoPreview(_uri: string) {}

export async function removePersistedGuidePhotos(
  photos: QueuedGuidePhoto[],
) {
  for (const photo of photos) {
    const file = new File(photo.uri);
    if (file.exists) {
      file.delete();
    }
  }
}

export async function removeTemporaryPhoto(uri: string) {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}
