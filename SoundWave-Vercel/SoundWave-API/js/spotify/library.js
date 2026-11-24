SoundWave.library = (() => {
  "use strict";
  const { getPlaylists, getPlaylist, getPlaylistItems, getSavedTracks, getRecentlyPlayed } = SoundWave.api;

  async function loadSavedTracksPage(offset = 0) {
    const response = await getSavedTracks(offset);
    return {
      tracks: (response?.items || []).map((entry) => entry.track).filter((track) => track && !track.is_local),
      nextOffset: response?.next ? Number(response.offset || 0) + Number(response.limit || 10) : null,
      total: response?.total || 0
    };
  }

  async function loadRecentTracks() {
    const response = await getRecentlyPlayed();
    return (response?.items || []).map((entry) => entry.track).filter((track) => track && !track.is_local);
  }

  async function loadPlaylistsPage(offset = 0) {
    const response = await getPlaylists(offset);
    return {
      playlists: (response?.items || []).filter(playlist => playlist?.id),
      nextOffset: response?.next ? Number(response.offset || 0) + Number(response.limit || 10) : null
    };
  }

  async function loadPlaylistTracks(id) {
    const playlist = await getPlaylist(id);
    let page = null;
    let warning = "";
    try {
      page = await getPlaylistItems(id);
    } catch (error) {
      if (error.status !== 403) throw error;
      warning = error.message;
    }
    const items = page?.items || playlist?.items?.items || [];
    return {
      playlist,
      tracks: items.map((entry) => entry?.item || entry?.track).filter((track) => track && track.type === "track" && !track.is_local),
      nextOffset: page?.next ? Number(page.offset || 0) + Number(page.limit || 10) : null,
      contentsAvailable: Array.isArray(page?.items) || Array.isArray(playlist?.items?.items),
      warning
    };
  }

  async function loadPlaylistTracksPage(id, offset) {
    const page = await getPlaylistItems(id, offset);
    return {
      tracks: (page?.items || []).map((entry) => entry?.item || entry?.track).filter((track) => track && track.type === "track" && !track.is_local),
      nextOffset: page?.next ? Number(page.offset || 0) + Number(page.limit || 10) : null
    };
  }

  return {
    loadSavedTracksPage, loadRecentTracks, loadPlaylistsPage, loadPlaylistTracks, loadPlaylistTracksPage
  };
})();
