import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { AREAS, DISCIPLINAS } from '../config/constants';
import { CLOUD } from '../config/env';
import { Button, C, Header, Input, Label, Select, s } from '../components/ui';
import { createFieldItem } from '../services/items';
import { useApp } from '../state/AppContext';
import { fmtDate, today } from '../utils/format';

export default function FieldScreen() {
  const { user, profile, refreshPending, online, sync } = useApp();
  const [area, setArea] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [descricao, setDescricao] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [disciplina, setDisciplina] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickPhoto = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permissão', 'Autorize o acesso nas configurações do aparelho.');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };

  const save = async () => {
    if (!area || !tag.trim() || !descricao.trim() || !disciplina) return Alert.alert('Campos obrigatórios', 'Preencha Área, TAG, Descrição e Disciplina.');
    setBusy(true);
    try {
      await createFieldItem({ area, tag, descricao, disciplina, photoUri: photo }, user!, profile!);
      await refreshPending();
      setTag(''); setDescricao(''); setPhoto(null); // mantém Área/Disciplina para registros em sequência
      Alert.alert('Salvo', !CLOUD ? 'Registro salvo no aparelho. Use "Enviar Planilha" para mandar.'
        : online ? 'Registro salvo. Sincronizando…' : 'Registro salvo no aparelho. Será enviado quando houver rede.');
      if (CLOUD && online) sync(true);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Campo — Nova Pendência" />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <Text style={{ color: C.muted }}>{user?.displayName} · {fmtDate(today())}</Text>
        <Label>1. Área</Label>
        <Select value={area} options={AREAS} onChange={setArea} />
        <Label>2. TAG</Label>
        <Input value={tag} onChangeText={setTag} autoCapitalize="characters" placeholder="Ex.: 311-PU-001" />
        <Label>3. Descrição</Label>
        <Input value={descricao} onChangeText={setDescricao} multiline placeholder="Descreva a pendência" />
        <Label>4. Foto</Label>
        {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: 8, marginBottom: 6 }} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Câmera" variant="ghost" onPress={() => pickPhoto(true)} /></View>
          <View style={{ flex: 1 }}><Button title="Galeria" variant="ghost" onPress={() => pickPhoto(false)} /></View>
        </View>
        <Label>5. Disciplina</Label>
        <Select value={disciplina} options={DISCIPLINAS} onChange={setDisciplina} />
        <View style={{ height: 16 }} />
        <Button title="Salvar Pendência" onPress={save} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
