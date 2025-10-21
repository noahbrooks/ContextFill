const MENU_PREFIX = 'contextfill';
const MESSAGE_SELECTION_CHANGED = 'ContextFill.selectionChanged';

let currentSelection = '';
let buildSequence = Promise.resolve();

function sanitizeFlags(flags) {
  const cleaned = String(flags || '').replace(/[^gimsuy]/gi, '');
  const seen = new Set();
  const unique = [];
  for (const char of cleaned.toLowerCase()) {
    if (!seen.has(char)) {
      seen.add(char);
      unique.push(char);
    }
  }
  return unique.join('') || 'g';
}

function applyReplacements(value, replacements) {
  if (typeof value !== 'string') {
    return '';
  }

  if (!Array.isArray(replacements) || !replacements.length) {
    return value;
  }

  let result = value;
  for (const replacement of replacements) {
    if (!replacement || !replacement.pattern) {
      continue;
    }

    const flags = sanitizeFlags(replacement.flags);
    let regex;
    try {
      regex = new RegExp(replacement.pattern, flags);
    } catch (error) {
      console.warn('ContextFill: invalid replacement regex', replacement.pattern, error);
      continue;
    }

    const replacementValue = typeof replacement.replacement === 'string' ? replacement.replacement : '';
    try {
      result = result.replace(regex, replacementValue);
    } catch (error) {
      console.warn('ContextFill: failed to apply replacement', replacement.pattern, error);
    }
  }

  return result;
}

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

async function openTargetUrl(targetUrl) {
  if (!targetUrl) {
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function') {
    try {
      const createdTab = await new Promise((resolve, reject) => {
        try {
          chrome.tabs.create({ url: targetUrl }, (tab) => {
            const lastError = chrome.runtime && chrome.runtime.lastError;
            if (lastError) {
              reject(new Error(lastError.message));
              return;
            }
            resolve(tab || true);
          });
        } catch (error) {
          reject(error);
        }
      });

      if (createdTab) {
        return;
      }
    } catch (error) {
      console.warn('ContextFill: chrome.tabs.create failed', targetUrl, error);
    }
  }

  if (typeof clients !== 'undefined' && typeof clients.openWindow === 'function') {
    try {
      const client = await clients.openWindow(targetUrl);
      if (client) {
        return;
      }
    } catch (error) {
      console.warn('ContextFill: clients.openWindow failed', targetUrl, error);
    }
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.open === 'function') {
    try {
      globalThis.open(targetUrl, '_blank', 'noopener');
      return;
    } catch (error) {
      console.warn('ContextFill: globalThis.open fallback failed', targetUrl, error);
    }
  }

  console.warn('ContextFill: unable to open URL (no available API)', targetUrl);
}

