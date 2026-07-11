import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "fuel-apply.microsoft-token";
const discovery = {
  authorizationEndpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

const redirectUri = AuthSession.makeRedirectUri({ scheme: "fuelapply" });

export function getRedirectUri(): string {
  return redirectUri;
}

async function saveToken(token: StoredToken): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(token));
}

async function readToken(): Promise<StoredToken | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return null;
  }
}

export async function signIn(clientId: string): Promise<string> {
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "profile", "offline_access", "User.Read", "Files.ReadWrite"],
    usePKCE: true,
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || !result.params.code) {
    throw new Error("Microsoftアカウントのサインインがキャンセルされました。");
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier ?? "",
      },
    },
    discovery,
  );

  const expiresIn = tokenResponse.expiresIn ?? 3600;
  await saveToken({
    accessToken: tokenResponse.accessToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return tokenResponse.accessToken;
}

async function refreshToken(token: StoredToken, clientId: string): Promise<string | null> {
  if (!token.refreshToken) return null;

  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      scope: "openid profile offline_access User.Read Files.ReadWrite",
    }).toString(),
  });
  if (!response.ok) return null;

  const refreshed = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  await saveToken({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  });
  return refreshed.access_token;
}

export async function getAccessToken(clientId: string): Promise<string | null> {
  const token = await readToken();
  if (!token) return null;
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  return refreshToken(token, clientId);
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
