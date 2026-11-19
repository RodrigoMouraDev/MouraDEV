import type { PunchItem } from '../types';

export type ColType = 'text' | 'number' | 'date' | 'datetime';
export interface ColumnDef {
  key: keyof PunchItem;
  header: string; // cabeçalho em "Modelo - Punch list.xlsx"
  sp: string; // nome interno da coluna na Lista do SharePoint
  type: ColType;
}

/**
 * Mapeamento único: planilha mestre <-> Lista SharePoint <-> SQLite.
 * Ajuste `header` se o cabeçalho do modelo diferir; `sp` deve casar com o nome interno da coluna.
 */
/** Colunas do app acrescentadas à direita do modelo (aprovação). */
export const APPROVAL_KEYS: (keyof PunchItem)[] = ['statusAprovacao', 'aprovador', 'frenteAprovacao', 'dataAprovacao', 'justificativa'];

/** Aliases aceitos na leitura de planilhas (cabeçalho normalizado -> campo). */
export const HEADER_ALIASES: Record<string, keyof PunchItem> = {
  descricao: 'descricao', area: 'area', comentarios: 'comentarios', impacto: 'impactos',
};

export const COLUMNS: ColumnDef[] = [
  { key: 'item', header: 'Item', sp: 'Item', type: 'number' },
  { key: 'area', header: 'Área', sp: 'Area', type: 'text' },
  { key: 'tag', header: 'TAG', sp: 'TAG', type: 'text' },
  { key: 'descricao', header: 'Descrição', sp: 'Descricao', type: 'text' },
  { key: 'disciplina', header: 'Disciplina', sp: 'Disciplina', type: 'text' },
  { key: 'categoria', header: 'Categoria', sp: 'Categoria', type: 'text' },
  { key: 'impactos', header: 'Impactos', sp: 'Impactos', type: 'text' },
  { key: 'tipo', header: 'Tipo', sp: 'Tipo', type: 'text' },
  { key: 'solicitadoPor', header: 'Solicitado por', sp: 'SolicitadoPor', type: 'text' },
  { key: 'origem', header: 'Origem', sp: 'Origem', type: 'text' },
  { key: 'dataInsercao', header: 'Data inserção', sp: 'DataInsercao', type: 'date' },
  { key: 'responsavel', header: 'Responsável solução', sp: 'ResponsavelSolucao', type: 'text' },
  { key: 'dataPrevista', header: 'Data prevista', sp: 'DataPrevista', type: 'date' },
  { key: 'situacao', header: 'Situação', sp: 'Situacao', type: 'text' },
  { key: 'dataConclusao', header: 'Data conclusão', sp: 'DataConclusao', type: 'date' },
  { key: 'comentarios', header: 'Comentário', sp: 'Comentarios', type: 'text' },
  { key: 'fotoUrl', header: 'Foto', sp: 'FotoUrl', type: 'text' },
  { key: 'statusAprovacao', header: 'Status de Aprovação', sp: 'StatusAprovacao', type: 'text' },
  { key: 'aprovador', header: 'Aprovador', sp: 'Aprovador', type: 'text' },
  { key: 'frenteAprovacao', header: 'Frente Aprovação', sp: 'FrenteAprovacao', type: 'text' },
  { key: 'dataAprovacao', header: 'Data/Hora Aprovação', sp: 'DataAprovacao', type: 'datetime' },
  { key: 'justificativa', header: 'Justificativa Devolução', sp: 'JustificativaDevolucao', type: 'text' },
  { key: 'emissaoInicial', header: 'Emissão inicial', sp: 'EmissaoInicial', type: 'date' },
  { key: 'dataRevisao', header: 'Data da revisão', sp: 'DataRevisao', type: 'date' },
  { key: 'localId', header: 'ID Local', sp: 'LocalId', type: 'text' },
];
