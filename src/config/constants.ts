/** Domínio do Projeto Sucuriú — Arauco (Inocência/MS). */

export const AREAS = ['WHL', 'FBL', 'PDB', 'RB', 'PB', 'EVAP - CRY', 'WLP / GAS', 'ETA', 'ETAC', 'ETE', 'CP', 'LT'] as const;
export type Area = (typeof AREAS)[number];

export const DISCIPLINAS = ['Civil', 'Estrutura Metálica', 'Mecânica', 'Elétrica', 'Instrumentação', 'Automação', 'Montagem', 'Outras'] as const;
export const CATEGORIAS = ['(A) Impeditiva', '(B) Não Impeditiva', '(C) Melhoria'] as const;
export const IMPACTOS = ['Segurança', 'Ambiental', 'Operação', 'Construção', 'Comissionamento', 'Manutenção'] as const;
export const TIPOS = [
  'Acessibilidade', 'Ajuste instrumentação', 'Ajuste Tela SDCD', 'Ajuste Lógica SDCD', 'Ajuste elétrico',
  'Ajuste mecânico', 'Ajuste tubulação', 'Documentação', 'Identificação', 'Iluminação', 'Pintura',
  'Utilidades', 'Divergência de projeto', 'Outros',
] as const;
export const SITUACOES = ['Pendente', 'Cancelado', 'Concluído'] as const;
export const STATUS_APROVACAO = ['Aguardando Aprovação', 'Aprovado', 'Devolvido'] as const;

export type Situacao = (typeof SITUACOES)[number];
export type StatusAprovacao = (typeof STATUS_APROVACAO)[number];

/** Perfis (frentes) da tela inicial e a Origem gravada em cada registro. */
export const PROFILES = {
  implantacao: { label: 'Arauco Implantação', origem: 'Implantação', frente: 'Arauco Implantação' },
  manutencao: { label: 'Arauco Manutenção', origem: 'Manutenção', frente: 'Arauco Manutenção' },
  timenow: { label: 'Timenow', origem: 'Projeto', frente: 'Timenow' },
} as const;
export type ProfileKey = keyof typeof PROFILES;

const map = (entries: [readonly Area[], string][]): Partial<Record<Area, string>> =>
  Object.fromEntries(entries.flatMap(([areas, name]) => areas.map((a) => [a, name])));

/** Matriz oficial de aprovação: frente -> área -> aprovador. */
export const APPROVERS: Record<ProfileKey, Partial<Record<Area, string>>> = {
  implantacao: map([
    [['WHL', 'FBL', 'PDB'], 'Eisenhower Costa'],
    [['RB', 'PB'], 'Fábio Romano'],
    [['EVAP - CRY', 'WLP / GAS'], 'Everson Brito'],
    [['ETA', 'ETAC', 'ETE'], 'Laércio Cursino'],
    [['CP'], 'Everson Brito'],
    [['LT'], 'Nilton Faber'],
  ]),
  manutencao: map([[AREAS, 'Lizandro Lamas']]),
  timenow: map([
    [['WHL', 'FBL', 'PDB'], 'Jose Eduardo Marino'],
    [['RB', 'PB', 'EVAP - CRY', 'WLP / GAS'], 'Abraão Nascimento Santiago'],
    [['ETA', 'ETAC', 'ETE', 'CP'], 'JOSE SADY'],
  ]),
};

/** Agrupamento das áreas por unidade (referência da matriz). */
export const UNIDADES: Record<string, readonly Area[]> = {
  Celulose: ['WHL', 'FBL', 'PDB'],
  'Recuperação / CNCG / DNCG': ['RB', 'PB', 'EVAP - CRY', 'WLP / GAS'],
  'Águas e Planta Química': ['ETA', 'ETAC', 'ETE', 'CP'],
  'Linha de Transmissão': ['LT'],
};

/** Referência técnica: coordenadores de apoio da matriz (não aprovam no app). */
export const SUPPORT_COORDINATORS = {
  Projeto: map([
    [['WHL'], 'Alianderson Lopes'],
    [['FBL'], 'Luis Tanaka'],
    [['PDB'], 'José Antônio Nogueira'],
    [['RB', 'PB'], 'Daniel Sidoruk'],
    [['EVAP - CRY'], 'Carlos Brunetto'],
    [['WLP / GAS'], 'Renê Ronchete'],
    [['ETA', 'ETAC'], 'Luciana Nalin'],
    [['ETE'], 'Luis Targa'],
    [['CP'], 'Gustavo Cenatti'],
  ]),
  Civil: map([
    [['WHL', 'FBL', 'PDB', 'RB', 'PB', 'EVAP - CRY', 'WLP / GAS', 'CP'], 'José Carlos Alves'],
    [['ETA', 'ETAC', 'ETE'], 'Laércio Cursino'],
  ]),
  Elétrica: map([
    [AREAS.filter((a) => a !== 'LT'), 'Gustavo Aprile'],
    [['LT'], 'Nilton Faber'],
  ]),
  Qualidade: map([[AREAS, 'Nilton Lasmar']]),
} as const;
