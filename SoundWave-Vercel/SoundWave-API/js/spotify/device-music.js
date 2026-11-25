SoundWave.musicasDispositivo = (() => {
  "use strict";
  let bancoDados;

  function abrirBiblioteca() {
    if (!bancoDados) bancoDados = new Promise((resolve, reject) => {
      const requisitar = indexedDB.open("soundwave-local-library", 1);
      requisitar.onupgradeneeded = () => requisitar.result.createObjectStore("tracks", { keyPath: "id" });
      requisitar.onsuccess = () => {
        const db = requisitar.result;
        db.onversionchange = () => { db.close(); bancoDados = null; };
        resolve(db);
      };
      requisitar.onerror = () => reject(requisitar.error);
    }).catch(erro => { bancoDados = null; throw erro; });
    return bancoDados;
  }

  async function transaction(modo, operacao) {
    const db = await abrirBiblioteca();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", modo);
      const resultado = operacao(tx.objectStore("tracks"));
      tx.oncomplete = () => resolve(resultado());
      tx.onabort = () => reject(tx.error || new Error("A gravação foi interrompida."));
    });
  }

  function importarArquivos(arquivos) {
    return transaction("readwrite", armazenamento => {
      let adicionados = 0;
      for (const arquivo of arquivos) {
        const nome = arquivo.name.replace(/\.[^.]+$/, "");
        const partes = nome.split(" - ");
        const artista = partes.length > 1 ? partes.shift().trim() : "Arquivo do dispositivo";
        const id = [arquivo.name, arquivo.size, arquivo.lastModified].join("::");
        const requisitar = armazenamento.add({ id: id, title: partes.join(" - ").trim() || arquivo.name, artist: artista, file: arquivo });
        requisitar.onsuccess = () => adicionados++;
        requisitar.onerror = evento => {
          if (requisitar.error.name === "ConstraintError") evento.preventDefault();
        };
      }
      return () => adicionados;
    });
  }

  class TocadorDispositivo {
    constructor(aoMudar, aoErrar) {
      this.audio = new Audio();
      this.audio.volume = 0.75;
      this.tracks = [];
      this.current = null;
      this.shuffle = false;
      this.repeat = "off";
      this.url = "";
      for (const evento of ["playing", "pause", "timeupdate", "loadedmetadata", "durationchange"]) {
        this.audio.addEventListener(evento, aoMudar);
      }
      this.audio.addEventListener("ended", () => {
        if (this.repeat === "track") this.play(this.current).catch(aoErrar);
        else if (this.repeat === "context" || this.index < this.tracks.length - 1) this.next().catch(aoErrar);
        else aoMudar();
      });
      this.audio.addEventListener("error", () => {
        if (this.current) aoErrar(new Error("O navegador não conseguiu reproduzir este arquivo."));
      });
    }

    get index() { return this.tracks.findIndex(musica => musica.id === this.current?.id); }
    get duration() { return (this.audio.duration || 0) * 1000; }

    async play(musica) {
      if (!musica) return;
      this.stop();
      this.current = musica;
      this.url = URL.createObjectURL(musica.file);
      this.audio.src = this.url;
      await this.audio.play();
    }

    stop() {
      this.current = null;
      this.audio.pause();
      if (this.url) {
        this.audio.removeAttribute("src");
        this.audio.load();
        URL.revokeObjectURL(this.url);
        this.url = "";
      }
    }

    toggle() { return this.audio.paused ? this.audio.play() : this.audio.pause(); }
    next() {
      const quantidade = this.tracks.length;
      const passo = this.shuffle && quantidade > 1 ? 1 + Math.floor(Math.random() * (quantidade - 1)) : 1;
      return this.play(this.tracks[(this.index + passo) % quantidade]);
    }
    previous() { return this.play(this.tracks[(this.index + this.tracks.length - 1) % this.tracks.length]); }
    async seek(ms) { this.audio.currentTime = ms / 1000; }
    async setVolume(valor) { this.audio.volume = valor; }
    toggleShuffle() { this.shuffle = !this.shuffle; return this.shuffle; }
    cycleRepeat() {
      this.repeat = this.repeat === "off" ? "context" : this.repeat === "context" ? "track" : "off";
      return this.repeat;
    }
  }

  async function montarDownloads(secao, tocador, aoTocar, aoRemover) {
    if (secao.dataset.mounted) return;
    secao.dataset.mounted = "true";
    const campo = secao.querySelector("input");
    const lista = secao.querySelector("ul");
    const status = secao.querySelector("[role=status]");
    const mostrarErro = erro => {
      status.textContent = erro.name === "QuotaExceededError" ? "Não há espaço suficiente no navegador para salvar esses arquivos."
        : "Não foi possível acessar as músicas neste navegador. " + erro.message;
    };

    async function refresh() {
      const musicas = await transaction("readonly", armazenamento => {
        const requisitar = armazenamento.getAll();
        return () => requisitar.result;
      });
      if (!secao.isConnected) return;
      tocador.tracks = musicas.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
      lista.replaceChildren();
      if (!musicas.length) {
        const vazio = document.createElement("li");
        vazio.textContent = "Nenhum arquivo importado.";
        lista.append(vazio);
      }
      for (const musica of musicas) {
        const linha = document.createElement("li");
        const tocar = document.createElement("button");
        tocar.type = "button";
        tocar.className = "spotify-play-inline";
        tocar.setAttribute("aria-label", "Tocar " + musica.title);
        tocar.textContent = "▶";
        tocar.onclick = () => aoTocar(musica).catch(mostrarErro);
        const texto = document.createElement("div");
        const titulo = document.createElement("strong");
        const artista = document.createElement("small");
        titulo.textContent = musica.title;
        artista.textContent = musica.artist;
        texto.append(titulo, artista);
        const remover = document.createElement("button");
        remover.type = "button";
        remover.textContent = "Remover";
        remover.setAttribute("aria-label", "Remover " + musica.title + " do SoundWave");
        remover.onclick = async () => {
          remover.disabled = true;
          try {
            await transaction("readwrite", armazenamento => { armazenamento.delete(musica.id); return () => null; });
            if (musica.id === tocador.current?.id) aoRemover();
            await refresh();
            status.textContent = "Arquivo removido da biblioteca do SoundWave.";
          } catch (erro) { remover.disabled = false; mostrarErro(erro); }
        };
        linha.append(tocar, texto, remover);
        lista.append(linha);
      }
    }

    campo.addEventListener("change", async () => {
      const selecionados = Array.from(campo.files);
      if (!selecionados.length) return;
      campo.disabled = true;
      status.textContent = "Salvando arquivos…";
      const arquivos = selecionados.filter(arquivo => arquivo.size && (arquivo.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|flac|ogg|opus|weba|aif|aiff)$/i.test(arquivo.name)));
      try {
        const adicionados = arquivos.length ? await importarArquivos(arquivos) : 0;
        await refresh();
        const duplicados = arquivos.length - adicionados;
        const ignorados = selecionados.length - arquivos.length;
        status.textContent = "Arquivos adicionados: " + adicionados + "." + (duplicados ? " Já salvos: " + duplicados + "." : "") + (ignorados ? " Ignorados (vazios ou sem áudio): " + ignorados + "." : "");
      } catch (erro) { mostrarErro(erro); }
      finally { campo.disabled = false; campo.value = ""; }
    });
    try { await refresh(); } catch (erro) { mostrarErro(erro); }
  }

  return {
    TocadorDispositivo, montarDownloads
  };
})();
