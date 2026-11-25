SoundWave.busca = (() => {
  "use strict";
  const { buscar } = SoundWave.api;

  async function buscarCatalogo(consulta, deslocamento = 0) {
    const valor = String(consulta || "").trim();
    if (!valor) return { tracks: [], artists: [], albums: [] };
    return buscar(valor, "track,artist,album", deslocamento);
  }

  async function buscarGenero(genero, deslocamento = 0) {
    const valor = String(genero || "").trim();
    if (!valor) return { tracks: [], artists: [], albums: [] };
    const filtro = /\s/.test(valor) ? '"' + valor.replace(/"/g, "") + '"' : valor;
    return buscar(`genre:${filtro}`, "track,artist", deslocamento);
  }

  async function buscarMusicasArtista(nome, idArtista) {
    const resposta = await buscar(`artist:${nome}`, "track");
    return (resposta?.tracks?.items || []).filter((musica) => musica.artists?.some((artista) => artista.id === idArtista));
  }

  return {
    buscarCatalogo, buscarGenero, buscarMusicasArtista
  };
})();
