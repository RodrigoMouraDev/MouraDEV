import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/components/ui';
import DetailScreen from './src/screens/DetailScreen';
import FieldScreen from './src/screens/FieldScreen';
import HomeScreen from './src/screens/HomeScreen';
import ListScreen from './src/screens/ListScreen';
import LoginScreen from './src/screens/LoginScreen';
import { AppProvider, useApp } from './src/state/AppContext';

function Router() {
  const { ready, user, route } = useApp();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (!user) return <LoginScreen />;
  switch (route.name) {
    case 'field': return <FieldScreen />;
    case 'office': return <ListScreen key="office" mode="office" />;
    case 'approvals': return <ListScreen key="approvals" mode="approvals" />;
    case 'detail': return <DetailScreen key={route.localId} localId={route.localId} />;
    default: return <HomeScreen />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.primary }} edges={['top']}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <AppProvider><Router /></AppProvider>
        </View>
      </SafeAreaView>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
