import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, C } from '../components/ui';
import { useApp } from '../state/AppContext';

export default function LoginScreen() {
  const { login } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.bg }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary }}>Punch List</Text>
      <Text style={{ fontSize: 16, color: C.muted, marginBottom: 32 }}>Projeto Sucuriú — Arauco (Inocência/MS)</Text>
      <Button title="Entrar com Microsoft 365" busy={busy} onPress={async () => {
        setBusy(true);
        try { await login(); } catch (e: any) { Alert.alert('Login', e.message); } finally { setBusy(false); }
      }} />
      <Text style={{ color: C.muted, marginTop: 12, fontSize: 12 }}>Após o primeiro acesso o app funciona offline.</Text>
    </View>
  );
}
