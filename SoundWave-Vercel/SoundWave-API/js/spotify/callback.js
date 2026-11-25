(() => {
  "use strict";
  const { concluirAutorizacao } = SoundWave.autenticacao;

  const mensagem = document.querySelector("[data-callback-message]");

  concluirAutorizacao().then((tratado) => {
    if (!tratado && mensagem) mensagem.textContent = "Não encontrei uma resposta de autorização. Volte ao SoundWave e conecte o Spotify novamente.";
  }).catch((erro) => {
    if (mensagem) mensagem.textContent = erro.message || "Não foi possível concluir a conexão com o Spotify.";
    const tentarNovamente = document.querySelector("[data-callback-retry]");
    if (tentarNovamente) tentarNovamente.hidden = false;
  });
})();
