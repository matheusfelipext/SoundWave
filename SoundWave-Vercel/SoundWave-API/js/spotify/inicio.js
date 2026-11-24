// Um espaço compartilhado pelos scripts clássicos; as tags defer preservam a ordem.
window.SoundWave = {};

(() => {
  "use strict";
  const fileMode = location.protocol === "file:";
  const theme = document.getElementById("tema-escuro");
  const settings = document.querySelector("[data-cookie-settings]");
  const consentKey = "soundwave_preferencias";
  const themeKey = "soundwave_tema";
  const lifetime = 60 * 60 * 24 * 180;
  const cookiePath = new URL("./", location.href).pathname;
  const memory = new Map();

  function readPreference(key) {
    try {
      if (fileMode) return localStorage.getItem(key) ?? memory.get(key);
      const pair = document.cookie.split("; ").find(item => item.startsWith(key + "="));
      if (pair) return pair.slice(key.length + 1);
    } catch { /* O tema continua disponível quando o armazenamento está bloqueado. */ }
    return memory.get(key);
  }

  function writePreference(key, value) {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    try {
      if (fileMode) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        return;
      }
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = key + "=" + (value ?? "") + "; Path=" + cookiePath
        + "; Max-Age=" + (value === null ? 0 : lifetime) + "; SameSite=Lax" + secure;
    } catch { /* Em caso de bloqueio, a escolha vale durante esta página. */ }
  }

  function applyTheme() {
    if (readPreference(consentKey) === "aceitar") theme.checked = readPreference(themeKey) === "escuro";
  }
  applyTheme();
  window.addEventListener("pageshow", applyTheme);
  theme.addEventListener("change", () => {
    if (readPreference(consentKey) === "aceitar") writePreference(themeKey, theme.checked ? "escuro" : "claro");
  });

  function preferencePanel() {
    const old = document.getElementById("sw-preferencias");
    if (old) return old;
    const box = document.createElement("section");
    box.id = "sw-preferencias";
    box.className = "sw-preferencias";
    box.setAttribute("aria-labelledby", "sw-cookie-titulo");
    box.innerHTML = '<h2 id="sw-cookie-titulo">Lembrar seu tema?</h2><p></p>'
      + '<div><button type="button" data-choice="aceitar">Aceitar preferências</button>'
      + '<button type="button" data-choice="recusar">Só o necessário</button></div>';
    box.querySelector("p").textContent = fileMode
      ? "Ao abrir pelo arquivo, guardamos sua escolha no armazenamento local do navegador. Se aceitar, também lembraremos o tema."
      : "Usamos um cookie para lembrar sua escolha por 180 dias. Se aceitar, outro cookie guarda o tema claro ou escuro.";
    box.addEventListener("click", event => {
      const button = event.target.closest("[data-choice]");
      if (!button) return;
      const choice = button.dataset.choice;
      writePreference(consentKey, choice);
      writePreference(themeKey, choice === "aceitar" ? (theme.checked ? "escuro" : "claro") : null);
      box.remove();
      settings?.focus();
    });
    document.body.append(box);
    return box;
  }
  settings?.addEventListener("click", () => preferencePanel().querySelector("button").focus());
  if (settings && !readPreference(consentKey)) preferencePanel();

  // O endereço de uma instalação HTTPS pode ser definido aqui ao publicar o projeto.
  const publishedHome = "https://soundwave-api-matheus.vercel.app/index.html";
  SoundWave.openWebConnection = function openWebConnection() {
    if (publishedHome) {
      const destination = new URL(publishedHome);
      destination.searchParams.set("conectar", "1");
      location.assign(destination.href);
      return;
    }
    let dialog = document.getElementById("sw-conexao-web");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "sw-conexao-web";
      dialog.className = "spotify-dialog";
      dialog.setAttribute("aria-labelledby", "sw-conexao-titulo");
      dialog.innerHTML = '<form class="spotify-dialog-form"><h2 id="sw-conexao-titulo">Conectar ao Spotify</h2>'
        + '<p>Esta cópia está aberta como arquivo. Para o Spotify poder voltar após a autorização, abra este mesmo projeto em um endereço web.</p>'
        + '<p>No VS Code, abra a pasta extraída e clique em <strong>Go Live</strong> com a extensão Live Server. Ou use o endereço HTTPS da sua cópia publicada.</p>'
        + '<label for="sw-endereco">Endereço do SoundWave em execução</label>'
        + '<input id="sw-endereco" type="url" value="http://127.0.0.1:5517/index.html" required>'
        + '<p class="spotify-dialog-help" role="status"></p>'
        + '<div class="spotify-dialog-actions"><button type="button" data-cancel>Voltar</button>'
        + '<button class="botao-principal" type="submit">Continuar para o login</button></div></form>';
      document.body.append(dialog);
      const input = dialog.querySelector("input");
      const feedback = dialog.querySelector("[role=status]");
      function destination() {
        const url = new URL(input.value);
        if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
        if (!url.pathname.endsWith(".html")) url.pathname = url.pathname.replace(/\/?$/, "/") + "index.html";
        url.search = "";
        url.hash = "";
        return url;
      }
      function describe() {
        try { feedback.textContent = "No painel do seu app Spotify, cadastre o retorno " + new URL("callback.html", destination()).href; }
        catch { feedback.textContent = "Use HTTPS ou o endereço local 127.0.0.1 do Live Server."; }
      }
      input.addEventListener("input", describe);
      describe();
      dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
      dialog.querySelector("form").onsubmit = event => {
        event.preventDefault();
        try {
          const url = destination();
          url.searchParams.set("conectar", "1");
          location.assign(url.href);
        } catch { describe(); input.focus(); }
      };
    }
    dialog.showModal();
  };
})();
