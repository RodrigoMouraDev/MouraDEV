import { randomUUID } from 'expo-crypto';
import { CLOUD } from '../config/env';
import { APPROVERS, PROFILES, type Area, type ProfileKey } from '../config/constants';
import { areaEmissao, getItem, listItems, nextItem, upsertItem } from '../db/database';
import type { PunchItem, UserProfile } from '../types';
import { dupKey, norm, nowIso, today } from '../utils/format';
import { persistPhoto } from '../utils/files';
import { parseContractor } from './excel';

export interface FieldInput { area: string; tag: string; descricao: string; disciplina: string; photoUri: string | null }

const blank = (user: UserProfile, origem: string): Omit<PunchItem, 'localId' | 'area' | 'tag' | 'descricao' | 'disciplina'> => {
  const d = today();
  return {
    spId: null, item: null, fotoLocalUri: null, fotoUrl: null, categoria: null, impactos: null, tipo: null,
    solicitadoPor: user.displayName, origem, dataInsercao: d, emissaoInicial: null, dataRevisao: d,
    responsavel: null, dataPrevista: null, situacao: 'Pendente', dataConclusao: null, comentarios: null,
    statusAprovacao: 'Aguardando Aprovação', aprovador: null, frenteAprovacao: null, dataAprovacao: null,
    justificativa: null, dirty: 1, updatedAt: nowIso(),
  };
};

/** Registro de campo (offline-first). Campos automáticos preenchidos aqui. */
export async function createFieldItem(input: FieldInput, user: UserProfile, profile: ProfileKey) {
  const localId = randomUUID();
  const it: PunchItem = {
    ...blank(user, PROFILES[profile].origem),
    localId, area: input.area, tag: input.tag.trim(), descricao: input.descricao.trim(), disciplina: input.disciplina,
    fotoLocalUri: input.photoUri ? await persistPhoto(input.photoUri, localId) : null,
  };
  it.emissaoInicial = await areaEmissao(it.area, it.dataInsercao);
  if (!CLOUD) it.item = await nextItem(it.area); // modo local: numeração por área no aparelho
  await upsertItem(it);
  return it;
}

/** Edição (Sala/Engenharia ou aprovação): marca para envio e atualiza a data da revisão. */
export async function saveEdit(localId: string, patch: Partial<PunchItem>) {
  const cur = await getItem(localId);
  if (!cur) throw new Error('Item não encontrado');
  const next = { ...cur, ...patch, dataRevisao: today(), dirty: 1, updatedAt: nowIso() };
  if (patch.situacao === 'Concluído' && !next.dataConclusao) next.dataConclusao = today();
  await upsertItem(next);
  return next;
}

/** Aprovador oficial da frente para a área (matriz). */
export const approverFor = (profile: ProfileKey, area: string) => APPROVERS[profile][area as Area] ?? null;
export const canApprove = (user: UserProfile, profile: ProfileKey, area: string) =>
  norm(approverFor(profile, area)) !== '' && norm(approverFor(profile, area)) === norm(user.displayName);
/** Áreas em que o usuário é aprovador oficial para a frente. */
export const approverAreas = (user: UserProfile, profile: ProfileKey) =>
  Object.entries(APPROVERS[profile]).filter(([, n]) => norm(n) === norm(user.displayName)).map(([a]) => a);

export async function decide(localId: string, user: UserProfile, profile: ProfileKey, approve: boolean, justificativa?: string) {
  const it = await getItem(localId);
  if (!it || !canApprove(user, profile, it.area)) throw new Error('Usuário não é o aprovador oficial desta área/frente.');
  if (!approve && !justificativa?.trim()) throw new Error('Justificativa obrigatória para devolver.');
  return saveEdit(localId, {
    statusAprovacao: approve ? 'Aprovado' : 'Devolvido',
    aprovador: user.displayName,
    frenteAprovacao: PROFILES[profile].frente,
    dataAprovacao: nowIso(),
    justificativa: approve ? null : justificativa!.trim(),
  });
}

/**
 * Compila planilha na base: arquivo de contratada (usa a Área escolhida) ou planilha exportada pelo app
 * (uma aba por Área). Ignora duplicados pela chave Área + TAG + Descrição.
 */
export async function importContractor(base64: string, area: string, user: UserProfile) {
  const { rows, errors } = parseContractor(base64);
  const existing = new Set((await listItems()).map((i) => dupKey(i.area, i.tag, i.descricao)));
  let added = 0, dup = 0;
  for (const r of rows) {
    const a = r.area ?? area;
    const key = dupKey(a, r.tag!, r.descricao!);
    if (existing.has(key)) { dup++; continue; }
    existing.add(key);
    const base = blank(user, 'Projeto');
    const fromFile = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    const it: PunchItem = {
      ...base, ...fromFile,
      localId: randomUUID(), spId: null, area: a, tag: r.tag!, descricao: r.descricao!,
      disciplina: r.disciplina ?? 'Outras', fotoLocalUri: null, dirty: 1, updatedAt: nowIso(),
      item: CLOUD ? null : await nextItem(a),
      emissaoInicial: await areaEmissao(a, r.dataInsercao ?? today()),
    };
    await upsertItem(it);
    added++;
  }
  return { added, dup, errors };
}
