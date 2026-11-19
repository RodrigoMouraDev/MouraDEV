import type { ProfileKey } from './config/constants';

export interface PunchItem {
  localId: string; // UUID local (sem conflito entre aparelhos)
  spId: string | null; // ID do item na Lista do SharePoint
  item: number | null; // Nº sequencial consolidado na sincronização
  area: string;
  tag: string;
  descricao: string;
  disciplina: string;
  fotoLocalUri: string | null;
  fotoUrl: string | null;
  categoria: string | null;
  impactos: string | null; // múltiplos, separados por "; "
  tipo: string | null;
  solicitadoPor: string;
  origem: string;
  dataInsercao: string; // ISO
  emissaoInicial: string | null;
  dataRevisao: string | null;
  responsavel: string | null;
  dataPrevista: string | null;
  situacao: string;
  dataConclusao: string | null;
  comentarios: string | null;
  statusAprovacao: string;
  aprovador: string | null;
  frenteAprovacao: string | null;
  dataAprovacao: string | null;
  justificativa: string | null;
  dirty: number; // 1 = alteração local pendente de envio
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  mail: string;
}

export interface Session {
  user: UserProfile;
  profile: ProfileKey | null;
}
