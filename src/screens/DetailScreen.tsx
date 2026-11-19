import { useEffect, useState } from 'react';
import { Alert } from '../utils/alert';
import { Image, Linking, Modal, ScrollView, Text, View } from 'react-native';
import { CATEGORIAS, IMPACTOS, PROFILES, SITUACOES, TIPOS } from '../config/constants';
import { Button, C, Header, Input, Label, Select, s } from '../components/ui';
import { CLOUD } from '../config/env';
import { getItem } from '../db/database';
import { approverFor, canApprove, decide, saveEdit } from '../services/items';
import { useApp } from '../state/AppContext';
import type { PunchItem } from '../types';
import { fmtDate, fmtDateTime, parseDateInput } from '../utils/format';

const Row = ({ k, v }: { k: string; v?: string | number | null }) => (
  <Text style={{ marginBottom: 2 }}><Text style={{ fontWeight: '700' }}>{k}: </Text>{v ?? '—'}</Text>
);

export default function DetailScreen({ localId }: { localId: string }) {
  const { user, profile, refreshPending, back, online, sync } = useApp();
  const [it, setIt] = useState<PunchItem | null>(null);
  const [draft, setDraft] = useState<Partial<PunchItem>>({});
  const [prev, setPrev] = useState('');
  const [concl, setConcl] = useState('');
  const [returning, setReturning] = useState(false);
  const [just, setJust] = useState('');

  useEffect(() => {
    getItem(localId).then((x) => {
      setIt(x);
      setPrev(fmtDate(x?.dataPrevista));
      setConcl(fmtDate(x?.dataConclusao));
    });
  }, [localId]);
  if (!it || !user || !profile) return null;

  const editable = profile === 'timenow';
  const approver = canApprove(user, profile, it.area);
  const v = <K extends keyof PunchItem>(k: K) => (k in draft ? draft[k] : it[k]) as PunchItem[K];
  const set = (p: Partial<PunchItem>) => setDraft((d) => ({ ...d, ...p }));

  const after = async (x: PunchItem, msg: string) => {
    setIt(x); setDraft({}); await refreshPending();
    if (CLOUD && online) sync(true);
    Alert.alert('OK', msg, [{ text: 'OK', onPress: back }]);
  };

  const save = async () => {
    const dataPrevista = prev ? parseDateInput(prev) : null;
    const dataConclusao = concl ? parseDateInput(concl) : null;
    if ((prev && !dataPrevista) || (concl && !dataConclusao)) return Alert.alert('Data inválida', 'Use DD/MM/AAAA ou DD/MMM/AA.');
    try { await after(await saveEdit(localId, { ...draft, dataPrevista, dataConclusao }), 'Alterações salvas.'); }
    catch (e: any) { Alert.alert('Erro', e.message); }
  };
  const act = async (approve: boolean) => {
    try {
      await after(await decide(localId, user, profile, approve, just), approve ? 'Pendência aprovada.' : 'Pendência devolvida.');
      setReturning(false);
    } catch (e: any) { Alert.alert('Aprovação', e.message); }
  };

  return (
    <>
      <Header title={`Item #${it.item ?? '— (não sincronizado)'}`} />
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Row k="Área" v={it.area} /><Row k="TAG" v={it.tag} /><Row k="Disciplina" v={it.disciplina} />
          <Row k="Descrição" v={it.descricao} />
          <Row k="Solicitado por" v={it.solicitadoPor} /><Row k="Origem" v={it.origem} />
          <Row k="Data inserção" v={fmtDate(it.dataInsercao)} /><Row k="Emissão inicial" v={fmtDate(it.emissaoInicial)} />
          <Row k="Data da revisão" v={fmtDate(it.dataRevisao)} />
          {it.fotoLocalUri ? <Image source={{ uri: it.fotoLocalUri }} style={{ width: '100%', height: 220, borderRadius: 8, marginTop: 8 }} />
            : it.fotoUrl ? <Text style={{ color: C.primary, marginTop: 6 }} onPress={() => Linking.openURL(it.fotoUrl!)}>Abrir foto no SharePoint</Text> : null}
        </View>

        <View style={s.card}>
          <Text style={{ fontWeight: '800', marginBottom: 4 }}>Aprovação</Text>
          <Row k="Status de Aprovação" v={it.statusAprovacao} />
          <Row k="Aprovador" v={it.aprovador} /><Row k="Frente" v={it.frenteAprovacao} />
          <Row k="Data/Hora" v={fmtDateTime(it.dataAprovacao)} />
          {it.justificativa ? <Row k="Justificativa" v={it.justificativa} /> : null}
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Aprovador oficial ({PROFILES[profile].label}): {approverFor(profile, it.area) ?? '—'}</Text>
          {approver && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{ flex: 1 }}><Button title="Aprovar Pendência" onPress={() => act(true)} /></View>
              <View style={{ flex: 1 }}><Button title="Devolver" variant="danger" onPress={() => setReturning(true)} /></View>
            </View>
          )}
        </View>

        {editable ? (
          <>
            <Label>Categoria</Label><Select value={v('categoria')} options={CATEGORIAS} allowClear onChange={(x) => set({ categoria: x })} />
            <Label>Impactos</Label><Select value={v('impactos')} options={IMPACTOS} allowClear onChange={(x) => set({ impactos: x })} />
            <Label>Tipo</Label><Select value={v('tipo')} options={TIPOS} allowClear onChange={(x) => set({ tipo: x })} />
            <Label>Responsável solução</Label><Input value={v('responsavel') ?? ''} onChangeText={(x) => set({ responsavel: x || null })} />
            <Label>Data prevista</Label><Input value={prev} onChangeText={setPrev} placeholder="DD/MM/AAAA" />
            <Label>Situação</Label><Select value={v('situacao')} options={SITUACOES} onChange={(x) => set({ situacao: x ?? 'Pendente' })} />
            <Label>Data conclusão</Label><Input value={concl} onChangeText={setConcl} placeholder="DD/MM/AAAA (automática ao concluir)" />
            <Label>Comentários</Label><Input multiline value={v('comentarios') ?? ''} onChangeText={(x) => set({ comentarios: x || null })} />
            <Button title="Salvar Alterações" onPress={save} />
          </>
        ) : (
          <View style={s.card}>
            <Row k="Categoria" v={it.categoria} /><Row k="Impactos" v={it.impactos} /><Row k="Tipo" v={it.tipo} />
            <Row k="Responsável" v={it.responsavel} /><Row k="Data prevista" v={fmtDate(it.dataPrevista)} />
            <Row k="Situação" v={it.situacao} /><Row k="Data conclusão" v={fmtDate(it.dataConclusao)} />
            <Row k="Comentários" v={it.comentarios} />
          </View>
        )}
      </ScrollView>

      <Modal visible={returning} transparent animationType="fade" onRequestClose={() => setReturning(false)}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { paddingBottom: 32 }]}>
            <Text style={{ fontWeight: '800', fontSize: 16 }}>Justificativa da devolução (obrigatória)</Text>
            <Input multiline value={just} onChangeText={setJust} style={{ marginVertical: 8 }} />
            <Button title="Confirmar Devolução" variant="danger" disabled={!just.trim()} onPress={() => act(false)} />
            <Button title="Cancelar" variant="ghost" onPress={() => setReturning(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
