SoundWave.deviceMusic = (() => {
  "use strict";
  let database;

  function openLibrary() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open("soundwave-local-library", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("tracks", { keyPath: "id" });
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => { database = null; throw error; });
    return database;
  }

  async function transaction(mode, operation) {
    const db = await openLibrary();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", mode);
      const result = operation(tx.objectStore("tracks"));
      tx.oncomplete = () => resolve(result());
      tx.onabort = () => reject(tx.error || new Error("A gravação foi interrompida."));
    });
  }

  function importFiles(files) {
    return transaction("readwrite", store => {
      let added = 0;
      for (const file of files) {
        const name = file.name.replace(/\.[^.]+$/, "");
        const parts = name.split(" - ");
        const artist = parts.length > 1 ? parts.shift().trim() : "Arquivo do dispositivo";
        const id = [file.name, file.size, file.lastModified].join("::");
        const request = store.add({ id, title: parts.join(" - ").trim() || file.name, artist, file });
        request.onsuccess = () => added++;
        request.onerror = event => {
          if (request.error.name === "ConstraintError") event.preventDefault();
        };
      }
      return () => added;
    });
  }

  class DevicePlayer {
    constructor(onChange, onError) {
      this.audio = new Audio();
      this.audio.volume = 0.75;
      this.tracks = [];
      this.current = null;
      this.shuffle = false;
      this.repeat = "off";
      this.url = "";
      for (const event of ["playing", "pause", "timeupdate", "loadedmetadata", "durationchange"]) {
        this.audio.addEventListener(event, onChange);
      }
      this.audio.addEventListener("ended", () => {
        if (this.repeat === "track") this.play(this.current).catch(onError);
        else if (this.repeat === "context" || this.index < this.tracks.length - 1) this.next().catch(onError);
        else onChange();
      });
      this.audio.addEventListener("error", () => {
        if (this.current) onError(new Error("O navegador não conseguiu reproduzir este arquivo."));
      });
    }

    get index() { return this.tracks.findIndex(track => track.id === this.current?.id); }
    get duration() { return (this.audio.duration || 0) * 1000; }

    async play(track) {
      if (!track) return;
      this.stop();
      this.current = track;
      this.url = URL.createObjectURL(track.file);
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
      const count = this.tracks.length;
      const step = this.shuffle && count > 1 ? 1 + Math.floor(Math.random() * (count - 1)) : 1;
      return this.play(this.tracks[(this.index + step) % count]);
    }
    previous() { return this.play(this.tracks[(this.index + this.tracks.length - 1) % this.tracks.length]); }
    async seek(ms) { this.audio.currentTime = ms / 1000; }
    async setVolume(value) { this.audio.volume = value; }
    toggleShuffle() { this.shuffle = !this.shuffle; return this.shuffle; }
    cycleRepeat() {
      this.repeat = this.repeat === "off" ? "context" : this.repeat === "context" ? "track" : "off";
      return this.repeat;
    }
  }

  async function mountDownloads(section, player, onPlay, onRemove) {
    if (section.dataset.mounted) return;
    section.dataset.mounted = "true";
    const input = section.querySelector("input");
    const list = section.querySelector("ul");
    const status = section.querySelector("[role=status]");
    const showError = error => {
      status.textContent = error.name === "QuotaExceededError" ? "Não há espaço suficiente no navegador para salvar esses arquivos."
        : "Não foi possível acessar as músicas neste navegador. " + error.message;
    };

    async function refresh() {
      const tracks = await transaction("readonly", store => {
        const request = store.getAll();
        return () => request.result;
      });
      if (!section.isConnected) return;
      player.tracks = tracks.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
      list.replaceChildren();
      if (!tracks.length) {
        const empty = document.createElement("li");
        empty.textContent = "Nenhum arquivo importado.";
        list.append(empty);
      }
      for (const track of tracks) {
        const row = document.createElement("li");
        const play = document.createElement("button");
        play.type = "button";
        play.className = "spotify-play-inline";
        play.setAttribute("aria-label", "Tocar " + track.title);
        play.textContent = "▶";
        play.onclick = () => onPlay(track).catch(showError);
        const text = document.createElement("div");
        const title = document.createElement("strong");
        const artist = document.createElement("small");
        title.textContent = track.title;
        artist.textContent = track.artist;
        text.append(title, artist);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remover";
        remove.setAttribute("aria-label", "Remover " + track.title + " do SoundWave");
        remove.onclick = async () => {
          remove.disabled = true;
          try {
            await transaction("readwrite", store => { store.delete(track.id); return () => null; });
            if (track.id === player.current?.id) onRemove();
            await refresh();
            status.textContent = "Arquivo removido da biblioteca do SoundWave.";
          } catch (error) { remove.disabled = false; showError(error); }
        };
        row.append(play, text, remove);
        list.append(row);
      }
    }

    input.addEventListener("change", async () => {
      const selected = Array.from(input.files);
      if (!selected.length) return;
      input.disabled = true;
      status.textContent = "Salvando arquivos…";
      const files = selected.filter(file => file.size && (file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|flac|ogg|opus|weba|aif|aiff)$/i.test(file.name)));
      try {
        const added = files.length ? await importFiles(files) : 0;
        await refresh();
        const duplicates = files.length - added;
        const skipped = selected.length - files.length;
        status.textContent = "Arquivos adicionados: " + added + "." + (duplicates ? " Já salvos: " + duplicates + "." : "") + (skipped ? " Ignorados (vazios ou sem áudio): " + skipped + "." : "");
      } catch (error) { showError(error); }
      finally { input.disabled = false; input.value = ""; }
    });
    try { await refresh(); } catch (error) { showError(error); }
  }

  return {
    DevicePlayer, mountDownloads
  };
})();
