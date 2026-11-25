SoundWave.autenticacao = (() => {
  "use strict";
  const CHAVE_CLIENT_ID = "soundwave.spotify.clientId";
  // Identificador público do app SoundWave cadastrado no Spotify Developer Dashboard.
  const CLIENT_ID_SOUNDWAVE = "202e169e293542de8ac9b3f5bd7011b5";
  const CHAVE_TOKEN_ACESSO = "soundwave.spotify.accessToken";
  const CHAVE_TOKEN_RENOVACAO = "soundwave.spotify.refreshToken";
  const CHAVE_EXPIRA_EM = "soundwave.spotify.expiresAt";
  const CHAVE_VERIFICADOR = "soundwave.spotify.codeVerifier";
  const CHAVE_ESTADO_OAUTH = "soundwave.spotify.oauthState";
  const CHAVE_URI_REDIRECIONAMENTO = "soundwave.spotify.redirectUri";
  const CHAVE_VOLTAR_PARA = "soundwave.spotify.returnTo";

  const ESCOPOS_SPOTIFY = [
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

  function obterClientId() {
    return localStorage.getItem(CHAVE_CLIENT_ID) || CLIENT_ID_SOUNDWAVE;
  }

  function salvarClientId(valor) {
    const clientId = String(valor || "").trim();
    if (!/^[a-f\d]{32}$/i.test(clientId)) throw new Error("Copie os 32 caracteres do campo Client ID em Basic Information no painel do Spotify.");
    localStorage.setItem(CHAVE_CLIENT_ID, clientId);
    return clientId;
  }

  function obterUriRedirecionamento() {
    if (location.protocol === "file:") return "";
    const nomeCaminho = window.location.pathname;
    const diretorio = nomeCaminho.endsWith("/") ? nomeCaminho : nomeCaminho.slice(0, nomeCaminho.lastIndexOf("/") + 1);
    return new URL(`${diretorio}callback.html`, window.location.origin).href;
  }

  function textoAleatorio(tamanho) {
    const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
    return Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join("");
  }

  function base64Url(bytes) {
    let binario = "";
    new Uint8Array(bytes).forEach((byte) => { binario += String.fromCharCode(byte); });
    return btoa(binario).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  async function criarDesafio(verificador) {
    const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador));
    return base64Url(resumo);
  }

  async function iniciarAutorizacao(voltarPara = `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    if (location.protocol === "file:") {
      SoundWave.abrirConexaoWeb();
      return;
    }
    const clientId = obterClientId();
    if (!clientId) throw new Error("Cadastre o Client ID do Spotify antes de conectar.");
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o SoundWave por HTTPS ou por http://127.0.0.1. O fluxo PKCE precisa de um contexto seguro.");
    }

    const verificador = textoAleatorio(64);
    const estado = textoAleatorio(32);
    const uriRedirecionamento = obterUriRedirecionamento();
    sessionStorage.setItem(CHAVE_VERIFICADOR, verificador);
    sessionStorage.setItem(CHAVE_ESTADO_OAUTH, estado);
    sessionStorage.setItem(CHAVE_URI_REDIRECIONAMENTO, uriRedirecionamento);
    sessionStorage.setItem(CHAVE_VOLTAR_PARA, voltarPara);

    const urlAutorizacao = new URL("https://accounts.spotify.com/authorize");
    urlAutorizacao.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: uriRedirecionamento,
      scope: ESCOPOS_SPOTIFY.join(" "),
      state: estado,
      code_challenge_method: "S256",
      code_challenge: await criarDesafio(verificador)
    }).toString();

    if (temSessao()) urlAutorizacao.searchParams.set("show_dialog", "true");
    window.location.assign(urlAutorizacao.href);
  }

  function guardarTokens(carga, tokenRenovacaoExistente = "") {
    if (!carga.access_token) throw new Error("O Spotify não retornou um token de acesso.");
    sessionStorage.setItem(CHAVE_TOKEN_ACESSO, carga.access_token);
    sessionStorage.setItem(CHAVE_EXPIRA_EM, String(Date.now() + Math.max(0, Number(carga.expires_in || 3600) - 45) * 1000));
    const tokenRenovacao = carga.refresh_token || tokenRenovacaoExistente;
    if (tokenRenovacao) sessionStorage.setItem(CHAVE_TOKEN_RENOVACAO, tokenRenovacao);
    else sessionStorage.removeItem(CHAVE_TOKEN_RENOVACAO);
  }

  async function requisicaoToken(corpo) {
    const resposta = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(corpo)
    });
    const carga = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const motivo = carga.error_description || carga.error || `HTTP ${resposta.status}`;
      throw new Error(`Falha na autenticação do Spotify: ${motivo}`);
    }
    return carga;
  }

  async function concluirAutorizacao() {
    const parametros = new URLSearchParams(window.location.search);
    const erroOauth = parametros.get("error");
    if (erroOauth) throw new Error(erroOauth === "access_denied" ? "A autorização foi cancelada no Spotify." : `O Spotify recusou a autorização (${erroOauth}).`);

    const codigo = parametros.get("code");
    if (!codigo) return false;

    const estadoRecebido = parametros.get("state");
    const estadoEsperado = sessionStorage.getItem(CHAVE_ESTADO_OAUTH);
    const verificador = sessionStorage.getItem(CHAVE_VERIFICADOR);
    const uriRedirecionamento = sessionStorage.getItem(CHAVE_URI_REDIRECIONAMENTO) || obterUriRedirecionamento();
    if (!estadoEsperado || !estadoRecebido || estadoRecebido !== estadoEsperado || !verificador) {
      throw new Error("Não foi possível validar a resposta OAuth. Comece a conexão novamente.");
    }

    const carga = await requisicaoToken({
      client_id: obterClientId(),
      grant_type: "authorization_code",
      code: codigo,
      redirect_uri: uriRedirecionamento,
      code_verifier: verificador
    });
    guardarTokens(carga);

    const retornoSalvo = sessionStorage.getItem(CHAVE_VOLTAR_PARA) || "index.html";
    [CHAVE_VERIFICADOR, CHAVE_ESTADO_OAUTH, CHAVE_URI_REDIRECIONAMENTO, CHAVE_VOLTAR_PARA].forEach((chave) => sessionStorage.removeItem(chave));
    sessionStorage.setItem("soundwave.spotify.notice", "Spotify conectado com sucesso.");

    let destino = new URL(retornoSalvo, window.location.href);
    const biblioteca = new URL("index.html", window.location.href);
    if (destino.origin !== biblioteca.origin) destino = biblioteca;
    const diretorio = new URL("./", biblioteca);
    if (destino.pathname === diretorio.pathname || destino.pathname === new URL("biblioteca.html", diretorio).pathname) {
      destino.pathname = biblioteca.pathname;
    }
    window.location.replace(`${destino.pathname}${destino.search}${destino.hash}`);
    return true;
  }

  let renovacaoEmAndamento;

  function renovarTokenAcesso() {
    if (!renovacaoEmAndamento) renovacaoEmAndamento = renovarToken().finally(() => { renovacaoEmAndamento = null; });
    return renovacaoEmAndamento;
  }

  async function renovarToken() {
    const clientId = obterClientId();
    const tokenRenovacao = sessionStorage.getItem(CHAVE_TOKEN_RENOVACAO);
    if (!clientId || !tokenRenovacao) throw new Error("Conecte sua conta Spotify novamente.");

    try {
      const carga = await requisicaoToken({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: tokenRenovacao
      });
      guardarTokens(carga, tokenRenovacao);
      return carga.access_token;
    } catch (erro) {
      limparTokens();
      throw erro;
    }
  }

  async function obterTokenAcesso() {
    const tokenAcesso = sessionStorage.getItem(CHAVE_TOKEN_ACESSO);
    const expiraEm = Number(sessionStorage.getItem(CHAVE_EXPIRA_EM) || 0);
    if (tokenAcesso && expiraEm > Date.now()) return tokenAcesso;
    return renovarTokenAcesso();
  }

  function temSessao() {
    return location.protocol !== "file:" && Boolean(sessionStorage.getItem(CHAVE_TOKEN_ACESSO) || sessionStorage.getItem(CHAVE_TOKEN_RENOVACAO));
  }

  function limparTokens() {
    [CHAVE_TOKEN_ACESSO, CHAVE_TOKEN_RENOVACAO, CHAVE_EXPIRA_EM, CHAVE_VERIFICADOR, CHAVE_ESTADO_OAUTH, CHAVE_URI_REDIRECIONAMENTO, CHAVE_VOLTAR_PARA]
      .forEach((chave) => sessionStorage.removeItem(chave));
  }

  function disconnect() {
    limparTokens();
    sessionStorage.removeItem("soundwave.spotify.notice");
  }

  return {
    ESCOPOS_SPOTIFY, obterClientId, salvarClientId, obterUriRedirecionamento, iniciarAutorizacao, concluirAutorizacao, renovarTokenAcesso, obterTokenAcesso, temSessao, limparTokens, disconnect
  };
})();
