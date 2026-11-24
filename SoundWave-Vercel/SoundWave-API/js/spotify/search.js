SoundWave.search = (() => {
  "use strict";
  const { search } = SoundWave.api;

  async function searchCatalog(query, offset = 0) {
    const value = String(query || "").trim();
    if (!value) return { tracks: [], artists: [], albums: [] };
    return search(value, "track,artist,album", offset);
  }

  async function searchGenre(genre, offset = 0) {
    const value = String(genre || "").trim();
    if (!value) return { tracks: [], artists: [], albums: [] };
    const filter = /\s/.test(value) ? '"' + value.replace(/"/g, "") + '"' : value;
    return search(`genre:${filter}`, "track,artist", offset);
  }

  async function searchArtistTracks(name, artistId) {
    const response = await search(`artist:${name}`, "track");
    return (response?.tracks?.items || []).filter((track) => track.artists?.some((artist) => artist.id === artistId));
  }

  return {
    searchCatalog, searchGenre, searchArtistTracks
  };
})();
