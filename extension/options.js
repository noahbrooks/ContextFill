(function () {
  const categoriesContainer = document.getElementById('categories');
  const addCategoryButton = document.getElementById('addCategory');
  const exportButton = document.getElementById('exportCategories');
  const importTriggerButton = document.getElementById('importCategoriesTrigger');
  const importInput = document.getElementById('importCategories');
  const importCategoryTriggerButton = document.getElementById('importCategoryTrigger');
  const importCategoryInput = document.getElementById('importCategory');
  const statusMessage = document.getElementById('statusMessage');
  const templateRowTemplate = document.getElementById('template-row');
  const replacementRowTemplate = document.getElementById('replacement-row');

  let categories = [];
  let statusTimer = null;

  function sanitizeFlags(flags) {
    const cleaned = String(flags || '').replace(/[^gimsuy]/gi, '');
    const unique = Array.from(new Set(cleaned.toLowerCase().split(''))).join('');
    return unique || 'g';
  }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
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

  function getDefaultCategories() {
    return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }

  function showStatus(message, type) {
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = message || '';
    const baseClass = 'status-message';
    statusMessage.className = type ? `${baseClass} ${type}` : baseClass;

    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }

    if (message) {
      statusTimer = setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = baseClass;
      }, 4000);
    }
  }

  function loadCategories() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ categories: [] }, (result) => {
        resolve(result.categories || []);
      });
    });
  }

  function saveCategories() {
    chrome.storage.sync.set({ categories });
  }

  function normalizeCategory(category) {
    const safeCategory = {
      id: category && category.id ? category.id : uuid(),
      name: category && category.name ? category.name : '',
      regex: category && category.regex ? category.regex : '',
    };

    const templates = Array.isArray(category && category.templates) ? category.templates : [];
    safeCategory.templates = templates.map((template) => ({
      id: template && template.id ? template.id : uuid(),
      label: template && template.label ? template.label : '',
      urlTemplate: template && template.urlTemplate ? template.urlTemplate : '',
    }));

    if (!safeCategory.templates.length) {
      safeCategory.templates = [
        {
          id: uuid(),
          label: '',
          urlTemplate: '',
        },
      ];
    }

    const replacements = Array.isArray(category && category.replacements) ? category.replacements : [];
    safeCategory.replacements = replacements.map((replacement) => ({
      id: replacement && replacement.id ? replacement.id : uuid(),
      pattern: replacement && replacement.pattern ? replacement.pattern : '',
      replacement: replacement && typeof replacement.replacement === 'string'
        ? replacement.replacement
        : '',
      flags: sanitizeFlags(replacement && replacement.flags ? replacement.flags : 'g'),
    }));

    return safeCategory;
  }

  function normalizeCategoriesList(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list.map((category) => normalizeCategory(category));
  }

  function updateCategory(categoryId, updater) {
    const index = categories.findIndex((cat) => cat.id === categoryId);
    if (index === -1) {
      return;
    }
    const updated = { ...categories[index] };
    updater(updated);
    categories = [
      ...categories.slice(0, index),
      updated,
      ...categories.slice(index + 1),
    ];
    saveCategories();
  }

  function createCategoryHeadingElements(category) {
    const heading = document.createElement('header');
    heading.className = 'category-heading';

    const nameBadge = document.createElement('span');
    nameBadge.className = 'category-name-badge';

    const regexText = document.createElement('span');
    regexText.className = 'category-regex';

    function setName(value) {
      const text = value && value.trim() ? value.trim() : 'Untitled category';
      nameBadge.textContent = text;
    }

    function setRegex(value) {
      const text = value && value.trim() ? value.trim() : 'No regular expression set';
      regexText.textContent = text;
      if (value && value.trim()) {
        regexText.classList.remove('empty');
      } else {
        regexText.classList.add('empty');
      }
    }

    setName(category.name);
    setRegex(category.regex);

    heading.appendChild(nameBadge);
    heading.appendChild(regexText);

    return {
      heading,
      setName,
      setRegex,
    };
  }

  function renderTemplateRow(category, template) {
    const fragment = templateRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.template-row');
    const labelInput = row.querySelector('.template-label');
    const urlInput = row.querySelector('.template-url');
    const removeButton = row.querySelector('.remove-template');

    labelInput.value = template.label || '';
    urlInput.value = template.urlTemplate || '';

    labelInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        const templates = (cat.templates || []).map((tpl) => {
          if (tpl.id === template.id) {
            return { ...tpl, label: event.target.value };
          }
          return tpl;
        });
        cat.templates = templates;
      });
    });

    urlInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        const templates = (cat.templates || []).map((tpl) => {
          if (tpl.id === template.id) {
            return { ...tpl, urlTemplate: event.target.value };
          }
          return tpl;
        });
        cat.templates = templates;
      });
    });

    removeButton.addEventListener('click', () => {
      updateCategory(category.id, (cat) => {
        cat.templates = (cat.templates || []).filter((tpl) => tpl.id !== template.id);
      });
      renderCategories();
    });

    return row;
  }

  function renderReplacementRow(category, replacement) {
    const fragment = replacementRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.replacement-row');
    const patternInput = row.querySelector('.replacement-pattern');
    const valueInput = row.querySelector('.replacement-value');
    const flagsInput = row.querySelector('.replacement-flags');
    const removeButton = row.querySelector('.remove-replacement');

    patternInput.value = replacement.pattern || '';
    valueInput.value = replacement.replacement || '';
    flagsInput.value = replacement.flags || 'g';

    patternInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        const replacements = (cat.replacements || []).map((rule) => {
          if (rule.id === replacement.id) {
            return { ...rule, pattern: event.target.value };
          }
          return rule;
        });
        cat.replacements = replacements;
      });
    });

    valueInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        const replacements = (cat.replacements || []).map((rule) => {
          if (rule.id === replacement.id) {
            return { ...rule, replacement: event.target.value };
          }
          return rule;
        });
        cat.replacements = replacements;
      });
    });

    flagsInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        const replacements = (cat.replacements || []).map((rule) => {
          if (rule.id === replacement.id) {
            return { ...rule, flags: sanitizeFlags(event.target.value) };
          }
          return rule;
        });
        cat.replacements = replacements;
      });
      flagsInput.value = sanitizeFlags(event.target.value);
    });

    removeButton.addEventListener('click', () => {
      updateCategory(category.id, (cat) => {
        cat.replacements = (cat.replacements || []).filter((rule) => rule.id !== replacement.id);
      });
      renderCategories();
    });

    return row;
  }

  function renderCategory(category) {
    const card = document.createElement('article');
    card.className = 'category-card';

    const headingElements = createCategoryHeadingElements(category);
    card.appendChild(headingElements.heading);

    const header = document.createElement('div');
    header.className = 'category-header';

    const nameLabel = document.createElement('label');
    nameLabel.innerHTML = '<span>Name</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'IP Addresses';
    nameInput.value = category.name || '';
    nameInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        cat.name = event.target.value;
      });
      headingElements.setName(event.target.value);
    });
    nameLabel.appendChild(nameInput);

    const regexLabel = document.createElement('label');
    regexLabel.innerHTML = '<span>Regular expression</span>';
    const regexInput = document.createElement('input');
    regexInput.type = 'text';
    regexInput.placeholder = '^(?:\\d{1,3}\\.){3}\\d{1,3}$';
    regexInput.value = category.regex || '';
    regexInput.addEventListener('input', (event) => {
      updateCategory(category.id, (cat) => {
        cat.regex = event.target.value;
      });
      headingElements.setRegex(event.target.value);
    });
    regexLabel.appendChild(regexInput);

    header.appendChild(nameLabel);
    header.appendChild(regexLabel);

    const normalizationSection = document.createElement('section');
    normalizationSection.className = 'normalization-section';

    const normalizationHeader = document.createElement('div');
    normalizationHeader.className = 'subsection-header';
    const normalizationTitle = document.createElement('span');
    normalizationTitle.textContent = 'Normalization rules';
    const addRuleButton = document.createElement('button');
    addRuleButton.type = 'button';
    addRuleButton.textContent = 'Add rule';
    addRuleButton.className = 'secondary';
    addRuleButton.addEventListener('click', () => {
      updateCategory(category.id, (cat) => {
        const next = Array.isArray(cat.replacements) ? [...cat.replacements] : [];
        next.push({
          id: uuid(),
          pattern: '',
          replacement: '',
          flags: 'g',
        });
        cat.replacements = next;
      });
      renderCategories();
    });

    normalizationHeader.appendChild(normalizationTitle);
    normalizationHeader.appendChild(addRuleButton);

    const replacementList = document.createElement('div');
    replacementList.className = 'replacement-list';

    const replacements = category.replacements || [];
    if (!replacements.length) {
      const empty = document.createElement('p');
      empty.className = 'replacement-empty';
      empty.textContent = 'No normalization rules. Add one to clean up defanged text before matching.';
      replacementList.appendChild(empty);
    } else {
      replacements.forEach((replacement) => {
        replacementList.appendChild(renderReplacementRow(category, replacement));
      });
    }

    normalizationSection.appendChild(normalizationHeader);
    normalizationSection.appendChild(replacementList);

    const templateList = document.createElement('div');
    templateList.className = 'template-list';

    const templates = category.templates || [];
    if (!templates.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Add at least one URL template.';
      templateList.appendChild(empty);
    } else {
      templates.forEach((template) => {
        templateList.appendChild(renderTemplateRow(category, template));
      });
    }

    const footer = document.createElement('div');
    footer.className = 'category-footer';

    const addTemplateButton = document.createElement('button');
    addTemplateButton.type = 'button';
    addTemplateButton.textContent = 'Add URL template';
    addTemplateButton.addEventListener('click', () => {
      updateCategory(category.id, (cat) => {
        const nextTemplates = Array.isArray(cat.templates) ? [...cat.templates] : [];
        nextTemplates.push({
          id: uuid(),
          label: '',
          urlTemplate: '',
        });
        cat.templates = nextTemplates;
      });
      renderCategories();
    });

    const removeCategoryButton = document.createElement('button');
    removeCategoryButton.type = 'button';
    removeCategoryButton.textContent = 'Remove category';
    removeCategoryButton.className = 'secondary';
    removeCategoryButton.addEventListener('click', () => {
      categories = categories.filter((cat) => cat.id !== category.id);
      saveCategories();
      renderCategories();
    });

    const exportCategoryButton = document.createElement('button');
    exportCategoryButton.type = 'button';
    exportCategoryButton.textContent = 'Export category';
    exportCategoryButton.className = 'secondary';
    exportCategoryButton.addEventListener('click', () => {
      exportSingleCategory(category);
    });

    footer.appendChild(addTemplateButton);
    footer.appendChild(removeCategoryButton);
    footer.appendChild(exportCategoryButton);

    card.appendChild(header);
    card.appendChild(normalizationSection);
    card.appendChild(templateList);
    card.appendChild(footer);

    return card;
  }

  function renderCategories() {
    if (categories.length) {
      categoriesContainer.dataset.count = categories.length;
    } else {
      delete categoriesContainer.dataset.count;
    }

    categoriesContainer.innerHTML = '';
    if (!categories.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No categories yet. Add one to get started.';
      categoriesContainer.appendChild(empty);
      return;
    }

    categories.forEach((category) => {
      categoriesContainer.appendChild(renderCategory(category));
    });
  }

  function addCategory() {
    const newCategory = {
      id: uuid(),
      name: '',
      regex: '',
      templates: [
        {
          id: uuid(),
          label: '',
          urlTemplate: '',
        },
      ],
      replacements: [],
    };
    categories = [...categories, newCategory];
    saveCategories();
    renderCategories();
    showStatus('Category added.', 'success');
  }

  function exportCategories() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        regex: category.regex,
        templates: (category.templates || []).map((template) => ({
          id: template.id,
          label: template.label,
          urlTemplate: template.urlTemplate,
        })),
        replacements: (category.replacements || []).map((replacement) => ({
          id: replacement.id,
          pattern: replacement.pattern,
          replacement: replacement.replacement,
          flags: replacement.flags,
        })),
      })),
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `contextfill-settings-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showStatus('Settings exported.', 'success');
  }

  function exportSingleCategory(category) {
    if (!category) {
      showStatus('Could not export category.', 'error');
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      category: {
        id: category.id,
        name: category.name,
        regex: category.regex,
        templates: (category.templates || []).map((template) => ({
          id: template.id,
          label: template.label,
          urlTemplate: template.urlTemplate,
        })),
        replacements: (category.replacements || []).map((replacement) => ({
          id: replacement.id,
          pattern: replacement.pattern,
          replacement: replacement.replacement,
          flags: replacement.flags,
        })),
      },
    };

    const safeName = (category.name || 'category').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `contextfill-category-${safeName}-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showStatus(`Exported “${category.name || 'Untitled category'}”.`, 'success');
  }

  function ensureUniqueCategoryIds(importedCategory) {
    let safeCategory = { ...importedCategory };
    while (categories.some((cat) => cat.id === safeCategory.id)) {
      safeCategory = { ...safeCategory, id: uuid() };
    }

    const existingTemplateIds = new Set();
    const existingReplacementIds = new Set();

    categories.forEach((cat) => {
      (cat.templates || []).forEach((tpl) => existingTemplateIds.add(tpl.id));
      (cat.replacements || []).forEach((rule) => existingReplacementIds.add(rule.id));
    });

    safeCategory.templates = (safeCategory.templates || []).map((template) => {
      let safeTemplate = { ...template };
      while (existingTemplateIds.has(safeTemplate.id)) {
        safeTemplate = { ...safeTemplate, id: uuid() };
      }
      existingTemplateIds.add(safeTemplate.id);
      return safeTemplate;
    });

    safeCategory.replacements = (safeCategory.replacements || []).map((replacement) => {
      let safeReplacement = {
        ...replacement,
        flags: sanitizeFlags(replacement.flags),
      };
      while (existingReplacementIds.has(safeReplacement.id)) {
        safeReplacement = { ...safeReplacement, id: uuid() };
      }
      existingReplacementIds.add(safeReplacement.id);
      return safeReplacement;
    });

    return safeCategory;
  }

  function applyImportedCategories(importedCategories) {
    categories = normalizeCategoriesList(importedCategories);
    saveCategories();
    renderCategories();
    const count = categories.length;
    const templateCount = categories.reduce((total, category) => total + (category.templates ? category.templates.length : 0), 0);
    showStatus(`Imported ${count} categor${count === 1 ? 'y' : 'ies'} with ${templateCount} template${templateCount === 1 ? '' : 's'}.`, 'success');
  }

  function applyImportedCategory(importedCategory) {
    const normalized = normalizeCategory(importedCategory);
    const unique = ensureUniqueCategoryIds(normalized);
    categories = [...categories, unique];
    saveCategories();
    renderCategories();
    const templateCount = unique.templates ? unique.templates.length : 0;
    showStatus(`Added category “${unique.name || 'Untitled category'}” with ${templateCount} template${templateCount === 1 ? '' : 's'}.`, 'success');
  }

  function handleImportFile(files) {
    if (!files || !files.length) {
      return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const data = JSON.parse(text);
        const imported = Array.isArray(data) ? data : data && Array.isArray(data.categories) ? data.categories : null;
        if (!imported) {
          throw new Error('Invalid settings format.');
        }
        applyImportedCategories(imported);
      } catch (error) {
        console.error('ContextFill: failed to import categories', error);
        showStatus('Import failed. Please select a valid settings file.', 'error');
      } finally {
        importInput.value = '';
      }
    };
    reader.onerror = () => {
      showStatus('Import failed. Could not read the file.', 'error');
      importInput.value = '';
    };
    reader.readAsText(file);
  }

  function handleImportCategoryFile(files) {
    if (!files || !files.length) {
      return;
    }

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const data = JSON.parse(text);
        const imported = data && data.category
          ? data.category
          : Array.isArray(data) && data.length > 0
            ? data[0]
            : null;

        if (!imported) {
          throw new Error('Invalid category format.');
        }

        applyImportedCategory(imported);
      } catch (error) {
        console.error('ContextFill: failed to import category', error);
        showStatus('Category import failed. Please select a valid category file.', 'error');
      } finally {
        importCategoryInput.value = '';
      }
    };
    reader.onerror = () => {
      showStatus('Category import failed. Could not read the file.', 'error');
      importCategoryInput.value = '';
    };
    reader.readAsText(file);
  }

  async function init() {
    categories = await loadCategories();
    if (!Array.isArray(categories)) {
      categories = [];
    }

    categories = normalizeCategoriesList(categories);

    if (!categories.length) {
      categories = normalizeCategoriesList(getDefaultCategories());
      saveCategories();
    }

    saveCategories();
    renderCategories();
  }

  addCategoryButton.addEventListener('click', addCategory);
  exportButton.addEventListener('click', () => {
    if (!categories.length) {
      showStatus('Nothing to export yet.', 'error');
      return;
    }
    exportCategories();
  });

  importTriggerButton.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (event) => {
    handleImportFile(event.target.files || []);
  });

  importCategoryTriggerButton.addEventListener('click', () => {
    importCategoryInput.click();
  });

  importCategoryInput.addEventListener('change', (event) => {
    handleImportCategoryFile(event.target.files || []);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
