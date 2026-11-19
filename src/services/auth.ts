import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { ENV, SCOPES } from '../config/env';
import type { UserProfile } from '../types';

WebBrowser.maybeCompleteAuthSession();

const base = `https://login.microsoftonline.com/${ENV.tenantId}/oauth2/v2.0`;
const discovery = { authorizationEndpoint: `${base}/authorize`, tokenEndpoint: `${base}/token` };
/** Registrar no Entra ID como "Mobile and desktop applications": punchlist://auth */
export const redirectUri = AuthSession.makeRedirectUri({ scheme: 'punchlist', path: 'auth' });

interface Stored { accessToken: string; refreshToken?: string; expiresIn?: number; issuedAt: number }

// SecureStore recomenda valores <= 2 KB: tokens são gravados em partes.
const CHUNK = 1800;
async function setSecure(key: string, value: string | null) {
  const n = Number((await SecureStore.getItemAsync(`${key}_n`)) ?? 0);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}_${i}`);
  if (value === null) return SecureStore.deleteItemAsync(`${key}_n`);
  const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
  for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(`${key}_${i}`, parts[i]);
  await SecureStore.setItemAsync(`${key}_n`, String(parts.length));
}
async function getSecure(key: string) {
  const n = Number((await SecureStore.getItemAsync(`${key}_n`)) ?? 0);
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) s += (await SecureStore.getItemAsync(`${key}_${i}`)) ?? '';
  return s;
}

const saveTokens = (t: AuthSession.TokenResponse) =>
  setSecure('tokens', JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, issuedAt: t.issuedAt } satisfies Stored));

/** Usuário em cache: permite operar 100% offline após o primeiro login. */
export async function getCachedUser(): Promise<UserProfile | null> {
  const s = await getSecure('user');
  return s ? JSON.parse(s) : null;
}

export async function login(): Promise<UserProfile> {
  const req = new AuthSession.AuthRequest({
    clientId: ENV.clientId, scopes: SCOPES, redirectUri, usePKCE: true, prompt: AuthSession.Prompt.SelectAccount,
  });
  const res = await req.promptAsync(discovery);
  if (res.type !== 'success') throw new Error(res.type === 'error' ? res.error?.message ?? 'Falha no login' : 'Login cancelado');
  const tok = await AuthSession.exchangeCodeAsync(
    { clientId: ENV.clientId, code: res.params.code, redirectUri, scopes: SCOPES, extraParams: { code_verifier: req.codeVerifier ?? '' } },
    discovery,
  );
  await saveTokens(tok);
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${tok.accessToken}` },
  });
  if (!r.ok) throw new Error(`Graph /me: ${r.status}`);
  const me = await r.json();
  const user: UserProfile = { id: me.id, displayName: me.displayName, mail: me.mail ?? me.userPrincipalName };
  await setSecure('user', JSON.stringify(user));
  return user;
}

/** Token válido (renova com refresh token). Exige rede somente quando precisa renovar. */
export async function getAccessToken(): Promise<string> {
  const s = await getSecure('tokens');
  if (!s) throw new Error('Sessão Microsoft 365 ausente — faça login novamente.');
  const t: Stored = JSON.parse(s);
  if (AuthSession.TokenResponse.isTokenFresh(t, 120)) return t.accessToken;
  if (!t.refreshToken) throw new Error('Sessão expirada — faça login novamente.');
  const n = await AuthSession.refreshAsync({ clientId: ENV.clientId, refreshToken: t.refreshToken, scopes: SCOPES }, discovery);
  if (!n.refreshToken) n.refreshToken = t.refreshToken;
  await saveTokens(n);
  return n.accessToken;
}

/** Modo local: identificação só pelo nome (sem conta Microsoft). */
export async function localLogin(name: string): Promise<UserProfile> {
  const user: UserProfile = { id: `local-${Date.now()}`, displayName: name.trim().replace(/\s+/g, ' '), mail: '' };
  await setSecure('user', JSON.stringify(user));
  return user;
}

export async function logout() {
  await setSecure('tokens', null);
  await setSecure('user', null);
}