const DEFAULT_CATEGORIES = [
  {
    id: 'default-ip-addresses',
    name: 'IP Addresses',
    regex: '^(?:\\d{1,3}\\.){3}\\d{1,3}$',
    replacements: [
      {
        id: 'default-ip-replace-dot',
        pattern: '\\[\\.\\]',
        replacement: '.',
        flags: 'g',
      },
    ],
    templates: [
      {
        id: 'default-ip-spur',
        label: 'Spur',
        urlTemplate: 'https://app.spur.us/search?q={{selection}}',
      },
      {
        id: 'default-ip-securitytrails',
        label: 'SecurityTrails IP',
        urlTemplate: 'https://securitytrails.com/list/ip/{{selection}}',
      },
      {
        id: 'default-ip-abuseipdb',
        label: 'AbuseIPDB',
        urlTemplate: 'https://www.abuseipdb.com/check/{{selection}}',
      },
      {
        id: 'default-ip-shodan',
        label: 'Shodan',
        urlTemplate: 'https://www.shodan.io/search?query={{selection}}',
      },
      {
        id: 'default-ip-virustotal',
        label: 'VirusTotal',
        urlTemplate: 'https://www.virustotal.com/gui/search/{{selection}}',
      },
    ],
  },
  {
    id: 'default-sha256',
    name: 'SHA256',
    regex: '^[A-Fa-f0-9]{64}$',
    replacements: [],
    templates: [
      {
        id: 'default-sha-virustotal',
        label: 'VirusTotal',
        urlTemplate: 'https://www.virustotal.com/gui/search/{{selection}}',
      },
      {
        id: 'default-sha-hybrid-analysis',
        label: 'Hybrid Analysis',
        urlTemplate: 'https://www.hybrid-analysis.com/search?query={{selection}}',
      },
    ],
  },
  {
    id: 'default-url',
    name: 'URL',
    regex: '^(?:(?:https?|ftp):\\/\\/)?[\\w.-]+\\.[\\w.-]+(?:[\\/\\?#]\\S*)?$',
    replacements: [
      {
        id: 'default-url-replace-dot',
        pattern: '\\[\\.\\]',
        replacement: '.',
        flags: 'g',
      },
      {
        id: 'default-url-strip-scheme',
        pattern: '^https?:\\/\\/',
        replacement: '',
        flags: 'i',
      },
    ],
    templates: [
      {
        id: 'default-url-securitytrails',
        label: 'SecurityTrails Domain',
        urlTemplate: 'https://securitytrails.com/domain/{{selection}}',
      },
      {
        id: 'default-url-whois',
        label: 'Whois.com',
        urlTemplate: 'https://www.whois.com/whois/{{selection}}',
      },
      {
        id: 'default-url-virustotal',
        label: 'VirusTotal',
        urlTemplate: 'https://www.virustotal.com/gui/search/{{selection}}',
      },
    ],
  },
];

function cloneDefaultCategories() {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function normalizeCategory(category) {
  const source = category && typeof category === 'object' ? category : {};
  const safeCategory = {
    id: source.id || generateId('category'),
    name: typeof source.name === 'string' ? source.name : '',
    regex: typeof source.regex === 'string' ? source.regex : '',
  };

  const templates = Array.isArray(source.templates) ? source.templates : [];
  safeCategory.templates = templates.map((template) => {
    const tplSource = template && typeof template === 'object' ? template : {};
    return {
      id: tplSource.id || generateId('template'),
      label: typeof tplSource.label === 'string' ? tplSource.label : '',
      urlTemplate: typeof tplSource.urlTemplate === 'string' ? tplSource.urlTemplate : '',
    };
  });

  const replacements = Array.isArray(source.replacements) ? source.replacements : [];
  safeCategory.replacements = replacements.map((replacement) => {
    const repSource = replacement && typeof replacement === 'object' ? replacement : {};
    return {
      id: repSource.id || generateId('replacement'),
      pattern: typeof repSource.pattern === 'string' ? repSource.pattern : '',
      replacement: typeof repSource.replacement === 'string' ? repSource.replacement : '',
      flags: sanitizeFlags(repSource.flags),
    };
  });

  return safeCategory;
}

function normalizeCategories(categories) {
  if (!Array.isArray(categories)) {
    return [];
  }
  return categories.map((category) => normalizeCategory(category));
}

function ensureDefaultCategories(categories) {
  const normalized = normalizeCategories(categories);
  if (!normalized.length) {
    const defaults = normalizeCategories(cloneDefaultCategories());
    chrome.storage.sync.set({ categories: defaults });
    return defaults;
  }
  return normalized;
}

function queueBuild(selectionText) {
  buildSequence = buildSequence
    .catch((error) => {
      console.error('ContextFill: previous menu build failed', error);
    })
    .then(() => buildMenus(selectionText))
    .catch((error) => {
      console.error('ContextFill: menu build failed', error);
    });

  return buildSequence;
}

function hasContextMenusApi() {
  return typeof chrome !== 'undefined'
    && !!chrome.contextMenus
    && typeof chrome.contextMenus.create === 'function'
    && typeof chrome.contextMenus.removeAll === 'function';
}

function refreshContextMenus() {
  if (hasContextMenusApi() && typeof chrome.contextMenus.refresh === 'function') {
    chrome.contextMenus.refresh();
  }
}

function createId(...parts) {
  const encodedParts = parts.map((part) => encodeURIComponent(String(part)));
  return [MENU_PREFIX, ...encodedParts].join('|');
}

function getCategories() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ categories: [] }, (result) => {
      const categories = ensureDefaultCategories(result.categories || []);
      resolve(categories);
    });
  });
}

