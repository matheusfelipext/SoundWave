SoundWave.player = (() => {
  "use strict";
  const { startPlayback, setRepeat: setRepeatRequest, setShuffle: setShuffleRequest } = SoundWave.api;
  const { getAccessToken } = SoundWave.auth;

  let sdkPromise;

  function loadSdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("O Spotify Web Playback SDK não carregou. Confira a conexão com a internet.")), 12000);
      window.onSpotifyWebPlaybackSDKReady = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Não consegui carregar o player oficial do Spotify."));
      };
      document.head.append(script);
    });
    return sdkPromise.catch((error) => { sdkPromise = null; throw error; });
  }

  class SpotifyPlayer {
    constructor({ onState, onMessage }) {
      this.onState = onState;
      this.onMessage = onMessage;
      this.instance = null;
      this.deviceId = "";
      this.playbackState = null;
      this.queue = [];
      this.shuffle = false;
      this.repeat = "off";
      this.readyPromise = null;
    }

    preload() {
      return loadSdk();
    }

    async connect() {
      if (this.deviceId && this.instance) return this.deviceId;
      if (!window.Spotify?.Player) await loadSdk();
      if (!this.instance) {
        let settled = false;
        let timeout;
        let rejectReady;
        const fail = (message) => {
          if (settled) { this.onMessage(message, true); return; }
          settled = true;
          window.clearTimeout(timeout);
          this.instance?.disconnect();
          this.instance = null;
          this.deviceId = "";
          rejectReady(new Error(message));
        };
        this.readyPromise = new Promise((resolve, reject) => {
          rejectReady = reject;
          timeout = window.setTimeout(() => fail("O Spotify Player não ficou pronto. Confira se sua conta tem Premium e tente novamente."), 15000);
          this.instance = new window.Spotify.Player({
            name: "SoundWave",
            volume: 0.75,
            getOAuthToken: (callback) => getAccessToken().then(callback).catch((error) => this.onMessage(error.message, true))
          });
          const player = this.instance;
          player.activateElement?.().catch(() => {});
          player.addListener("autoplay_failed", () => this.onMessage("O navegador aguardou sua interação. Clique em tocar para liberar o áudio.", true));
          player.addListener("ready", ({ device_id }) => {
            settled = true;
            window.clearTimeout(timeout);
            this.deviceId = device_id;
            this.onMessage("Player Spotify conectado neste navegador.");
            resolve(device_id);
          });
          player.addListener("not_ready", () => {
            this.deviceId = "";
            this.readyPromise = null;
            this.instance?.disconnect();
            this.instance = null;
            this.onMessage("O player Spotify ficou indisponível. Tente conectar novamente.", true);
          });
          player.addListener("player_state_changed", (state) => {
            this.playbackState = state;
            if (state) this.onState(state);
          });
          player.addListener("initialization_error", ({ message }) => fail(`Falha ao iniciar o player: ${message}`));
          player.addListener("authentication_error", ({ message }) => fail(`Falha de autenticação do player: ${message}. Conecte novamente.`));
          player.addListener("account_error", () => fail("O Spotify Web Playback SDK exige uma conta Spotify Premium ativa."));
          player.addListener("playback_error", ({ message }) => this.onMessage(`O Spotify não iniciou esta reprodução: ${message}`, true));
        });
        this.instance.connect().then((connected) => {
          if (!connected) fail("O Spotify Player não conseguiu conectar.");
        }).catch((error) => fail(error.message));
      }
      return this.deviceId || this.readyPromise;
    }

    async play(track, queue = []) {
      if (!track?.uri) throw new Error("Esta faixa não tem um Spotify URI reproduzível.");
      if (track.is_playable === false) throw new Error("O Spotify não disponibiliza esta faixa para sua conta.");
      this.instance?.activateElement?.().catch(() => {});
      const uniqueQueue = [...new Map([...(queue.length ? queue : [track]), track]
        .filter((item) => item?.uri && item.is_playable !== false)
        .map((item) => [item.uri, item])).values()];
      this.queue = uniqueQueue;
      const deviceId = await this.connect();
      const first = uniqueQueue.findIndex((item) => item.uri === track.uri);
      const ordered = uniqueQueue.slice(first).concat(uniqueQueue.slice(0, first));
      await startPlayback(deviceId, ordered.map((item) => item.uri));
    }

    async toggle() {
      if (!this.instance) throw new Error("Escolha uma faixa do Spotify para iniciar o player.");
      await this.instance.activateElement?.();
      await this.instance.togglePlay();
    }

    async next() {
      if (!this.instance) throw new Error("O player Spotify ainda não está conectado.");
      await this.instance.nextTrack();
    }

    async previous() {
      if (!this.instance) throw new Error("O player Spotify ainda não está conectado.");
      await this.instance.previousTrack();
    }

    async seek(positionMs) {
      if (!this.instance) return;
      await this.instance.seek(Math.max(0, Number(positionMs) || 0));
    }

    async setVolume(volume) {
      if (!this.instance) return;
      await this.instance.setVolume(Math.max(0, Math.min(1, Number(volume) || 0)));
    }

    async toggleShuffle() {
      if (!this.deviceId) throw new Error("Conecte o player Spotify antes de alterar o aleatório.");
      const enabled = !this.shuffle;
      await setShuffleRequest(this.deviceId, enabled);
      this.shuffle = enabled;
      return this.shuffle;
    }

    async cycleRepeat() {
      if (!this.deviceId) throw new Error("Conecte o player Spotify antes de alterar a repetição.");
      const mode = this.repeat === "off" ? "context" : this.repeat === "context" ? "track" : "off";
      await setRepeatRequest(this.deviceId, mode);
      this.repeat = mode;
      return this.repeat;
    }

    disconnect() {
      if (this.instance) this.instance.disconnect();
      this.instance = null;
      this.deviceId = "";
      this.playbackState = null;
    }
  }

  return {
    SpotifyPlayer
  };
})();
