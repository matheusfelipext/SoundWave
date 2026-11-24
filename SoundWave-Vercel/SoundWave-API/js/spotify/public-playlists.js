SoundWave.publicPlaylists = (() => {
  "use strict";
  const { search } = SoundWave.api;

  function playlistId(value) {
    const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/.exec(value);
    if (uri) return uri[1];
    try {
      const url = new URL(value);
      if (url.origin !== "https://open.spotify.com" || url.username || url.password) return null;
      return /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname)?.[1] || null;
    } catch { return null; }
  }

  function showPlaylistEmbed(container, id) {
    if (!/^[A-Za-z0-9]{22}$/.test(id)) return false;
    const frame = document.createElement("iframe");
    frame.className = "playlist-incorporada";
    frame.src = "https://open.spotify.com/embed/playlist/" + id;
    frame.title = "Player oficial da playlist no Spotify";
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    const link = document.createElement("a");
    link.href = "https://open.spotify.com/playlist/" + id;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Abrir no Spotify ↗";
    container.replaceChildren(frame, link);
    container.hidden = false;
    return true;
  }

  function mountPlaylistSearch(section, connected) {
    const form = section.querySelector("form");
    const status = section.querySelector("[role=status]");
    const list = section.querySelector("[data-results]");
    const more = section.querySelector("[data-more]");
    const preview = section.querySelector("[data-preview]");
    let revision = 0;
    let offset = 0;
    let query = "";
    let ids = new Set();

    async function load() {
      const run = revision;
      more.disabled = true;
      try {
        const result = await search(query, "playlist", offset);
        if (run !== revision || !section.isConnected) return;
        const page = result.playlists;
        for (const playlist of page?.items || []) {
          if (!playlist?.id || ids.has(playlist.id)) continue;
          ids.add(playlist.id);
          const link = document.createElement("a");
          link.href = "playlist.html?publica=" + encodeURIComponent(playlist.id);
          link.className = "cartao";
          const cover = document.createElement("img");
          cover.src = playlist.images?.[0]?.url || "img/minhas-favoritas.svg";
          cover.alt = "";
          cover.loading = "lazy";
          const name = document.createElement("h3");
          name.textContent = playlist.name;
          const owner = document.createElement("p");
          owner.textContent = playlist.owner?.display_name || "Playlist no Spotify";
          link.append(cover, name, owner);
          list.append(link);
        }
        status.textContent = ids.size ? "" : "Nenhuma playlist encontrada para essa busca.";
        offset = (page?.offset ?? offset) + (page?.limit || 10);
        more.hidden = !page?.next || offset > 1000;
      } catch (error) {
        if (run === revision) status.textContent = error.message;
      } finally {
        if (run === revision) more.disabled = false;
      }
    }

    form.onsubmit = event => {
      event.preventDefault();
      revision++;
      query = form.elements.playlist.value.trim();
      offset = 0;
      ids = new Set();
      list.replaceChildren();
      preview.replaceChildren();
      more.hidden = true;
      if (showPlaylistEmbed(preview, playlistId(query) || "")) { status.textContent = ""; return; }
      if (!query || /^(https?:|spotify:)/i.test(query)) {
        status.textContent = "Use um nome ou o link de uma playlist em open.spotify.com/playlist/.";
        return;
      }
      if (!connected) {
        status.textContent = "Conecte sua conta para buscar por nome ou cole o link de uma playlist pública.";
        return;
      }
      status.textContent = "Buscando playlists…";
      load();
    };
    more.onclick = load;
  }

  return {
    showPlaylistEmbed, mountPlaylistSearch
  };
})();
