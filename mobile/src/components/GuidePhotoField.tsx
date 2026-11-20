import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { compressGuidePhoto, removeTemporaryPhoto } from "@/src/services/deliveryPhotos";

type GuidePhotoFieldProps = {
  label: string;
  photoUri: string | null;
  disabled?: boolean;
  onChange: (uri: string | null) => void;
};

export function GuidePhotoField({
  label,
  photoUri,
  disabled = false,
  onChange,
}: GuidePhotoFieldProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectPhoto(useCamera: boolean) {
    if (isLoading || disabled) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Debes permitir el acceso a la cámara para tomar la foto.");
        }
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Debes permitir el acceso a tus fotos para adjuntarlas.");
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.8,
          });
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        throw new Error("No se pudo leer la foto seleccionada.");
      }
      const compressed = await compressGuidePhoto(asset.uri);
      if (photoUri && !disabled) {
        await removeTemporaryPhoto(photoUri);
      }
      onChange(compressed.uri);
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "No se pudo preparar la foto.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function removePhoto() {
    if (photoUri) {
      try {
        await removeTemporaryPhoto(photoUri);
        onChange(null);
      } catch (removeError) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : "No se pudo quitar la foto.",
        );
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {photoUri ? (
        <Image
          accessibilityLabel={`Vista previa de ${label}`}
          source={{ uri: photoUri }}
          style={styles.preview}
        />
      ) : (
        <Text style={styles.hint}>Aún no hay una foto adjunta.</Text>
      )}
      <View style={styles.actions}>
        {Platform.OS !== "web" ? (
          <Pressable
            accessibilityRole="button"
            disabled={isLoading || disabled}
            onPress={() => void selectPhoto(true)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Tomar foto</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isLoading || disabled}
          onPress={() => void selectPhoto(false)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {photoUri ? "Cambiar" : "Elegir foto"}
          </Text>
        </Pressable>
        {photoUri ? (
          <Pressable
            accessibilityRole="button"
            disabled={isLoading || disabled}
            onPress={() => void removePhoto()}
            style={styles.removeButton}
          >
            <Text style={styles.removeText}>Quitar</Text>
          </Pressable>
        ) : null}
        {isLoading ? <ActivityIndicator color="#176447" /> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    color: "#20342a",
    fontSize: 14,
    fontWeight: "700",
  },
  hint: {
    color: "#637168",
    fontSize: 13,
  },
  preview: {
    backgroundColor: "#e8ede9",
    borderRadius: 10,
    height: 126,
    width: "100%",
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: "#eaf2ed",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    color: "#176447",
    fontSize: 13,
    fontWeight: "700",
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  removeText: {
    color: "#a84f14",
    fontSize: 13,
    fontWeight: "700",
  },
  error: {
    color: "#a3352c",
    fontSize: 13,
  },
});
