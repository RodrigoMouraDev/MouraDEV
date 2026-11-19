import { useState } from 'react';
import { Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { Button, C, Input } from '../components/ui';
import { CLOUD } from '../config/env';
import { useApp } from '../state/AppContext';

export default function LoginScreen() {
  const { login } = useApp();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const go = async () => {
    if (!CLOUD && name.trim().split(/\s+/).length < 2) return Alert.alert('Identificação', 'Informe nome e sobrenome.');
    setBusy(true);
    try { await login(name); } catch (e: any) { Alert.alert('Login', e.message); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: C.bg }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: C.primary }}>Punch List</Text>
      <Text style={{ fontSize: 16, color: C.muted, marginBottom: 32 }}>Projeto Sucuriú — Arauco (Inocência/MS)</Text>
      {!CLOUD && <Input value={name} onChangeText={setName} placeholder="Nome completo" autoCapitalize="words" style={{ marginBottom: 8 }} />}
      <Button title={CLOUD ? 'Entrar com Microsoft 365' : 'Entrar'} busy={busy} onPress={go} />
      <Text style={{ color: C.muted, marginTop: 12, fontSize: 12 }}>
        {CLOUD ? 'Após o primeiro acesso o app funciona offline.' : 'O nome é usado em "Solicitado por" e nas aprovações. O app funciona 100% offline.'}
      </Text>
    </View>
  );
}
