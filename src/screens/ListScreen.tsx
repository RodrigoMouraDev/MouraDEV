import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../utils/alert';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { AREAS, DISCIPLINAS, SITUACOES, STATUS_APROVACAO } from '../config/constants';
import { Button, C, Header, Input, Select, s } from '../components/ui';
import { listItems } from '../db/database';
import { approverAreas, importContractor } from '../services/items';
import { exportAndShare } from '../services/sync';
import { readBase64 } from '../utils/files';
import { useApp } from '../state/AppContext';
import type { PunchItem } from '../types';
import { fmtDate, norm } from '../utils/format';

/** Sala/Engenharia (Timenow) ou fila de Aprovações (aprovador oficial). */
export default function ListScreen({ mode }: { mode: 'office' | 'approvals' }) {
  const { user, profile, navigate, version, refreshPending } = useApp();
  const myAreas = useMemo(() => (mode === 'approvals' ? approverAreas(user!, profile!) : [...AREAS]), [mode, user, profile]);
  const [items, setItems] = useState<PunchItem[]>([]);
  const [f, setF] = useState({ area: null as string | null, tag: '', disciplina: null as string | null, situacao: null as string | null,
    status: (mode === 'approvals' ? 'Aguardando Aprovação' : null) as string | null });
  const [busy, setBusy] = useState<'' | 'upload' | 'export'>('');
  const [uploadArea, setUploadArea] = useState<string | null>(null);
  const [askArea, setAskArea] = useState(false);

  const load = useCallback(async () => {
    const rows = await listItems({
      area: f.area ? (myAreas.includes(f.area) ? f.area : []) : myAreas,
      disciplina: f.disciplina ?? undefined, situacao: f.situacao ?? undefined, statusAprovacao: f.status ?? undefined,
    });
    setItems(f.tag ? rows.filter((r) => norm(r.tag).includes(norm(f.tag))) : rows);
  }, [f, myAreas]);
  useEffect(() => { load(); }, [load, version]);

  const upload = async () => {
    if (!uploadArea) return;
    setAskArea(false);
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true,
    });
    if (r.canceled) return;
    setBusy('upload');
    try {
      const b64 = await readBase64(r.assets[0].uri);
      const res = await importContractor(b64, uploadArea, user!);
      await refreshPending(); await load();
      Alert.alert('Arquivo da Contratada', `Área ${uploadArea}\n${res.added} item(ns) incluído(s)\n${res.dup} duplicado(s) ignorado(s)` +
        (res.errors.length ? `\n\n${res.errors.slice(0, 8).join('\n')}${res.errors.length > 8 ? '\n…' : ''}` : ''));
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setBusy(''); }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      await exportAndShare();
      await refreshPending();
    } catch (e: any) { Alert.alert('Exportar', e.message); } finally { setBusy(''); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={mode === 'office' ? 'Sala / Engenharia' : 'Aprovações'} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.localId}
        contentContainerStyle={s.body}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            {mode === 'office' && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Upload Arquivo da Contratada" variant="accent" busy={busy === 'upload'} onPress={() => setAskArea(true)} /></View>
                <View style={{ flex: 1 }}><Button title="Baixar / Exportar Planilha Atualizada" busy={busy === 'export'} onPress={doExport} /></View>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Select value={f.area} options={myAreas} allowClear placeholder="Área" onChange={(v) => setF({ ...f, area: v })} /></View>
              <View style={{ flex: 1 }}><Input value={f.tag} placeholder="TAG" onChangeText={(t) => setF({ ...f, tag: t })} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}><Select value={f.disciplina} options={DISCIPLINAS} allowClear placeholder="Disciplina" onChange={(v) => setF({ ...f, disciplina: v })} /></View>
              <View style={{ flex: 1 }}><Select value={f.situacao} options={SITUACOES} allowClear placeholder="Situação" onChange={(v) => setF({ ...f, situacao: v })} /></View>
            </View>
            <View style={{ marginTop: 6 }}><Select value={f.status} options={STATUS_APROVACAO} allowClear placeholder="Status de Aprovação" onChange={(v) => setF({ ...f, status: v })} /></View>
            <Text style={{ color: C.muted, marginTop: 8 }}>{items.length} item(ns)</Text>
          </View>
        }
        renderItem={({ item: it }) => (
          <Pressable style={s.card} onPress={() => navigate({ name: 'detail', localId: it.localId })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800' }}>#{it.item ?? '—'} · {it.area} · {it.tag}</Text>
              {it.dirty ? <Text style={{ color: C.accent, fontWeight: '700' }}>⟳ pendente</Text> : null}
            </View>
            <Text numberOfLines={2} style={{ marginVertical: 4 }}>{it.descricao}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {it.disciplina} · {it.situacao} · {it.statusAprovacao} · {fmtDate(it.dataInsercao)} · {it.solicitadoPor}
            </Text>
          </Pressable>
        )}
      />
      <Modal visible={askArea} transparent animationType="fade" onRequestClose={() => setAskArea(false)}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { paddingBottom: 32 }]}>
            <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Área do arquivo</Text>
            <Text style={{ color: C.muted, marginBottom: 8 }}>Planilhas enviadas pelo app (uma aba por Área) usam a área de cada aba.</Text>
            <Select value={uploadArea} options={AREAS} onChange={setUploadArea} />
            <Button title="Selecionar arquivo .xlsx" disabled={!uploadArea} onPress={upload} />
            <Button title="Cancelar" variant="ghost" onPress={() => setAskArea(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
