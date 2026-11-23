/**
 * LinkedIn Feed Keyword Filter — Content Script
 * Manifest V3, nessuna chiamata di rete, tutto in locale.
 * Compatibile con Chrome e Firefox (Manifest V3).
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // SELETTORI — unico punto da toccare quando LinkedIn cambia la pagina.
  // Si provano in ordine: il primo livello che trova qualcosa vince.
  // ---------------------------------------------------------------------------

  // Livello 1: struttura del feed in uso da novembre 2026 (lista virtualizzata).
  const CURRENT_POST_SELECTORS = [
    '[data-testid="mainFeed"] [role="listitem"][componentkey]',
    '[role="listitem"][componentkey^="update-card"]'
  ];

  // Livello 2: struttura precedente, ancora servita su alcune pagine.
  const LEGACY_POST_SELECTORS = [
    'div.feed-shared-update-v2',
    'div.occludable-update',
    'div[data-urn*="urn:li:activity"]',
    'div[data-urn*="urn:li:aggregate"]',
    'div[data-id*="urn:li:activity"]',
    'div[data-view-name*="feed-full-update"]'
  ];

  // Livello 3: ripiego generico, usato solo sul feed e solo se i primi due
  // livelli non trovano niente. Prende elementi di lista con abbastanza testo.
  const FALLBACK_POST_SELECTORS = [
    'main [role="listitem"]',
    'main [role="article"]',
    'main article'
  ];
  const FALLBACK_MIN_TEXT = 150;

  // Contenitore esterno da nascondere, così non resta lo spazio vuoto.
  const WRAPPER_SELECTOR = '[data-virtualized-item], .occludable-update';

  // Selettori certi (livelli 1 e 2), usati per il controllo immediato dei post
  // appena aggiunti alla pagina.
  const KNOWN_POST_SELECTOR = CURRENT_POST_SELECTORS.concat(LEGACY_POST_SELECTORS).join(', ');
  const SCAN_DELAY_MS = 80;

  const STATE_ATTR = 'data-lff-state'; // "hidden" | "collapsed"
  const KEYWORD_ATTR = 'data-lff-keyword';
  const ALLOWED_ATTR = 'data-lff-user-allowed';
  const PLACEHOLDER_CLASS = 'lff-collapsed-container';

  // Dopo quanti ms senza post riconosciuti sul feed si segnala il problema.
  const DETECTION_GRACE_MS = 6000;

  // ---------------------------------------------------------------------------

  const api = (() => {
    if (typeof browser !== 'undefined' && browser?.runtime?.id) return browser;
    if (typeof chrome !== 'undefined' && chrome?.runtime?.id) return chrome;
    return null;
  })();
  const storage = api?.storage?.local || null;

  let config = { enabled: true, keywords: [], filterMode: 'hide' };
  let matchers = [];
  let matchersVersion = 0;
  const matchCache = new WeakMap();
  let scanTimer = null;

  const startedAt = Date.now();
  const status = { tier: 'none', posts: 0, filtered: 0, everSeenPosts: false };

  // --- Parole chiave ---------------------------------------------------------

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Corrispondenza a parola intera, senza distinzione fra maiuscole e minuscole.
   * "pro" non nasconde "programmatore"; "#crypto" e "growth hacking" funzionano.
   */
  function buildMatchers(keywords) {
    const out = [];
    for (const raw of keywords) {
      if (typeof raw !== 'string') continue;
      const kw = raw.trim();
      if (!kw) continue;

      const body = escapeRegExp(kw).replace(/\s+/g, '\\s+');
      const left = /^[\p{L}\p{N}_]/u.test(kw) ? '(?<![\\p{L}\\p{N}_])' : '';
      const right = /[\p{L}\p{N}_]$/u.test(kw) ? '(?![\\p{L}\\p{N}_])' : '';
      try {
        const re = new RegExp(left + body + right, 'iu');
        out.push({ raw, test: (text) => re.test(text) });
      } catch (err) {
        // Espressione non valida: ripiego sulla ricerca semplice.
        const lower = kw.toLowerCase();
        out.push({ raw, test: (text) => text.toLowerCase().includes(lower) });
      }
    }
    return out;
  }

  function findMatchingKeyword(text) {
    for (const m of matchers) {
      if (m.test(text)) return m.raw;
    }
    return null;
  }

  /**
   * Testo del post con uno spazio fra un nodo e l'altro. textContent incolla
   * elementi vicini ("Anna Rossi" + "CEO" diventa "Anna RossiCEO") e la
   * ricerca a parola intera non troverebbe più "Anna Rossi".
   */
  function getSpacedText(card) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue;
      if (value && value.trim()) parts.push(value);
    }
    return parts.join(' ');
  }

  /**
   * Parola chiave trovata nel post, oppure null. Il risultato resta in memoria
   * finché testo e parole chiave non cambiano: le scansioni periodiche non
   * rileggono ogni volta tutto il post.
   */
  function matchCard(card) {
    const raw = card.textContent || '';
    const cached = matchCache.get(card);
    if (cached && cached.raw === raw && cached.version === matchersVersion) {
      return cached.result;
    }
    let result = null;
    if (raw.trim()) {
      result = findMatchingKeyword(raw) || findMatchingKeyword(getSpacedText(card));
    }
    matchCache.set(card, { raw, version: matchersVersion, result });
    return result;
  }

  function setConfig(partial) {
    if (!partial) return;
    if (typeof partial.enabled === 'boolean') config.enabled = partial.enabled;
    if (Array.isArray(partial.keywords)) config.keywords = partial.keywords;
    if (partial.filterMode === 'hide' || partial.filterMode === 'collapse') {
      config.filterMode = partial.filterMode;
    }
    matchers = buildMatchers(config.keywords);
    matchersVersion += 1;
  }

  function isActive() {
    return config.enabled && matchers.length > 0;
  }

  // --- Ricerca dei post ------------------------------------------------------

  function isFeedPage() {
    return window.location.pathname.startsWith('/feed');
  }

  function queryOutermost(selectors) {
    const found = Array.from(document.querySelectorAll(selectors.join(', ')));
    const set = new Set(found);
    // Tiene solo gli elementi più esterni, per non valutare due volte lo stesso post.
    return found.filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (set.has(p)) return false;
      }
      return true;
    });
  }

  function getPostCards() {
    let cards = queryOutermost(CURRENT_POST_SELECTORS);
    if (cards.length > 0) {
      status.tier = 'current';
      return cards;
    }

    cards = queryOutermost(LEGACY_POST_SELECTORS);
    if (cards.length > 0) {
      status.tier = 'legacy';
      return cards;
    }

    if (isFeedPage()) {
      cards = queryOutermost(FALLBACK_POST_SELECTORS).filter(
        (el) => (el.textContent || '').trim().length >= FALLBACK_MIN_TEXT
      );
      if (cards.length > 0) {
        status.tier = 'fallback';
        return cards;
      }
    }

    status.tier = 'none';
    return [];
  }

  /**
   * Elemento su cui applicare il filtro: il contenitore esterno del post,
   * se contiene solo quel post; altrimenti il post stesso.
   */
  function getTarget(card) {
    const wrapper = card.closest(WRAPPER_SELECTOR);
    if (!wrapper || wrapper === card) return card;
    for (const other of wrapper.querySelectorAll(KNOWN_POST_SELECTOR)) {
      if (other !== card && !card.contains(other) && !other.contains(card)) return card;
    }
    return wrapper;
  }

  // --- Applicazione del filtro -----------------------------------------------

  function getPlaceholder(target) {
    const prev = target.previousElementSibling;
    return prev && prev.classList.contains(PLACEHOLDER_CLASS) ? prev : null;
  }

  function removePlaceholder(target) {
    const placeholder = getPlaceholder(target);
    if (placeholder) placeholder.remove();
  }

  function createPlaceholder(target, keyword) {
    const placeholder = document.createElement('div');
    placeholder.className = PLACEHOLDER_CLASS;

    const info = document.createElement('div');
    info.className = 'lff-collapsed-info';

    const badge = document.createElement('span');
    badge.className = 'lff-badge';
    badge.textContent = 'Nascosto';

    const label = document.createElement('span');
    label.textContent = 'Post contenente: ';

    const kw = document.createElement('span');
    kw.className = 'lff-keyword-tag';
    kw.textContent = keyword;

    info.append(badge, label, kw);

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'lff-show-btn';
    showBtn.title = 'Mostra questo post';
    showBtn.textContent = 'Mostra';
    showBtn.addEventListener('click', () => {
      target.setAttribute(ALLOWED_ATTR, 'true');
      clearFilter(target);
    });

    placeholder.append(info, showBtn);
    target.parentNode.insertBefore(placeholder, target);
  }

  function applyFilter(target, keyword) {
    const wanted = config.filterMode === 'collapse' ? 'collapsed' : 'hidden';
    const sameState =
      target.getAttribute(STATE_ATTR) === wanted &&
      target.getAttribute(KEYWORD_ATTR) === keyword;

    if (wanted === 'hidden') {
      if (sameState && !getPlaceholder(target)) return;
      removePlaceholder(target);
    } else {
      if (sameState && getPlaceholder(target)) return;
      removePlaceholder(target);
      createPlaceholder(target, keyword);
    }

    target.setAttribute(STATE_ATTR, wanted);
    target.setAttribute(KEYWORD_ATTR, keyword);
  }

  function clearFilter(target) {
    if (target.hasAttribute(STATE_ATTR)) {
      target.removeAttribute(STATE_ATTR);
      target.removeAttribute(KEYWORD_ATTR);
    }
    removePlaceholder(target);
  }

  /**
   * Rimuove i banner rimasti senza il loro post (LinkedIn smonta i post lontani
   * dalla parte visibile della pagina).
   */
  function removeOrphanPlaceholders() {
    for (const placeholder of document.querySelectorAll('.' + PLACEHOLDER_CLASS)) {
      const next = placeholder.nextElementSibling;
      if (!next || next.getAttribute(STATE_ATTR) !== 'collapsed') placeholder.remove();
    }
  }

  // --- Scansione -------------------------------------------------------------

  /**
   * @param {boolean} full  true dopo un cambio di impostazioni: azzera anche i
   *                        filtri su post che in questo momento non sono montati.
   */
  /**
   * Valuta un post e applica il filtro. Restituisce l'elemento su cui agisce.
   * @param {boolean} canClear  false nel controllo immediato: lì si nasconde
   *                            soltanto, la rimozione del filtro spetta a scan().
   */
  function filterCard(card, canClear) {
    const target = getTarget(card);
    if (target.getAttribute(ALLOWED_ATTR) === 'true') return target;

    // Il testo si legge dal DOM e non dal rendering: resta disponibile
    // anche quando il post è già nascosto.
    if (!(card.textContent || '').trim()) return target;

    const matched = matchCard(card);
    if (matched) {
      applyFilter(target, matched);
    } else if (canClear) {
      clearFilter(target);
    }
    return target;
  }

  /** Post più esterno che contiene l'elemento, secondo i selettori certi. */
  function outermostKnownCard(el) {
    let found = null;
    for (let p = el; p; p = p.parentElement) {
      if (p.matches(KNOWN_POST_SELECTOR)) found = p;
    }
    return found;
  }

  /**
   * Controllo immediato dei post toccati da un gruppo di modifiche della pagina.
   * Gira prima che il browser ridisegni: il post da nascondere non fa in tempo
   * a comparire.
   */
  function filterTouchedCards(mutations) {
    const touched = new Set();
    for (const m of mutations) {
      if (m.addedNodes.length === 0 || isOwnMutation(m)) continue;
      const owner = m.target.nodeType === Node.ELEMENT_NODE ? outermostKnownCard(m.target) : null;
      if (owner) {
        touched.add(owner);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(KNOWN_POST_SELECTOR)) {
          touched.add(node);
        } else {
          for (const card of node.querySelectorAll(KNOWN_POST_SELECTOR)) {
            touched.add(outermostKnownCard(card));
          }
        }
      }
    }
    for (const card of touched) {
      if (card && card.isConnected) filterCard(card, false);
    }
  }

  function scan(full) {

    const cards = getPostCards();
    const visited = new Set();
    const active = isActive();

    for (const card of cards) {
      if (!card.isConnected) continue;
      if (active) {
        visited.add(filterCard(card, true));
      } else {
        const target = getTarget(card);
        visited.add(target);
        clearFilter(target);
      }
    }

    if (full || !active) {
      for (const el of document.querySelectorAll('[' + STATE_ATTR + ']')) {
        if (!active || !visited.has(el)) clearFilter(el);
      }
    }
    removeOrphanPlaceholders();

    status.posts = cards.length;
    status.filtered = document.querySelectorAll('[' + STATE_ATTR + ']').length;
    if (cards.length > 0) status.everSeenPosts = true;
  }

  function scheduleScan() {
    if (scanTimer !== null) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan(false);
    }, SCAN_DELAY_MS);
  }

  function getStatus() {
    const feed = isFeedPage();
    return {
      feed,
      tier: status.tier,
      posts: status.posts,
      filtered: status.filtered,
      // Sul feed, a pagina caricata da un po', senza mai aver riconosciuto un
      // post: LinkedIn ha probabilmente cambiato struttura.
      detectionFailed:
        feed && !status.everSeenPosts && Date.now() - startedAt > DETECTION_GRACE_MS,
      active: isActive()
    };
  }

  // --- Avvio -----------------------------------------------------------------

  function isOwnNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && node.classList.contains(PLACEHOLDER_CLASS);
  }

  function isOwnMutation(mutation) {
    const t = mutation.target;
    if (t.nodeType === Node.ELEMENT_NODE && t.closest('.' + PLACEHOLDER_CLASS)) return true;
    for (const node of mutation.addedNodes) {
      if (!isOwnNode(node)) return false;
    }
    return true;
  }

  async function loadConfig() {
    if (!storage) return;
    try {
      const data = await storage.get(['enabled', 'keywords', 'filterMode']);
      setConfig(data);
    } catch (err) {
      console.warn('[LinkedIn Feed Filter] Errore di lettura delle impostazioni:', err);
    }
  }

  async function init() {
    await loadConfig();
    scheduleScan();

    // 1. Nuovi elementi aggiunti dallo scroll o dalla navigazione interna.
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => m.addedNodes.length > 0 && !isOwnMutation(m));
      if (!relevant) return;
      if (isActive()) filterTouchedCards(mutations);
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 2. Controllo periodico leggero, per i post rimontati dalla lista virtualizzata.
    setInterval(scheduleScan, 1500);

    // 3. Impostazioni cambiate dal popup (vale per tutte le schede aperte).
    if (api?.storage?.onChanged) {
      api.storage.onChanged.addListener((changes, areaName) => {
        if (areaName && areaName !== 'local') return;
        const partial = {};
        if (changes.enabled) partial.enabled = changes.enabled.newValue !== false;
        if (changes.keywords) partial.keywords = changes.keywords.newValue || [];
        if (changes.filterMode) partial.filterMode = changes.filterMode.newValue || 'hide';
        if (Object.keys(partial).length === 0) return;
        setConfig(partial);
        scan(true);
      });
    }

    // 4. Messaggi dal popup: aggiornamento immediato e richiesta di stato.
    if (api?.runtime?.onMessage) {
      api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'LFF_CONFIG_UPDATED' && msg.config) {
          setConfig(msg.config);
          scan(true);
          sendResponse({ status: 'ok' });
        } else if (msg.type === 'LFF_GET_STATUS') {
          scan(false);
          sendResponse(getStatus());
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
