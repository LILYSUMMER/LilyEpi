(function () {
  var button = document.querySelector("[data-menu-button]");
  var menu = document.querySelector("[data-menu]");

  function closeMenu() {
    if (!button || !menu) return;
    menu.setAttribute("hidden", "");
    button.setAttribute("aria-expanded", "false");
  }

  if (button && menu) {
    button.addEventListener("click", function () {
      var willOpen = menu.hasAttribute("hidden");
      if (willOpen) menu.removeAttribute("hidden");
      else menu.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hasAttribute("hidden")) {
        closeMenu();
        button.focus();
      }
    });
  }

  var url = (document.body.getAttribute("data-video-url") || "").trim();
  var soon = document.body.getAttribute("data-soon") || "Coming soon";
  var dialog = document.getElementById("walkthrough");
  var frame = dialog ? dialog.querySelector("[data-dialog-frame]") : null;

  function youtubeId(value) {
    var match = String(value).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
    return match ? match[1] : "";
  }

  function openWalkthrough() {
    if (!dialog || !frame || !url) return;
    frame.replaceChildren();
    var id = youtubeId(url);
    if (id) {
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube.com/embed/" + id;
      iframe.title = dialog.querySelector("#walkthrough-title").textContent;
      iframe.allowFullscreen = true;
      frame.appendChild(iframe);
    } else {
      var video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      frame.appendChild(video);
    }
    dialog.showModal();
  }

  document.querySelectorAll(".js-watch").forEach(function (node) {
    if (!url) {
      node.setAttribute("aria-disabled", "true");
      var note = document.createElement("span");
      note.className = "soon";
      note.textContent = soon;
      node.insertAdjacentElement("afterend", note);
      return;
    }
    node.addEventListener("click", function () {
      closeMenu();
      openWalkthrough();
    });
  });

  if (dialog) {
    dialog.querySelector("[data-dialog-close]").addEventListener("click", function () {
      dialog.close();
    });
    dialog.addEventListener("close", function () {
      if (frame) frame.replaceChildren();
    });
  }
})();
