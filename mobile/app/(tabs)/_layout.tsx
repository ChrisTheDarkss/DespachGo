import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/src/hooks/useAuth";

export default function TabsLayout() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#174a39" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: "#f7f8f6",
    flex: 1,
    justifyContent: "center",
  },
});
