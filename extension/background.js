const MENU_PREFIX = 'contextfill';

function createId(...parts) {
  const encodedParts = parts.map((part) => encodeURIComponent(String(part)));
  return [MENU_PREFIX, ...encodedParts].join('|');
}

function getCategories() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ categories: [] }, (result) => {
      resolve(result.categories || []);
    });
  });
}

function removeAllMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => resolve());
  });
}

async function buildMenus(selectionText) {
  const trimmed = (selectionText || '').trim();
  if (!trimmed) {
    return;
  }

  const categories = await getCategories();
  const matchingCategories = [];

  for (const category of categories) {
    if (!category || !category.regex || !Array.isArray(category.templates)) {
      continue;
    }

    let regex;
    try {
      regex = new RegExp(category.regex, 'u');
    } catch (error) {
      console.warn('ContextFill: invalid regex', category.regex, error);
      continue;
    }

    if (!regex.test(trimmed)) {
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
      templates: validTemplates.map((template) => ({
        data: template,
        key: template.id || template.urlTemplate,
      })),
    });
  }

  if (!matchingCategories.length) {
    return;
  }

  for (const { category, categoryKey, templates } of matchingCategories) {
    const hasMultipleCategories = matchingCategories.length > 1;
    const hasMultipleTemplates = templates.length > 1;

    let parentId = null;
    if (hasMultipleCategories || hasMultipleTemplates) {
      parentId = createId('category', categoryKey);
      const title = category.name || 'ContextFill';
      chrome.contextMenus.create({
        id: parentId,
        title,
        contexts: ['selection'],
      });
    }

    for (const template of templates) {
      const menuId = createId('template', categoryKey, template.key);
      const title = hasMultipleTemplates || hasMultipleCategories
        ? template.data.label || category.name || template.data.urlTemplate
        : template.data.label || category.name || 'Open link';

      chrome.contextMenus.create({
        id: menuId,
        title,
        contexts: ['selection'],
        parentId: parentId || undefined,
      });
    }
  }
}

async function handleOnShown(info) {
  if (!info || typeof info.selectionText !== 'string') {
    await removeAllMenus();
    chrome.contextMenus.refresh();
    return;
  }

  await removeAllMenus();
  await buildMenus(info.selectionText);
  chrome.contextMenus.refresh();
}

function fillTemplate(urlTemplate, selection) {
  const encodedSelection = encodeURIComponent(selection);
  let filled = urlTemplate.replace(/\{\{selection\}\}/g, encodedSelection);
  filled = filled.replace(/\{\{rawSelection\}\}/g, selection);
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

  const template = (category.templates || []).find((tpl) => (tpl.id || tpl.urlTemplate) === mapping.templateId);
  if (!template || !template.urlTemplate) {
    return;
  }

  const selection = info.selectionText.trim();
  if (!selection) {
    return;
  }

  const targetUrl = fillTemplate(template.urlTemplate, selection);
  if (!targetUrl) {
    return;
  }

  chrome.tabs.create({ url: targetUrl });
}

function parseMenuId(menuItemId) {
  if (typeof menuItemId !== 'string') {
    return null;
  }

  const parts = menuItemId.split('|');
  if (parts.length < 4) {
    return null;
  }

  const [prefix, type, categoryPart, templatePart] = parts;
  if (prefix !== MENU_PREFIX || type !== 'template') {
    return null;
  }

  return {
    categoryId: decodeURIComponent(categoryPart),
    templateId: decodeURIComponent(templatePart),
  };
}

chrome.contextMenus.onShown.addListener((info, tab) => {
  handleOnShown(info).catch((error) => console.error('ContextFill onShown error', error));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleClick(info, tab).catch((error) => console.error('ContextFill onClicked error', error));
});

chrome.runtime.onInstalled.addListener(() => {
  // Ensure menus start clean when the service worker launches.
  removeAllMenus();
});
