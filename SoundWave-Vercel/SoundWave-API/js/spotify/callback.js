(() => {
  "use strict";
  const { completeAuthorization } = SoundWave.auth;

  const message = document.querySelector("[data-callback-message]");

  completeAuthorization().then((handled) => {
    if (!handled && message) message.textContent = "Não encontrei uma resposta de autorização. Volte ao SoundWave e conecte o Spotify novamente.";
  }).catch((error) => {
    if (message) message.textContent = error.message || "Não foi possível concluir a conexão com o Spotify.";
    const retry = document.querySelector("[data-callback-retry]");
    if (retry) retry.hidden = false;
  });
})();