function removeAllMenus() {
  return new Promise((resolve) => {
    if (!hasContextMenusApi()) {
      resolve();
      return;
    }

    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime?.lastError;
      if (error && !error.message.includes('No such menu item')) {
        console.warn('ContextFill: removeAllMenus error', error);
      }
      resolve();
    });
  });
}

async function buildMenus(selectionText) {
  currentSelection = (selectionText || '').trim();

  if (!hasContextMenusApi()) {
    return;
  }

  await removeAllMenus();

  const selection = currentSelection;

  if (!selection) {
    return;
  }

  const categories = await getCategories();
  const matchingCategories = [];

  for (const category of categories) {
    if (!category || !category.regex || !Array.isArray(category.templates)) {
      continue;
    }

    const pattern = String(category.regex || '').trim();
    if (!pattern) {
      continue;
    }

    let regex;
    try {
      regex = new RegExp(pattern, 'u');
    } catch (error) {
      console.warn('ContextFill: invalid regex', pattern, error);
      continue;
    }

    const normalizedSelection = applyReplacements(selection, category.replacements || []);

    if (!regex.test(normalizedSelection)) {
      continue;
    }

    const validTemplates = category.templates.filter((template) => template && template.urlTemplate);
    if (!validTemplates.length) {
      continue;
    }

    const categoryKey = category.id || category.regex;
    matchingCategories.push({
      category,
      categoryKey,
      normalizedSelection,
      templates: validTemplates.map((template) => ({
        data: template,
        key: template.id || template.urlTemplate,
      })),
    });
  }

  if (!matchingCategories.length) {
    return;
  }

  const hasMultipleCategories = matchingCategories.length > 1;

  matchingCategories.forEach(({ category, categoryKey, templates }, index) => {
    if (index > 0) {
      chrome.contextMenus.create(
        {
          type: 'separator',
          contexts: ['selection'],
        },
        () => {
          const error = chrome.runtime?.lastError;
          if (error) {
            console.warn('ContextFill: failed to create separator', error);
          }
        },
      );
    }

    const categoryTitle = category.name || 'ContextFill';
    const hasMultipleTemplates = templates.length > 1;
    const createOpenAll = hasMultipleTemplates;

    if (createOpenAll) {
      const categoryMenuId = createId('category', categoryKey);
      chrome.contextMenus.create(
        {
          id: categoryMenuId,
          title: categoryTitle,
          contexts: ['selection'],
        },
        () => {
          const error = chrome.runtime?.lastError;
          if (error) {
            console.error('ContextFill: failed to create category menu', error);
          }
        },
      );
    }

    for (const template of templates) {
      const menuId = createId('template', categoryKey, template.key);
      const baseTitle = template.data.label || template.data.urlTemplate || categoryTitle || 'Open link';
      let title = baseTitle;

      if (hasMultipleCategories) {
        title = `${categoryTitle}: ${baseTitle}`;
      } else if (createOpenAll) {
        title = `- ${baseTitle}`;
      }

      chrome.contextMenus.create(
        {
          id: menuId,
          title,
          contexts: ['selection'],
        },
        () => {
          const error = chrome.runtime?.lastError;
          if (error) {
            console.error('ContextFill: failed to create template menu', error);
          }
        },
      );
    }
  }
  );
}

function handleOnShown(info) {
  const selectionFromEvent = typeof info?.selectionText === 'string' ? info.selectionText : null;
  const trimmedSelection = selectionFromEvent ? selectionFromEvent.trim() : '';

  if (!trimmedSelection) {
    refreshContextMenus();
    return;
  }

  if (trimmedSelection === currentSelection) {
    refreshContextMenus();
    return;
  }

  queueBuild(trimmedSelection).then(() => {
    refreshContextMenus();
  });
}

