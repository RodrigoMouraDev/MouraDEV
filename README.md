# Punch List — Projeto Sucuriú (Arauco · Inocência/MS)

App corporativo **Android + iOS** (Expo SDK 58 + EAS Build, TypeScript) para registro de pendências em campo
**100% offline**, com sincronização automática para o **SharePoint Online** (Lista + Biblioteca de Documentos)
e atualização da planilha mestre **`Modelo - Punch list.xlsx`**.

## Arquitetura

```
App.tsx                      Roteador simples (sem lib de navegação)
src/config/constants.ts      Áreas, disciplinas, opções, perfis, matriz de aprovação, coordenadores de apoio
src/config/columns.ts        Mapeamento único: cabeçalho xlsx <-> coluna da Lista SP <-> SQLite
src/config/env.ts            Variáveis EXPO_PUBLIC_* (Entra ID / SharePoint)
src/db/database.ts           SQLite (expo-sqlite): itens + metadados
src/services/auth.ts         Login Microsoft 365 (PKCE), tokens no SecureStore, sessão offline
src/services/graph.ts        Microsoft Graph: Lista, upload/download na Biblioteca
src/services/sync.ts         Pull -> Push (fotos + itens) -> planilha mestre; exportação
src/services/excel.ts        SheetJS: leitura de planilha da contratada e geração da mestre
src/services/items.ts        Regras: registro de campo, edição, aprovação, importação
src/state/AppContext.tsx     Sessão, perfil, rede, contador de pendentes, auto-sync
src/screens/*                Login, Início, Campo, Sala/Engenharia + Aprovações, Detalhe
```

**Fluxo offline-first:** todo registro/edição é gravado primeiro no SQLite (`dirty = 1`) com UUID local; as fotos
são copiadas para o armazenamento do app. Ao detectar rede (NetInfo), a cada 5 min com pendências, após salvar
online ou em **“Sincronizar Agora”**, o app:

1. **Pull** — lê a Lista do SharePoint e atualiza a base local (itens sem alteração local).
2. **Push** — envia fotos para a Biblioteca (`Fotos/<Área>/…jpg`, URL gravada em `FotoUrl`) e cria/atualiza os itens.
   O **`Item` sequencial é o ID da Lista do SharePoint**: gerado pelo servidor, nunca conflita entre aparelhos.
   A coluna `LocalId` evita duplicar um item cujo envio foi interrompido.
3. **Planilha mestre** — baixa `Modelo - Punch list.xlsx`, localiza a linha de cabeçalho (com `TAG` e `Descrição`),
   reescreve as linhas de dados a partir da Lista (fonte única da verdade), acrescenta colunas ausentes à direita,
   preenche os rótulos `Emissão inicial` / `Data da revisão` do bloco superior e devolve o arquivo ao SharePoint.

**Datas** (calendário do aparelho, gravadas como data Excel nativa formato `dd/mmm/yy`):
`Data inserção` = dia do registro; `Emissão inicial` = mais antiga da área, preservada; `Data da revisão` =
atualizada em cada inclusão, edição, aprovação e sincronização.

**Aprovação:** `Aprovar Pendência` / `Devolver` (justificativa obrigatória) só aparecem quando o nome do usuário
logado (Entra ID `displayName`, comparado sem acento/maiúsculas) é o aprovador oficial da área **para o perfil
selecionado** (`APPROVERS` em `constants.ts`). Grava `Aprovador`, `Frente Aprovação`, `Data/Hora Aprovação`.

## 1. Microsoft Entra ID (App registration)

1. *App registrations → New registration* — “Punch List Sucuriú”, contas somente deste diretório.
2. *Authentication → Add a platform → Mobile and desktop applications* → Redirect URI: `punchlist://auth`.
   Em *Advanced settings* deixe **Allow public client flows = Yes**. Não há client secret (PKCE).
3. *API permissions* (Delegated, Microsoft Graph): `User.Read`, `Sites.ReadWrite.All`, `offline_access` → **Grant admin consent**.
   (Alternativa mais restrita: `Sites.Selected` concedido apenas ao site do projeto.)

