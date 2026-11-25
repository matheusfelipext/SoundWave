SoundWave.playlistsPublicas = (() => {
  "use strict";
  const { buscar } = SoundWave.api;

  function idDaPlaylist(valor) {
    const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(valor);
    if (uri) return uri[1];
    try {
      const url = new URL(valor);
      if (url.origin !== "https://open.spotify.com" || url.username || url.password) return null;
      return /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname)?.[1] || null;
    } catch { return null; }
  }

  function mostrarPlaylistIncorporada(recipiente, id) {
    if (!/^[A-Za-z0-9]{22}$/.test(id)) return false;
    const quadro = document.createElement("iframe");
    quadro.className = "playlist-incorporada";
    quadro.src = "https://open.spotify.com/embed/playlist/" + id;
    quadro.title = "Player oficial da playlist no Spotify";
    quadro.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    quadro.allowFullscreen = true;
    const link = document.createElement("a");
    link.href = "https://open.spotify.com/playlist/" + id;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir no Spotify ↗";
    recipiente.replaceChildren(quadro, link);
    recipiente.hidden = false;
    return true;
  }

  function montarBuscaPlaylists(secao, conectado) {
    const formulario = secao.querySelector("form");
    const status = secao.querySelector("[role=status]");
    const lista = secao.querySelector("[data-results]");
    const mais = secao.querySelector("[data-more]");
    const previa = secao.querySelector("[data-preview]");
    let revisao = 0;
    let deslocamento = 0;
    let consulta = "";
    let ids = new Set();

    async function load() {
      const executar = revisao;
      mais.disabled = true;
      try {
        const resultado = await buscar(consulta, "playlist", deslocamento);
        if (executar !== revisao || !secao.isConnected) return;
        const pagina = resultado.playlists;
        for (const playlist of pagina?.items || []) {
          if (!playlist?.id || ids.has(playlist.id)) continue;
          ids.add(playlist.id);
          const link = document.createElement("a");
          link.href = "playlist.html?publica=" + encodeURIComponent(playlist.id);
          link.className = "cartao";
          const capa = document.createElement("img");
          capa.src = playlist.images?.[0]?.url || "img/minhas-favoritas.svg";
          capa.alt = "";
          capa.loading = "lazy";
          const nome = document.createElement("h3");
          nome.textContent = playlist.name;
          const dono = document.createElement("p");
          dono.textContent = playlist.owner?.display_name || "Playlist no Spotify";
          link.append(capa, nome, dono);
          lista.append(link);
        }
        status.textContent = ids.size ? "" : "Nenhuma playlist encontrada para essa busca.";
        deslocamento = (pagina?.offset ?? deslocamento) + (pagina?.limit || 10);
        mais.hidden = !pagina?.next || deslocamento > 1000;
      } catch (erro) {
        if (executar === revisao) status.textContent = erro.message;
      } finally {
        if (executar === revisao) mais.disabled = false;
      }
    }

    formulario.onsubmit = evento => {
      evento.preventDefault();
      revisao++;
      consulta = formulario.elements.playlist.value.trim();
      deslocamento = 0;
      ids = new Set();
      lista.replaceChildren();
      previa.replaceChildren();
      mais.hidden = true;
      if (mostrarPlaylistIncorporada(previa, idDaPlaylist(consulta) || "")) { status.textContent = ""; return; }
      if (!consulta || /^(https?:|spotify:)/i.test(consulta)) {
        status.textContent = "Use um nome ou o link de uma playlist em open.spotify.com/playlist/.";
        return;
      }
      if (!conectado) {
        status.textContent = "Conecte sua conta para buscar por nome ou cole o link de uma playlist pública.";
        return;
      }
      status.textContent = "Buscando playlists…";
      load();
    };
    mais.onclick = load;
  }

  return {
    mostrarPlaylistIncorporada, montarBuscaPlaylists
  };
})();