function fillTemplate(urlTemplate, normalizedSelection, rawSelection) {
  const safeNormalized = typeof normalizedSelection === 'string' ? normalizedSelection : '';
  const safeRaw = typeof rawSelection === 'string' ? rawSelection : '';
  const encodedNormalized = encodeURIComponent(safeNormalized);
  const encodedRaw = encodeURIComponent(safeRaw);

  let filled = urlTemplate.replace(/\{\{selection\}\}/g, encodedNormalized);
  filled = filled.replace(/\{\{normalizedSelection\}\}/g, safeNormalized);
  filled = filled.replace(/\{\{rawSelection\}\}/g, safeRaw);
  filled = filled.replace(/\{\{rawSelectionEncoded\}\}/g, encodedRaw);
  return filled;
}

async function handleClick(info, tab) {
  if (!info || !info.menuItemId || typeof info.selectionText !== 'string') {
    return;
  }

  const mapping = parseMenuId(info.menuItemId);
  if (!mapping) {
    return;
  }

  const categories = await getCategories();
  const category = categories.find((cat) => (cat.id || cat.regex) === mapping.categoryId);
  if (!category) {
    return;
  }

  const rawSelection = info.selectionText.trim();
  if (!rawSelection) {
    return;
  }

  const normalizedSelection = applyReplacements(rawSelection, category.replacements || []);

  if (mapping.kind === 'category') {
    const templates = (category.templates || []).filter((tpl) => tpl && tpl.urlTemplate);
    for (const template of templates) {
      const targetUrl = fillTemplate(template.urlTemplate, normalizedSelection, rawSelection);
      // Use MV3-compatible window opening without requiring the tabs permission.
      await openTargetUrl(targetUrl);
    }
    return;
  }

  if (mapping.kind === 'template') {
    const template = (category.templates || []).find((tpl) => (tpl.id || tpl.urlTemplate) === mapping.templateId);
    if (!template || !template.urlTemplate) {
      return;
    }

    const targetUrl = fillTemplate(template.urlTemplate, normalizedSelection, rawSelection);
    if (!targetUrl) {
      return;
    }

    await openTargetUrl(targetUrl);
  }
}

function parseMenuId(menuItemId) {
  if (typeof menuItemId !== 'string') {
    return null;
  }

  const parts = menuItemId.split('|');
  if (parts.length < 3) {
    return null;
  }

  const [prefix, type, categoryPart, templatePart] = parts;
  if (prefix !== MENU_PREFIX) {
    return null;
  }

  if (type === 'template') {
    if (!categoryPart || !templatePart) {
      return null;
    }
    return {
      kind: 'template',
      categoryId: decodeURIComponent(categoryPart),
      templateId: decodeURIComponent(templatePart),
    };
  }

  if (type === 'category') {
    if (!categoryPart) {
      return null;
    }
    return {
      kind: 'category',
      categoryId: decodeURIComponent(categoryPart),
    };
  }

  return null;
}

if (hasContextMenusApi()) {
  if (chrome.contextMenus.onShown) {
    chrome.contextMenus.onShown.addListener((info) => {
      handleOnShown(info);
    });
  } else {
    console.info('ContextFill: contextMenus.onShown API unavailable; using content-script updates instead');
  }

  if (chrome.contextMenus.onClicked) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      handleClick(info, tab).catch((error) => console.error('ContextFill onClicked error', error));
    });
  } else {
    console.warn('ContextFill: contextMenus.onClicked API unavailable');
  }
} else {
  console.error('ContextFill: contextMenus API unavailable; extension cannot register menus.');
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_SELECTION_CHANGED) {
      return;
    }

    queueBuild(message.text || '').then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      console.error('ContextFill: failed to process selection message', error);
      sendResponse({ ok: false, error: String(error) });
    });

    return true;
  });
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.categories) {
      queueBuild(currentSelection);
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    queueBuild('');
  });
}

// Initialize menus in case the service worker wakes up without prior events.
queueBuild('');
