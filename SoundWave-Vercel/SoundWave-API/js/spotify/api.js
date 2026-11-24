SoundWave.api = (() => {
  "use strict";
  const { getAccessToken, refreshAccessToken } = SoundWave.auth;

  const API_ROOT = "https://api.spotify.com/v1";

  class SpotifyApiError extends Error {
    constructor(message, status, payload = null, detail = "") {
      super(message);
      this.name = "SpotifyApiError";
      this.status = status;
      this.payload = payload;
      this.detail = detail;
    }
  }

  function messageForStatus(status, detail) {
    if (status === 401) return "A sessão do Spotify expirou. Conecte-se novamente.";
    if (status === 403) return "O Spotify negou esse recurso. Confira Premium do dono do app, usuário autorizado, permissões e limites do Development Mode.";
    if (status === 404) return "O Spotify não encontrou esse conteúdo ou ele não está disponível para esta conta.";
    if (status === 429) return "O limite de chamadas do Spotify foi atingido. Aguarde um pouco e tente novamente.";
    return detail || `A API do Spotify respondeu com HTTP ${status}.`;
  }

  async function request(path, { method = "GET", query = null, body = null, cache = "default", retried = false } = {}) {
    const target = /^https:\/\//i.test(path) ? path : `${API_ROOT}/${String(path).replace(/^\/+/, "")}`;
    const url = new URL(target);
    if (url.origin !== "https://api.spotify.com" || !url.pathname.startsWith("/v1/")) {
      throw new Error("URL de API do Spotify inválida.");
    }
    if (query) Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });

    const token = await getAccessToken();
    const response = await fetch(url.href, {
      method,
      cache,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 401 && !retried) {
      await refreshAccessToken();
      return request(path, { method, query, body, cache, retried: true });
    }
    if (response.status === 204) return null;

    if (!response.ok) {
      const raw = (await response.text()).trim();
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        // O Spotify também pode enviar a explicação em texto simples.
      }
      const reason = payload?.error?.message || payload?.error_description || payload?.error?.reason
        || (typeof payload === "string" ? payload : null)
        || (!payload && !raw.startsWith("<") ? raw : "");
      const detail = typeof reason === "string" ? reason.slice(0, 400) : "";
      const message = messageForStatus(response.status, detail);
      const diagnostic = response.status === 403 ? ` (403 em ${url.pathname}${detail ? " · " + detail : ""})` : "";
      throw new SpotifyApiError(message + diagnostic, response.status, payload, detail);
    }
    return response.json().catch(() => null);
  }

  const search = (query, type = "track,artist,album", offset = 0) => request("/search", {
    query: { q: query, type, limit: 10, offset }
  });

  const getProfile = () => request("/me", { cache: "no-store" });
  const getSavedTracks = (offset = 0) => request("/me/tracks", { query: { limit: 10, offset } });
  const getSavedAlbums = (offset = 0) => request("/me/albums", { query: { limit: 10, offset } });
  const getRecentlyPlayed = () => request("/me/player/recently-played", { query: { limit: 10 } });
  const getPlaylists = (offset = 0) => request("/me/playlists", { query: { limit: 10, offset } });
  const getPlaylist = (id) => request(`/playlists/${encodeURIComponent(id)}`);
  const getPlaylistItems = (id, offset = 0) => request(`/playlists/${encodeURIComponent(id)}/items`, { query: { limit: 10, offset } });
  const getArtist = (id) => request(`/artists/${encodeURIComponent(id)}`);
  const getArtistAlbums = (id, offset = 0) => request(`/artists/${encodeURIComponent(id)}/albums`, { query: { include_groups: "album,single", limit: 10, offset } });

  const checkSavedItems = (uris) => request("/me/library/contains", { query: { uris: uris.join(",") } });
  const saveLibraryItem = (uri) => request("/me/library", { method: "PUT", query: { uris: uri } });
  const removeLibraryItem = (uri) => request("/me/library", { method: "DELETE", query: { uris: uri } });

  const startPlayback = (deviceId, uris) => request("/me/player/play", {
    method: "PUT",
    query: { device_id: deviceId },
    body: { uris }
  });

  const setShuffle = (deviceId, enabled) => request("/me/player/shuffle", {
    method: "PUT",
    query: { device_id: deviceId, state: enabled }
  });

  const setRepeat = (deviceId, mode) => request("/me/player/repeat", {
    method: "PUT",
    query: { device_id: deviceId, state: mode }
  });

  return {
    SpotifyApiError, request, search, getProfile, getSavedTracks, getSavedAlbums, getRecentlyPlayed, getPlaylists, getPlaylist, getPlaylistItems, getArtist, getArtistAlbums, checkSavedItems, saveLibraryItem, removeLibraryItem, startPlayback, setShuffle, setRepeat
  };
})();
