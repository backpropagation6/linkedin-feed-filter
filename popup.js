/**
 * LinkedIn Feed Keyword Filter — Popup Logic
 * Manifest V3, pure async/await, no inline handlers.
 * Compatible with Chrome and Firefox (Manifest V3 / Firefox 109+).
 */

// Browser compatibility helpers
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

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // Elementi DOM
  const toggleEnabled = document.getElementById('toggle-enabled');
  const keywordForm = document.getElementById('keyword-form');
  const keywordInput = document.getElementById('keyword-input');
  const keywordList = document.getElementById('keyword-list');
  const keywordCount = document.getElementById('keyword-count');
  const emptyState = document.getElementById('empty-state');
  const modeHide = document.getElementById('mode-hide');
  const modeCollapse = document.getElementById('mode-collapse');
  const saveStatus = document.getElementById('save-status');

  // Stato locale
  let state = {
    enabled: true,
    keywords: [],
    filterMode: 'hide'
  };

  const storage = getStorageArea();

  /**
   * Mostra un breve feedback visivo di salvataggio
   */
  let statusTimeout = null;
  function showStatus(text = 'Modifiche salvate') {
    if (saveStatus) {
      saveStatus.textContent = text;
      saveStatus.style.opacity = '1';
      clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => {
        saveStatus.style.opacity = '0.7';
      }, 2000);
    }
  }

  /**
   * Salva lo stato corrente in storage e notifica il tab attivo
   */
  async function saveState() {
    try {
      if (storage) {
        await storage.set({
          enabled: state.enabled,
          keywords: state.keywords,
          filterMode: state.filterMode
        });
      }

      // Notifica diretta al tab attivo (canale ad alta priorità)
      const api = getBrowserApi();
      if (api?.tabs?.query) {
        try {
          const tabs = await api.tabs.query({ active: true, currentWindow: true });
          if (tabs && tabs[0]?.id) {
            await api.tabs.sendMessage(tabs[0].id, {
              type: 'LFF_CONFIG_UPDATED',
              config: {
                enabled: state.enabled,
                keywords: state.keywords,
                filterMode: state.filterMode
              }
            });
          }
        } catch (e) {
          // Tab non LinkedIn o non ancora pronto
        }
      }

      showStatus('Sincronizzato');
    } catch (err) {
      console.error('Errore durante il salvataggio:', err);
      showStatus('Errore salvataggio');
    }
  }

  /**
   * Renderizza la lista delle parole chiave
   */
  function renderKeywords() {
    keywordList.innerHTML = '';
    keywordCount.textContent = state.keywords.length;

    if (state.keywords.length === 0) {
      emptyState.style.display = 'block';
      keywordList.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    keywordList.style.display = 'flex';

    state.keywords.forEach((keyword, index) => {
      const chip = document.createElement('div');
      chip.className = 'chip';

      const textSpan = document.createElement('span');
      textSpan.textContent = keyword;

      const removeBtn = document.createElement('span');
      removeBtn.className = 'chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = `Rimuovi "${keyword}"`;
      removeBtn.setAttribute('role', 'button');
      removeBtn.setAttribute('tabindex', '0');

      removeBtn.addEventListener('click', async () => {
        state.keywords.splice(index, 1);
        renderKeywords();
        await saveState();
      });

      removeBtn.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          state.keywords.splice(index, 1);
          renderKeywords();
          await saveState();
        }
      });

      chip.appendChild(textSpan);
      chip.appendChild(removeBtn);
      keywordList.appendChild(chip);
    });
  }

  /**
   * Carica i dati all'apertura del popup
   */
  async function loadState() {
    try {
      const data = await storage.get(['enabled', 'keywords', 'filterMode']);
      if (typeof data.enabled === 'boolean') {
        state.enabled = data.enabled;
      }
      if (Array.isArray(data.keywords)) {
        state.keywords = data.keywords;
      }
      if (data.filterMode) {
        state.filterMode = data.filterMode;
      }

      // Aggiorna UI
      toggleEnabled.checked = state.enabled;
      if (state.filterMode === 'collapse') {
        modeCollapse.checked = true;
      } else {
        modeHide.checked = true;
      }

      renderKeywords();
      await checkPermissions();
    } catch (err) {
      console.error('Errore durante il caricamento dello stato:', err);
    }
  }

  /**
   * Verifica se l'estensione ha accesso a LinkedIn (su Firefox MV3 le host permissions sono runtime)
   */
  async function checkPermissions() {
    const warningEl = document.getElementById('permission-warning');
    if (!warningEl) return;

    const api = getBrowserApi();
    if (api?.permissions?.contains) {
      try {
        const has = await api.permissions.contains({
          origins: ['*://*.linkedin.com/*', '*://linkedin.com/*']
        });
        warningEl.style.display = has ? 'none' : 'flex';
      } catch (e) {
        console.warn('[LinkedIn Feed Filter] Errore verifica permessi:', e);
      }
    }
  }

  const grantBtn = document.getElementById('grant-permission-btn');
  if (grantBtn) {
    grantBtn.addEventListener('click', async () => {
      const api = getBrowserApi();
      if (api?.permissions?.request) {
        try {
          const granted = await api.permissions.request({
            origins: ['*://*.linkedin.com/*', '*://linkedin.com/*']
          });
          if (granted) {
            const warningEl = document.getElementById('permission-warning');
            if (warningEl) warningEl.style.display = 'none';
            showStatus('Permesso accordato! Ricarica LinkedIn');
          }
        } catch (err) {
          console.error('[LinkedIn Feed Filter] Errore richiesta permesso:', err);
        }
      }
    });
  }

  // Listener per aggiunta keyword
  keywordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawValue = keywordInput.value.trim();
    if (!rawValue) return;

    // Evita duplicati (case-insensitive)
    const exists = state.keywords.some(
      k => k.toLowerCase() === rawValue.toLowerCase()
    );

    if (!exists) {
      state.keywords.push(rawValue);
      renderKeywords();
      await saveState();
      keywordInput.value = '';
    } else {
      keywordInput.value = '';
      showStatus('Parola già presente');
    }

    keywordInput.focus();
  });

  // Listener per toggle on/off generale
  toggleEnabled.addEventListener('change', async () => {
    state.enabled = toggleEnabled.checked;
    await saveState();
  });

  // Listener per cambio modalità
  modeHide.addEventListener('change', async () => {
    if (modeHide.checked) {
      state.filterMode = 'hide';
      await saveState();
    }
  });

  modeCollapse.addEventListener('change', async () => {
    if (modeCollapse.checked) {
      state.filterMode = 'collapse';
      await saveState();
    }
  });

  // Inizializza
  await loadState();
});
