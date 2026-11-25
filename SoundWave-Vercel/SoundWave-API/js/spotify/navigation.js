SoundWave.navegacao = (() => {
  "use strict";
  const nomes = ["index", "explorar", "artista", "curtidas", "playlist", "recentes", "downloads", "radio"];
  const paginas = new Set(nomes.map(nome => nome + ".html"));
  const diretorio = new URL("./", location.href);
  const modelosLocais = location.protocol === "file:" && document.querySelector("template[data-page]");

  function enderecoPagina() {
    if (modelosLocais) {
      const rota = new URLSearchParams(location.hash.slice(1)).get("tela");
      if (rota && paginas.has(rota.split("?")[0])) return new URL(rota, diretorio);
    }
    return new URL(location.href);
  }

  function paginaLocal(nome) {
    const modelo = document.querySelector('template[data-page="' + nome + '"]');
    return {
      content: modelo.content.firstElementChild.cloneNode(true),
      title: modelo.dataset.title,
      active: modelo.dataset.active
    };
  }

  async function paginaWeb(url) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error("Página indisponível");
    const pagina = new DOMParser().parseFromString(await resposta.text(), "text/html");
    return {
      content: pagina.querySelector("main.conteudo"),
      title: pagina.title,
      active: pagina.querySelector(".menu-lateral [aria-current]")?.getAttribute("href")
    };
  }

  function mostrarPagina(pagina) {
    document.querySelector("main.conteudo").replaceWith(pagina.content);
    document.title = pagina.title;
    document.querySelector("#menu-aberto").checked = false;
    for (const link of document.querySelectorAll(".menu-lateral a.menu-item")) {
      if (link.getAttribute("href") === pagina.active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
  }

  function manterPlayerNaNavegacao(desenharPagina) {
    if (location.protocol === "file:" && !modelosLocais) return;
    if (modelosLocais && location.hash.startsWith("#tela=")) {
      mostrarPagina(paginaLocal(enderecoPagina().pathname.split("/").pop()));
    }
    let pendente = Promise.resolve();
    function navegar(url, empurrar) {
      pendente = pendente.then(async () => {
        const nome = url.pathname.split("/").pop();
        const pagina = modelosLocais ? paginaLocal(nome) : await paginaWeb(url);
        if (!pagina.content) throw new Error("Página indisponível");
        if (empurrar) {
          const endereco = modelosLocais ? "#" + new URLSearchParams({ tela: nome + url.search }) : url;
          history.pushState(null, "", endereco);
        }
        mostrarPagina(pagina);
        await desenharPagina();
      }).catch(() => location.assign(url));
    }

    document.addEventListener("click", evento => {
      const link = evento.target.closest("a[href]");
      if (!link || evento.defaultPrevented || evento.button || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey || link.target || link.getAttribute("href").startsWith("#")) return;
      const url = new URL(link.href);
      if (new URL("./", url).href === diretorio.href && paginas.has(url.pathname.split("/").pop())) {
        evento.preventDefault();
        navegar(url, true);
      }
    });
    document.addEventListener("submit", evento => {
      const formulario = evento.target;
      if (!formulario.matches("form[role=search]")) return;
      evento.preventDefault();
      const url = new URL("explorar.html", diretorio);
      url.search = new URLSearchParams(new FormData(formulario)).toString();
      navegar(url, true);
    });
    window.addEventListener("popstate", () => navegar(enderecoPagina(), false));
  }
  return { manterPlayerNaNavegacao, enderecoPagina };
})();
