/**
 * LinkedIn Feed Keyword Filter — Popup Logic
 * Manifest V3, pure async/await, no inline handlers.
 * Compatible with Chrome and Firefox (Manifest V3).
 */

// Browser compatibility shim
const ext = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

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

  const storage = ext.storage.sync || ext.storage.local;

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
   * Salva lo stato corrente in storage
   */
  async function saveState() {
    try {
      await storage.set({
        enabled: state.enabled,
        keywords: state.keywords,
        filterMode: state.filterMode
      });
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
    } catch (err) {
      console.error('Errore durante il caricamento dello stato:', err);
    }
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
