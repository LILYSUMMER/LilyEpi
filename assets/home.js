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

  document.querySelectorAll("[data-metrics]").forEach(function (node) {
    function ready(value) {
      var text = (value || "").trim();
      if (!text || text.indexOf("{{") !== -1) return "";
      return text;
    }

    var participants = ready(node.getAttribute("data-participants"));
    var coupons = ready(node.getAttribute("data-coupons"));
    if (!participants && !coupons) return;

    var parts = [];
    if (participants) {
      parts.push(node.getAttribute("data-participants-label").replace(/\{\{[^}]+\}\}/, participants));
    }
    if (coupons) {
      parts.push(node.getAttribute("data-coupons-label").replace(/\{\{[^}]+\}\}/, coupons));
    }
    node.textContent = parts.join(" · ");
    node.hidden = false;
  });
})();
