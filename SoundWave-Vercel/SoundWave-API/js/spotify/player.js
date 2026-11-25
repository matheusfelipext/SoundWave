SoundWave.tocador = (() => {
  "use strict";
  const { iniciarReproducao, definirRepetir: requisicaoDefinirRepetir, definirAleatorio: requisicaoDefinirAleatorio } = SoundWave.api;
  const { obterTokenAcesso } = SoundWave.autenticacao;

  let promessaSdk;

  function carregarSdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    if (promessaSdk) return promessaSdk;

    promessaSdk = new Promise((resolve, reject) => {
      const tempoLimite = window.setTimeout(() => reject(new Error("O Spotify Web Playback SDK não carregou. Confira a conexão com a internet.")), 12000);
      window.onSpotifyWebPlaybackSDKReady = () => {
        window.clearTimeout(tempoLimite);
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(tempoLimite);
        reject(new Error("Não consegui carregar o player oficial do Spotify."));
      };
      document.head.append(script);
    });
    return promessaSdk.catch((erro) => { promessaSdk = null; throw erro; });
  }

  class TocadorSpotify {
    constructor({ onState: aoEstado, onMessage: aoMensagem }) {
      this.onState = aoEstado;
      this.onMessage = aoMensagem;
      this.instance = null;
      this.deviceId = "";
      this.playbackState = null;
      this.queue = [];
      this.shuffle = false;
      this.repeat = "off";
      this.readyPromise = null;
    }

    preload() {
      return carregarSdk();
    }

    async connect() {
      if (this.deviceId && this.instance) return this.deviceId;
      if (!window.Spotify?.Player) await carregarSdk();
      if (!this.instance) {
        let resolvido = false;
        let tempoLimite;
        let rejeitarPronto;
        const falhar = (mensagem) => {
          if (resolvido) { this.onMessage(mensagem, true); return; }
          resolvido = true;
          window.clearTimeout(tempoLimite);
          this.instance?.disconnect();
          this.instance = null;
          this.deviceId = "";
          rejeitarPronto(new Error(mensagem));
        };
        this.readyPromise = new Promise((resolve, reject) => {
          rejeitarPronto = reject;
          tempoLimite = window.setTimeout(() => falhar("O Spotify Player não ficou pronto. Confira se sua conta tem Premium e tente novamente."), 15000);
          this.instance = new window.Spotify.Player({
            name: "SoundWave",
            volume: 0.75,
            getOAuthToken: (retorno) => obterTokenAcesso().then(retorno).catch((erro) => this.onMessage(erro.message, true))
          });
          const tocador = this.instance;
          tocador.activateElement?.().catch(() => {});
          tocador.addListener("autoplay_failed", () => this.onMessage("O navegador aguardou sua interação. Clique em tocar para liberar o áudio.", true));
          tocador.addListener("ready", ({ device_id }) => {
            resolvido = true;
            window.clearTimeout(tempoLimite);
            this.deviceId = device_id;
            this.onMessage("Player Spotify conectado neste navegador.");
            resolve(device_id);
          });
          tocador.addListener("not_ready", () => {
            this.deviceId = "";
            this.readyPromise = null;
            this.instance?.disconnect();
            this.instance = null;
            this.onMessage("O player Spotify ficou indisponível. Tente conectar novamente.", true);
          });
          tocador.addListener("player_state_changed", (estado) => {
            this.playbackState = estado;
            if (estado) this.onState(estado);
          });
          tocador.addListener("initialization_error", ({ message: mensagem }) => falhar(`Falha ao iniciar o player: ${mensagem}`));
          tocador.addListener("authentication_error", ({ message: mensagem }) => falhar(`Falha de autenticação do player: ${mensagem}. Conecte novamente.`));
          tocador.addListener("account_error", () => falhar("O Spotify Web Playback SDK exige uma conta Spotify Premium ativa."));
          tocador.addListener("playback_error", ({ message: mensagem }) => this.onMessage(`O Spotify não iniciou esta reprodução: ${mensagem}`, true));
        });
        this.instance.connect().then((conectado) => {
          if (!conectado) falhar("O Spotify Player não conseguiu conectar.");
        }).catch((erro) => falhar(erro.message));
      }
      return this.deviceId || this.readyPromise;
    }

    async play(musica, fila = []) {
      if (!musica?.uri) throw new Error("Esta faixa não tem um Spotify URI reproduzível.");
      if (musica.is_playable === false) throw new Error("O Spotify não disponibiliza esta faixa para sua conta.");
      this.instance?.activateElement?.().catch(() => {});
      const filaUnica = [...new Map([...(fila.length ? fila : [musica]), musica]
        .filter((item) => item?.uri && item.is_playable !== false)
        .map((item) => [item.uri, item])).values()];
      this.queue = filaUnica;
      const idDispositivo = await this.connect();
      const primeiro = filaUnica.findIndex((item) => item.uri === musica.uri);
      const ordenado = filaUnica.slice(primeiro).concat(filaUnica.slice(0, primeiro));
      await iniciarReproducao(idDispositivo, ordenado.map((item) => item.uri));
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

    async seek(posicaoMs) {
      if (!this.instance) return;
      await this.instance.seek(Math.max(0, Number(posicaoMs) || 0));
    }

    async setVolume(volume) {
      if (!this.instance) return;
      await this.instance.setVolume(Math.max(0, Math.min(1, Number(volume) || 0)));
    }

    async toggleShuffle() {
      if (!this.deviceId) throw new Error("Conecte o player Spotify antes de alterar o aleatório.");
      const habilitado = !this.shuffle;
      await requisicaoDefinirAleatorio(this.deviceId, habilitado);
      this.shuffle = habilitado;
      return this.shuffle;
    }

    async cycleRepeat() {
      if (!this.deviceId) throw new Error("Conecte o player Spotify antes de alterar a repetição.");
      const modo = this.repeat === "off" ? "context" : this.repeat === "context" ? "track" : "off";
      await requisicaoDefinirRepetir(this.deviceId, modo);
      this.repeat = modo;
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
    TocadorSpotify
  };
})();
