/**
 * LinkedIn Feed Keyword Filter — Content Script
 * Manifest V3 compliant, zero blocking, real-time sync with storage.
 * Compatible with Chrome and Firefox (Manifest V3 / Firefox 109+).
 */

(() => {
  'use strict';

  // Helper sicuro per accedere alle API di storage del browser
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
    if (typeof browser !== 'undefined' && browser?.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome?.storage) return chrome;
    return null;
  }

  // Configurazione predefinita
  let config = {
    enabled: true,
    keywords: [],
    filterMode: 'hide', // 'hide' (invisibile) oppure 'collapse' (barra compatta)
  };

  let blockedCount = 0;
  let scanScheduled = false;

  // Selettori noti per i contenitori dei post su LinkedIn
  const POST_SELECTORS = [
    'div.feed-shared-update-v2',
    'div.occludable-update',
    'div[data-urn*="urn:li:activity"]',
    'div[data-urn*="urn:li:aggregate"]',
    'div[data-id*="urn:li:activity"]',
    'div[data-view-name*="feed-full-update"]',
    'div[data-view-name*="feed"]',
    'article'
  ];

  /**
   * Carica la configurazione da storage (local, garantito su Chrome e Firefox)
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
   * Restituisce il contenitore principale del post dato un elemento
   */
  function getPostContainer(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

    // Se il nodo stesso è un post o è dentro un contenitore di post
    return node.closest('.occludable-update') || 
           node.closest('div.feed-shared-update-v2') || 
           node.closest('div[data-urn*="urn:li:"]') || 
           node.closest('div[data-view-name*="feed"]') ||
           node.closest('article');
  }

  /**
   * Controlla se il testo del post contiene una delle keyword attive
   * Restituisce la keyword trovata o null
   */
  function findMatchingKeyword(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return null;
    const lowerText = text.toLowerCase();

    for (const rawKw of keywords) {
      const kw = rawKw.trim().toLowerCase();
      if (!kw) continue;

      // Se inizia con # o contiene spazi/caratteri speciali: match come sottostringa
      if (kw.startsWith('#') || /\s|[^\w\s]/.test(kw)) {
        if (lowerText.includes(kw)) {
          return rawKw;
        }
      } else {
        // Altrimenti parola intera con delimitatori o fallback substring
        try {
          const regex = new RegExp(`(^|\\W)${escapeRegExp(kw)}($|\\W)`, 'i');
          if (regex.test(lowerText)) {
            return rawKw;
          }
        } catch (e) {
          if (lowerText.includes(kw)) {
            return rawKw;
          }
        }
      }
    }
    return null;
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Filtra o ripristina un singolo post
   */
  function evaluatePost(post) {
    if (!post || !post.isConnected) return;

    // Se il filtro è disattivato globalmente, ripristina lo stato originale
    if (!config.enabled || config.keywords.length === 0) {
      unfilterPost(post);
      return;
    }

    // Se l'utente ha già scelto manualmente di sbloccare questo post
    if (post.dataset.lffUserAllowed === 'true') {
      return;
    }

    const postText = post.innerText || post.textContent || '';
    if (!postText.trim()) return; // Non ha ancora caricato testo (lazy/occluded)

    const matchedKeyword = findMatchingKeyword(postText, config.keywords);

    if (matchedKeyword) {
      applyFilterToPost(post, matchedKeyword);
    } else {
      unfilterPost(post);
    }

    post.dataset.lffChecked = 'true';
  }

  /**
   * Applica il filtro al post in base alla modalità scelta
   */
  function applyFilterToPost(post, keyword) {
    post.dataset.lffBlockedKeyword = keyword;

    if (config.filterMode === 'hide') {
      // Modalità invisibile totale: classe + stile inline prioritario
      removePlaceholder(post);
      post.classList.add('lff-hidden');
      post.style.setProperty('display', 'none', 'important');
    } else {
      // Modalità collassata con banner informativo
      post.classList.add('lff-hidden');
      post.style.setProperty('display', 'none', 'important');
      createOrUpdatePlaceholder(post, keyword);
    }

    blockedCount++;
    console.log(`[LinkedIn Feed Filter] Post nascosto (keyword: "${keyword}")`);
  }

  /**
   * Rimuove il filtro dal post
   */
  function unfilterPost(post) {
    post.classList.remove('lff-hidden');
    post.style.removeProperty('display');
    delete post.dataset.lffBlockedKeyword;
    removePlaceholder(post);
  }

  /**
   * Crea o aggiorna la barra di avviso discreta per i post collassati (sicuro per CSP)
   */
  function createOrUpdatePlaceholder(post, keyword) {
    let placeholder = post.previousElementSibling;
    if (!placeholder || !placeholder.classList.contains('lff-collapsed-container')) {
      placeholder = document.createElement('div');
      placeholder.className = 'lff-collapsed-container';
      post.parentNode.insertBefore(placeholder, post);
    }

    placeholder.textContent = ''; // pulizia

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
      post.dataset.lffUserAllowed = 'true';
      post.classList.remove('lff-hidden');
      post.style.removeProperty('display');
      placeholder.remove();
    }, { once: true });

    placeholder.appendChild(infoDiv);
    placeholder.appendChild(showBtn);
  }

  function removePlaceholder(post) {
    const prev = post.previousElementSibling;
    if (prev && prev.classList.contains('lff-collapsed-container')) {
      prev.remove();
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Scansione scaglionata di tutti i post presenti nel DOM
   */
  async function scanAllPosts() {
    scanScheduled = false;

    // Raccoglie tutti i post presenti nella pagina
    const selectorQuery = POST_SELECTORS.join(', ');
    const postElements = Array.from(document.querySelectorAll(selectorQuery));

    // Dedup: se abbiamo selezionato sia un inner che un outer occludable-update
    const uniquePosts = new Set();
    for (const el of postElements) {
      const mainPost = getPostContainer(el);
      if (mainPost) uniquePosts.add(mainPost);
    }

    const postsArray = Array.from(uniquePosts);
    const BATCH_SIZE = 15;

    // Elaborazione a batch per non bloccare il frame rendering
    for (let i = 0; i < postsArray.length; i += BATCH_SIZE) {
      const chunk = postsArray.slice(i, i + BATCH_SIZE);
      for (const post of chunk) {
        evaluatePost(post);
      }
      // Cede il controllo al browser per mantenere 60 FPS
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }

  /**
   * Pianifica una scansione debouncata
   */
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      setTimeout(scanAllPosts, 80);
    });
  }

  /**
   * Reset completo dei post per ricalcolo istantaneo
   */
  function reevaluateAll() {
    document.querySelectorAll('.lff-collapsed-container').forEach(el => el.remove());
    document.querySelectorAll('.lff-hidden').forEach(el => el.classList.remove('lff-hidden'));
    document.querySelectorAll('[data-lff-checked]').forEach(el => {
      delete el.dataset.lffChecked;
      delete el.dataset.lffBlockedKeyword;
    });
    scheduleScan();
  }

  /**
   * Inizializzazione principale
   */
  async function init() {
    await loadConfig();

    // Scansione iniziale
    scheduleScan();

    // Osservatore mutazioni DOM per i nuovi post caricati dallo scroll infinito
    const observer = new MutationObserver(mutations => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        scheduleScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Ascolto in tempo reale dei cambiamenti dalle opzioni (popup)
    const api = getBrowserApi();
    if (api?.storage?.onChanged) {
      api.storage.onChanged.addListener((changes, areaName) => {
        // In Firefox o Chrome l'evento può riportare 'local' o non specificare areaName
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
            console.log('[LinkedIn Feed Filter] Configurazione aggiornata:', config);
            reevaluateAll();
          }
        }
      });
    }

    console.log('[LinkedIn Feed Filter] Inizializzato con successo su:', window.location.hostname);
  }

  // Avvio quando il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
