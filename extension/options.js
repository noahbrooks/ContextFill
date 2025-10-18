(function () {
  const categoriesContainer = document.getElementById('categories');
  const addCategoryButton = document.getElementById('addCategory');
  const templateRowTemplate = document.getElementById('template-row');

  let categories = [];

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
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

  function renderCategory(category) {
    const card = document.createElement('article');
    card.className = 'category-card';

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
    });
    regexLabel.appendChild(regexInput);

    header.appendChild(nameLabel);
    header.appendChild(regexLabel);

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

    footer.appendChild(addTemplateButton);
    footer.appendChild(removeCategoryButton);

    card.appendChild(header);
    card.appendChild(templateList);
    card.appendChild(footer);

    return card;
  }

  function renderCategories() {
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
    };
    categories = [...categories, newCategory];
    saveCategories();
    renderCategories();
  }

  async function init() {
    categories = await loadCategories();
    if (!Array.isArray(categories)) {
      categories = [];
    }

    // Ensure every category and template has an id for stable tracking.
    categories = categories.map((category) => {
      const safeCategory = {
        id: category.id || uuid(),
        name: category.name || '',
        regex: category.regex || '',
      };

      const templates = Array.isArray(category.templates) ? category.templates : [];
      safeCategory.templates = templates.map((template) => ({
        id: template.id || uuid(),
        label: template.label || '',
        urlTemplate: template.urlTemplate || '',
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

      return safeCategory;
    });

    saveCategories();
    renderCategories();
  }

  addCategoryButton.addEventListener('click', addCategory);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
