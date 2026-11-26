import NetInfo from "@react-native-community/netinfo";
import { supabase, supabaseConfigurationError } from "@/src/lib/supabase";
import {
  getQueuedDeliveries,
  removeQueuedDelivery,
  updateQueuedDelivery,
  type QueuedDelivery,
} from "@/src/services/deliveryOutbox";
import {
  getQueuedGuidePhotoContents,
  removePersistedGuidePhotos,
} from "@/src/services/deliveryPhotos";

type DeliveryRpcResult = {
  entrega_id: string;
};

const activeSyncs = new Set<string>();

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNetworkFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    (isRecord(error) && "status" in error && error.status === 0)
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return "No se pudo sincronizar la entrega.";
}

async function registerQueuedDelivery(
  action: QueuedDelivery,
): Promise<DeliveryRpcResult> {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const { data, error } =
    action.operation === "delivery"
      ? await supabase.rpc("registrar_entrega", {
          p_parada: action.stopId,
          p_items: action.items,
          p_motivo: action.reason,
          p_comentario: action.comment,
          p_recibido_por: action.receivedBy,
          p_entrega_id: action.id,
        })
      : await supabase.rpc("registrar_entrega_fallida", {
          p_parada: action.stopId,
          p_motivo: action.reason,
          p_comentario: action.comment,
          p_entrega_id: action.id,
        });

  throwIfError(error);
  if (!isRecord(data) || typeof data.entrega_id !== "string") {
    throw new Error("Supabase devolvió una respuesta de entrega inválida.");
  }
  if (data.entrega_id !== action.id) {
    throw new Error("La entrega sincronizada tiene un identificador distinto.");
  }
  return { entrega_id: data.entrega_id };
}

async function uploadQueuedPhoto(
  deliveryId: string,
  photo: QueuedDelivery["photos"][number],
) {
  if (!supabase) {
    throw new Error(
      supabaseConfigurationError ?? "Supabase no está configurado.",
    );
  }

  const path = `${deliveryId}/${photo.ordenId}.jpg`;
  const { data: existingPhoto, error: existingError } = await supabase
    .from("entrega_fotos")
    .select("id")
    .eq("ruta_archivo", path)
    .maybeSingle();
  throwIfError(existingError);
  if (existingPhoto) {
    return;
  }

  const contents = await getQueuedGuidePhotoContents(photo);
  const { error: uploadError } = await supabase.storage
    .from("entregas")
    .upload(path, contents, {
      contentType: photo.mimeType,
      upsert: true,
    });
  throwIfError(uploadError);

  const { error: insertError } = await supabase.from("entrega_fotos").insert({
    entrega_id: deliveryId,
    orden_id: photo.ordenId,
    ruta_archivo: path,
  });
  throwIfError(insertError);
}

async function isOffline() {
  const state = await NetInfo.fetch();
  return state.isConnected === false || state.isInternetReachable === false;
}

export async function syncPendingDeliveries(
  userId: string,
  retryFailed = false,
) {
  if (activeSyncs.has(userId)) {
    return;
  }
  activeSyncs.add(userId);

  try {
    if (!supabase || (await isOffline())) {
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    throwIfError(sessionError);
    if (session?.user.id !== userId) {
      return;
    }

    const queue = await getQueuedDeliveries(userId);
    for (const action of queue) {
      if (action.status === "failed" && !retryFailed) {
        continue;
      }

      try {
        if (action.status === "failed") {
          await updateQueuedDelivery(userId, action.id, {
            status: action.registered ? "photo_pending" : "pending",
            error: null,
          });
        }

        if (!action.registered) {
          await registerQueuedDelivery(action);
          await updateQueuedDelivery(userId, action.id, {
            registered: true,
            status: "photo_pending",
            error: null,
          });
        }

        for (const photo of action.photos) {
          await uploadQueuedPhoto(action.id, photo);
        }

        const removed = await removeQueuedDelivery(userId, action.id);
        if (removed) {
          await removePersistedGuidePhotos(removed.photos);
        }
      } catch (error) {
        if (isNetworkFailure(error) || (await isOffline())) {
          const currentAction = (await getQueuedDeliveries(userId)).find(
            ({ id }) => id === action.id,
          );
          if (!currentAction) {
            throw new Error(
              "Se perdió el registro local mientras se sincronizaba.",
            );
          }
          await updateQueuedDelivery(userId, action.id, {
            status: currentAction.registered ? "photo_pending" : "pending",
            error: null,
          });
          break;
        }

        await updateQueuedDelivery(userId, action.id, {
          status: "failed",
          error: errorMessage(error),
        });
      }
    }
  } finally {
    activeSyncs.delete(userId);
  }
}
