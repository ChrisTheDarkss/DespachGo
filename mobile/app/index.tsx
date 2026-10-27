import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAuth } from "@/src/hooks/useAuth";

export default function IndexScreen() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#174a39" />
      </View>
    );
  }

  return <Redirect href={session ? "/(tabs)" : "/login"} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#f7f8f6",
    flex: 1,
    justifyContent: "center",
  },
});
