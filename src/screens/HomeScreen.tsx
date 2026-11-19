import { Alert, ScrollView, Text } from 'react-native';
import { PROFILES, type ProfileKey } from '../config/constants';
import { Button, C, Header, s } from '../components/ui';
import { approverAreas } from '../services/items';
import { useApp } from '../state/AppContext';

export default function HomeScreen() {
  const { user, profile, setProfile, navigate, logout } = useApp();
  if (!user) return null;
  const areas = profile ? approverAreas(user, profile) : [];
  return (
    <>
      <Header title="Punch List — Sucuriú" canBack={false} />
      <ScrollView contentContainerStyle={s.body}>
        <Text style={{ fontSize: 14, color: C.muted }}>Usuário</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 16 }}>{user.displayName}</Text>
        <Text style={{ fontWeight: '700', marginBottom: 4 }}>Selecione o perfil</Text>
        {(Object.keys(PROFILES) as ProfileKey[]).map((k) => (
          <Button key={k} title={`${profile === k ? '✓ ' : ''}${PROFILES[k].label}`} variant={profile === k ? 'primary' : 'ghost'} onPress={() => setProfile(k)} />
        ))}
        {profile && (
          <>
            <Text style={{ color: C.muted, marginVertical: 8 }}>Origem: {PROFILES[profile].origem}</Text>
            <Button title="Registrar Pendência (Campo)" variant="accent" onPress={() => navigate({ name: 'field' })} />
            {profile === 'timenow' && <Button title="Sala / Engenharia" variant="accent" onPress={() => navigate({ name: 'office' })} />}
            {areas.length > 0 && <Button title={`Aprovações (${areas.join(', ')})`} variant="accent" onPress={() => navigate({ name: 'approvals' })} />}
          </>
        )}
        <Button title="Sair" variant="ghost" onPress={() =>
          Alert.alert('Sair', 'Itens não sincronizados permanecem no aparelho. Deseja sair?', [
            { text: 'Cancelar' }, { text: 'Sair', style: 'destructive', onPress: logout },
          ])} />
      </ScrollView>
    </>
  );
}
