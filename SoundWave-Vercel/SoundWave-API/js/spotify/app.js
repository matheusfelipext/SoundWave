(() => {
  "use strict";
  const { getClientId, getRedirectUri, hasSession, saveClientId, startAuthorization, disconnect } = SoundWave.auth;
  const { checkSavedItems, getArtist, getArtistAlbums, getProfile, getSavedAlbums, removeLibraryItem, saveLibraryItem } = SoundWave.api;
  const { loadPlaylistTracks, loadPlaylistTracksPage, loadPlaylistsPage, loadRecentTracks, loadSavedTracksPage } = SoundWave.library;
  const { searchArtistTracks, searchCatalog, searchGenre } = SoundWave.search;
  const { SpotifyPlayer } = SoundWave.player;
  const { keepPlayerOnNavigation, pageAddress } = SoundWave.navigation;

  const { DevicePlayer, mountDownloads } = SoundWave.deviceMusic;
  const { mountPlaylistSearch, showPlaylistEmbed } = SoundWave.publicPlaylists;

  const state = {
    user: null,
    player: null,
    currentTrack: null,
    savedIds: new Set(),
    searchRun: 0,
    spotifyPlayer: null,
    localPlayer: null,
    playlistTracks: [],
    favoriteTracks: []
  };

  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function imageFor(item) {
    return item?.album?.images?.[0]?.url || item?.images?.[0]?.url || "img/tocando-agora.svg";
  }

  function artistNames(track) {
    return (track?.artists || []).map((artist) => artist.name).filter(Boolean).join(", ") || "Artista não informado";
  }

  function formatTime(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function showNotice(message, error = false) {
    let notice = one(".spotify-status");
    if (!notice) {
      notice = element("div", "spotify-status");
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      one("main.conteudo")?.prepend(notice);
    }
    notice.textContent = message;
    notice.classList.toggle("erro", Boolean(error));
    notice.hidden = false;
  }

  function clearNotice() {
    const notice = one(".spotify-status");
    if (notice) notice.hidden = true;
  }

  function renderEmpty(target, message) {
    if (!target) return;
    target.replaceChildren();
    const empty = element(target.tagName === "OL" ? "li" : "p", "spotify-empty", message);
    target.append(empty);
  }

  function setTitle(section, title) {
    const heading = section?.closest(".secao")?.querySelector(".secao-cabecalho h2");
    if (heading) heading.textContent = title;
  }

  function setPageHeading(title, subtitle) {
    const heading = one(".titulo-pagina");
    if (heading) heading.textContent = title;
    const subheading = one(".subtitulo-pagina");
    if (subheading) subheading.textContent = subtitle;
  }

  function makeConnectButton() {
    const right = one(".barra-direita");
    if (!right || one("[data-spotify-connect]", right)) return;
    const button = element("button", "spotify-connect-button", "Conectar Spotify");
    button.type = "button";
    button.dataset.spotifyConnect = "";
    button.addEventListener("click", onConnectClick);
    const profile = one(".perfil", right);
    right.insertBefore(button, profile || null);
    updateConnectionButton();
  }

  function updateConnectionButton() {
    const button = one("[data-spotify-connect]");
    if (!button) return;
    const connected = hasSession();
    button.textContent = connected ? "Desconectar Spotify" : "Conectar Spotify";
    button.classList.toggle("conectado", connected);
    button.setAttribute("aria-label", connected ? "Desconectar conta Spotify" : "Conectar conta Spotify");
    const profile = one(".perfil-nome");
    if (profile) {
      const label = [...profile.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (label && state.user) label.textContent = state.user.display_name || "Spotify";
      else if (label && !connected) label.textContent = "Conecte o Spotify";
    }
  }

  function setupClientIdDialog() {
    if (one("#spotify-client-dialog")) return one("#spotify-client-dialog");
    const dialog = element("dialog", "spotify-dialog");
    dialog.id = "spotify-client-dialog";
    dialog.setAttribute("aria-labelledby", "spotify-client-title");
    dialog.innerHTML = `
      <form class="spotify-dialog-form">
        <button class="spotify-dialog-close" type="button" aria-label="Fechar">×</button>
        <p class="spotify-dialog-eyebrow">SOUNDWAVE</p>
        <h2 id="spotify-client-title">Conectar ao Spotify</h2>
        <p>Use o Client ID do app no Spotify Developer Dashboard. O SoundWave usa OAuth PKCE e não pede Client Secret.</p>
        <label for="spotify-client-id">Client ID</label>
        <input id="spotify-client-id" name="clientId" type="text" autocomplete="off" spellcheck="false" pattern="[a-fA-F0-9]{32}" title="32 caracteres do campo Client ID do Spotify" required>
        <span class="spotify-redirect-label">No painel do app, abra Settings → Edit → Redirect URIs. Cole este endereço e clique em Add e Save.</span>
        <code data-spotify-redirect></code>
        <button class="spotify-copy" type="button" data-copy-redirect>Copiar endereço de retorno</button>
        <div class="spotify-dialog-actions">
          <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Abrir painel Spotify ↗</a>
          <button class="botao-principal" type="submit">Salvar e conectar</button>
        </div>
        <p class="spotify-dialog-help" role="status">Em Development Mode, a conta dona do app precisa de Premium ativo para acessar a Web API.</p>
      </form>`;
    document.body.append(dialog);
    const form = one("form", dialog);
    const input = one("#spotify-client-id", dialog);
    const redirect = one("[data-spotify-redirect]", dialog);
    const feedback = one(".spotify-dialog-help", dialog);
    const panel = one(".spotify-dialog-actions a", dialog);
    function updatePanelLink() {
      const id = input.value.trim();
      panel.href = "https://developer.spotify.com/dashboard" + (/^[0-9a-f]{32}$/i.test(id) ? "/" + id : "");
    }
    input.addEventListener("input", updatePanelLink);
    one("[data-copy-redirect]", dialog).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(getRedirectUri());
        feedback.textContent = "Endereço copiado. Cole em Redirect URIs no painel do app.";
      } catch {
        feedback.textContent = "Selecione o endereço acima e copie com Ctrl+C.";
      }
    });
    const refreshRedirect = () => { redirect.textContent = getRedirectUri(); };
    one(".spotify-dialog-close", dialog).addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        saveClientId(input.value);
        dialog.close();
        await startAuthorization();
      } catch (error) {
        feedback.textContent = error.message;
        if (!dialog.open) dialog.showModal();
      }
    });
    dialog.addEventListener("close", refreshRedirect);
    dialog.refresh = () => {
      input.value = getClientId();
      updatePanelLink();
      refreshRedirect();
      dialog.showModal();
      input.focus();
    };
    return dialog;
  }

  async function onConnectClick() {
    if (hasSession()) {
      state.localPlayer?.stop();
      state.spotifyPlayer?.disconnect();
      disconnect();
      window.location.reload();
      return;
    }
    await connectSpotify();
  }

  let openingLogin = false;
  window.addEventListener("pageshow", () => { openingLogin = false; });

  async function connectSpotify() {
    if (location.protocol === "file:") {
      SoundWave.openWebConnection();
      return;
    }
    if (openingLogin) return;
    openingLogin = true;
    try {
      await startAuthorization();
    } catch (error) {
      openingLogin = false;
      showNotice(error.message, true);
      addAppSettings();
    }
  }

  function addAppSettings() {
    const settings = element("button", "spotify-panel-link", "Configurar aplicativo");
    settings.type = "button";
    settings.addEventListener("click", () => {
      if (location.protocol === "file:") SoundWave.openWebConnection();
      else setupClientIdDialog().refresh();
    });
    one(".spotify-status").append(" ", settings);
  }

  function makeTrackFavorite(track, className = "") {
    const saved = state.savedIds.has(track.id);
    const button = element("button", `curtir botao-icone${saved ? " salvo" : ""}${className ? ` ${className}` : ""}`);
    button.type = "button";
    button.dataset.favoriteTrack = track.id;
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label", saved ? "Remover das músicas salvas" : "Salvar na biblioteca do Spotify");
    button.title = button.getAttribute("aria-label");
    button.append(element("i", "ri-heart-line"), element("i", "ri-heart-fill"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(track, button);
    });
    return button;
  }

  function updateFavoriteButtons(track) {
    const saved = state.savedIds.has(track.id);
    all("[data-favorite-track]").filter((button) => button.dataset.favoriteTrack === track.id).forEach((button) => {
      button.classList.toggle("salvo", saved);
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", saved ? "Remover das músicas salvas" : "Salvar na biblioteca do Spotify");
      button.title = button.getAttribute("aria-label");
    });
  }

  async function toggleFavorite(track, button) {
    if (!hasSession()) return showNotice("Conecte sua conta Spotify para alterar suas músicas salvas.", true);
    button.disabled = true;
    try {
      const uri = track.uri || `spotify:track:${track.id}`;
      if (state.savedIds.has(track.id)) {
        await removeLibraryItem(uri);
        state.savedIds.delete(track.id);
        if (pageAddress().pathname.endsWith("curtidas.html")) await initializeFavorites();
        showNotice("Música removida da sua biblioteca do Spotify.");
      } else {
        await saveLibraryItem(uri);
        state.savedIds.add(track.id);
        showNotice("Música salva na sua biblioteca do Spotify.");
      }
      updateFavoriteButtons(track);
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function checkFavoriteStates(tracks) {
    const unique = [...new Map(tracks.filter((track) => track?.id).map((track) => [track.id, track])).values()];
    for (let index = 0; index < unique.length; index += 40) {
      const batch = unique.slice(index, index + 40);
      if (!batch.length) continue;
      try {
        const saved = await checkSavedItems(batch.map((track) => track.uri || `spotify:track:${track.id}`));
        batch.forEach((track, position) => {
          if (saved?.[position]) state.savedIds.add(track.id);
          else state.savedIds.delete(track.id);
        });
      } catch (error) {
        if (error.status === 403) showNotice(error.message, true);
      }
    }
  }

  function makePlayButton(track, queue) {
    const button = element("button", "spotify-play-inline");
    button.type = "button";
    button.setAttribute("aria-label", `Tocar ${track.name || "música"} no Spotify`);
    button.title = "Tocar no Spotify";
    button.append(element("i", "ri-play-fill"));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      playTrack(track, queue);
    });
    return button;
  }

  function renderTrackList(target, tracks, { append = false, nextOffset = null, onMore = null } = {}) {
    if (!target) return;
    target.querySelector(".spotify-load-more-row")?.remove();
    if (!append) target.replaceChildren();
    if (!tracks.length && !append) {
      renderEmpty(target, "Nenhuma música foi retornada pelo Spotify.");
      return;
    }
    tracks.forEach((track, index) => {
      const row = element("li", "musica");
      row.dataset.spotifyTrackId = track.id;
      const number = element("span", "musica-numero");
      number.append(makePlayButton(track, tracks));
      const main = element("span", "musica-principal");
      const image = element("img");
      image.src = imageFor(track);
      image.alt = `Capa de ${track.album?.name || track.name}`;
      const labels = element("span");
      labels.append(element("span", "musica-titulo", track.name || "Faixa sem título"));
      labels.append(element("span", "musica-artista", artistNames(track)));
      main.append(image, labels);
      row.append(number, main, element("span", "musica-album", track.album?.name || "—"), makeTrackFavorite(track), element("span", "musica-duracao", formatTime(track.duration_ms)));
      target.append(row);
    });
    if (nextOffset !== null && onMore) {
      const row = element("li", "spotify-load-more-row");
      const button = element("button", "spotify-load-more", "Carregar mais");
      button.type = "button";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Carregando…";
        try { await onMore(nextOffset); }
        catch (error) { showNotice(error.message || "Não foi possível carregar mais resultados.", true); }
      });
      row.append(button);
      target.append(row);
    }
  }

  function renderTrackGrid(target, tracks, message = "Nenhuma música foi retornada pelo Spotify.", append = false) {
    if (!target) return;
    if (!append || target.querySelector(".spotify-empty")) target.replaceChildren();
    if (!tracks.length && !append) return renderEmpty(target, message);
    tracks.forEach((track) => {
      const card = element("article", "cartao spotify-track-card");
      const image = element("img");
      image.loading = "lazy";
      image.src = imageFor(track);
      image.alt = `Capa de ${track.album?.name || track.name}`;
      const title = element("h3", "", track.name || "Faixa sem título");
      const artist = element("p", "", artistNames(track));
      const actions = element("div", "spotify-card-actions");
      actions.append(makePlayButton(track, tracks), makeTrackFavorite(track));
      card.append(image, title, artist, actions);
      target.append(card);
    });
  }

  function renderArtistGrid(target, artists, message = "Nenhum artista foi retornado pelo Spotify.") {
    if (!target) return;
    target.replaceChildren();
    if (!artists.length) return renderEmpty(target, message);
    artists.forEach((artist) => {
      const link = element("a", "artista");
      link.dataset.artistId = artist.id;
      link.href = `artista.html?id=${encodeURIComponent(artist.id)}`;
      const image = element("img");
      image.src = artist.images?.[0]?.url || "img/avatar.svg";
      image.loading = "lazy";
      image.alt = `Imagem de ${artist.name}`;
      link.append(image, element("h3", "", artist.name || "Artista"), element("p", "", artist.genres?.[0] || "Artista no Spotify"));
      target.append(link);
    });
  }

  function renderAlbumGrid(target, albums, { append = false, nextOffset = null, onMore = null } = {}) {
    if (!target) return;
    target.nextElementSibling?.matches("[data-spotify-albums-more]") && target.nextElementSibling.remove();
    if (!append) target.replaceChildren();
    if (!albums.length && !append) return renderEmpty(target, "Nenhum álbum foi retornado pelo Spotify.");
    albums.forEach((album) => {
      const link = element("a", "cartao");
      link.dataset.albumId = album.id;
      link.href = album.external_urls?.spotify || `https://open.spotify.com/album/${encodeURIComponent(album.id)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const image = element("img");
      image.loading = "lazy";
      image.src = imageFor(album);
      image.alt = `Capa de ${album.name}`;
      link.append(image, element("h3", "", album.name || "Álbum"), element("p", "", (album.artists || []).map((artist) => artist.name).join(", ")));
      target.append(link);
    });
    if (nextOffset !== null && onMore) {
      const button = element("button", "spotify-load-more", "Carregar mais álbuns");
      button.type = "button";
      button.dataset.spotifyAlbumsMore = "";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Carregando…";
        try { await onMore(nextOffset); }
        catch (error) { showNotice(error.message || "Não foi possível carregar mais álbuns.", true); }
      });
      target.after(button);
    }
  }

  function renderPlaylistGrid(target, playlists, { append = false, nextOffset = null, onMore = null } = {}) {
    if (!target) return;
    target.nextElementSibling?.matches("[data-spotify-playlists-more]") && target.nextElementSibling.remove();
    if (!append) target.replaceChildren();
    if (!playlists.length && !append) return renderEmpty(target, "Sua conta ainda não retornou playlists.");
    playlists.forEach((playlist) => {
      const link = element("a", "cartao");
      link.href = `playlist.html?id=${encodeURIComponent(playlist.id)}`;
      const image = element("img");
      image.src = imageFor(playlist);
      image.alt = `Capa da playlist ${playlist.name}`;
      link.append(image, element("h3", "", playlist.name || "Playlist"), element("p", "", `${playlist.items?.total ?? playlist.tracks?.total ?? ""} faixas`));
      target.append(link);
    });
    if (nextOffset !== null && onMore) {
      const button = element("button", "spotify-load-more", "Carregar mais playlists");
      button.type = "button";
      button.dataset.spotifyPlaylistsMore = "";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Carregando…";
        try { await onMore(nextOffset); }
        catch (error) { showNotice(error.message || "Não foi possível carregar mais playlists.", true); }
      });
      target.after(button);
    }
  }

  function renderSidebarPlaylists(playlists) {
    const target = one("[data-spotify-playlists]");
    if (!target) return;
    target.replaceChildren();
    playlists.slice(0, 5).forEach((playlist) => {
      const link = element("a", "menu-item pequeno");
      link.href = `playlist.html?id=${encodeURIComponent(playlist.id)}`;
      const image = element("img");
      image.src = imageFor(playlist);
      image.alt = "";
      link.append(image, element("span", "", playlist.name || "Playlist"));
      target.append(link);
    });
  }

  async function playTrack(track, queue = [track]) {
    if (!hasSession()) return showNotice("Conecte sua conta Spotify para reproduzir músicas.", true);
    if (state.player === state.localPlayer) state.localPlayer.stop();
    state.player = state.spotifyPlayer;
    state.currentTrack = track;
    updateCurrentTrack(track);
    try {
      await state.player.play(track, queue);
    } catch (error) {
      showNotice(error.message, true);
    }
  }

  function updateCurrentTrack(track) {
    if (!track) return;
    const shell = one(".player-musica");
    const cover = one("img", shell);
    const title = one("h4", shell);
    const artist = one("p", shell);
    if (cover) { cover.src = imageFor(track); cover.alt = `Capa de ${track.album?.name || track.name}`; }
    if (title) { delete title.dataset.localId; title.textContent = track.name || "Faixa do Spotify"; }
    if (artist) artist.textContent = artistNames(track);
    const heart = one("[data-current-favorite]");
    if (heart) {
      heart.dataset.favoriteTrack = track.id || "";
      heart.disabled = !track.id;
      const saved = state.savedIds.has(track.id);
      heart.classList.toggle("salvo", saved);
      heart.setAttribute("aria-pressed", String(saved));
    }
  }

  function updatePlayerState(playback) {
    const shell = one(".player");
    if (!shell) return;
    const track = playback.track_window?.current_track;
    if (track && track.id !== state.currentTrack?.id) {
      state.currentTrack = track;
      updateCurrentTrack(track);
    }
    shell.classList.toggle("is-playing", !playback.paused);
    updateProgress(playback.position, playback.duration);
  }

  function updateProgress(position, duration) {
    const elapsed = one(".player-progresso > span:first-child");
    const total = one(".player-progresso > span:last-child");
    const fill = one(".barra-progresso > span");
    if (elapsed) elapsed.textContent = formatTime(position);
    if (total) total.textContent = formatTime(duration);
    if (fill) fill.style.width = duration ? `${Math.min(100, position / duration * 100)}%` : "0%";
  }

  function setupPlayerControls() {
    state.localPlayer = new DevicePlayer(renderLocalPlayer, error => showNotice(error.message, true));
    state.spotifyPlayer = new SpotifyPlayer({
      onState: (playback) => {
        if (state.player !== state.spotifyPlayer) return;
        progressAnchor = performance.now();
        updatePlayerState(playback);
      },
      onMessage: (message, error) => showNotice(message, error)
    });
    state.player = state.spotifyPlayer;
    let progressAnchor = 0;
    window.setInterval(() => {
      const playback = state.player.playbackState;
      if (playback && !playback.paused) updateProgress(Math.min(playback.duration, playback.position + performance.now() - progressAnchor), playback.duration);
    }, 500);
    const toggle = one(".botao-tocar");
    toggle?.addEventListener("click", async (event) => {
      event.preventDefault();
      try { await state.player.toggle(); }
      catch (error) { showNotice(error.message, true); }
    });
    const next = one('.player-botoes a[aria-label="Próxima"]');
    const previous = one('.player-botoes a[aria-label="Anterior"]');
    next?.addEventListener("click", async (event) => {
      event.preventDefault();
      try { await state.player.next(); } catch (error) { showNotice(error.message, true); }
    });
    previous?.addEventListener("click", async (event) => {
      event.preventDefault();
      try { await state.player.previous(); } catch (error) { showNotice(error.message, true); }
    });
    const shuffle = one('.player-botoes label[title="Aleatório"]');
    shuffle?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const enabled = await state.player.toggleShuffle();
        const input = one("input", shuffle);
        if (input) input.checked = enabled;
      } catch (error) { showNotice(error.message, true); }
    });
    const repeat = one('.player-botoes label[title="Repetir"]');
    repeat?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const mode = await state.player.cycleRepeat();
        const input = one("input", repeat);
        if (input) input.checked = mode !== "off";
        repeat.title = mode === "track" ? "Repetir música" : mode === "context" ? "Repetir contexto" : "Repetição desligada";
      } catch (error) { showNotice(error.message, true); }
    });
    const seek = one(".barra-progresso");
    if (seek) {
      seek.setAttribute("role", "slider");
      seek.setAttribute("tabindex", "0");
      seek.setAttribute("aria-label", "Posição da música");
      seek.addEventListener("click", (event) => {
        const duration = state.player === state.localPlayer ? state.localPlayer.duration : state.player.playbackState?.duration;
        if (!duration) return;
        const rect = seek.getBoundingClientRect();
        state.player.seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * duration)
          .catch((error) => showNotice(error.message, true));
      });
    }
    const volume = one(".volume-barra");
    volume?.addEventListener("click", (event) => {
      const rect = volume.getBoundingClientRect();
      const value = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const fill = one("span", volume);
      if (fill) fill.style.width = `${value * 100}%`;
      state.player.setVolume(value).catch((error) => showNotice(error.message, true));
    });
    const currentFavorite = one(".player-musica .curtir");
    if (currentFavorite) {
      currentFavorite.dataset.currentFavorite = "";
      currentFavorite.addEventListener("click", (event) => {
        event.preventDefault();
        if (state.currentTrack) toggleFavorite(state.currentTrack, currentFavorite);
        else showNotice("Escolha uma faixa do Spotify primeiro.");
      });
    }
  }

  async function initializeLibrary() {
    const tracksTarget = one("[data-spotify-tracks]");
    const recentTarget = one("[data-spotify-recent]");
    const artistsTarget = one("[data-spotify-artists]");
    const savedResult = await loadSavedTracksPage(0);
    savedResult.tracks.forEach((track) => state.savedIds.add(track.id));
    renderTrackGrid(tracksTarget, savedResult.tracks, "Sua biblioteca do Spotify não tem músicas salvas ainda.");
    try {
      const recent = await loadRecentTracks();
      await checkFavoriteStates(recent);
      renderTrackGrid(recentTarget, recent, "As faixas tocadas recentemente aparecerão aqui.");
    } catch (error) {
      renderEmpty(recentTarget, error.message);
    }
    const artists = [...new Map(savedResult.tracks.flatMap((track) => track.artists || []).map((artist) => [artist.id, artist])).values()];
    renderArtistGrid(artistsTarget, artists, "Salve músicas para descobrir artistas da sua biblioteca.");
  }

  async function performSearch(value, mode = "text") {
    const run = ++state.searchRun;
    const tracksTarget = one("[data-spotify-search-tracks]") || one("[data-spotify-style-tracks]") || one("[data-spotify-radio-results]");
    if (!tracksTarget || !value.trim()) return;
    const artistsTarget = one("[data-spotify-search-artists]");
    const albumsTarget = one("[data-spotify-search-albums]");
    const more = one("[data-spotify-search-more]");
    const tracks = new Map();
    const artists = new Map();
    const albums = new Map();
    let offset = 0;
    let busy = false;
    renderEmpty(tracksTarget, "Buscando no catálogo do Spotify…");
    artistsTarget?.replaceChildren();
    albumsTarget?.replaceChildren();
    if (more) more.hidden = true;

    async function loadBatch() {
      if (busy || offset === null) return;
      busy = true;
      if (more) more.disabled = true;
      const added = [];
      try {
        for (let page = 0; page < (more ? 3 : 1) && offset !== null; page++) {
          const results = await (mode === "genre" ? searchGenre(value, offset) : searchCatalog(value, offset));
          if (run !== state.searchRun || !tracksTarget.isConnected) return;
          for (const artist of results.artists?.items || []) {
            if (artist?.id) artists.set(artist.id, artist);
          }
          for (const album of results.albums?.items || []) {
            if (album?.id) albums.set(album.id, album);
          }
          for (const track of results.tracks?.items || []) {
            if (!track?.id || tracks.has(track.id)) continue;
            tracks.set(track.id, track);
            added.push(track);
            if (mode === "genre") {
              for (const artist of track.artists || []) {
                if (artist.id && !artists.has(artist.id)) artists.set(artist.id, artist);
              }
              if (track.album?.id && !albums.has(track.album.id)) albums.set(track.album.id, track.album);
            }
          }
          const next = [results.tracks, results.artists, results.albums].find(group => group?.next);
          offset = next && offset < 1000 ? (next.offset ?? offset) + (next.limit || 10) : null;
        }
        await checkFavoriteStates(added);
      } catch (error) {
        if (run === state.searchRun && tracksTarget.isConnected) showNotice(error.message, true);
      } finally {
        busy = false;
        if (run === state.searchRun && tracksTarget.isConnected) {
          renderTrackGrid(tracksTarget, [...tracks.values()], "Nenhuma faixa encontrada.");
          renderArtistGrid(artistsTarget, [...artists.values()], "Nenhum artista encontrado.");
          renderAlbumGrid(albumsTarget, [...albums.values()]);
          if (more) {
            more.hidden = offset === null || offset > 1000;
            more.disabled = false;
            more.textContent = "Carregar mais resultados";
          }
        }
      }
    }
    if (more) more.onclick = loadBatch;
    await loadBatch();
  }

  async function initializeExplore() {
    const params = pageAddress().searchParams;
    const query = params.get("q");
    const genre = params.get("genre");
    const searchInput = one('.busca input[name="q"]');
    if (searchInput) searchInput.value = query || "";
    if (query) {
      setPageHeading("Resultados da pesquisa", `Resultados reais do catálogo Spotify para “${query}”.`);
      await performSearch(query);
    } else if (genre) {
      one("[data-spotify-genres]")?.querySelectorAll(".genero").forEach(link => link.classList.toggle("selecionado", link.dataset.genre === genre));
      setPageHeading(`Estilo: ${genre}`, "Faixas e artistas encontrados pela pesquisa oficial do Spotify.");
      await performSearch(genre, "genre");
    } else {
      const tracksTarget = one("[data-spotify-search-tracks]") || one("[data-spotify-style-tracks]");
      renderEmpty(tracksTarget, "Escolha um estilo ou pesquise uma música, artista ou álbum.");
      const artistsTarget = one("[data-spotify-search-artists]") || one("[data-spotify-artists]");
      renderEmpty(artistsTarget, "Os artistas aparecem aqui quando você pesquisa no catálogo.");
      renderEmpty(one("[data-spotify-search-albums]"), "Os álbuns aparecem aqui quando você pesquisa no catálogo.");
      setPageHeading("Explorar", "Pesquise no catálogo do Spotify ou selecione um estilo.");
    }
    const genreArea = one("[data-spotify-genres]");
    genreArea?.addEventListener("click", (event) => {
      const button = event.target.closest(".genero");
      if (!button) return;
      event.preventDefault();
      all(".genero", genreArea).forEach((item) => item.classList.toggle("selecionado", item === button));
      const genreValue = button.dataset.genre || button.textContent.trim();
      history.replaceState(null, "", `explorar.html?genre=${encodeURIComponent(genreValue)}`);
      setPageHeading(`Estilo: ${genreValue}`, "Faixas e artistas encontrados pela pesquisa oficial do Spotify.");
      performSearch(genreValue, "genre").catch((error) => showNotice(error.message, true));
    });
  }

  async function initializeFavorites() {
    const target = one("[data-spotify-favorites]");
    const hero = one(".destaque");
    const subtitle = one(".destaque .destaque-texto > p:last-of-type");
    state.favoriteTracks = [];
    const loadPage = async (offset = 0, append = false) => {
      const result = await loadSavedTracksPage(offset);
      result.tracks.forEach((track) => state.savedIds.add(track.id));
      state.favoriteTracks.push(...result.tracks);
      renderTrackList(target, result.tracks, {
        append,
        nextOffset: result.nextOffset,
        onMore: (nextOffset) => loadPage(nextOffset, true).catch((error) => showNotice(error.message, true))
      });
      if (subtitle) subtitle.textContent = `${result.total} músicas salvas na sua biblioteca Spotify`;
      if (hero) hero.dataset.trackCount = String(result.total);
    };
    const playAll = one(".destaque .botao-principal");
    if (playAll) playAll.onclick = (event) => {
      event.preventDefault();
      if (state.favoriteTracks[0]) playTrack(state.favoriteTracks[0], state.favoriteTracks);
      else showNotice("Sua biblioteca não tem músicas carregadas.");
    };
    await loadPage();
    const albumsTarget = one("[data-spotify-saved-albums]");
    const loadAlbums = async (offset = 0) => {
      const page = await getSavedAlbums(offset);
      renderAlbumGrid(albumsTarget, page.items.map((item) => item.album).filter(Boolean), {
        append: offset > 0,
        nextOffset: page.next ? page.offset + page.limit : null,
        onMore: loadAlbums
      });
    };
    await loadAlbums().catch((error) => renderEmpty(albumsTarget, error.message));
  }

  async function initializeRecent() {
    setPageHeading("Tocadas recentemente", "Histórico de reprodução da sua conta Spotify.");
    const tracks = await loadRecentTracks();
    const grid = one("[data-spotify-recent]");
    const list = one("[data-spotify-recent-tracks]");
    await checkFavoriteStates(tracks);
    renderTrackGrid(grid, tracks, "Não há faixas recentes retornadas pelo Spotify.");
    renderTrackList(list, tracks);
  }

  async function initializePlaylists(connected = true) {
    const params = pageAddress().searchParams;
    const id = params.get("id");
    const playlistGrid = one("[data-spotify-playlists-page]");
    const trackList = one("[data-spotify-playlist-items]");
    const discovery = one("[data-public-discovery]");
    const embed = one("[data-playlist-embed]");
    const publicId = params.get("publica");
    discovery.hidden = Boolean(id || publicId);
    one("[data-account-playlists-heading]").hidden = discovery.hidden;
    if (!discovery.hidden) mountPlaylistSearch(discovery, connected);
    if (publicId || (id && !connected)) {
      one(".destaque h1").textContent = "Playlist do Spotify";
      one(".destaque .destaque-texto > p:last-of-type").textContent = "Ouça no player oficial da playlist.";
      one(".destaque .botao-principal").hidden = true;
      playlistGrid.hidden = true;
      trackList.hidden = true;
      if (!showPlaylistEmbed(embed, publicId || id)) showNotice("O identificador da playlist é inválido.", true);
      return;
    }
    if (!id) {
      const title = one(".destaque h1");
      const description = one(".destaque .destaque-texto > p:last-of-type");
      const playButton = one(".destaque .botao-principal");
      const label = one(".destaque-tipo");
      if (label) label.textContent = "Sua biblioteca Spotify";
      if (title) title.textContent = "Suas playlists";
      if (description) description.textContent = "Encontre playlists no Spotify ou abra uma da sua biblioteca.";
      if (playButton) playButton.hidden = true;
      if (!connected) { renderEmpty(playlistGrid, "Conecte o Spotify para ver as playlists da sua conta."); return; }
      const result = await loadPlaylistsPage();
      renderPlaylistGrid(playlistGrid, result.playlists, {
        nextOffset: result.nextOffset,
        onMore: (offset) => loadMorePlaylists(offset, playlistGrid)
      });
      if (trackList) trackList.hidden = true;
      return;
    }

    if (playlistGrid) playlistGrid.hidden = true;
    if (trackList) trackList.hidden = false;
    let result;
    try {
      result = await loadPlaylistTracks(id);
    } catch (error) {
      if (![403, 404].includes(error.status) || !showPlaylistEmbed(embed, id)) throw error;
      one(".destaque h1").textContent = "Playlist do Spotify";
      one(".destaque .destaque-texto > p:last-of-type").textContent = "Confira a disponibilidade no player oficial.";
      one(".destaque .botao-principal").hidden = true;
      return;
    }
    const heading = one(".destaque h1");
    if (heading) heading.textContent = result.playlist.name || "Playlist Spotify";
    const description = one(".destaque .destaque-texto > p:last-of-type");
    if (description) description.textContent = result.playlist.description || `${result.playlist.items?.total ?? result.playlist.tracks?.total ?? result.tracks.length} faixas`;
    const hero = one(".destaque");
    if (hero && result.playlist.images?.[0]?.url) hero.style.backgroundImage = `url("${result.playlist.images[0].url}")`;
    state.playlistTracks = result.tracks;
    await checkFavoriteStates(result.tracks);
    renderTrackList(trackList, result.tracks, {
      nextOffset: result.nextOffset,
      onMore: (nextOffset) => loadMorePlaylistTracks(id, nextOffset, trackList)
    });
    if (!result.contentsAvailable && trackList) renderEmpty(trackList, "O Spotify não disponibilizou as faixas desta playlist. Em Development Mode, o conteúdo pode ser limitado a playlists que você possui ou edita.");
    else if (result.warning) showNotice(result.warning, true);
    if (!result.contentsAvailable) showPlaylistEmbed(embed, id);
    const playButton = one(".destaque .botao-principal");
    if (playButton) playButton.hidden = !state.playlistTracks.length;
    playButton?.addEventListener("click", (event) => {
      event.preventDefault();
      if (state.playlistTracks[0]) playTrack(state.playlistTracks[0], state.playlistTracks);
      else showNotice("Esta playlist não retornou faixas que possam ser tocadas.");
    });
  }

  async function loadMorePlaylists(offset, target) {
    const page = await loadPlaylistsPage(offset);
    renderPlaylistGrid(target, page.playlists, {
      append: true,
      nextOffset: page.nextOffset,
      onMore: (nextOffset) => loadMorePlaylists(nextOffset, target)
    });
  }

  async function loadMorePlaylistTracks(id, offset, target) {
    const page = await loadPlaylistTracksPage(id, offset);
    state.playlistTracks.push(...page.tracks);
    await checkFavoriteStates(page.tracks);
    renderTrackList(target, page.tracks, {
      append: true,
      nextOffset: page.nextOffset,
      onMore: (followingOffset) => loadMorePlaylistTracks(id, followingOffset, target)
    });
  }

  async function initializeArtist() {
    const params = pageAddress().searchParams;
    const id = params.get("id");
    if (!id) {
      renderEmpty(one("[data-spotify-artist-tracks]"), "Pesquise um artista e abra um resultado para ver os dados reais.");
      renderEmpty(one("[data-spotify-artist-albums]"), "A discografia será carregada quando você abrir um artista.");
      setPageHeading("Artista", "Abra um artista encontrado na pesquisa do Spotify.");
      return;
    }
    const artist = await getArtist(id);
    const [albumPage, tracks] = await Promise.all([
      getArtistAlbums(id), searchArtistTracks(artist.name || "", id).catch(() => [])
    ]);
    const heading = one(".destaque h1");
    if (heading) heading.textContent = artist.name || "Artista Spotify";
    const detail = one(".destaque .destaque-texto > p:last-of-type");
    if (detail) detail.textContent = artist.genres?.length ? artist.genres.join(" · ") : "Perfil e discografia do catálogo Spotify";
    const hero = one("[data-spotify-artist-hero]");
    if (hero && artist.images?.[0]?.url) hero.style.backgroundImage = `url("${artist.images[0].url}")`;
    const spotifyLink = one(".destaque .botao-principal");
    if (spotifyLink) {
      spotifyLink.textContent = "Abrir no Spotify";
      spotifyLink.href = artist.external_urls?.spotify || `https://open.spotify.com/artist/${encodeURIComponent(id)}`;
      spotifyLink.target = "_blank";
      spotifyLink.rel = "noopener noreferrer";
    }
    const trackTarget = one("[data-spotify-artist-tracks]");
    await checkFavoriteStates(tracks);
    renderTrackList(trackTarget, tracks);
    const albumsTarget = one("[data-spotify-artist-albums]");
    renderAlbumGrid(albumsTarget, albumPage.items || [], {
      nextOffset: albumPage.next ? Number(albumPage.offset || 0) + Number(albumPage.limit || 10) : null,
      onMore: (offset) => loadMoreArtistAlbums(id, offset, albumsTarget)
    });
    const relatedSection = one("[data-spotify-related-section]");
    if (relatedSection) relatedSection.hidden = true;
  }

  async function loadMoreArtistAlbums(id, offset, target) {
    const page = await getArtistAlbums(id, offset);
    renderAlbumGrid(target, page.items || [], {
      append: true,
      nextOffset: page.next ? Number(page.offset || 0) + Number(page.limit || 10) : null,
      onMore: (nextOffset) => loadMoreArtistAlbums(id, nextOffset, target)
    });
  }

  async function initializeDownloads() {
    const section = one("[data-device-library]");
    if (!section) return;
    await mountDownloads(section, state.localPlayer, async track => {
      // Desconectar o dispositivo Web Playback interrompe a faixa do Spotify nesta aba.
      if (state.player !== state.localPlayer) state.spotifyPlayer.disconnect();
      state.player = state.localPlayer;
      state.currentTrack = null;
      await state.localPlayer.play(track);
    }, () => {
      state.localPlayer.stop();
      state.player = state.spotifyPlayer;
      resetPlayerUi();
    });
  }

  function renderLocalPlayer() {
    const local = state.localPlayer;
    if (state.player !== local || !local.current) return;
    const record = local.current;
    if (one(".player-musica h4").dataset.localId !== record.id) {
      updateCurrentTrack({ name: record.title, artists: [{ name: record.artist }] });
      one(".player-musica h4").dataset.localId = record.id;
    }
    one(".player").classList.toggle("is-playing", !local.audio.paused);
    updateProgress(local.audio.currentTime * 1000, local.duration);
  }

  function setupSidebar() {
    one(".perfil")?.addEventListener("click", event => {
      if (state.user) return;
      event.preventDefault();
      connectSpotify();
    });
    const profile = one(".perfil-nome");
    const label = profile && [...profile.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (label && !state.user) label.textContent = "Conecte o Spotify";
    const playlistTarget = one("[data-spotify-playlists]");
    if (playlistTarget) playlistTarget.replaceChildren();
  }

  function setupGenreRadio() {
    const radio = one("[data-spotify-radio]");
    radio?.addEventListener("click", (event) => {
      const station = event.target.closest(".estacao");
      if (!station) return;
      event.preventDefault();
      const label = one("h3", station)?.textContent.replace(/^(?:Rádio|Estilo)\s+/i, "").trim();
      const genre = station.dataset.genre || label || "pop";
      const heroHeading = one(".destaque h1");
      const heroDescription = one(".destaque .destaque-texto > p:last-of-type");
      if (heroHeading) heroHeading.textContent = `Estilo: ${genre}`;
      if (heroDescription) heroDescription.textContent = "Faixas encontradas pela pesquisa do catálogo Spotify.";
      performSearch(genre, "genre").catch((error) => showNotice(error.message, true));
    });
  }

  function setupFullscreen() {
    const button = one("[data-fullscreen]");
    if (!button) return;
    const updateLabel = () => {
      const active = Boolean(document.fullscreenElement);
      button.setAttribute("aria-label", active ? "Sair da tela cheia" : "Tela cheia");
      button.title = active ? "Sair da tela cheia" : "Tela cheia";
    };
    button.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (error) {
        showNotice("O navegador não permitiu alternar para tela cheia.", true);
      }
    });
    document.addEventListener("fullscreenchange", updateLabel);
    updateLabel();
  }

  function setupHeroButton() {
    const button = one(".destaque .botao-principal");
    if (!button || !(pageAddress().pathname.endsWith("/") || pageAddress().pathname.endsWith("/index.html"))) return;
    button.textContent = hasSession() ? "Explorar músicas" : "Conectar Spotify";
    button.href = hasSession() ? "explorar.html" : "#conectar-spotify";
    button.addEventListener("click", (event) => {
      if (hasSession()) return;
      event.preventDefault();
      connectSpotify();
    });
  }

  function resetPlayerUi() {
    const shell = one(".player");
    shell?.classList.remove("is-playing");
    const title = one(".player-musica h4");
    const artist = one(".player-musica p");
    const fill = one(".barra-progresso > span");
    const current = one(".player-progresso > span:first-child");
    const total = one(".player-progresso > span:last-child");
    if (title) { delete title.dataset.localId; title.textContent = "Nenhuma música selecionada"; }
    if (artist) artist.textContent = "Conecte o Spotify para começar";
    if (fill) fill.style.width = "0%";
    if (current) current.textContent = "0:00";
    if (total) total.textContent = "0:00";
  }

  async function initialize() {
    const currentUrl = new URL(location.href);
    if (location.protocol !== "file:" && currentUrl.searchParams.get("conectar") === "1") {
      currentUrl.searchParams.delete("conectar");
      history.replaceState(null, "", currentUrl.href);
      if (!hasSession()) {
        try {
          await startAuthorization();
          return;
        } catch (error) {
          sessionStorage.setItem("soundwave.spotify.notice", error.message);
        }
      }
    }
    makeConnectButton();
    setupSidebar();
    setupPlayerControls();
    setupFullscreen();
    resetPlayerUi();
    if (one("[data-device-library]")) initializeDownloads().catch(error => showNotice(error.message, true));

    const authNotice = location.protocol !== "file:" && sessionStorage.getItem("soundwave.spotify.notice");
    if (authNotice) {
      sessionStorage.removeItem("soundwave.spotify.notice");
      showNotice(authNotice);
    }

    if (!hasSession()) {
      keepPlayerOnNavigation(renderGuestPage);
      await renderGuestPage();
      if (authNotice) { showNotice(authNotice, true); addAppSettings(); }
      return;
    }

    try {
      state.user = await getProfile();
      state.spotifyPlayer.preload().catch(() => {}); // Tocar tenta carregar novamente se a rede falhar.
      if (state.user.images?.[0]?.url) one(".perfil img").src = state.user.images[0].url;
      updateConnectionButton();
      clearNotice();
      const playlistPage = await loadPlaylistsPage().catch(() => ({ playlists: [] }));
      renderSidebarPlaylists(playlistPage.playlists);
      keepPlayerOnNavigation(renderPage);
      await renderPage();
    } catch (error) {
      updateConnectionButton();
      if (error.status === 403 && !state.user) {
        const detail = error.detail ? " Resposta do Spotify: " + error.detail : "";
        showNotice("O login foi aceito, mas o Spotify negou a leitura do perfil (403 em /v1/me)." + detail
          + " Confira se o Premium está ativo na conta que criou o app e se o e-mail usado no login está autorizado em User Management.", true);
        const profile = one(".perfil-nome");
        if (profile) profile.textContent = "Acesso à API bloqueado";
        const hero = one(".destaque .botao-principal");
        if (hero) hero.hidden = true;
        const notice = one(".spotify-status");
        const panel = element("a", "spotify-panel-link", "Abrir painel do app ↗");
        panel.href = "https://developer.spotify.com/dashboard/" + encodeURIComponent(getClientId());
        panel.target = "_blank";
        panel.rel = "noopener";
        notice.append(" ", panel);
        const retry = element("button", "spotify-panel-link", "Tentar novamente");
        retry.type = "button";
        retry.onclick = () => location.reload();
        notice.append(" ", retry);
        const authorize = element("button", "spotify-panel-link", "Reautorizar conta");
        authorize.type = "button";
        authorize.addEventListener("click", connectSpotify);
        notice.append(" ", authorize);
        addAppSettings();
        // O navegador pode restaurar a tela antiga sem fazer uma nova consulta ao perfil.
        window.addEventListener("pageshow", event => {
          if (event.persisted) location.reload();
        });
        setupDisconnectedView("Indisponível enquanto o acesso ao Spotify estiver bloqueado.");
        if (one("[data-public-discovery]")) await initializePlaylists(false);
        return;
      }
      showNotice(error.message, true);
      setupDisconnectedView(error.message);
    }
  }

  async function renderGuestPage() {
    setupHeroButton();
    updateConnectionButton();
    if (one("[data-device-library]")) {
      clearNotice();
      await initializeDownloads();
      return;
    }
    showNotice("Conecte sua conta Spotify para carregar sua biblioteca.");
    addAppSettings();
    setupDisconnectedView();
    if (one("[data-public-discovery]")) await initializePlaylists(false);
  }

  async function renderPage() {
    setupHeroButton();
    setupGenreRadio();
    try {
      showNotice("Carregando do Spotify…");
      const file = pageAddress().pathname.split("/").pop() || "index.html";
      if (file === "index.html") await initializeLibrary();
      else if (file === "explorar.html") await initializeExplore();
      else if (file === "curtidas.html") await initializeFavorites();
      else if (file === "recentes.html") await initializeRecent();
      else if (file === "playlist.html") await initializePlaylists();
      else if (file === "artista.html") await initializeArtist();
      else if (file === "downloads.html") await initializeDownloads();
      else if (file === "radio.html") {
        const heading = one(".destaque h1");
        const description = one(".destaque .destaque-texto > p:last-of-type");
        if (heading) heading.textContent = "Rádio por estilo";
        if (description) description.textContent = "Escolha um atalho para pesquisar faixas reais no Spotify.";
        renderEmpty(one("[data-spotify-radio-results]"), "Escolha um estilo para pesquisar faixas reais no Spotify.");
      }
      if (one(".spotify-status")?.textContent === "Carregando do Spotify…") clearNotice();
    } catch (error) {
      updateConnectionButton();
      showNotice(error.message || "Não foi possível carregar dados do Spotify.", true);
      setupDisconnectedView(error.message);
    }
  }

  function setupDisconnectedView(message = "Conecte sua conta Spotify para carregar dados reais.") {
    const targets = [
      "[data-spotify-tracks]", "[data-spotify-recent]", "[data-spotify-artists]", "[data-spotify-style-tracks]",
      "[data-spotify-favorites]", "[data-spotify-playlist-items]", "[data-spotify-artist-tracks]",
      "[data-spotify-artist-albums]", "[data-spotify-recent-tracks]",
      "[data-spotify-search-tracks]", "[data-spotify-search-artists]", "[data-spotify-search-albums]",
      "[data-spotify-playlists-page]", "[data-spotify-radio-results]", "[data-spotify-saved-albums]"
    ];
    targets.forEach((selector) => {
      const target = one(selector);
      if (target && !target.hidden) renderEmpty(target, message);
    });
  }

  initialize().catch(error => showNotice(error.message || "Falha ao iniciar o SoundWave.", true));
})();
