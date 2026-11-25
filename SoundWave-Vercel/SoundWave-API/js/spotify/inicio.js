// Um espaço compartilhado pelos scripts clássicos; as tags defer preservam a ordem.
window.SoundWave = {};

(() => {
  "use strict";
  const modoArquivo = location.protocol === "file:";
  const tema = document.getElementById("tema-escuro");
  const configuracoes = document.querySelector("[data-cookie-settings]");
  const chaveConsentimento = "soundwave_preferencias";
  const chaveTema = "soundwave_tema";
  const validade = 60 * 60 * 24 * 180;
  const caminhoCookie = new URL("./", location.href).pathname;
  const memoria = new Map();

  function lerPreferencia(chave) {
    try {
      if (modoArquivo) return localStorage.getItem(chave) ?? memoria.get(chave);
      const par = document.cookie.split("; ").find(item => item.startsWith(chave + "="));
      if (par) return par.slice(chave.length + 1);
    } catch { /* O tema continua disponível quando o armazenamento está bloqueado. */ }
    return memoria.get(chave);
  }

  function gravarPreferencia(chave, valor) {
    if (valor === null) memoria.delete(chave);
    else memoria.set(chave, valor);
    try {
      if (modoArquivo) {
        if (valor === null) localStorage.removeItem(chave);
        else localStorage.setItem(chave, valor);
        return;
      }
      const seguro = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = chave + "=" + (valor ?? "") + "; Path=" + caminhoCookie
        + "; Max-Age=" + (valor === null ? 0 : validade) + "; SameSite=Lax" + seguro;
    } catch { /* Em caso de bloqueio, a escolha vale durante esta página. */ }
  }

  function aplicarTema() {
    if (lerPreferencia(chaveConsentimento) === "aceitar") tema.checked = lerPreferencia(chaveTema) === "escuro";
  }
  aplicarTema();
  window.addEventListener("pageshow", aplicarTema);
  tema.addEventListener("change", () => {
    if (lerPreferencia(chaveConsentimento) === "aceitar") gravarPreferencia(chaveTema, tema.checked ? "escuro" : "claro");
  });

  function painelPreferencias() {
    const antigo = document.getElementById("sw-preferencias");
    if (antigo) return antigo;
    const caixa = document.createElement("section");
    caixa.id = "sw-preferencias";
    caixa.className = "sw-preferencias";
    caixa.setAttribute("aria-labelledby", "sw-cookie-titulo");
    caixa.innerHTML = '<h2 id="sw-cookie-titulo">Lembrar seu tema?</h2><p></p>'
      + '<div><button type="button" data-choice="aceitar">Aceitar preferências</button>'
      + '<button type="button" data-choice="recusar">Só o necessário</button></div>';
    caixa.querySelector("p").textContent = modoArquivo
      ? "Ao abrir pelo arquivo, guardamos sua escolha no armazenamento local do navegador. Se aceitar, também lembraremos o tema."
      : "Usamos um cookie para lembrar sua escolha por 180 dias. Se aceitar, outro cookie guarda o tema claro ou escuro.";
    caixa.addEventListener("click", evento => {
      const botao = evento.target.closest("[data-choice]");
      if (!botao) return;
      const escolha = botao.dataset.choice;
      gravarPreferencia(chaveConsentimento, escolha);
      gravarPreferencia(chaveTema, escolha === "aceitar" ? (tema.checked ? "escuro" : "claro") : null);
      caixa.remove();
      configuracoes?.focus();
    });
    document.body.append(caixa);
    return caixa;
  }
  configuracoes?.addEventListener("click", () => painelPreferencias().querySelector("button").focus());
  if (configuracoes && !lerPreferencia(chaveConsentimento)) painelPreferencias();

  // O endereço de uma instalação HTTPS pode ser definido aqui ao publicar o projeto.
  const inicioPublicado = "https://soundwave-matheus.vercel.app/index.html";
  SoundWave.abrirConexaoWeb = function abrirConexaoWeb() {
    if (inicioPublicado) {
      const destino = new URL(inicioPublicado);
      destino.searchParams.set("conectar", "1");
      location.assign(destino.href);
      return;
    }
    let dialogo = document.getElementById("sw-conexao-web");
    if (!dialogo) {
      dialogo = document.createElement("dialog");
      dialogo.id = "sw-conexao-web";
      dialogo.className = "spotify-dialog";
      dialogo.setAttribute("aria-labelledby", "sw-conexao-titulo");
      dialogo.innerHTML = '<form class="spotify-dialog-form"><h2 id="sw-conexao-titulo">Conectar ao Spotify</h2>'
        + '<p>Esta cópia está aberta como arquivo. Para o Spotify poder voltar após a autorização, abra este mesmo projeto em um endereço web.</p>'
        + '<p>No VS Code, abra a pasta extraída e clique em <strong>Go Live</strong> com a extensão Live Server. Ou use o endereço HTTPS da sua cópia publicada.</p>'
        + '<label for="sw-endereco">Endereço do SoundWave em execução</label>'
        + '<input id="sw-endereco" type="url" value="http://127.0.0.1:5517/index.html" required>'
        + '<p class="spotify-dialog-help" role="status"></p>'
        + '<div class="spotify-dialog-actions"><button type="button" data-cancel>Voltar</button>'
        + '<button class="botao-principal" type="submit">Continuar para o login</button></div></form>';
      document.body.append(dialogo);
      const campo = dialogo.querySelector("input");
      const retornoVisual = dialogo.querySelector("[role=status]");
      function destino() {
        const url = new URL(campo.value);
        if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
        if (!url.pathname.endsWith(".html")) url.pathname = url.pathname.replace(/\/?$/, "/") + "index.html";
        url.search = "";
        url.hash = "";
        return url;
      }
      function descrever() {
        try { retornoVisual.textContent = "No painel do seu app Spotify, cadastre o retorno " + new URL("callback.html", destino()).href; }
        catch { retornoVisual.textContent = "Use HTTPS ou o endereço local 127.0.0.1 do Live Server."; }
      }
      campo.addEventListener("input", descrever);
      descrever();
      dialogo.querySelector("[data-cancel]").onclick = () => dialogo.close();
      dialogo.querySelector("form").onsubmit = evento => {
        evento.preventDefault();
        try {
          const url = destino();
          url.searchParams.set("conectar", "1");
          location.assign(url.href);
        } catch { descrever(); campo.focus(); }
      };
    }
    dialogo.showModal();
  };
})();
