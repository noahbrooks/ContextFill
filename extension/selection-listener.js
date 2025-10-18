(function () {
  const MESSAGE_TYPE = 'ContextFill.selectionChanged';
  let lastSentText = null;
  let debounceTimer = null;

  function getSelectionText() {
    const selection = window.getSelection && window.getSelection();
    if (!selection) {
      return '';
    }
    return selection.toString();
  }

  function sendSelection(force) {
    const text = getSelectionText();
    if (!force && text === lastSentText) {
      return;
    }

    lastSentText = text;
    try {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPE, text },
        () => {
          const error = chrome.runtime.lastError;
          if (error && error.message && !error.message.includes('Receiving end does not exist')) {
            console.warn('ContextFill selection message error', error);
          }
        },
      );
    } catch (error) {
      console.warn('ContextFill selection message dispatch failed', error);
    }
  }

  function scheduleSend(force) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      sendSelection(!!force);
    }, 100);
  }

  document.addEventListener('selectionchange', () => {
    scheduleSend(false);
  });

  document.addEventListener('mouseup', () => {
    scheduleSend(false);
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt') {
      return;
    }
    scheduleSend(false);
  }, true);

  document.addEventListener('contextmenu', () => {
    sendSelection(true);
  }, true);

  // Initialize with the current selection if any.
  scheduleSend(true);
})();
