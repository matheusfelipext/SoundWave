SoundWave.biblioteca = (() => {
  "use strict";
  const { obterPlaylists, obterPlaylist, obterItensPlaylist, obterMusicasSalvas, obterTocadasRecentemente } = SoundWave.api;

  async function carregarPaginaMusicasSalvas(deslocamento = 0) {
    const resposta = await obterMusicasSalvas(deslocamento);
    return {
      tracks: (resposta?.items || []).map((entrada) => entrada.track).filter((musica) => musica && !musica.is_local),
      nextOffset: resposta?.next ? Number(resposta.offset || 0) + Number(resposta.limit || 10) : null,
      total: resposta?.total || 0
    };
  }

  async function carregarMusicasRecentes() {
    const resposta = await obterTocadasRecentemente();
    return (resposta?.items || []).map((entrada) => entrada.track).filter((musica) => musica && !musica.is_local);
  }

  async function carregarPaginaPlaylists(deslocamento = 0) {
    const resposta = await obterPlaylists(deslocamento);
    return {
      playlists: (resposta?.items || []).filter(playlist => playlist?.id),
      nextOffset: resposta?.next ? Number(resposta.offset || 0) + Number(resposta.limit || 10) : null
    };
  }

  async function carregarMusicasPlaylist(id) {
    const playlist = await obterPlaylist(id);
    let pagina = null;
    let alerta = "";
    try {
      pagina = await obterItensPlaylist(id);
    } catch (erro) {
      if (erro.status !== 403) throw erro;
      alerta = erro.message;
    }
    const itens = pagina?.items || playlist?.items?.items || [];
    return {
      playlist: playlist,
      tracks: itens.map((entrada) => entrada?.item || entrada?.track).filter((musica) => musica && musica.type === "track" && !musica.is_local),
      nextOffset: pagina?.next ? Number(pagina.offset || 0) + Number(pagina.limit || 10) : null,
      contentsAvailable: Array.isArray(pagina?.items) || Array.isArray(playlist?.items?.items),
      warning: alerta
    };
  }

  async function carregarPaginaMusicasPlaylist(id, deslocamento) {
    const pagina = await obterItensPlaylist(id, deslocamento);
    return {
      tracks: (pagina?.items || []).map((entrada) => entrada?.item || entrada?.track).filter((musica) => musica && musica.type === "track" && !musica.is_local),
      nextOffset: pagina?.next ? Number(pagina.offset || 0) + Number(pagina.limit || 10) : null
    };
  }

  return {
    carregarPaginaMusicasSalvas, carregarMusicasRecentes, carregarPaginaPlaylists, carregarMusicasPlaylist, carregarPaginaMusicasPlaylist
  };
})();
