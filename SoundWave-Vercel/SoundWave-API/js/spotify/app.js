(() => {
  "use strict";
  const { obterClientId, obterUriRedirecionamento, temSessao, salvarClientId, iniciarAutorizacao, disconnect } = SoundWave.autenticacao;
  const { verificarItensSalvos, obterArtista, obterAlbunsArtista, obterPerfil, obterAlbunsSalvos, removerDaBiblioteca, salvarNaBiblioteca } = SoundWave.api;
  const { carregarMusicasPlaylist, carregarPaginaMusicasPlaylist, carregarPaginaPlaylists, carregarMusicasRecentes, carregarPaginaMusicasSalvas } = SoundWave.biblioteca;
  const { buscarMusicasArtista, buscarCatalogo, buscarGenero } = SoundWave.busca;
  const { TocadorSpotify } = SoundWave.tocador;
  const { manterPlayerNaNavegacao, enderecoPagina } = SoundWave.navegacao;

  const { TocadorDispositivo, montarDownloads } = SoundWave.musicasDispositivo;
  const { montarBuscaPlaylists, mostrarPlaylistIncorporada } = SoundWave.playlistsPublicas;

  const estado = {
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

  const um = (seletor, raiz = document) => raiz.querySelector(seletor);
  const todos = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

  function elemento(etiqueta, nomeClasse = "", texto = "") {
    const no = document.createElement(etiqueta);
    if (nomeClasse) no.className = nomeClasse;
    if (texto !== undefined) no.textContent = texto;
    return no;
  }

  function imagemDe(item) {
    return item?.album?.images?.[0]?.url || item?.images?.[0]?.url || "img/tocando-agora.svg";
  }

  function nomesArtistas(musica) {
    return (musica?.artists || []).map((artista) => artista.name).filter(Boolean).join(", ") || "Artista não informado";
  }

  function formatarTempo(ms) {
    const segundos = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  }

  function mostrarAviso(mensagem, erro = false) {
    let aviso = um(".spotify-status");
    if (!aviso) {
      aviso = elemento("div", "spotify-status");
      aviso.setAttribute("role", "status");
      aviso.setAttribute("aria-live", "polite");
      um("main.conteudo")?.prepend(aviso);
    }
    aviso.textContent = mensagem;
    aviso.classList.toggle("erro", Boolean(erro));
    aviso.hidden = false;
  }

  function limparAviso() {
    const aviso = um(".spotify-status");
    if (aviso) aviso.hidden = true;
  }

  function desenharVazio(alvo, mensagem) {
    if (!alvo) return;
    alvo.replaceChildren();
    const vazio = elemento(alvo.tagName === "OL" ? "li" : "p", "spotify-empty", mensagem);
    alvo.append(vazio);
  }

  function definirTitulo(secao, titulo) {
    const cabecalho = secao?.closest(".secao")?.querySelector(".secao-cabecalho h2");
    if (cabecalho) cabecalho.textContent = titulo;
  }

  function definirTituloPagina(titulo, legenda) {
    const cabecalho = um(".titulo-pagina");
    if (cabecalho) cabecalho.textContent = titulo;
    const subtitulo = um(".subtitulo-pagina");
    if (subtitulo) subtitulo.textContent = legenda;
  }

  function criarBotaoConectar() {
    const direita = um(".barra-direita");
    if (!direita || um("[data-spotify-connect]", direita)) return;
    const botao = elemento("button", "spotify-connect-button", "Conectar Spotify");
    botao.type = "button";
    botao.dataset.spotifyConnect = "";
    botao.addEventListener("click", aoClicarConectar);
    const perfil = um(".perfil", direita);
    direita.insertBefore(botao, perfil || null);
    atualizarBotaoConexao();
  }

  function atualizarBotaoConexao() {
    const botao = um("[data-spotify-connect]");
    if (!botao) return;
    const conectado = temSessao();
    botao.textContent = conectado ? "Desconectar Spotify" : "Conectar Spotify";
    botao.classList.toggle("conectado", conectado);
    botao.setAttribute("aria-label", conectado ? "Desconectar conta Spotify" : "Conectar conta Spotify");
    const perfil = um(".perfil-nome");
    if (perfil) {
      const rotulo = [...perfil.childNodes].find((no) => no.nodeType === Node.TEXT_NODE);
      if (rotulo && estado.user) rotulo.textContent = estado.user.display_name || "Spotify";
      else if (rotulo && !conectado) rotulo.textContent = "Conecte o Spotify";
    }
  }

  function configurarDialogoClientId() {
    if (um("#spotify-client-dialog")) return um("#spotify-client-dialog");
    const dialogo = elemento("dialog", "spotify-dialog");
    dialogo.id = "spotify-client-dialog";
    dialogo.setAttribute("aria-labelledby", "spotify-client-title");
    dialogo.innerHTML = `
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
    document.body.append(dialogo);
    const formulario = um("form", dialogo);
    const campo = um("#spotify-client-id", dialogo);
    const redirecionamento = um("[data-spotify-redirect]", dialogo);
    const retornoVisual = um(".spotify-dialog-help", dialogo);
    const painel = um(".spotify-dialog-actions a", dialogo);
    function atualizarLinkPainel() {
      const id = campo.value.trim();
      painel.href = "https://developer.spotify.com/dashboard" + (/^[0-9a-f]{32}$/i.test(id) ? "/" + id : "");
    }
    campo.addEventListener("input", atualizarLinkPainel);
    um("[data-copy-redirect]", dialogo).addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(obterUriRedirecionamento());
        retornoVisual.textContent = "Endereço copiado. Cole em Redirect URIs no painel do app.";
      } catch {
        retornoVisual.textContent = "Selecione o endereço acima e copie com Ctrl+C.";
      }
    });
    const atualizarRedirecionamento = () => { redirecionamento.textContent = obterUriRedirecionamento(); };
    um(".spotify-dialog-close", dialogo).addEventListener("click", () => dialogo.close());
    dialogo.addEventListener("click", (evento) => { if (evento.target === dialogo) dialogo.close(); });
    formulario.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      try {
        salvarClientId(campo.value);
        dialogo.close();
        await iniciarAutorizacao();
      } catch (erro) {
        retornoVisual.textContent = erro.message;
        if (!dialogo.open) dialogo.showModal();
      }
    });
    dialogo.addEventListener("close", atualizarRedirecionamento);
    dialogo.refresh = () => {
      campo.value = obterClientId();
      atualizarLinkPainel();
      atualizarRedirecionamento();
      dialogo.showModal();
      campo.focus();
    };
    return dialogo;
  }

  async function aoClicarConectar() {
    if (temSessao()) {
      estado.localPlayer?.stop();
      estado.spotifyPlayer?.disconnect();
      disconnect();
      window.location.reload();
      return;
    }
    await conectarSpotify();
  }

  let abrindoLogin = false;
  window.addEventListener("pageshow", () => { abrindoLogin = false; });

  async function conectarSpotify() {
    if (location.protocol === "file:") {
      SoundWave.abrirConexaoWeb();
      return;
    }
    if (abrindoLogin) return;
    abrindoLogin = true;
    try {
      await iniciarAutorizacao();
    } catch (erro) {
      abrindoLogin = false;
      mostrarAviso(erro.message, true);
      adicionarConfiguracoes();
    }
  }

  function adicionarConfiguracoes() {
    const configuracoes = elemento("button", "spotify-panel-link", "Configurar aplicativo");
    configuracoes.type = "button";
    configuracoes.addEventListener("click", () => {
      if (location.protocol === "file:") SoundWave.abrirConexaoWeb();
      else configurarDialogoClientId().refresh();
    });
    um(".spotify-status").append(" ", configuracoes);
  }

  function criarBotaoCurtir(musica, nomeClasse = "") {
    const salvos = estado.savedIds.has(musica.id);
    const botao = elemento("button", `curtir botao-icone${salvos ? " salvo" : ""}${nomeClasse ? ` ${nomeClasse}` : ""}`);
    botao.type = "button";
    botao.dataset.favoriteTrack = musica.id;
    botao.setAttribute("aria-pressed", String(salvos));
    botao.setAttribute("aria-label", salvos ? "Remover das músicas salvas" : "Salvar na biblioteca do Spotify");
    botao.title = botao.getAttribute("aria-label");
    botao.append(elemento("i", "ri-heart-line"), elemento("i", "ri-heart-fill"));
    botao.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      alternarCurtida(musica, botao);
    });
    return botao;
  }

  function atualizarBotoesCurtir(musica) {
    const salvos = estado.savedIds.has(musica.id);
    todos("[data-favorite-track]").filter((botao) => botao.dataset.favoriteTrack === musica.id).forEach((botao) => {
      botao.classList.toggle("salvo", salvos);
      botao.setAttribute("aria-pressed", String(salvos));
      botao.setAttribute("aria-label", salvos ? "Remover das músicas salvas" : "Salvar na biblioteca do Spotify");
      botao.title = botao.getAttribute("aria-label");
    });
  }

  async function alternarCurtida(musica, botao) {
    if (!temSessao()) return mostrarAviso("Conecte sua conta Spotify para alterar suas músicas salvas.", true);
    botao.disabled = true;
    try {
      const uri = musica.uri || `spotify:track:${musica.id}`;
      if (estado.savedIds.has(musica.id)) {
        await removerDaBiblioteca(uri);
        estado.savedIds.delete(musica.id);
        if (enderecoPagina().pathname.endsWith("curtidas.html")) await inicializarCurtidas();
        mostrarAviso("Música removida da sua biblioteca do Spotify.");
      } else {
        await salvarNaBiblioteca(uri);
        estado.savedIds.add(musica.id);
        mostrarAviso("Música salva na sua biblioteca do Spotify.");
      }
      atualizarBotoesCurtir(musica);
    } catch (erro) {
      mostrarAviso(erro.message, true);
    } finally {
      botao.disabled = false;
    }
  }

  async function verificarCurtidas(musicas) {
    const unicos = [...new Map(musicas.filter((musica) => musica?.id).map((musica) => [musica.id, musica])).values()];
    for (let indice = 0; indice < unicos.length; indice += 40) {
      const lote = unicos.slice(indice, indice + 40);
      if (!lote.length) continue;
      try {
        const salvos = await verificarItensSalvos(lote.map((musica) => musica.uri || `spotify:track:${musica.id}`));
        lote.forEach((musica, posicao) => {
          if (salvos?.[posicao]) estado.savedIds.add(musica.id);
          else estado.savedIds.delete(musica.id);
        });
      } catch (erro) {
        if (erro.status === 403) mostrarAviso(erro.message, true);
      }
    }
  }

  function criarBotaoTocar(musica, fila) {
    const botao = elemento("button", "spotify-play-inline");
    botao.type = "button";
    botao.setAttribute("aria-label", `Tocar ${musica.name || "música"} no Spotify`);
    botao.title = "Tocar no Spotify";
    botao.append(elemento("i", "ri-play-fill"));
    botao.addEventListener("click", (evento) => {
      evento.preventDefault();
      tocarMusica(musica, fila);
    });
    return botao;
  }

  function desenharListaMusicas(alvo, musicas, { append: anexar = false, nextOffset: deslocamentoSeguinte = null, onMore: aoMais = null } = {}) {
    if (!alvo) return;
    alvo.querySelector(".spotify-load-more-row")?.remove();
    if (!anexar) alvo.replaceChildren();
    if (!musicas.length && !anexar) {
      desenharVazio(alvo, "Nenhuma música foi retornada pelo Spotify.");
      return;
    }
    musicas.forEach((musica, indice) => {
      const linha = elemento("li", "musica");
      linha.dataset.spotifyTrackId = musica.id;
      const numero = elemento("span", "musica-numero");
      numero.append(criarBotaoTocar(musica, musicas));
      const principal = elemento("span", "musica-principal");
      const imagem = elemento("img");
      imagem.src = imagemDe(musica);
      imagem.alt = `Capa de ${musica.album?.name || musica.name}`;
      const rotulos = elemento("span");
      rotulos.append(elemento("span", "musica-titulo", musica.name || "Faixa sem título"));
      rotulos.append(elemento("span", "musica-artista", nomesArtistas(musica)));
      principal.append(imagem, rotulos);
      linha.append(numero, principal, elemento("span", "musica-album", musica.album?.name || "—"), criarBotaoCurtir(musica), elemento("span", "musica-duracao", formatarTempo(musica.duration_ms)));
      alvo.append(linha);
    });
    if (deslocamentoSeguinte !== null && aoMais) {
      const linha = elemento("li", "spotify-load-more-row");
      const botao = elemento("button", "spotify-load-more", "Carregar mais");
      botao.type = "button";
      botao.addEventListener("click", async () => {
        botao.disabled = true;
        botao.textContent = "Carregando…";
        try { await aoMais(deslocamentoSeguinte); }
        catch (erro) { mostrarAviso(erro.message || "Não foi possível carregar mais resultados.", true); }
      });
      linha.append(botao);
      alvo.append(linha);
    }
  }

  function desenharGradeMusicas(alvo, musicas, mensagem = "Nenhuma música foi retornada pelo Spotify.", anexar = false) {
    if (!alvo) return;
    if (!anexar || alvo.querySelector(".spotify-empty")) alvo.replaceChildren();
    if (!musicas.length && !anexar) return desenharVazio(alvo, mensagem);
    musicas.forEach((musica) => {
      const cartao = elemento("article", "cartao spotify-track-card");
      const imagem = elemento("img");
      imagem.loading = "lazy";
      imagem.src = imagemDe(musica);
      imagem.alt = `Capa de ${musica.album?.name || musica.name}`;
      const titulo = elemento("h3", "", musica.name || "Faixa sem título");
      const artista = elemento("p", "", nomesArtistas(musica));
      const acoes = elemento("div", "spotify-card-actions");
      acoes.append(criarBotaoTocar(musica, musicas), criarBotaoCurtir(musica));
      cartao.append(imagem, titulo, artista, acoes);
      alvo.append(cartao);
    });
  }

  function desenharGradeArtistas(alvo, artistas, mensagem = "Nenhum artista foi retornado pelo Spotify.") {
    if (!alvo) return;
    alvo.replaceChildren();
    if (!artistas.length) return desenharVazio(alvo, mensagem);
    artistas.forEach((artista) => {
      const link = elemento("a", "artista");
      link.dataset.artistId = artista.id;
      link.href = `artista.html?id=${encodeURIComponent(artista.id)}`;
      const imagem = elemento("img");
      imagem.src = artista.images?.[0]?.url || "img/avatar.svg";
      imagem.loading = "lazy";
      imagem.alt = `Imagem de ${artista.name}`;
      link.append(imagem, elemento("h3", "", artista.name || "Artista"), elemento("p", "", artista.genres?.[0] || "Artista no Spotify"));
      alvo.append(link);
    });
  }

  function desenharGradeAlbuns(alvo, albuns, { append: anexar = false, nextOffset: deslocamentoSeguinte = null, onMore: aoMais = null } = {}) {
    if (!alvo) return;
    alvo.nextElementSibling?.matches("[data-spotify-albums-more]") && alvo.nextElementSibling.remove();
    if (!anexar) alvo.replaceChildren();
    if (!albuns.length && !anexar) return desenharVazio(alvo, "Nenhum álbum foi retornado pelo Spotify.");
    albuns.forEach((album) => {
      const link = elemento("a", "cartao");
      link.dataset.albumId = album.id;
      link.href = album.external_urls?.spotify || `https://open.spotify.com/album/${encodeURIComponent(album.id)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const imagem = elemento("img");
      imagem.loading = "lazy";
      imagem.src = imagemDe(album);
      imagem.alt = `Capa de ${album.name}`;
      link.append(imagem, elemento("h3", "", album.name || "Álbum"), elemento("p", "", (album.artists || []).map((artista) => artista.name).join(", ")));
      alvo.append(link);
    });
    if (deslocamentoSeguinte !== null && aoMais) {
      const botao = elemento("button", "spotify-load-more", "Carregar mais álbuns");
      botao.type = "button";
      botao.dataset.spotifyAlbumsMore = "";
      botao.addEventListener("click", async () => {
        botao.disabled = true;
        botao.textContent = "Carregando…";
        try { await aoMais(deslocamentoSeguinte); }
        catch (erro) { mostrarAviso(erro.message || "Não foi possível carregar mais álbuns.", true); }
      });
      alvo.after(botao);
    }
  }

  function desenharGradePlaylists(alvo, playlists, { append: anexar = false, nextOffset: deslocamentoSeguinte = null, onMore: aoMais = null } = {}) {
    if (!alvo) return;
    alvo.nextElementSibling?.matches("[data-spotify-playlists-more]") && alvo.nextElementSibling.remove();
    if (!anexar) alvo.replaceChildren();
    if (!playlists.length && !anexar) return desenharVazio(alvo, "Sua conta ainda não retornou playlists.");
    playlists.forEach((playlist) => {
      const link = elemento("a", "cartao");
      link.href = `playlist.html?id=${encodeURIComponent(playlist.id)}`;
      const imagem = elemento("img");
      imagem.src = imagemDe(playlist);
      imagem.alt = `Capa da playlist ${playlist.name}`;
      link.append(imagem, elemento("h3", "", playlist.name || "Playlist"), elemento("p", "", `${playlist.items?.total ?? playlist.tracks?.total ?? ""} faixas`));
      alvo.append(link);
    });
    if (deslocamentoSeguinte !== null && aoMais) {
      const botao = elemento("button", "spotify-load-more", "Carregar mais playlists");
      botao.type = "button";
      botao.dataset.spotifyPlaylistsMore = "";
      botao.addEventListener("click", async () => {
        botao.disabled = true;
        botao.textContent = "Carregando…";
        try { await aoMais(deslocamentoSeguinte); }
        catch (erro) { mostrarAviso(erro.message || "Não foi possível carregar mais playlists.", true); }
      });
      alvo.after(botao);
    }
  }

  function desenharPlaylistsMenu(playlists) {
    const alvo = um("[data-spotify-playlists]");
    if (!alvo) return;
    alvo.replaceChildren();
    playlists.slice(0, 5).forEach((playlist) => {
      const link = elemento("a", "menu-item pequeno");
      link.href = `playlist.html?id=${encodeURIComponent(playlist.id)}`;
      const imagem = elemento("img");
      imagem.src = imagemDe(playlist);
      imagem.alt = "";
      link.append(imagem, elemento("span", "", playlist.name || "Playlist"));
      alvo.append(link);
    });
  }

  async function tocarMusica(musica, fila = [musica]) {
    if (!temSessao()) return mostrarAviso("Conecte sua conta Spotify para reproduzir músicas.", true);
    if (estado.player === estado.localPlayer) estado.localPlayer.stop();
    estado.player = estado.spotifyPlayer;
    estado.currentTrack = musica;
    atualizarMusicaAtual(musica);
    try {
      await estado.player.play(musica, fila);
    } catch (erro) {
      mostrarAviso(erro.message, true);
    }
  }

  function atualizarMusicaAtual(musica) {
    if (!musica) return;
    const estrutura = um(".player-musica");
    const capa = um("img", estrutura);
    const titulo = um("h4", estrutura);
    const artista = um("p", estrutura);
    if (capa) { capa.src = imagemDe(musica); capa.alt = `Capa de ${musica.album?.name || musica.name}`; }
    if (titulo) { delete titulo.dataset.localId; titulo.textContent = musica.name || "Faixa do Spotify"; }
    if (artista) artista.textContent = nomesArtistas(musica);
    const coracao = um("[data-current-favorite]");
    if (coracao) {
      coracao.dataset.favoriteTrack = musica.id || "";
      coracao.disabled = !musica.id;
      const salvos = estado.savedIds.has(musica.id);
      coracao.classList.toggle("salvo", salvos);
      coracao.setAttribute("aria-pressed", String(salvos));
    }
  }

  function atualizarEstadoPlayer(reproducao) {
    const estrutura = um(".player");
    if (!estrutura) return;
    const musica = reproducao.track_window?.current_track;
    if (musica && musica.id !== estado.currentTrack?.id) {
      estado.currentTrack = musica;
      atualizarMusicaAtual(musica);
    }
    estrutura.classList.toggle("is-playing", !reproducao.paused);
    atualizarProgresso(reproducao.position, reproducao.duration);
  }

  function atualizarProgresso(posicao, duracao) {
    const decorrido = um(".player-progresso > span:first-child");
    const total = um(".player-progresso > span:last-child");
    const preencher = um(".barra-progresso > span");
    if (decorrido) decorrido.textContent = formatarTempo(posicao);
    if (total) total.textContent = formatarTempo(duracao);
    if (preencher) preencher.style.width = duracao ? `${Math.min(100, posicao / duracao * 100)}%` : "0%";
  }

  function configurarControlesPlayer() {
    estado.localPlayer = new TocadorDispositivo(desenharPlayerLocal, erro => mostrarAviso(erro.message, true));
    estado.spotifyPlayer = new TocadorSpotify({
      onState: (reproducao) => {
        if (estado.player !== estado.spotifyPlayer) return;
        ancoraProgresso = performance.now();
        atualizarEstadoPlayer(reproducao);
      },
      onMessage: (mensagem, erro) => mostrarAviso(mensagem, erro)
    });
    estado.player = estado.spotifyPlayer;
    let ancoraProgresso = 0;
    window.setInterval(() => {
      const reproducao = estado.player.playbackState;
      if (reproducao && !reproducao.paused) atualizarProgresso(Math.min(reproducao.duration, reproducao.position + performance.now() - ancoraProgresso), reproducao.duration);
    }, 500);
    const alternar = um(".botao-tocar");
    alternar?.addEventListener("click", async (evento) => {
      evento.preventDefault();
      try { await estado.player.toggle(); }
      catch (erro) { mostrarAviso(erro.message, true); }
    });
    const proximo = um('.player-botoes a[aria-label="Próxima"]');
    const anterior = um('.player-botoes a[aria-label="Anterior"]');
    proximo?.addEventListener("click", async (evento) => {
      evento.preventDefault();
      try { await estado.player.next(); } catch (erro) { mostrarAviso(erro.message, true); }
    });
    anterior?.addEventListener("click", async (evento) => {
      evento.preventDefault();
      try { await estado.player.previous(); } catch (erro) { mostrarAviso(erro.message, true); }
    });
    const aleatorio = um('.player-botoes label[title="Aleatório"]');
    aleatorio?.addEventListener("click", async (evento) => {
      evento.preventDefault();
      try {
        const habilitado = await estado.player.toggleShuffle();
        const campo = um("input", aleatorio);
        if (campo) campo.checked = habilitado;
      } catch (erro) { mostrarAviso(erro.message, true); }
    });
    const repetir = um('.player-botoes label[title="Repetir"]');
    repetir?.addEventListener("click", async (evento) => {
      evento.preventDefault();
      try {
        const modo = await estado.player.cycleRepeat();
        const campo = um("input", repetir);
        if (campo) campo.checked = modo !== "off";
        repetir.title = modo === "track" ? "Repetir música" : modo === "context" ? "Repetir contexto" : "Repetição desligada";
      } catch (erro) { mostrarAviso(erro.message, true); }
    });
    const irPara = um(".barra-progresso");
    if (irPara) {
      irPara.setAttribute("role", "slider");
      irPara.setAttribute("tabindex", "0");
      irPara.setAttribute("aria-label", "Posição da música");
      irPara.addEventListener("click", (evento) => {
        const duracao = estado.player === estado.localPlayer ? estado.localPlayer.duration : estado.player.playbackState?.duration;
        if (!duracao) return;
        const retangulo = irPara.getBoundingClientRect();
        estado.player.seek(Math.max(0, Math.min(1, (evento.clientX - retangulo.left) / retangulo.width)) * duracao)
          .catch((erro) => mostrarAviso(erro.message, true));
      });
    }
    const volume = um(".volume-barra");
    volume?.addEventListener("click", (evento) => {
      const retangulo = volume.getBoundingClientRect();
      const valor = Math.max(0, Math.min(1, (evento.clientX - retangulo.left) / retangulo.width));
      const preencher = um("span", volume);
      if (preencher) preencher.style.width = `${valor * 100}%`;
      estado.player.setVolume(valor).catch((erro) => mostrarAviso(erro.message, true));
    });
    const curtidaAtual = um(".player-musica .curtir");
    if (curtidaAtual) {
      curtidaAtual.dataset.currentFavorite = "";
      curtidaAtual.addEventListener("click", (evento) => {
        evento.preventDefault();
        if (estado.currentTrack) alternarCurtida(estado.currentTrack, curtidaAtual);
        else mostrarAviso("Escolha uma faixa do Spotify primeiro.");
      });
    }
  }

  async function inicializarBiblioteca() {
    const alvoMusicas = um("[data-spotify-tracks]");
    const alvoRecentes = um("[data-spotify-recent]");
    const alvoArtistas = um("[data-spotify-artists]");
    const resultadoSalvos = await carregarPaginaMusicasSalvas(0);
    resultadoSalvos.tracks.forEach((musica) => estado.savedIds.add(musica.id));
    desenharGradeMusicas(alvoMusicas, resultadoSalvos.tracks, "Sua biblioteca do Spotify não tem músicas salvas ainda.");
    try {
      const recentes = await carregarMusicasRecentes();
      await verificarCurtidas(recentes);
      desenharGradeMusicas(alvoRecentes, recentes, "As faixas tocadas recentemente aparecerão aqui.");
    } catch (erro) {
      desenharVazio(alvoRecentes, erro.message);
    }
    const artistas = [...new Map(resultadoSalvos.tracks.flatMap((musica) => musica.artists || []).map((artista) => [artista.id, artista])).values()];
    desenharGradeArtistas(alvoArtistas, artistas, "Salve músicas para descobrir artistas da sua biblioteca.");
  }

  async function executarBusca(valor, modo = "text") {
    const executar = ++estado.searchRun;
    const alvoMusicas = um("[data-spotify-search-tracks]") || um("[data-spotify-style-tracks]") || um("[data-spotify-radio-results]");
    if (!alvoMusicas || !valor.trim()) return;
    const alvoArtistas = um("[data-spotify-search-artists]");
    const alvoAlbuns = um("[data-spotify-search-albums]");
    const mais = um("[data-spotify-search-more]");
    const musicas = new Map();
    const artistas = new Map();
    const albuns = new Map();
    let deslocamento = 0;
    let ocupado = false;
    desenharVazio(alvoMusicas, "Buscando no catálogo do Spotify…");
    alvoArtistas?.replaceChildren();
    alvoAlbuns?.replaceChildren();
    if (mais) mais.hidden = true;

    async function carregarLote() {
      if (ocupado || deslocamento === null) return;
      ocupado = true;
      if (mais) mais.disabled = true;
      const adicionados = [];
      try {
        for (let pagina = 0; pagina < (mais ? 3 : 1) && deslocamento !== null; pagina++) {
          const resultados = await (modo === "genre" ? buscarGenero(valor, deslocamento) : buscarCatalogo(valor, deslocamento));
          if (executar !== estado.searchRun || !alvoMusicas.isConnected) return;
          for (const artista of resultados.artists?.items || []) {
            if (artista?.id) artistas.set(artista.id, artista);
          }
          for (const album of resultados.albums?.items || []) {
            if (album?.id) albuns.set(album.id, album);
          }
          for (const musica of resultados.tracks?.items || []) {
            if (!musica?.id || musicas.has(musica.id)) continue;
            musicas.set(musica.id, musica);
            adicionados.push(musica);
            if (modo === "genre") {
              for (const artista of musica.artists || []) {
                if (artista.id && !artistas.has(artista.id)) artistas.set(artista.id, artista);
              }
              if (musica.album?.id && !albuns.has(musica.album.id)) albuns.set(musica.album.id, musica.album);
            }
          }
          const proximo = [resultados.tracks, resultados.artists, resultados.albums].find(grupo => grupo?.next);
          deslocamento = proximo && deslocamento < 1000 ? (proximo.offset ?? deslocamento) + (proximo.limit || 10) : null;
        }
        await verificarCurtidas(adicionados);
      } catch (erro) {
        if (executar === estado.searchRun && alvoMusicas.isConnected) mostrarAviso(erro.message, true);
      } finally {
        ocupado = false;
        if (executar === estado.searchRun && alvoMusicas.isConnected) {
          desenharGradeMusicas(alvoMusicas, [...musicas.values()], "Nenhuma faixa encontrada.");
          desenharGradeArtistas(alvoArtistas, [...artistas.values()], "Nenhum artista encontrado.");
          desenharGradeAlbuns(alvoAlbuns, [...albuns.values()]);
          if (mais) {
            mais.hidden = deslocamento === null || deslocamento > 1000;
            mais.disabled = false;
            mais.textContent = "Carregar mais resultados";
          }
        }
      }
    }
    if (mais) mais.onclick = carregarLote;
    await carregarLote();
  }

  async function inicializarExplorar() {
    const parametros = enderecoPagina().searchParams;
    const consulta = parametros.get("q");
    const genero = parametros.get("genre");
    const campoBusca = um('.busca input[name="q"]');
    if (campoBusca) campoBusca.value = consulta || "";
    if (consulta) {
      definirTituloPagina("Resultados da pesquisa", `Resultados reais do catálogo Spotify para “${consulta}”.`);
      await executarBusca(consulta);
    } else if (genero) {
      um("[data-spotify-genres]")?.querySelectorAll(".genero").forEach(link => link.classList.toggle("selecionado", link.dataset.genre === genero));
      definirTituloPagina(`Estilo: ${genero}`, "Faixas e artistas encontrados pela pesquisa oficial do Spotify.");
      await executarBusca(genero, "genre");
    } else {
      const alvoMusicas = um("[data-spotify-search-tracks]") || um("[data-spotify-style-tracks]");
      desenharVazio(alvoMusicas, "Escolha um estilo ou pesquise uma música, artista ou álbum.");
      const alvoArtistas = um("[data-spotify-search-artists]") || um("[data-spotify-artists]");
      desenharVazio(alvoArtistas, "Os artistas aparecem aqui quando você pesquisa no catálogo.");
      desenharVazio(um("[data-spotify-search-albums]"), "Os álbuns aparecem aqui quando você pesquisa no catálogo.");
      definirTituloPagina("Explorar", "Pesquise no catálogo do Spotify ou selecione um estilo.");
    }
    const areaGenero = um("[data-spotify-genres]");
    areaGenero?.addEventListener("click", (evento) => {
      const botao = evento.target.closest(".genero");
      if (!botao) return;
      evento.preventDefault();
      todos(".genero", areaGenero).forEach((item) => item.classList.toggle("selecionado", item === botao));
      const valorGenero = botao.dataset.genre || botao.textContent.trim();
      history.replaceState(null, "", `explorar.html?genre=${encodeURIComponent(valorGenero)}`);
      definirTituloPagina(`Estilo: ${valorGenero}`, "Faixas e artistas encontrados pela pesquisa oficial do Spotify.");
      executarBusca(valorGenero, "genre").catch((erro) => mostrarAviso(erro.message, true));
    });
  }

  async function inicializarCurtidas() {
    const alvo = um("[data-spotify-favorites]");
    const destaque = um(".destaque");
    const legenda = um(".destaque .destaque-texto > p:last-of-type");
    estado.favoriteTracks = [];
    const carregarPagina = async (deslocamento = 0, anexar = false) => {
      const resultado = await carregarPaginaMusicasSalvas(deslocamento);
      resultado.tracks.forEach((musica) => estado.savedIds.add(musica.id));
      estado.favoriteTracks.push(...resultado.tracks);
      desenharListaMusicas(alvo, resultado.tracks, {
        append: anexar,
        nextOffset: resultado.nextOffset,
        onMore: (deslocamentoSeguinte) => carregarPagina(deslocamentoSeguinte, true).catch((erro) => mostrarAviso(erro.message, true))
      });
      if (legenda) legenda.textContent = `${resultado.total} músicas salvas na sua biblioteca Spotify`;
      if (destaque) destaque.dataset.trackCount = String(resultado.total);
    };
    const tocarTudo = um(".destaque .botao-principal");
    if (tocarTudo) tocarTudo.onclick = (evento) => {
      evento.preventDefault();
      if (estado.favoriteTracks[0]) tocarMusica(estado.favoriteTracks[0], estado.favoriteTracks);
      else mostrarAviso("Sua biblioteca não tem músicas carregadas.");
    };
    await carregarPagina();
    const alvoAlbuns = um("[data-spotify-saved-albums]");
    const carregarAlbuns = async (deslocamento = 0) => {
      const pagina = await obterAlbunsSalvos(deslocamento);
      desenharGradeAlbuns(alvoAlbuns, pagina.items.map((item) => item.album).filter(Boolean), {
        append: deslocamento > 0,
        nextOffset: pagina.next ? pagina.offset + pagina.limit : null,
        onMore: carregarAlbuns
      });
    };
    await carregarAlbuns().catch((erro) => desenharVazio(alvoAlbuns, erro.message));
  }

  async function inicializarRecentes() {
    definirTituloPagina("Tocadas recentemente", "Histórico de reprodução da sua conta Spotify.");
    const musicas = await carregarMusicasRecentes();
    const grade = um("[data-spotify-recent]");
    const lista = um("[data-spotify-recent-tracks]");
    await verificarCurtidas(musicas);
    desenharGradeMusicas(grade, musicas, "Não há faixas recentes retornadas pelo Spotify.");
    desenharListaMusicas(lista, musicas);
  }

  async function inicializarPlaylists(conectado = true) {
    const parametros = enderecoPagina().searchParams;
    const id = parametros.get("id");
    const gradePlaylists = um("[data-spotify-playlists-page]");
    const listaMusicas = um("[data-spotify-playlist-items]");
    const descoberta = um("[data-public-discovery]");
    const incorporado = um("[data-playlist-embed]");
    const idPublico = parametros.get("publica");
    descoberta.hidden = Boolean(id || idPublico);
    um("[data-account-playlists-heading]").hidden = descoberta.hidden;
    if (!descoberta.hidden) montarBuscaPlaylists(descoberta, conectado);
    if (idPublico || (id && !conectado)) {
      um(".destaque h1").textContent = "Playlist do Spotify";
      um(".destaque .destaque-texto > p:last-of-type").textContent = "Ouça no player oficial da playlist.";
      um(".destaque .botao-principal").hidden = true;
      gradePlaylists.hidden = true;
      listaMusicas.hidden = true;
      if (!mostrarPlaylistIncorporada(incorporado, idPublico || id)) mostrarAviso("O identificador da playlist é inválido.", true);
      return;
    }
    if (!id) {
      const titulo = um(".destaque h1");
      const descricao = um(".destaque .destaque-texto > p:last-of-type");
      const botaoTocar = um(".destaque .botao-principal");
      const rotulo = um(".destaque-tipo");
      if (rotulo) rotulo.textContent = "Sua biblioteca Spotify";
      if (titulo) titulo.textContent = "Suas playlists";
      if (descricao) descricao.textContent = "Encontre playlists no Spotify ou abra uma da sua biblioteca.";
      if (botaoTocar) botaoTocar.hidden = true;
      if (!conectado) { desenharVazio(gradePlaylists, "Conecte o Spotify para ver as playlists da sua conta."); return; }
      const resultado = await carregarPaginaPlaylists();
      desenharGradePlaylists(gradePlaylists, resultado.playlists, {
        nextOffset: resultado.nextOffset,
        onMore: (deslocamento) => carregarMaisPlaylists(deslocamento, gradePlaylists)
      });
      if (listaMusicas) listaMusicas.hidden = true;
      return;
    }

    if (gradePlaylists) gradePlaylists.hidden = true;
    if (listaMusicas) listaMusicas.hidden = false;
    let resultado;
    try {
      resultado = await carregarMusicasPlaylist(id);
    } catch (erro) {
      if (![403, 404].includes(erro.status) || !mostrarPlaylistIncorporada(incorporado, id)) throw erro;
      um(".destaque h1").textContent = "Playlist do Spotify";
      um(".destaque .destaque-texto > p:last-of-type").textContent = "Confira a disponibilidade no player oficial.";
      um(".destaque .botao-principal").hidden = true;
      return;
    }
    const cabecalho = um(".destaque h1");
    if (cabecalho) cabecalho.textContent = resultado.playlist.name || "Playlist Spotify";
    const descricao = um(".destaque .destaque-texto > p:last-of-type");
    if (descricao) descricao.textContent = resultado.playlist.description || `${resultado.playlist.items?.total ?? resultado.playlist.tracks?.total ?? resultado.tracks.length} faixas`;
    const destaque = um(".destaque");
    if (destaque && resultado.playlist.images?.[0]?.url) destaque.style.backgroundImage = `url("${resultado.playlist.images[0].url}")`;
    estado.playlistTracks = resultado.tracks;
    await verificarCurtidas(resultado.tracks);
    desenharListaMusicas(listaMusicas, resultado.tracks, {
      nextOffset: resultado.nextOffset,
      onMore: (deslocamentoSeguinte) => carregarMaisMusicasPlaylist(id, deslocamentoSeguinte, listaMusicas)
    });
    if (!resultado.contentsAvailable && listaMusicas) desenharVazio(listaMusicas, "O Spotify não disponibilizou as faixas desta playlist. Em Development Mode, o conteúdo pode ser limitado a playlists que você possui ou edita.");
    else if (resultado.warning) mostrarAviso(resultado.warning, true);
    if (!resultado.contentsAvailable) mostrarPlaylistIncorporada(incorporado, id);
    const botaoTocar = um(".destaque .botao-principal");
    if (botaoTocar) botaoTocar.hidden = !estado.playlistTracks.length;
    botaoTocar?.addEventListener("click", (evento) => {
      evento.preventDefault();
      if (estado.playlistTracks[0]) tocarMusica(estado.playlistTracks[0], estado.playlistTracks);
      else mostrarAviso("Esta playlist não retornou faixas que possam ser tocadas.");
    });
  }

  async function carregarMaisPlaylists(deslocamento, alvo) {
    const pagina = await carregarPaginaPlaylists(deslocamento);
    desenharGradePlaylists(alvo, pagina.playlists, {
      append: true,
      nextOffset: pagina.nextOffset,
      onMore: (deslocamentoSeguinte) => carregarMaisPlaylists(deslocamentoSeguinte, alvo)
    });
  }

  async function carregarMaisMusicasPlaylist(id, deslocamento, alvo) {
    const pagina = await carregarPaginaMusicasPlaylist(id, deslocamento);
    estado.playlistTracks.push(...pagina.tracks);
    await verificarCurtidas(pagina.tracks);
    desenharListaMusicas(alvo, pagina.tracks, {
      append: true,
      nextOffset: pagina.nextOffset,
      onMore: (proximoDeslocamento) => carregarMaisMusicasPlaylist(id, proximoDeslocamento, alvo)
    });
  }

  async function inicializarArtista() {
    const parametros = enderecoPagina().searchParams;
    const id = parametros.get("id");
    if (!id) {
      desenharVazio(um("[data-spotify-artist-tracks]"), "Pesquise um artista e abra um resultado para ver os dados reais.");
      desenharVazio(um("[data-spotify-artist-albums]"), "A discografia será carregada quando você abrir um artista.");
      definirTituloPagina("Artista", "Abra um artista encontrado na pesquisa do Spotify.");
      return;
    }
    const artista = await obterArtista(id);
    const [paginaAlbum, musicas] = await Promise.all([
      obterAlbunsArtista(id), buscarMusicasArtista(artista.name || "", id).catch(() => [])
    ]);
    const cabecalho = um(".destaque h1");
    if (cabecalho) cabecalho.textContent = artista.name || "Artista Spotify";
    const detalhe = um(".destaque .destaque-texto > p:last-of-type");
    if (detalhe) detalhe.textContent = artista.genres?.length ? artista.genres.join(" · ") : "Perfil e discografia do catálogo Spotify";
    const destaque = um("[data-spotify-artist-hero]");
    if (destaque && artista.images?.[0]?.url) destaque.style.backgroundImage = `url("${artista.images[0].url}")`;
    const linkSpotify = um(".destaque .botao-principal");
    if (linkSpotify) {
      linkSpotify.textContent = "Abrir no Spotify";
      linkSpotify.href = artista.external_urls?.spotify || `https://open.spotify.com/artist/${encodeURIComponent(id)}`;
      linkSpotify.target = "_blank";
      linkSpotify.rel = "noopener noreferrer";
    }
    const alvoMusica = um("[data-spotify-artist-tracks]");
    await verificarCurtidas(musicas);
    desenharListaMusicas(alvoMusica, musicas);
    const alvoAlbuns = um("[data-spotify-artist-albums]");
    desenharGradeAlbuns(alvoAlbuns, paginaAlbum.items || [], {
      nextOffset: paginaAlbum.next ? Number(paginaAlbum.offset || 0) + Number(paginaAlbum.limit || 10) : null,
      onMore: (deslocamento) => carregarMaisAlbunsArtista(id, deslocamento, alvoAlbuns)
    });
    const secaoRelacionada = um("[data-spotify-related-section]");
    if (secaoRelacionada) secaoRelacionada.hidden = true;
  }

  async function carregarMaisAlbunsArtista(id, deslocamento, alvo) {
    const pagina = await obterAlbunsArtista(id, deslocamento);
    desenharGradeAlbuns(alvo, pagina.items || [], {
      append: true,
      nextOffset: pagina.next ? Number(pagina.offset || 0) + Number(pagina.limit || 10) : null,
      onMore: (deslocamentoSeguinte) => carregarMaisAlbunsArtista(id, deslocamentoSeguinte, alvo)
    });
  }

  async function inicializarDownloads() {
    const secao = um("[data-device-library]");
    if (!secao) return;
    await montarDownloads(secao, estado.localPlayer, async musica => {
      // Desconectar o dispositivo Web Playback interrompe a faixa do Spotify nesta aba.
      if (estado.player !== estado.localPlayer) estado.spotifyPlayer.disconnect();
      estado.player = estado.localPlayer;
      estado.currentTrack = null;
      await estado.localPlayer.play(musica);
    }, () => {
      estado.localPlayer.stop();
      estado.player = estado.spotifyPlayer;
      zerarPlayer();
    });
  }

  function desenharPlayerLocal() {
    const local = estado.localPlayer;
    if (estado.player !== local || !local.current) return;
    const registro = local.current;
    if (um(".player-musica h4").dataset.localId !== registro.id) {
      atualizarMusicaAtual({ name: registro.title, artists: [{ name: registro.artist }] });
      um(".player-musica h4").dataset.localId = registro.id;
    }
    um(".player").classList.toggle("is-playing", !local.audio.paused);
    atualizarProgresso(local.audio.currentTime * 1000, local.duration);
  }

  function configurarMenuLateral() {
    um(".perfil")?.addEventListener("click", evento => {
      if (estado.user) return;
      evento.preventDefault();
      conectarSpotify();
    });
    const perfil = um(".perfil-nome");
    const rotulo = perfil && [...perfil.childNodes].find((no) => no.nodeType === Node.TEXT_NODE);
    if (rotulo && !estado.user) rotulo.textContent = "Conecte o Spotify";
    const alvoPlaylists = um("[data-spotify-playlists]");
    if (alvoPlaylists) alvoPlaylists.replaceChildren();
  }

  function configurarRadioGenero() {
    const radio = um("[data-spotify-radio]");
    radio?.addEventListener("click", (evento) => {
      const estacao = evento.target.closest(".estacao");
      if (!estacao) return;
      evento.preventDefault();
      const rotulo = um("h3", estacao)?.textContent.replace(/^(?:Rádio|Estilo)\s+/i, "").trim();
      const genero = estacao.dataset.genre || rotulo || "pop";
      const cabecalhoDestaque = um(".destaque h1");
      const descricaoDestaque = um(".destaque .destaque-texto > p:last-of-type");
      if (cabecalhoDestaque) cabecalhoDestaque.textContent = `Estilo: ${genero}`;
      if (descricaoDestaque) descricaoDestaque.textContent = "Faixas encontradas pela pesquisa do catálogo Spotify.";
      executarBusca(genero, "genre").catch((erro) => mostrarAviso(erro.message, true));
    });
  }

  function configurarTelaCheia() {
    const botao = um("[data-fullscreen]");
    if (!botao) return;
    const atualizarRotulo = () => {
      const ativo = Boolean(document.fullscreenElement);
      botao.setAttribute("aria-label", ativo ? "Sair da tela cheia" : "Tela cheia");
      botao.title = ativo ? "Sair da tela cheia" : "Tela cheia";
    };
    botao.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (erro) {
        mostrarAviso("O navegador não permitiu alternar para tela cheia.", true);
      }
    });
    document.addEventListener("fullscreenchange", atualizarRotulo);
    atualizarRotulo();
  }

  function configurarBotaoDestaque() {
    const botao = um(".destaque .botao-principal");
    if (!botao || !(enderecoPagina().pathname.endsWith("/") || enderecoPagina().pathname.endsWith("/index.html"))) return;
    botao.textContent = temSessao() ? "Explorar músicas" : "Conectar Spotify";
    botao.href = temSessao() ? "explorar.html" : "#conectar-spotify";
    botao.addEventListener("click", (evento) => {
      if (temSessao()) return;
      evento.preventDefault();
      conectarSpotify();
    });
  }

  function zerarPlayer() {
    const estrutura = um(".player");
    estrutura?.classList.remove("is-playing");
    const titulo = um(".player-musica h4");
    const artista = um(".player-musica p");
    const preencher = um(".barra-progresso > span");
    const atual = um(".player-progresso > span:first-child");
    const total = um(".player-progresso > span:last-child");
    if (titulo) { delete titulo.dataset.localId; titulo.textContent = "Nenhuma música selecionada"; }
    if (artista) artista.textContent = "Conecte o Spotify para começar";
    if (preencher) preencher.style.width = "0%";
    if (atual) atual.textContent = "0:00";
    if (total) total.textContent = "0:00";
  }

  async function inicializar() {
    const urlAtual = new URL(location.href);
    if (location.protocol !== "file:" && urlAtual.searchParams.get("conectar") === "1") {
      urlAtual.searchParams.delete("conectar");
      history.replaceState(null, "", urlAtual.href);
      if (!temSessao()) {
        try {
          await iniciarAutorizacao();
          return;
        } catch (erro) {
          sessionStorage.setItem("soundwave.spotify.notice", erro.message);
        }
      }
    }
    criarBotaoConectar();
    configurarMenuLateral();
    configurarControlesPlayer();
    configurarTelaCheia();
    zerarPlayer();
    if (um("[data-device-library]")) inicializarDownloads().catch(erro => mostrarAviso(erro.message, true));

    const avisoAutenticacao = location.protocol !== "file:" && sessionStorage.getItem("soundwave.spotify.notice");
    if (avisoAutenticacao) {
      sessionStorage.removeItem("soundwave.spotify.notice");
      mostrarAviso(avisoAutenticacao);
    }

    if (!temSessao()) {
      manterPlayerNaNavegacao(desenharPaginaVisitante);
      await desenharPaginaVisitante();
      if (avisoAutenticacao) { mostrarAviso(avisoAutenticacao, true); adicionarConfiguracoes(); }
      return;
    }

    try {
      estado.user = await obterPerfil();
      estado.spotifyPlayer.preload().catch(() => {}); // Tocar tenta carregar novamente se a rede falhar.
      if (estado.user.images?.[0]?.url) um(".perfil img").src = estado.user.images[0].url;
      atualizarBotaoConexao();
      limparAviso();
      const paginaPlaylist = await carregarPaginaPlaylists().catch(() => ({ playlists: [] }));
      desenharPlaylistsMenu(paginaPlaylist.playlists);
      manterPlayerNaNavegacao(desenharPagina);
      await desenharPagina();
    } catch (erro) {
      atualizarBotaoConexao();
      if (erro.status === 403 && !estado.user) {
        const detalhe = erro.detail ? " Resposta do Spotify: " + erro.detail : "";
        mostrarAviso("O login foi aceito, mas o Spotify negou a leitura do perfil (403 em /v1/me)." + detalhe
          + " Confira se o Premium está ativo na conta que criou o app e se o e-mail usado no login está autorizado em User Management.", true);
        const perfil = um(".perfil-nome");
        if (perfil) perfil.textContent = "Acesso à API bloqueado";
        const destaque = um(".destaque .botao-principal");
        if (destaque) destaque.hidden = true;
        const aviso = um(".spotify-status");
        const painel = elemento("a", "spotify-panel-link", "Abrir painel do app ↗");
        painel.href = "https://developer.spotify.com/dashboard/" + encodeURIComponent(obterClientId());
        painel.target = "_blank";
        painel.rel = "noopener";
        aviso.append(" ", painel);
        const tentarNovamente = elemento("button", "spotify-panel-link", "Tentar novamente");
        tentarNovamente.type = "button";
        tentarNovamente.onclick = () => location.reload();
        aviso.append(" ", tentarNovamente);
        const autorizar = elemento("button", "spotify-panel-link", "Reautorizar conta");
        autorizar.type = "button";
        autorizar.addEventListener("click", conectarSpotify);
        aviso.append(" ", autorizar);
        adicionarConfiguracoes();
        // O navegador pode restaurar a tela antiga sem fazer uma nova consulta ao perfil.
        window.addEventListener("pageshow", evento => {
          if (evento.persisted) location.reload();
        });
        configurarVisaoDesconectada("Indisponível enquanto o acesso ao Spotify estiver bloqueado.");
        if (um("[data-public-discovery]")) await inicializarPlaylists(false);
        return;
      }
      mostrarAviso(erro.message, true);
      configurarVisaoDesconectada(erro.message);
    }
  }

  async function desenharPaginaVisitante() {
    configurarBotaoDestaque();
    atualizarBotaoConexao();
    if (um("[data-device-library]")) {
      limparAviso();
      await inicializarDownloads();
      return;
    }
    mostrarAviso("Conecte sua conta Spotify para carregar sua biblioteca.");
    adicionarConfiguracoes();
    configurarVisaoDesconectada();
    if (um("[data-public-discovery]")) await inicializarPlaylists(false);
  }

  async function desenharPagina() {
    configurarBotaoDestaque();
    configurarRadioGenero();
    try {
      mostrarAviso("Carregando do Spotify…");
      const arquivo = enderecoPagina().pathname.split("/").pop() || "index.html";
      if (arquivo === "index.html") await inicializarBiblioteca();
      else if (arquivo === "explorar.html") await inicializarExplorar();
      else if (arquivo === "curtidas.html") await inicializarCurtidas();
      else if (arquivo === "recentes.html") await inicializarRecentes();
      else if (arquivo === "playlist.html") await inicializarPlaylists();
      else if (arquivo === "artista.html") await inicializarArtista();
      else if (arquivo === "downloads.html") await inicializarDownloads();
      else if (arquivo === "radio.html") {
        const cabecalho = um(".destaque h1");
        const descricao = um(".destaque .destaque-texto > p:last-of-type");
        if (cabecalho) cabecalho.textContent = "Rádio por estilo";
        if (descricao) descricao.textContent = "Escolha um atalho para pesquisar faixas reais no Spotify.";
        desenharVazio(um("[data-spotify-radio-results]"), "Escolha um estilo para pesquisar faixas reais no Spotify.");
      }
      if (um(".spotify-status")?.textContent === "Carregando do Spotify…") limparAviso();
    } catch (erro) {
      atualizarBotaoConexao();
      mostrarAviso(erro.message || "Não foi possível carregar dados do Spotify.", true);
      configurarVisaoDesconectada(erro.message);
    }
  }

  function configurarVisaoDesconectada(mensagem = "Conecte sua conta Spotify para carregar dados reais.") {
    const alvos = [
      "[data-spotify-tracks]", "[data-spotify-recent]", "[data-spotify-artists]", "[data-spotify-style-tracks]",
      "[data-spotify-favorites]", "[data-spotify-playlist-items]", "[data-spotify-artist-tracks]",
      "[data-spotify-artist-albums]", "[data-spotify-recent-tracks]",
      "[data-spotify-search-tracks]", "[data-spotify-search-artists]", "[data-spotify-search-albums]",
      "[data-spotify-playlists-page]", "[data-spotify-radio-results]", "[data-spotify-saved-albums]"
    ];
    alvos.forEach((seletor) => {
      const alvo = um(seletor);
      if (alvo && !alvo.hidden) desenharVazio(alvo, mensagem);
    });
  }

  inicializar().catch(erro => mostrarAviso(erro.message || "Falha ao iniciar o SoundWave.", true));
})();
