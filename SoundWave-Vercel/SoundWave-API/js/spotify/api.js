SoundWave.api = (() => {
  "use strict";
  const { obterTokenAcesso, renovarTokenAcesso } = SoundWave.autenticacao;

  const RAIZ_API = "https://api.spotify.com/v1";

  class ErroApiSpotify extends Error {
    constructor(mensagem, status, carga = null, detalhe = "") {
      super(mensagem);
      this.name = "SpotifyApiError";
      this.status = status;
      this.payload = carga;
      this.detail = detalhe;
    }
  }

  function mensagemPorStatus(status, detalhe) {
    if (status === 401) return "A sessão do Spotify expirou. Conecte-se novamente.";
    if (status === 403) return "O Spotify negou esse recurso. Confira Premium do dono do app, usuário autorizado, permissões e limites do Development Mode.";
    if (status === 404) return "O Spotify não encontrou esse conteúdo ou ele não está disponível para esta conta.";
    if (status === 429) return "O limite de chamadas do Spotify foi atingido. Aguarde um pouco e tente novamente.";
    return detalhe || `A API do Spotify respondeu com HTTP ${status}.`;
  }

  async function requisitar(caminho, { method: metodo = "GET", query: consulta = null, body: corpo = null, cache: cache = "default", retried = false } = {}) {
    const alvo = /^https:\/\//i.test(caminho) ? caminho : `${RAIZ_API}/${String(caminho).replace(/^\/+/, "")}`;
    const url = new URL(alvo);
    if (url.origin !== "https://api.spotify.com" || !url.pathname.startsWith("/v1/")) {
      throw new Error("URL de API do Spotify inválida.");
    }
    if (consulta) Object.entries(consulta).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(chave, String(valor));
    });

    const token = await obterTokenAcesso();
    const resposta = await fetch(url.href, {
      method: metodo,
      cache: cache,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(corpo ? { "Content-Type": "application/json" } : {})
      },
      body: corpo ? JSON.stringify(corpo) : undefined
    });

    if (resposta.status === 401 && !retried) {
      await renovarTokenAcesso();
      return requisitar(caminho, { method: metodo, query: consulta, body: corpo, cache: cache, retried: true });
    }
    if (resposta.status === 204) return null;

    if (!resposta.ok) {
      const bruto = (await resposta.text()).trim();
      let carga = null;
      try {
        carga = JSON.parse(bruto);
      } catch {
        // O Spotify também pode enviar a explicação em texto simples.
      }
      const motivo = carga?.error?.message || carga?.error_description || carga?.error?.reason
        || (typeof carga === "string" ? carga : null)
        || (!carga && !bruto.startsWith("<") ? bruto : "");
      const detalhe = typeof motivo === "string" ? motivo.slice(0, 400) : "";
      const mensagem = mensagemPorStatus(resposta.status, detalhe);
      const diagnostico = resposta.status === 403 ? ` (403 em ${url.pathname}${detalhe ? " · " + detalhe : ""})` : "";
      throw new ErroApiSpotify(mensagem + diagnostico, resposta.status, carga, detalhe);
    }
    return resposta.json().catch(() => null);
  }

  const buscar = (consulta, tipo = "track,artist,album", deslocamento = 0) => requisitar("/search", {
    query: { q: consulta, type: tipo, limit: 10, offset: deslocamento }
  });

  const obterPerfil = () => requisitar("/me", { cache: "no-store" });
  const obterMusicasSalvas = (deslocamento = 0) => requisitar("/me/tracks", { query: { limit: 10, offset: deslocamento } });
  const obterAlbunsSalvos = (deslocamento = 0) => requisitar("/me/albums", { query: { limit: 10, offset: deslocamento } });
  const obterTocadasRecentemente = () => requisitar("/me/player/recently-played", { query: { limit: 10 } });
  const obterPlaylists = (deslocamento = 0) => requisitar("/me/playlists", { query: { limit: 10, offset: deslocamento } });
  const obterPlaylist = (id) => requisitar(`/playlists/${encodeURIComponent(id)}`);
  const obterItensPlaylist = (id, deslocamento = 0) => requisitar(`/playlists/${encodeURIComponent(id)}/items`, { query: { limit: 10, offset: deslocamento } });
  const obterArtista = (id) => requisitar(`/artists/${encodeURIComponent(id)}`);
  const obterAlbunsArtista = (id, deslocamento = 0) => requisitar(`/artists/${encodeURIComponent(id)}/albums`, { query: { include_groups: "album,single", limit: 10, offset: deslocamento } });

  const verificarItensSalvos = (uris) => requisitar("/me/library/contains", { query: { uris: uris.join(",") } });
  const salvarNaBiblioteca = (uri) => requisitar("/me/library", { method: "PUT", query: { uris: uri } });
  const removerDaBiblioteca = (uri) => requisitar("/me/library", { method: "DELETE", query: { uris: uri } });

  const iniciarReproducao = (idDispositivo, uris) => requisitar("/me/player/play", {
    method: "PUT",
    query: { device_id: idDispositivo },
    body: { uris: uris }
  });

  const definirAleatorio = (idDispositivo, habilitado) => requisitar("/me/player/shuffle", {
    method: "PUT",
    query: { device_id: idDispositivo, state: habilitado }
  });

  const definirRepetir = (idDispositivo, modo) => requisitar("/me/player/repeat", {
    method: "PUT",
    query: { device_id: idDispositivo, state: modo }
  });

  return {
    ErroApiSpotify, requisitar, buscar, obterPerfil, obterMusicasSalvas, obterAlbunsSalvos, obterTocadasRecentemente, obterPlaylists, obterPlaylist, obterItensPlaylist, obterArtista, obterAlbunsArtista, verificarItensSalvos, salvarNaBiblioteca, removerDaBiblioteca, iniciarReproducao, definirAleatorio, definirRepetir
  };
})();
