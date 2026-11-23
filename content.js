/**
 * LinkedIn Feed Keyword Filter — Content Script
 * Manifest V3 compliant, zero blocking, real-time sync with storage.
 * Compatible with Chrome and Firefox (Manifest V3 / Firefox 140+).
 */

(() => {
  'use strict';

  // Helper sicuro per accedere alle API di storage
  function getStorageArea() {
    if (typeof browser !== 'undefined' && browser?.storage?.local) {
      return browser.storage.local;
    }
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
    return null;
  }

  function getBrowserApi() {
    if (typeof browser !== 'undefined' && (browser?.storage || browser?.runtime)) return browser;
    if (typeof chrome !== 'undefined' && (chrome?.storage || chrome?.runtime)) return chrome;
    return null;
  }

  // Configurazione attiva
  let config = {
    enabled: true,
    keywords: [],
    filterMode: 'hide' // 'hide' (invisibile) oppure 'collapse' (barra compatta)
  };

  let scanScheduled = false;

  /**
   * Carica la configurazione salvata
   */
  async function loadConfig() {
    try {
      const storage = getStorageArea();
      if (!storage) return;

      const data = await storage.get(['enabled', 'keywords', 'filterMode']);
      if (data) {
        if (typeof data.enabled === 'boolean') config.enabled = data.enabled;
        if (Array.isArray(data.keywords)) config.keywords = data.keywords;
        if (data.filterMode) config.filterMode = data.filterMode;
      }
      console.log('[LinkedIn Feed Filter] Configurazione attiva:', config);
    } catch (err) {
      console.warn('[LinkedIn Feed Filter] Errore caricamento storage:', err);
    }
  }

  /**
   * Raccoglie tutti i contenitori di post presenti nel feed
   */
  function getAllPostCards() {
    const candidates = document.querySelectorAll([
      'div.feed-shared-update-v2',
      'div.occludable-update',
      'div[data-urn*="urn:li:activity"]',
      'div[data-urn*="urn:li:aggregate"]',
      'div[data-id*="urn:li:activity"]',
      'div[data-view-name*="feed-full-update"]'
    ].join(', '));

    const posts = new Set();
    for (const el of candidates) {
      // Risali all'occludable-update o al feed-shared-update-v2
      const card = el.closest('.occludable-update') || el.closest('.feed-shared-update-v2') || el;
      if (card && card.isConnected) {
        posts.add(card);
      }
    }
    return Array.from(posts);
  }

  /**
   * Controlla se il testo del post contiene una delle keyword attive (ricerca case-insensitive robusta)
   */
  function findMatchingKeyword(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return null;
    const lowerText = text.toLowerCase();

    for (const rawKw of keywords) {
      const kw = rawKw.trim().toLowerCase();
      if (!kw) continue;

      if (lowerText.includes(kw)) {
        return rawKw;
      }
    }
    return null;
  }

  /**
   * Valuta un singolo post
   */
  function evaluatePost(card) {
    if (!card || !card.isConnected) return;

    // Se disattivato o nessuna parola chiave, ripristina
    if (!config.enabled || config.keywords.length === 0) {
      unfilterPost(card);
      return;
    }

    // Se l'utente ha sbloccato manualmente questo post
    if (card.dataset.lffUserAllowed === 'true') {
      return;
    }

    // textContent è infallibile: restituisce tutto il testo anche se parzialmente nascosto o occluso
    const text = card.textContent || '';
    if (!text.trim()) return;

    const matched = findMatchingKeyword(text, config.keywords);
    if (matched) {
      applyFilterToPost(card, matched);
    } else {
      unfilterPost(card);
    }
  }

  /**
   * Applica il filtro al post
   */
  function applyFilterToPost(card, keyword) {
    card.dataset.lffBlockedKeyword = keyword;

    if (config.filterMode === 'hide') {
      removePlaceholder(card);
      // Forza azzeramento dimensioni e sparizione totale
      card.classList.add('lff-hidden');
      card.style.setProperty('display', 'none', 'important');
      card.style.setProperty('visibility', 'hidden', 'important');
      card.style.setProperty('height', '0px', 'important');
      card.style.setProperty('min-height', '0px', 'important');
      card.style.setProperty('margin', '0px', 'important');
      card.style.setProperty('padding', '0px', 'important');
      card.style.setProperty('overflow', 'hidden', 'important');

      // Nascondi anche i nodi interni diretti
      const inners = card.querySelectorAll('.feed-shared-update-v2');
      for (const inner of inners) {
        inner.style.setProperty('display', 'none', 'important');
      }
    } else {
      // Modalità collassata con banner informativo
      card.classList.add('lff-hidden');
      card.style.setProperty('display', 'none', 'important');
      createOrUpdatePlaceholder(card, keyword);
    }

    console.log(`[LinkedIn Feed Filter] Post nascosto: "${keyword}"`);
  }

  /**
   * Ripristina il post originale
   */
  function unfilterPost(card) {
    card.classList.remove('lff-hidden');
    card.style.removeProperty('display');
    card.style.removeProperty('visibility');
    card.style.removeProperty('height');
    card.style.removeProperty('min-height');
    card.style.removeProperty('margin');
    card.style.removeProperty('padding');
    card.style.removeProperty('overflow');

    const inners = card.querySelectorAll('.feed-shared-update-v2');
    for (const inner of inners) {
      inner.style.removeProperty('display');
    }

    delete card.dataset.lffBlockedKeyword;
    removePlaceholder(card);
  }

  /**
   * Banner discreto per post collassati
   */
  function createOrUpdatePlaceholder(card, keyword) {
    let placeholder = card.previousElementSibling;
    if (!placeholder || !placeholder.classList.contains('lff-collapsed-container')) {
      placeholder = document.createElement('div');
      placeholder.className = 'lff-collapsed-container';
      card.parentNode.insertBefore(placeholder, card);
    }

    placeholder.textContent = '';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'lff-collapsed-info';

    const badge = document.createElement('span');
    badge.className = 'lff-badge';
    badge.textContent = 'Nascosto';

    const textSpan = document.createElement('span');
    textSpan.textContent = 'Post contenente: ';

    const kwSpan = document.createElement('span');
    kwSpan.className = 'lff-keyword-tag';
    kwSpan.textContent = keyword;

    infoDiv.appendChild(badge);
    infoDiv.appendChild(textSpan);
    infoDiv.appendChild(kwSpan);

    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.className = 'lff-show-btn';
    showBtn.title = 'Mostra questo post';
    showBtn.textContent = 'Mostra';

    showBtn.addEventListener('click', () => {
      card.dataset.lffUserAllowed = 'true';
      unfilterPost(card);
      placeholder.remove();
    }, { once: true });

    placeholder.appendChild(infoDiv);
    placeholder.appendChild(showBtn);
  }

  function removePlaceholder(card) {
    const prev = card.previousElementSibling;
    if (prev && prev.classList.contains('lff-collapsed-container')) {
      prev.remove();
    }
  }

  /**
   * Scansione di tutti i post presenti
   */
  async function scanAllPosts() {
    scanScheduled = false;
    const posts = getAllPostCards();
    const BATCH = 15;

    for (let i = 0; i < posts.length; i += BATCH) {
      const chunk = posts.slice(i, i + BATCH);
      for (const card of chunk) {
        evaluatePost(card);
      }
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      setTimeout(scanAllPosts, 60);
    });
  }

  function reevaluateAll() {
    document.querySelectorAll('.lff-collapsed-container').forEach(el => el.remove());
    document.querySelectorAll('.lff-hidden').forEach(el => el.classList.remove('lff-hidden'));
    document.querySelectorAll('[data-lff-blocked-keyword]').forEach(el => {
      delete el.dataset.lffBlockedKeyword;
    });
    scheduleScan();
  }

  /**
   * Inizializzazione
   */
  async function init() {
    await loadConfig();
    scheduleScan();

    // 1. Observer per nuovi elementi aggiunti dallo scroll
    const observer = new MutationObserver(mutations => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) scheduleScan();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 2. Controllo periodico leggero (ogni 1.5s) per catturare elementi virtualizzati
    setInterval(scheduleScan, 1500);

    // 3. Ascolto storage onChanged nativo
    const api = getBrowserApi();
    if (api?.storage?.onChanged) {
      api.storage.onChanged.addListener((changes, areaName) => {
        if (!areaName || areaName === 'local') {
          let changed = false;
          if (changes.enabled) {
            config.enabled = changes.enabled.newValue;
            changed = true;
          }
          if (changes.keywords) {
            config.keywords = changes.keywords.newValue || [];
            changed = true;
          }
          if (changes.filterMode) {
            config.filterMode = changes.filterMode.newValue || 'hide';
            changed = true;
          }
          if (changed) {
            console.log('[LinkedIn Feed Filter] Aggiornamento storage rilevato:', config);
            reevaluateAll();
          }
        }
      });
    }

    // 4. Ascolto messaggi diretti dal popup (canale alternativo infallibile)
    if (api?.runtime?.onMessage) {
      api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'LFF_CONFIG_UPDATED' && msg.config) {
          console.log('[LinkedIn Feed Filter] Ricevuto messaggio diretto dal popup:', msg.config);
          config = Object.assign({}, config, msg.config);
          reevaluateAll();
          if (typeof sendResponse === 'function') sendResponse({ status: 'ok' });
        }
      });
    }

    console.log('[LinkedIn Feed Filter] Attivo su:', window.location.hostname);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
