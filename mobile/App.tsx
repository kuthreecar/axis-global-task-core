import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text } from "react-native";

import { conn } from "./src/market";
import { WatchlistScreen } from "./src/screens/Watchlist";
import { PortfolioScreen } from "./src/screens/Portfolio";
import { MarketsScreen } from "./src/screens/Markets";
import { AssetDetailScreen } from "./src/screens/AssetDetail";
import { C } from "./src/theme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 11, color: focused ? C.text : C.muted, fontWeight: focused ? "700" : "500" }}>{label}</Text>;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: C.panel, borderTopColor: C.line },
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.muted,
      }}
    >
      <Tab.Screen name="Watchlist" component={WatchlistScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="★" focused={focused} /> }} />
      <Tab.Screen name="Portfolio" component={PortfolioScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="$" focused={focused} /> }} />
      <Tab.Screen name="Markets" component={MarketsScreen} options={{ tabBarIcon: ({ focused }) => <TabIcon label="≡" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.panel,
    text: C.text,
    border: C.line,
    primary: C.accent,
  },
};

export default function App() {
  useEffect(() => {
    conn.start();
    return () => conn.stop();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: C.panel },
            headerTitleStyle: { color: C.text },
            headerTintColor: C.accent,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="Home" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="Asset"
            component={AssetDetailScreen}
            options={({ route }: any) => ({ title: route.params?.symbol ?? "Asset" })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
