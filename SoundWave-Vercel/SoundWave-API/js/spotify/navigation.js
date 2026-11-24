SoundWave.navigation = (() => {
  "use strict";
  const names = ["index", "explorar", "artista", "curtidas", "playlist", "recentes", "downloads", "radio"];
  const pages = new Set(names.map(name => name + ".html"));
  const directory = new URL("./", location.href);
  const localTemplates = location.protocol === "file:" && document.querySelector("template[data-page]");

  function pageAddress() {
    if (localTemplates) {
      const route = new URLSearchParams(location.hash.slice(1)).get("tela");
      if (route && pages.has(route.split("?")[0])) return new URL(route, directory);
    }
    return new URL(location.href);
  }

  function localPage(name) {
    const template = document.querySelector('template[data-page="' + name + '"]');
    return {
      content: template.content.firstElementChild.cloneNode(true),
      title: template.dataset.title,
      active: template.dataset.active
    };
  }

  async function webPage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Página indisponível");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    return {
      content: page.querySelector("main.conteudo"),
      title: page.title,
      active: page.querySelector(".menu-lateral [aria-current]")?.getAttribute("href")
    };
  }

  function showPage(page) {
    document.querySelector("main.conteudo").replaceWith(page.content);
    document.title = page.title;
    document.querySelector("#menu-aberto").checked = false;
    for (const link of document.querySelectorAll(".menu-lateral a.menu-item")) {
      if (link.getAttribute("href") === page.active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
  }

  function keepPlayerOnNavigation(renderPage) {
    if (location.protocol === "file:" && !localTemplates) return;
    if (localTemplates && location.hash.startsWith("#tela=")) {
      showPage(localPage(pageAddress().pathname.split("/").pop()));
    }
    let pending = Promise.resolve();
    function navigate(url, push) {
      pending = pending.then(async () => {
        const name = url.pathname.split("/").pop();
        const page = localTemplates ? localPage(name) : await webPage(url);
        if (!page.content) throw new Error("Página indisponível");
        if (push) {
          const address = localTemplates ? "#" + new URLSearchParams({ tela: name + url.search }) : url;
          history.pushState(null, "", address);
        }
        showPage(page);
        await renderPage();
      }).catch(() => location.assign(url));
    }

    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target || link.getAttribute("href").startsWith("#")) return;
      const url = new URL(link.href);
      if (new URL("./", url).href === directory.href && pages.has(url.pathname.split("/").pop())) {
        event.preventDefault();
        navigate(url, true);
      }
    });
    document.addEventListener("submit", event => {
      const form = event.target;
      if (!form.matches("form[role=search]")) return;
      event.preventDefault();
      const url = new URL("explorar.html", directory);
      url.search = new URLSearchParams(new FormData(form)).toString();
      navigate(url, true);
    });
    window.addEventListener("popstate", () => navigate(pageAddress(), false));
  }
  return { keepPlayerOnNavigation, pageAddress };
})();
