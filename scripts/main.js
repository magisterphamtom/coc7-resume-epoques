const MODULE_ID = "coc7-resume-epoques";
const VIEWER_ID = "coc7-resume-epoques-viewer";
const SOCKET = `module.${MODULE_ID}`;
const BASCULE_ID = "coc7-bascule-epoque";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Les deux époques (mêmes clés que le module Bascule d'époque). */
const ERAS = ["1933", "modern"];
const DEFAULT_LABELS = { "1933": "1933", modern: "2025-2026" };

/** Dossier des résumés du monde courant. */
const baseDir = () => `worlds/${game.world.id}/resume`;

/** Normalise le champ « epoque » de index.json : 1933 → "1933", tout le reste → "modern". */
const normEra = (value) => (String(value ?? "").trim() === "1933" ? "1933" : "modern");

/** Nom affiché d'une époque (celui de Bascule d'époque s'il est actif). */
function eraLabel(era) {
  const fromBascule = game.modules.get(BASCULE_ID)?.active
    ? game.settings.get(BASCULE_ID, "config")?.[era]?.label
    : "";
  return fromBascule || DEFAULT_LABELS[era];
}

/** Époque en cours de la table (Bascule d'époque), ou null. */
function currentEra() {
  if (!game.modules.get(BASCULE_ID)?.active) return null;
  try {
    const era = game.settings.get(BASCULE_ID, "currentEra");
    return ERAS.includes(era) ? era : null;
  } catch {
    return null;
  }
}

/** Date de dernière modification d'un fichier, ou null s'il est introuvable. */
async function fetchStamp(path) {
  try {
    const res = await fetch(foundry.utils.getRoute(path), { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const modified = Date.parse(res.headers.get("last-modified") ?? "");
    if (!Number.isNaN(modified)) return modified;
    return Number(res.headers.get("content-length")) || 1;
  } catch (err) {
    console.warn(`${MODULE_ID} | Fichier du résumé injoignable`, err);
    return null;
  }
}

/**
 * Lit resume/index.json :
 * { "resumes": [ { "epoque": "1933", "session": 3, "titre": "…", "fichier": "1933-session-03.webp", "date": "2026-11-10" } ] }
 * « epoque » vaut 1933 ou 2026 ; « date » (AAAA-MM-JJ) sert à savoir quel résumé est le plus récent toutes époques confondues.
 * @returns {Promise<{byEra: object, stamps: object}|null>}
 */
async function resolveAll() {
  try {
    const res = await fetch(foundry.utils.getRoute(`${baseDir()}/index.json`), { cache: "no-store" });
    if (!res.ok) return null;
    const indexStamp = Date.parse(res.headers.get("last-modified") ?? "") || 1;
    const data = await res.json();
    const list = Array.isArray(data?.resumes) ? data.resumes : [];
    const byEra = { "1933": [], modern: [] };
    list.filter((entry) => entry?.fichier).forEach((entry, order) => {
      const era = normEra(entry.epoque);
      byEra[era].push({
        era,
        order,
        session: Number(entry.session) || 0,
        titre: String(entry.titre ?? ""),
        date: String(entry.date ?? ""),
        path: `${baseDir()}/${entry.fichier}`,
        stamp: indexStamp
      });
    });
    const stamps = {};
    for (const era of ERAS) {
      byEra[era].sort((x, y) => y.session - x.session || y.date.localeCompare(x.date) || x.order - y.order);
      const newest = byEra[era][0];
      if (!newest) continue;
      const stamp = await fetchStamp(newest.path);
      if (!stamp) {
        byEra[era] = [];
        continue;
      }
      newest.stamp = stamp;
      stamps[era] = stamp;
    }
    if (!ERAS.some((era) => byEra[era].length)) return null;
    return { byEra, stamps };
  } catch (err) {
    console.warn(`${MODULE_ID} | Liste des résumés illisible`, err);
    return null;
  }
}

/** Dernier résumé vu, par époque (réglage propre à chaque utilisateur). */
const getSeen = () => game.settings.get(MODULE_ID, "lastSeen") ?? {};
const isUnseen = (all, era) => !!all.stamps[era] && all.stamps[era] !== getSeen()[era];

/** Époque à montrer d'abord : le résumé non vu le plus récent, sinon l'époque en cours, sinon la 1re disponible. */
function pickEra(all, wanted) {
  const available = ERAS.filter((era) => all.byEra[era].length);
  if (wanted && available.includes(wanted)) return wanted;
  const unseen = available.filter((era) => isUnseen(all, era));
  if (unseen.length === 1) return unseen[0];
  if (unseen.length > 1) {
    const cur = currentEra();
    if (cur && unseen.includes(cur)) return cur;
    return unseen.sort((a, b) => (all.byEra[b][0].date).localeCompare(all.byEra[a][0].date))[0];
  }
  const cur = currentEra();
  return available.includes(cur) ? cur : available[0];
}

/** Fenêtre d'affichage des résumés. */
class ResumeViewer extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: VIEWER_ID,
    classes: ["coc7-resume-epoques"],
    tag: "section",
    window: {
      title: "RESUME_EPOQUES.Titre",
      icon: "fa-solid fa-scroll",
      resizable: true
    },
    position: { width: 760, height: 860 },
    actions: {
      zoomIn: ResumeViewer.#onZoomIn,
      zoomOut: ResumeViewer.#onZoomOut,
      fit: ResumeViewer.#onFit,
      selectTab: ResumeViewer.#onSelectTab,
      selectEra: ResumeViewer.#onSelectEra,
      share: ResumeViewer.#onShare
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/viewer.hbs` }
  };

  /** Époque affichée (choisie à l'ouverture, puis par les boutons d'époque). */
  era = null;

  /** Commandes de zoom de la vue en cours (définies au rendu). */
  zoomApi = null;

  #resizeObserver = null;

  /** Résumés de l'époque affichée (un par onglet). */
  entries = [];

  #all = null;

  async _prepareContext() {
    const all = await resolveAll();
    this.#all = all;
    if (!all) {
      this.entries = [];
      return { era: this.era ?? "modern", src: "", entries: [], eras: [], showEras: false, showTabs: false, isGM: game.user.isGM, labels: this.#labels() };
    }
    if (!this.era || !all.byEra[this.era]?.length) this.era = pickEra(all);
    const cur = currentEra();
    const seen = getSeen();
    this.entries = all.byEra[this.era].map((entry, i) => ({
      ...entry,
      index: i,
      active: i === 0,
      isNew: i === 0 && all.stamps[this.era] !== seen[this.era],
      label: entry.session ? `S${entry.session}` : game.i18n.localize("RESUME_EPOQUES.Titre"),
      src: `${foundry.utils.getRoute(entry.path)}?v=${entry.stamp}`
    }));
    const eras = ERAS.filter((era) => all.byEra[era].length).map((era) => ({
      key: era,
      label: eraLabel(era),
      active: era === this.era,
      current: era === cur,
      isNew: all.stamps[era] !== seen[era]
    }));
    return {
      era: this.era,
      src: this.entries[0]?.src ?? "",
      entries: this.entries,
      eras,
      showEras: eras.length > 1,
      showTabs: this.entries.length > 1,
      isGM: game.user.isGM,
      labels: this.#labels()
    };
  }

  #labels() {
    const t = (key) => game.i18n.localize(`RESUME_EPOQUES.${key}`);
    return {
      zoomIn: t("ZoomPlus"),
      zoomOut: t("ZoomMoins"),
      fit: t("Ajuster"),
      hint: t("Aide"),
      share: t("Partager"),
      none: t("AucunResume"),
      new: t("Nouveau"),
      current: t("EpoqueEnCours")
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#markSeen();
    this.#setupZoom();
  }

  /** Le résumé le plus récent d'une époque est « vu » dès qu'il est affiché. */
  #markSeen() {
    const stamp = this.#all?.stamps[this.era];
    if (!stamp || getSeen()[this.era] === stamp) return;
    game.settings.set(MODULE_ID, "lastSeen", { ...getSeen(), [this.era]: stamp }).catch(() => {});
  }

  async _onClose(options) {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    return super._onClose?.(options);
  }

  /**
   * Zoom à la molette (centré sur le curseur), déplacement en glissant,
   * double-clic pour ajuster. Le dézoom s'arrête à l'image entière.
   */
  #setupZoom() {
    this.#resizeObserver?.disconnect();
    this.zoomApi = null;
    const viewport = this.element.querySelector(".rhe-scroll");
    const img = viewport?.querySelector(".rhe-img");
    if (!viewport || !img) return;

    let fit = 1;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let atFit = true;

    const maxScale = () => Math.max(fit, 3);
    const apply = () => {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const clamp = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
      ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
    };
    const fitView = () => {
      if (!img.naturalWidth || !viewport.clientWidth) return;
      fit = Math.min(viewport.clientWidth / img.naturalWidth, viewport.clientHeight / img.naturalHeight);
      scale = fit;
      atFit = true;
      clamp();
      apply();
    };
    const zoomAt = (factor, cx, cy) => {
      const next = Math.min(maxScale(), Math.max(fit, scale * factor));
      const ratio = next / scale;
      tx = cx - (cx - tx) * ratio;
      ty = cy - (cy - ty) * ratio;
      scale = next;
      atFit = scale <= fit * 1.001;
      clamp();
      apply();
    };
    const zoomCenter = (factor) => zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);

    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    let drag = null;
    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, tx, ty };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("rhe-dragging");
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!drag) return;
      tx = drag.tx + (event.clientX - drag.x);
      ty = drag.ty + (event.clientY - drag.y);
      clamp();
      apply();
    });
    const endDrag = () => {
      drag = null;
      viewport.classList.remove("rhe-dragging");
    };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("dblclick", fitView);

    // Si la fenêtre est redimensionnée : on réajuste, ou on garde le zoom courant.
    this.#resizeObserver = new ResizeObserver(() => {
      if (atFit) fitView();
      else {
        clamp();
        apply();
      }
    });
    this.#resizeObserver.observe(viewport);

    if (img.complete && img.naturalWidth) fitView();
    else img.addEventListener("load", fitView, { once: true });

    this.zoomApi = { zoomIn: () => zoomCenter(1.4), zoomOut: () => zoomCenter(1 / 1.4), fit: fitView };
  }

  static #onZoomIn() {
    this.zoomApi?.zoomIn();
  }

  static #onZoomOut() {
    this.zoomApi?.zoomOut();
  }

  static #onFit() {
    this.zoomApi?.fit();
  }

  static #onSelectTab(event, target) {
    const entry = this.entries[Number(target.dataset.index)];
    const img = this.element.querySelector(".rhe-img");
    if (!entry || !img) return;
    this.element.querySelectorAll(".rhe-tab").forEach((tab) => {
      tab.classList.toggle("active", tab === target);
    });
    target.querySelector(".rhe-new")?.remove();
    img.addEventListener("load", () => this.zoomApi?.fit(), { once: true });
    img.src = entry.src;
  }

  static #onSelectEra(event, target) {
    const era = target.dataset.era;
    if (!ERAS.includes(era) || era === this.era) return;
    this.era = era;
    this.render({ force: true });
  }

  static #onShare() {
    try {
      game.socket.emit(SOCKET, { action: "show", era: this.era });
      ui.notifications.info(game.i18n.localize("RESUME_EPOQUES.PartageOk"));
    } catch (err) {
      console.error(`${MODULE_ID} | Échec du partage`, err);
      ui.notifications.error(game.i18n.localize("RESUME_EPOQUES.PartageErreur"));
    }
  }
}

/**
 * Ouvre (ou rafraîchit) la fenêtre des résumés.
 * @param {object} [options]
 * @param {boolean} [options.silent] Ne rien afficher si aucun résumé n'existe.
 * @param {string} [options.era] Époque à afficher en premier.
 */
async function openViewer({ silent = false, era = null } = {}) {
  try {
    const all = await resolveAll();
    if (!all) {
      if (!silent) ui.notifications.info(game.i18n.localize("RESUME_EPOQUES.AucunResume"));
      return;
    }
    const existing = foundry.applications.instances.get(VIEWER_ID);
    const viewer = existing ?? new ResumeViewer();
    viewer.era = pickEra(all, era ?? existing?.era);
    await viewer.render({ force: true });
    viewer.bringToFront?.();
  } catch (err) {
    console.error(`${MODULE_ID} | Échec d'ouverture`, err);
    ui.notifications.error(game.i18n.localize("RESUME_EPOQUES.OuvertureErreur"));
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "lastSeen", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "autoOpen", {
    name: "RESUME_EPOQUES.Reglage.Auto.Nom",
    hint: "RESUME_EPOQUES.Reglage.Auto.Aide",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", async () => {
  game.socket.on(SOCKET, (data) => {
    if (data?.action === "show") openViewer({ era: data.era });
  });

  // Ouverture automatique à la connexion si un résumé n'a pas encore été vu.
  if (!game.settings.get(MODULE_ID, "autoOpen")) return;
  const all = await resolveAll();
  if (all && ERAS.some((era) => isUnseen(all, era))) {
    setTimeout(() => openViewer({ silent: true }), 1000);
  }
});

// Bouton toujours disponible dans la barre d'outils de gauche (joueurs et MJ).
Hooks.on("getSceneControlButtons", (controls) => {
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group?.tools) return;
  group.tools.resumeEpoques = {
    name: "resumeEpoques",
    title: "RESUME_EPOQUES.Bouton",
    icon: "fa-solid fa-scroll",
    order: 101,
    button: true,
    visible: true,
    onChange: () => openViewer()
  };
});
