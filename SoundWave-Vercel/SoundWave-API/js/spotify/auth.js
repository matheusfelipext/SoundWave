SoundWave.auth = (() => {
  "use strict";
  const CLIENT_ID_KEY = "soundwave.spotify.clientId";
  // Identificador público do app SoundWave cadastrado no Spotify Developer Dashboard.
  const SOUNDWAVE_CLIENT_ID = "202e169e293542de8ac9b3f5bd7011b5";
  const ACCESS_TOKEN_KEY = "soundwave.spotify.accessToken";
  const REFRESH_TOKEN_KEY = "soundwave.spotify.refreshToken";
  const EXPIRES_AT_KEY = "soundwave.spotify.expiresAt";
  const CODE_VERIFIER_KEY = "soundwave.spotify.codeVerifier";
  const OAUTH_STATE_KEY = "soundwave.spotify.oauthState";
  const REDIRECT_URI_KEY = "soundwave.spotify.redirectUri";
  const RETURN_TO_KEY = "soundwave.spotify.returnTo";

  const SPOTIFY_SCOPES = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-recently-played",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state"
  ];

  function getClientId() {
    return localStorage.getItem(CLIENT_ID_KEY) || SOUNDWAVE_CLIENT_ID;
  }

  function saveClientId(value) {
    const clientId = String(value || "").trim();
    if (!/^[a-f\d]{32}$/i.test(clientId)) throw new Error("Copie os 32 caracteres do campo Client ID em Basic Information no painel do Spotify.");
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    return clientId;
  }

  function getRedirectUri() {
    if (location.protocol === "file:") return "";
    const pathname = window.location.pathname;
    const directory = pathname.endsWith("/") ? pathname : pathname.slice(0, pathname.lastIndexOf("/") + 1);
    return new URL(`${directory}callback.html`, window.location.origin).href;
  }

  function randomString(length) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  function base64Url(bytes) {
    let binary = "";
    new Uint8Array(bytes).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  async function createChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(digest);
  }

  async function startAuthorization(returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    if (location.protocol === "file:") {
      SoundWave.openWebConnection();
      return;
    }
    const clientId = getClientId();
    if (!clientId) throw new Error("Cadastre o Client ID do Spotify antes de conectar.");
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o SoundWave por HTTPS ou por http://127.0.0.1. O fluxo PKCE precisa de um contexto seguro.");
    }

    const verifier = randomString(64);
    const state = randomString(32);
    const redirectUri = getRedirectUri();
    sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri);
    sessionStorage.setItem(RETURN_TO_KEY, returnTo);

    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES.join(" "),
      state,
      code_challenge_method: "S256",
      code_challenge: await createChallenge(verifier)
    }).toString();

    if (hasSession()) authorizeUrl.searchParams.set("show_dialog", "true");
    window.location.assign(authorizeUrl.href);
  }

  function storeTokens(payload, existingRefreshToken = "") {
    if (!payload.access_token) throw new Error("O Spotify não retornou um token de acesso.");
    sessionStorage.setItem(ACCESS_TOKEN_KEY, payload.access_token);
    sessionStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + Math.max(0, Number(payload.expires_in || 3600) - 45) * 1000));
    const refreshToken = payload.refresh_token || existingRefreshToken;
    if (refreshToken) sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    else sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  async function tokenRequest(body) {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload.error_description || payload.error || `HTTP ${response.status}`;
      throw new Error(`Falha na autenticação do Spotify: ${reason}`);
    }
    return payload;
  }

  async function completeAuthorization() {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) throw new Error(oauthError === "access_denied" ? "A autorização foi cancelada no Spotify." : `O Spotify recusou a autorização (${oauthError}).`);

    const code = params.get("code");
    if (!code) return false;

    const receivedState = params.get("state");
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    const redirectUri = sessionStorage.getItem(REDIRECT_URI_KEY) || getRedirectUri();
    if (!expectedState || !receivedState || receivedState !== expectedState || !verifier) {
      throw new Error("Não foi possível validar a resposta OAuth. Comece a conexão novamente.");
    }

    const payload = await tokenRequest({
      client_id: getClientId(),
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    });
    storeTokens(payload);

    const savedReturn = sessionStorage.getItem(RETURN_TO_KEY) || "index.html";
    [CODE_VERIFIER_KEY, OAUTH_STATE_KEY, REDIRECT_URI_KEY, RETURN_TO_KEY].forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.setItem("soundwave.spotify.notice", "Spotify conectado com sucesso.");

    let destination = new URL(savedReturn, window.location.href);
    const library = new URL("index.html", window.location.href);
    if (destination.origin !== library.origin) destination = library;
    const directory = new URL("./", library);
    if (destination.pathname === directory.pathname || destination.pathname === new URL("biblioteca.html", directory).pathname) {
      destination.pathname = library.pathname;
    }
    window.location.replace(`${destination.pathname}${destination.search}${destination.hash}`);
    return true;
  }

  let refreshInProgress;

  function refreshAccessToken() {
    if (!refreshInProgress) refreshInProgress = renewToken().finally(() => { refreshInProgress = null; });
    return refreshInProgress;
  }

  async function renewToken() {
    const clientId = getClientId();
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (!clientId || !refreshToken) throw new Error("Conecte sua conta Spotify novamente.");

    try {
      const payload = await tokenRequest({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      });
      storeTokens(payload, refreshToken);
      return payload.access_token;
    } catch (error) {
      clearTokens();
      throw error;
    }
  }

  async function getAccessToken() {
    const accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = Number(sessionStorage.getItem(EXPIRES_AT_KEY) || 0);
    if (accessToken && expiresAt > Date.now()) return accessToken;
    return refreshAccessToken();
  }

  function hasSession() {
    return location.protocol !== "file:" && Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY));
  }

  function clearTokens() {
    [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, EXPIRES_AT_KEY, CODE_VERIFIER_KEY, OAUTH_STATE_KEY, REDIRECT_URI_KEY, RETURN_TO_KEY]
      .forEach((key) => sessionStorage.removeItem(key));
  }

  function disconnect() {
    clearTokens();
    sessionStorage.removeItem("soundwave.spotify.notice");
  }

  return {
    SPOTIFY_SCOPES, getClientId, saveClientId, getRedirectUri, startAuthorization, completeAuthorization, refreshAccessToken, getAccessToken, hasSession, clearTokens, disconnect
  };
})();