## 2. SharePoint

No site do projeto crie a Lista **`PunchList`** com as colunas abaixo (nome interno exato; tipo sugerido).
Datas como *Data e Hora*; demais como *Uma linha de texto* (ou *Várias linhas* para Descrição/Comentários/Justificativa/FotoUrl).

| Coluna (interno) | Tipo | | Coluna (interno) | Tipo |
|---|---|---|---|---|
| `Item` | Número | | `ResponsavelSolucao` | Texto |
| `Area` | Texto | | `DataPrevista` | Data |
| `TAG` | Texto | | `Situacao` | Texto |
| `Descricao` | Várias linhas | | `DataConclusao` | Data |
| `Disciplina` | Texto | | `Comentarios` | Várias linhas |
| `Categoria` | Texto | | `FotoUrl` | Várias linhas |
| `Impactos` | Texto | | `StatusAprovacao` | Texto |
| `Tipo` | Texto | | `Aprovador` | Texto |
| `SolicitadoPor` | Texto | | `FrenteAprovacao` | Texto |
| `Origem` | Texto | | `DataAprovacao` | Data e Hora |
| `DataInsercao` | Data | | `JustificativaDevolucao` | Várias linhas |
| `EmissaoInicial` | Data | | `DataRevisao` | Data |
| `LocalId` | Texto (indexado) | | | |

Na Biblioteca **Documentos** coloque `PunchList/Modelo - Punch list.xlsx` (as fotos vão para `PunchList/Fotos`).
Se os cabeçalhos do modelo forem diferentes, ajuste `header` em `src/config/columns.ts`.

## 3. Ambiente local

```bash
cp .env.example .env      # preencha Tenant, Client ID e SharePoint
npm install               # SheetJS vem do CDN oficial (cdn.sheetjs.com) — commite o package-lock.json gerado
npm run typecheck
npx expo run:android      # ou: npx expo run:ios  (expo-auth-session/SecureStore exigem build nativo, não Expo Go)
```

## 4. Builds (EAS)

```bash
npm i -g eas-cli && eas login
eas init                                  # vincula o projectId ao app.json
# Cadastre cada variável do .env.example no EAS (preview e production), ex.:
eas env:create --environment preview --name EXPO_PUBLIC_AZURE_CLIENT_ID --value <id> --visibility plaintext
```

| Saída | Comando |
|---|---|
| **APK Android** (instalação direta) | `eas build -p android --profile preview` |
| **IPA iOS Ad-Hoc** (aparelhos registrados) | `eas device:create` e depois `eas build -p ios --profile preview` |
| **AAB** Play Store | `eas build -p android --profile production` |
| **TestFlight** | `eas build -p ios --profile production --auto-submit` (preencha `ascAppId` em `eas.json`) |

iOS exige conta Apple Developer (o EAS gera certificados/perfis). Os bundle IDs estão em `app.json`
(`com.arauco.sucuriu.punchlist`) — ajuste conforme o padrão corporativo.

## Upload de arquivo da contratada (perfil Timenow)

Sala/Engenharia → **Upload Arquivo da Contratada** → escolhe a Área → seleciona `.xlsx`. O app localiza o cabeçalho,
exige `TAG` e `Descrição` (demais colunas do modelo são aproveitadas se existirem), ignora duplicados pela chave
**Área + TAG + Descrição** (normalizada) e inclui os válidos com `Origem = Projeto`; eles sobem na próxima sincronização.

## Limitações conhecidas

- O SheetJS Community não preserva toda a formatação visual (cores/bordas) ao regravar o modelo; valores, abas,
  cabeçalho e bloco superior são mantidos.
- Edições simultâneas do mesmo item em aparelhos diferentes: vale a última sincronização (last-write-wins).
- A habilitação do aprovador compara o `displayName` do Entra ID com a matriz — os nomes no diretório devem
  coincidir (acentos e maiúsculas são ignorados).
