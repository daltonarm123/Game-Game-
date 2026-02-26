import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Text } from "react-native";
import { useAuth } from "../auth";
import { LoadingView } from "../components/LoadingView";
import { Colors } from "../theme";

// Screens
import { LoginScreen } from "../screens/auth/LoginScreen";
import { RegisterScreen } from "../screens/auth/RegisterScreen";

import { AccountScreen } from "../screens/AccountScreen";
import { AdminScreen } from "../screens/AdminScreen";
import { AllianceForumsScreen } from "../screens/AllianceForumsScreen";
import { AllianceScreen } from "../screens/AllianceScreen";
import { AttackScreen } from "../screens/AttackScreen";
import { BuildingsScreen } from "../screens/BuildingsScreen";
import { EmbassyScreen } from "../screens/EmbassyScreen";
import { ForumsScreen } from "../screens/ForumsScreen";
import { GuildhallScreen } from "../screens/GuildhallScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { HowToPlayScreen } from "../screens/HowToPlayScreen";
import { MarketplaceScreen } from "../screens/MarketplaceScreen";
import { OverviewScreen } from "../screens/OverviewScreen";
import { PigeonsScreen } from "../screens/PigeonsScreen";
import { PrayScreen } from "../screens/PrayScreen";
import { RankingsScreen } from "../screens/RankingsScreen";
import { ResearchScreen } from "../screens/ResearchScreen";
import { SettlementsScreen } from "../screens/SettlementsScreen";
import { TrainTroopsScreen } from "../screens/TrainTroopsScreen";
import { WarRoomScreen } from "../screens/WarRoomScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOpts = {
  headerStyle: { backgroundColor: Colors.card },
  headerTintColor: Colors.textMain,
  headerTitleStyle: { fontWeight: "700" as const, color: Colors.textMain },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: Colors.bg },
};

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

function KingdomStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Overview" component={OverviewScreen} />
      <Stack.Screen name="Buildings" component={BuildingsScreen} />
      <Stack.Screen name="Research" component={ResearchScreen} />
      <Stack.Screen name="Settlements" component={SettlementsScreen} />
    </Stack.Navigator>
  );
}

function WarStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="WarRoom" component={WarRoomScreen} options={{ title: "War Room" }} />
      <Stack.Screen name="TrainTroops" component={TrainTroopsScreen} options={{ title: "Train Troops" }} />
      <Stack.Screen name="Attack" component={AttackScreen} options={{ title: "Attack Kingdom" }} />
      <Stack.Screen name="Guildhall" component={GuildhallScreen} options={{ title: "Guildhall" }} />
      <Stack.Screen name="Embassy" component={EmbassyScreen} options={{ title: "Embassy" }} />
    </Stack.Navigator>
  );
}

function SocialStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Alliance" component={AllianceScreen} />
      <Stack.Screen name="AllianceForums" component={AllianceForumsScreen} options={{ title: "Alliance Forums" }} />
      <Stack.Screen name="Rankings" component={RankingsScreen} />
      <Stack.Screen name="Pigeons" component={PigeonsScreen} />
      <Stack.Screen name="Forums" component={ForumsScreen} />
    </Stack.Navigator>
  );
}

function MarketStack() {
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Marketplace" component={MarketplaceScreen} />
      <Stack.Screen name="HolyCircle" component={PrayScreen} options={{ title: "Holy Circle" }} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  const { auth } = useAuth();
  return (
    <Stack.Navigator screenOptions={screenOpts}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Account" component={AccountScreen} />
      <Stack.Screen name="HowToPlay" component={HowToPlayScreen} options={{ title: "How To Play" }} />
      {auth?.user?.isAdmin && (
        <Stack.Screen name="Admin" component={AdminScreen} options={{ title: "Admin Panel" }} />
      )}
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="KingdomTab"
        component={KingdomStack}
        options={{ title: "Kingdom", tabBarIcon: ({ focused }) => <TabIcon icon="👑" focused={focused} /> }}
      />
      <Tab.Screen
        name="WarTab"
        component={WarStack}
        options={{ title: "War", tabBarIcon: ({ focused }) => <TabIcon icon="⚔️" focused={focused} /> }}
      />
      <Tab.Screen
        name="SocialTab"
        component={SocialStack}
        options={{ title: "Social", tabBarIcon: ({ focused }) => <TabIcon icon="🤝" focused={focused} /> }}
      />
      <Tab.Screen
        name="MarketTab"
        component={MarketStack}
        options={{ title: "Market", tabBarIcon: ({ focused }) => <TabIcon icon="🏪" focused={focused} /> }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStack}
        options={{ title: "More", tabBarIcon: ({ focused }) => <TabIcon icon="☰" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ ...screenOpts, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { auth, loading } = useAuth();

  if (loading) return <LoadingView message="Loading…" />;

  return (
    <NavigationContainer>
      {auth ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
