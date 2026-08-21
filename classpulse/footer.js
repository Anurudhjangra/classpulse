(function () {
  const SOCIAL = {
    snapchat: { label: "Snapchat", url: "https://www.snapchat.com/add/anirudh_jangra" },
    instagram: { label: "Instagram", url: "https://www.instagram.com/anirudh_jangra_" },
    whatsapp: { label: "WhatsApp", url: "https://wa.me/9050543063" },
  };

  const footer = document.createElement("footer");
  footer.className = "app-footer";
  footer.innerHTML =
    '<div class="foot-inner">' +
    '<div class="foot-brand">Made with <strong>ClassPulse</strong> &copy; 2025 Anirudh Jangra</div>' +
    '<div class="foot-contact"><span class="foot-label">Contact:</span>' +
    Object.values(SOCIAL)
      .map(
        (s, i) =>
          '<a class="foot-btn ' +
          ["foot-snapchat", "foot-instagram", "foot-whatsapp"][i] +
          '" href="' + s.url + '" target="_blank" rel="noopener">' + s.label + "</a>"
      )
      .join("") +
    "</div></div>";
  document.body.appendChild(footer);
})();
