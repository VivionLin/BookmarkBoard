document.addEventListener('DOMContentLoaded', () => {

    /* ========================================================
       THEME MANAGER
       Handles applying and switching themes.
       ======================================================== */
    const ThemeManager = (() => {
        const themes = [
            {key: 'theme_material', value: 'material-you-theme'},
            {key: 'theme_frosted_glass', value: 'frosted-glass-theme'},
            {key: 'theme_sticky_note', value: 'sticky-note-theme'},
            {key: 'theme_bujo', value: 'bujo-theme'},
            {key: 'theme_latex', value: 'latex-theme'},
            {key: 'theme_pop_art', value: 'pop-art-theme'},
            {key: 'theme_commute_dark', value: 'commute-dark-theme', nightMode: true},
            {key: 'theme_neon', value: 'neon-red-blue-theme', nightMode: true},
            {key: 'theme_cyberpunk', value: 'cyberpunk-theme', nightMode: true},
            {key: 'theme_hacker', value: 'hacker-theme', nightMode: true},
            {key: 'theme_blackboard', value: 'blackboard-theme', nightMode: true}
        ];

        function applyTheme(theme) {
            themes.forEach(t => document.body.classList.remove(t.value));
            document.body.classList.add(theme);
        }

        function buildThemeSelector(activeThemeValue) {
            const themeTrigger = document.getElementById('theme-dropdown-trigger');
            const themeOptionsContainer = document.getElementById('theme-options');
            const themeLabel = document.getElementById('current-theme-name');

            themeOptionsContainer.innerHTML = '';

            themes.forEach(t => {
                const optionEl = document.createElement('div');
                const localizedName = chrome.i18n.getMessage(t.key) || t.key;

                optionEl.className = 'theme-option';
                if (t.value === activeThemeValue) {
                    optionEl.classList.add('selected');
                    themeLabel.textContent = localizedName;
                }
                
                optionEl.innerHTML = `<span>${t.nightMode ? '🌙' : ''}</span><span>${localizedName}</span>`;
                
                optionEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyTheme(t.value);
                    chrome.storage.local.set({ theme: t.value });
                    themeLabel.textContent = localizedName;
                    
                    document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('selected'));
                    optionEl.classList.add('selected');
                    themeTrigger.classList.remove('open');
                });
                
                themeOptionsContainer.appendChild(optionEl);
            });

            themeTrigger.addEventListener('click', () => themeTrigger.classList.toggle('open'));
            document.addEventListener('click', (e) => {
                if (!themeTrigger.contains(e.target)) {
                    themeTrigger.classList.remove('open');
                }
            });
        }

        return {
            init: () => {
                chrome.storage.local.get('theme', ({ theme }) => {
                    let activeTheme = themes[0].value; // default to first theme
                    if (theme && themes.some(t => t.value === theme)) {
                        activeTheme = theme;
                    }
                    buildThemeSelector(activeTheme);
                    applyTheme(activeTheme);
                });
            }
        };
    })();


    /* ========================================================
       HEADER MANAGER
       Handles header UI interactions like the overflow menu.
       ======================================================== */
    const HeaderManager = (() => {
        return {
            init: () => {
                const overflowBtn = document.getElementById('overflow-btn');
                const overflowOptions = document.getElementById('overflow-options');
                const themeTrigger = document.getElementById('theme-dropdown-trigger');

                if (overflowBtn && overflowOptions) {
                    // Toggle menu on button click
                    overflowBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); 
                        overflowOptions.classList.toggle('show');
                        
                        // Close theme dropdown if it happens to be open
                        if (themeTrigger) {
                            themeTrigger.classList.remove('open');
                        }
                    });

                    // Close overflow menu when clicking anywhere else
                    document.addEventListener('click', (e) => {
                        const overflowMenuWrapper = document.querySelector('.overflow-menu-wrapper');
                        if (overflowMenuWrapper && !overflowMenuWrapper.contains(e.target)) {
                            overflowOptions.classList.remove('show');
                        }
                    });
                }
            }
        };
    })();


    /* ========================================================
       BOOKMARK UI MANAGER
       Handles fetching, rendering, and collapsing bookmarks.
       ======================================================== */
    const BookmarkManager = (() => {
        const tabsContainer = document.getElementById('tabs-container');
        const panelsContainer = document.getElementById('tab-panels-container');
        let collapsedStates = {};
        let activeTabId = null;

        function updateAndSaveState(id, isCollapsed) {
            collapsedStates[id] = isCollapsed;
            chrome.storage.sync.set({ collapsedStates });
        }

        function getDomain(url) {
            try { return new URL(url).hostname; } 
            catch (e) { return url; }
        }

        // Helper function to extract average color from an image
        function getAverageRGB(imgEl) {
            const defaultRGB = {r: 255, g: 255, b: 255}; // Default to white
            const canvas = document.createElement('canvas');
            const context = canvas.getContext && canvas.getContext('2d');
            
            if (!context) return defaultRGB;

            const height = canvas.height = imgEl.naturalHeight || imgEl.offsetHeight || 32;
            const width = canvas.width = imgEl.naturalWidth || imgEl.offsetWidth || 32;

            context.drawImage(imgEl, 0, 0);

            let data;
            try {
                data = context.getImageData(0, 0, width, height);
            } catch(e) {
                // Catch Security errors if canvas is tainted
                return defaultRGB;
            }

            const length = data.data.length;
            let rgb = {r: 0, g: 0, b: 0};
            let count = 0;
            const blockSize = 5; // Look at every 5th pixel to speed up calculation

            for (let i = 0; i < length; i += blockSize * 4) {
                // Skip fully transparent pixels
                if (data.data[i + 3] === 0) continue; 
                
                count++;
                rgb.r += data.data[i];
                rgb.g += data.data[i+1];
                rgb.b += data.data[i+2];
            }

            if (count === 0) return defaultRGB;

            rgb.r = Math.floor(rgb.r / count);
            rgb.g = Math.floor(rgb.g / count);
            rgb.b = Math.floor(rgb.b / count);

            return rgb;
        }

        function createCard(bookmark) {
            const card = document.createElement('a');
            card.className = 'card draggable-item';
            card.href = bookmark.url;
            card.target = '_blank';
            card.dataset.id = bookmark.id;
            card.dataset.index = bookmark.index;
            card.draggable = true;

            const domain = getDomain(bookmark.url);
            const icon = document.createElement('img');
            icon.className = 'card-icon';

            icon.crossOrigin = "Anonymous";

            icon.onerror = function() {
                if (!this.dataset.fallbackAttempted) {
                    this.dataset.fallbackAttempted = 'true';
                    this.src = `/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=32`;
                }
            };

            icon.onload = function() {
                const rgb = getAverageRGB(icon);
                card.style.setProperty('--icon-color', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
            };

            icon.src = `https://icon.horse/icon/${domain}`;

            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = bookmark.title || domain;
            
            card.appendChild(icon);
            card.appendChild(title);
            return card;
        }

        function processSecondLevelFolder(secondLevelFolder, parentElement) {
            const blockContainer = document.createElement('div');
            blockContainer.className = 'folder-block draggable-item';
            blockContainer.dataset.id = secondLevelFolder.id; 
            blockContainer.dataset.index = secondLevelFolder.index;
            blockContainer.draggable = true;
            
            if (collapsedStates[secondLevelFolder.id]) blockContainer.classList.add('collapsed');
            
            const folderTitle = document.createElement('h2');
            folderTitle.className = 'folder-title';
            folderTitle.textContent = secondLevelFolder.title;
            blockContainer.appendChild(folderTitle);

            folderTitle.addEventListener('mousedown', e => e.stopPropagation());

            folderTitle.addEventListener('click', () => {
                if (document.body.classList.contains('is-searching')) return;

                const isCollapsing = !blockContainer.classList.contains('collapsed');
                blockContainer.classList.toggle('collapsed');
                updateAndSaveState(secondLevelFolder.id, isCollapsing);
            });

            const containerForChildren = document.createElement('div');
            containerForChildren.className = 'folder-items';
            blockContainer.appendChild(containerForChildren);
            parentElement.appendChild(blockContainer);

            secondLevelFolder.children.forEach(thirdLevelNode => processThirdPlusLevelNode(thirdLevelNode, containerForChildren));
        }

        function processThirdPlusLevelNode(deeperLevelNode, parentElement) {
            if (deeperLevelNode.children) {
                // It's a nested folder -> create a dashed group
                const folderGroup = document.createElement('div');
                folderGroup.className = 'folder-group draggable-item';

                // Allow subfolders to be dragged and reordered too!
                folderGroup.draggable = true;
                folderGroup.dataset.id = deeperLevelNode.id; 
                folderGroup.dataset.index = deeperLevelNode.index;
                
                if (collapsedStates[deeperLevelNode.id]) folderGroup.classList.add('collapsed');

                const folderTitle = document.createElement('h2');
                folderTitle.className = 'folder-title';
                folderTitle.textContent = deeperLevelNode.title;
                folderGroup.appendChild(folderTitle);

                // Prevent drag from starting when interacting with the collapse title
                folderTitle.addEventListener('mousedown', e => e.stopPropagation());
                folderTitle.addEventListener('click', () => {
                    if (document.body.classList.contains('is-searching')) return;

                    const isCollapsing = !folderGroup.classList.contains('collapsed');
                    folderGroup.classList.toggle('collapsed');
                    updateAndSaveState(deeperLevelNode.id, isCollapsing);
                });

                const itemsContainer = document.createElement('div');
                itemsContainer.className = 'folder-items';
                folderGroup.appendChild(itemsContainer);
                parentElement.appendChild(folderGroup);
                
                deeperLevelNode.children.forEach(node => processThirdPlusLevelNode(node, itemsContainer));
            } else if (deeperLevelNode.url) {
                // It's a bookmark -> create a card
                parentElement.appendChild(createCard(deeperLevelNode));
            }
        }

        function buildUI() {
            chrome.bookmarks.getTree((bookmarkTree) => {
                const topLevelFolders = bookmarkTree[0].children;

                topLevelFolders.forEach((folder, index) => {
                    if (!folder.children) return; 

                    // Create Tab
                    const tab = document.createElement('button');
                    tab.className = 'tab-button';
                    tab.textContent = folder.title;
                    tab.dataset.tabId = folder.id;
                    tabsContainer.appendChild(tab);

                    // Create Panel
                    const panel = document.createElement('div');
                    panel.className = 'tab-panel';
                    panel.id = `panel-${folder.id}`;
                    panel.dataset.id = folder.id; 
                    panelsContainer.appendChild(panel);

                    const directBookmarks = folder.children.filter(node => node.url);
                    const subFolders = folder.children.filter(node => node.children);

                    subFolders.forEach(secondLevelFolder => processSecondLevelFolder(secondLevelFolder, panel));

                    // Create a "free" block for direct bookmarks and add it to the bottom
                    if (directBookmarks.length > 0) {
                        const blockContainer = document.createElement('div');
                        blockContainer.className = 'folder-block';
                        blockContainer.dataset.id = folder.id; 
                        
                        const containerForChildren = document.createElement('div');
                        containerForChildren.className = 'folder-items';
                        directBookmarks.forEach(bookmark => containerForChildren.appendChild(createCard(bookmark)));
                        
                        blockContainer.appendChild(containerForChildren);
                        panel.appendChild(blockContainer);
                    }

                    if ((activeTabId && folder.id === activeTabId) || (!activeTabId && index === 0)) {
                        tab.classList.add('active');
                        panel.classList.add('active');
                    }
                });

                tabsContainer.addEventListener('click', (e) => {
                    if (e.target.matches('.tab-button')) {
                        const tabId = e.target.dataset.tabId;
                        activeTabId = tabId;

                        tabsContainer.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
                        panelsContainer.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

                        e.target.classList.add('active');
                        document.getElementById(`panel-${tabId}`).classList.add('active');
                    }
                });

                const searchInput = document.getElementById('search-input');
                if (searchInput && searchInput.value.trim() !== '') {
                    searchInput.dispatchEvent(new Event('input'));
                }
            });
        }

        function refreshUI() {
            const activeTab = document.querySelector('.tab-button.active');
            if (activeTab) activeTabId = activeTab.dataset.tabId;
            tabsContainer.innerHTML = '';
            panelsContainer.innerHTML = '';
            buildUI();
        }

        function syncWithChrome() {
            let isImporting = false;

            // Debounce timer to prevent the UI from refreshing 100 times 
            // if a user imports a large folder of bookmarks all at once.
            let refreshTimeout;
            const triggerRefresh = () => {
                if (isImporting) return;

                clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    // Don't refresh if the user is currently searching, 
                    // as it would disrupt their search results
                    if (!document.body.classList.contains('is-searching')) {
                        BookmarkManager.refreshUI();
                    }
                }, 100); 
            };

            chrome.bookmarks.onCreated.addListener(triggerRefresh);
            chrome.bookmarks.onRemoved.addListener(triggerRefresh);
            chrome.bookmarks.onChanged.addListener(triggerRefresh);
            chrome.bookmarks.onMoved.addListener(triggerRefresh);
            chrome.bookmarks.onChildrenReordered.addListener(triggerRefresh);
            chrome.bookmarks.onImportBegan.addListener(() => isImporting = true);
            chrome.bookmarks.onImportEnded.addListener(() => {
                isImporting = false;
                triggerRefresh(); 
            });
        };

        return {
            init: () => {
                chrome.storage.sync.get('collapsedStates', (result) => {
                    if (result.collapsedStates) collapsedStates = result.collapsedStates;
                    buildUI();
                    syncWithChrome();
                });
            },
            refreshUI: refreshUI
        };
    })();


    /* ========================================================
       DRAG AND DROP MANAGER
       Handles moving bookmarks/folders around.
       ======================================================== */
    const DragDropManager = (() => {
        const dragIndicator = document.createElement('div');
        dragIndicator.className = 'drag-indicator';

        // Helper to find which element the mouse is hovering "before"
        function getDragAfterElement(container, x, y) {
            const draggableElements = [...container.querySelectorAll(':scope >.draggable-item:not(.dragging)')];
            const isVertical = container.classList.contains('tab-panel') || container.classList.contains('folder-items');
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                if (isVertical) {
                    // Vertical drag logic for folder blocks
                    const offset = y - (box.top + box.height / 2);
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    }
                } else {
                    // Horizontal drag logic for bookmark cards
                    if (y >= box.top - 15 && y <= box.bottom + 15) {
                        const offset = x - (box.left + box.width / 2);
                        if (offset < 0 && offset > closest.offset) {
                            return { offset: offset, element: child };
                        }
                    }
                }
                return closest;
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        return {
            init: (onDropSuccess) => {
                document.addEventListener('dragstart', (e) => {
                    if (document.body.classList.contains('is-searching')) {
                        e.preventDefault();
                        return;
                    }

                    const item = e.target.closest('.draggable-item');
                    if (item) {
                        e.stopPropagation(); // prevent parent folders from also starting drag
                        e.dataTransfer.setData('text/plain', item.dataset.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setTimeout(() => item.classList.add('dragging'), 0);
                    }
                });

                document.addEventListener('dragend', (e) => {
                    const item = e.target.closest('.draggable-item');
                    if (item) item.classList.remove('dragging');
                    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    if (dragIndicator.parentNode) dragIndicator.parentNode.removeChild(dragIndicator);
                });

                document.addEventListener('dragover', (e) => {
                    const dropZone = e.target.closest('.folder-items, .tab-panel');
                    if (dropZone) {
                        e.preventDefault();
                        e.stopPropagation();

                        e.dataTransfer.dropEffect = 'move';

                        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                        dropZone.classList.add('drag-over');

                        // Move the drag indicator line
                        const afterElement = getDragAfterElement(dropZone, e.clientX, e.clientY);
                        if (afterElement) dropZone.insertBefore(dragIndicator, afterElement);
                        else dropZone.appendChild(dragIndicator);
                    }
                });

                document.addEventListener('dragleave', (e) => {
                    const dropZone = e.target.closest('.folder-items, .tab-panel');
                    if (dropZone && !dropZone.contains(e.relatedTarget)) {
                        dropZone.classList.remove('drag-over');
                    }
                });

                document.addEventListener('drop', (e) => {
                    const dropZone = e.target.closest('.folder-items, .tab-panel');
                    if (dropZone) {
                        e.preventDefault();
                        dropZone.classList.remove('drag-over');
                        
                        const bookmarkId = e.dataTransfer.getData('text/plain');
                        const parentElement = dropZone.closest('.folder-group, .folder-block, .tab-panel');
                        
                        if (parentElement && bookmarkId) {
                            const newParentId = parentElement.dataset.id;

                            // Determine exactly what index to insert at based on the indicator's DOM location
                            let targetIndex = undefined;
                            if (dragIndicator.nextElementSibling) {
                                const nextItem = dragIndicator.nextElementSibling;
                                if (nextItem && nextItem.dataset.index !== undefined) {
                                    targetIndex = parseInt(nextItem.dataset.index, 10);
                                }
                            }

                            // Clean up indicator instantly
                            if (dragIndicator.parentNode) dragIndicator.parentNode.removeChild(dragIndicator);

                            const moveProps = { parentId: newParentId };
                            if (targetIndex !== undefined) moveProps.index = targetIndex;

                            chrome.bookmarks.move(bookmarkId, moveProps, () => onDropSuccess());
                        }
                    }
                });
            }
        };
    })();


    /* ========================================================
       SEARCH MANAGER
       Handles filtering the UI based on search input.
       ======================================================== */
    const SearchManager = (() => {
        return {
            init: () => {
                const searchInput = document.getElementById('search-input');
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    const allCards = document.querySelectorAll('.card');
                    const allFolders = document.querySelectorAll('.folder-block, .folder-group');
                    const allPanels = document.querySelectorAll('.tab-panel');

                    if (!query) {
                        document.body.classList.remove('is-searching');
                        allCards.forEach(c => c.style.display = '');
                        allFolders.forEach(f => f.style.display = '');
                        allPanels.forEach(panel => panel.style.display = '');
                        return;
                    }

                    document.body.classList.add('is-searching');

                    // Hide all items initially
                    allCards.forEach(c => c.style.display = 'none');
                    allFolders.forEach(f => f.style.display = 'none');

                    // 1. Show matching cards and their ancestors
                    allCards.forEach(card => {
                        const title = card.querySelector('.card-title').textContent.toLowerCase();
                        const url = card.href.toLowerCase();
                        if (title.includes(query) || url.includes(query)) {
                            card.style.display = 'flex';

                            // Traverse up and make sure parent folders are visible
                            let parent = card.parentElement;
                            while (parent && parent.id !== 'tab-panels-container') {
                                if (parent.classList.contains('folder-block') || parent.classList.contains('folder-group')) {
                                    parent.style.display = 'block';
                                }
                                parent = parent.parentElement;
                            }
                        }
                    });

                    // 2. Show matching folders (and reveal all their children)
                    allFolders.forEach(folder => {
                        const titleElement = folder.querySelector('.folder-title');
                        if (titleElement && titleElement.textContent.toLowerCase().includes(query)) {
                            folder.style.display = 'block';
                            folder.querySelectorAll('.folder-block, .folder-group').forEach(f => f.style.display = 'block');
                            folder.querySelectorAll('.card').forEach(c => c.style.display = 'flex');
                            
                            // Ensure ancestors are visible
                            let parent = folder.parentElement;
                            while (parent && parent.id !== 'tab-panels-container') {
                                if (parent.classList.contains('folder-block') || parent.classList.contains('folder-group')) {
                                    parent.style.display = 'block';
                                }
                                parent = parent.parentElement;
                            }
                        }
                    });

                    // 3. Show/hide whole Tab Panels based on whether they contain any results
                    allPanels.forEach(panel => {
                        const hasVisibleContent = Array.from(panel.querySelectorAll('.card, .folder-block, .folder-group')).some(el => {
                            return el.style.display === 'flex' || el.style.display === 'block';
                        });
                        panel.style.display = hasVisibleContent ? 'flex' : 'none';
                    });
                });
            }
        };
    })();


    /* ========================================================
       CONTEXT MENU MANAGER
       Handles right-clicks, creation, and deletion.
       ======================================================== */
    const ContextMenuManager = (() => {
        let currentContextMenuTarget = null;
        let currentContextMenuType = null; 

        return {
            init: (onUpdateSuccess) => {
                const contextMenu = document.getElementById('context-menu');
                const cmCreateFolder = document.getElementById('cm-create-folder');
                const cmCreateBookmark = document.getElementById('cm-create-bookmark');
                const cmRename = document.getElementById('cm-rename');
                const cmDelete = document.getElementById('cm-delete');

                document.addEventListener('contextmenu', (e) => {
                    // Prevent default browser menu if right clicking a component
                    const card = e.target.closest('.card');
                    let folder = e.target.closest('.folder-group, .folder-block, .tab-panel');

                    if (!card && !folder && !e.target.closest('header')) {
                        folder = document.querySelector('.tab-panel.active');
                    }

                    if (card || folder) {
                        e.preventDefault();
                        currentContextMenuTarget = card || folder;
                        currentContextMenuType = card ? 'card' : 'folder';

                        contextMenu.classList.add('active');
                        
                        // Adjust position so it doesn't clip off the screen window
                        let x = e.pageX;
                        let y = e.pageY;
                        const rect = contextMenu.getBoundingClientRect();
                        if (x + rect.width > window.innerWidth) x -= rect.width;
                        if (y + rect.height > window.innerHeight) y -= rect.height;
                        
                        contextMenu.style.left = `${x}px`;
                        contextMenu.style.top = `${y}px`;

                        const isSearching = document.body.classList.contains('is-searching');

                        // Setup options visibility
                        if (currentContextMenuType === 'card') {
                            cmCreateFolder.style.display = 'none';
                            cmCreateBookmark.style.display = 'none';
                            cmRename.style.display = 'flex';
                            cmDelete.style.display = 'flex';
                        } else {
                            cmCreateFolder.style.display = isSearching ? 'none' : 'flex';
                            cmCreateBookmark.style.display = isSearching ? 'none' : 'flex';
                            // Disallow deleting root "Tabs" (e.g. Chrome's main "Bookmarks Bar" root id)
                            const isRootTab = currentContextMenuTarget.classList.contains('tab-panel');
                            cmRename.style.display = isRootTab ? 'none' : 'flex';
                            cmDelete.style.display = currentContextMenuTarget.classList.contains('tab-panel') ? 'none' : 'flex';
                        }
                    }
                });

                // Hide context menu on normal click anywhere
                document.addEventListener('click', () => contextMenu.classList.remove('active'));

                cmCreateFolder.addEventListener('click', () => {
                    if (document.body.classList.contains('is-searching')) return;

                    if (currentContextMenuTarget) {
                        const parentId = currentContextMenuTarget.dataset.id;
                        const title = prompt(chrome.i18n.getMessage("prompt_folder_name"));
                        if (title) {
                            chrome.bookmarks.create({ parentId: parentId, title: title }, () => onUpdateSuccess());
                        }
                    }
                });

                cmCreateBookmark.addEventListener('click', () => {
                    if (document.body.classList.contains('is-searching')) return;

                    if (currentContextMenuTarget) {
                        const parentId = currentContextMenuTarget.dataset.id;
                        const title = prompt(chrome.i18n.getMessage("prompt_bookmark_title"));
                        if (title) {
                            const url = prompt(chrome.i18n.getMessage("prompt_bookmark_url"), 'https://');
                            if (url) {
                                chrome.bookmarks.create({ parentId: parentId, title: title, url: url }, () => onUpdateSuccess());
                            }
                        }
                    }
                });

                cmRename.addEventListener('click', () => {
                    if (currentContextMenuTarget) {
                        const id = currentContextMenuTarget.dataset.id;
                        const currentTitle = currentContextMenuTarget.querySelector('.card-title, .folder-title')?.textContent || '';
                        
                        const isCard = currentContextMenuType === 'card';
                        const promptMsg = isCard 
                            ? chrome.i18n.getMessage("prompt_rename_bookmark") || "Enter new bookmark title:"
                            : chrome.i18n.getMessage("prompt_rename_folder") || "Enter new folder name:";
                        
                        const newTitle = prompt(promptMsg, currentTitle);
                        
                        if (newTitle !== null && newTitle.trim() !== '') {
                            chrome.bookmarks.update(id, { title: newTitle.trim() }, () => onUpdateSuccess());
                        }
                    }
                });

                cmDelete.addEventListener('click', () => {
                    if (currentContextMenuTarget) {
                        const id = currentContextMenuTarget.dataset.id;
                        const title = currentContextMenuTarget.querySelector('.card-title, .folder-title')?.textContent || 'this item';
                        
                        if (confirm(chrome.i18n.getMessage("delete_confirm", [title]))) {
                            if (currentContextMenuType === 'card') {
                                chrome.bookmarks.remove(id, () => onUpdateSuccess());
                            } else {
                                chrome.bookmarks.removeTree(id, () => onUpdateSuccess());
                            }
                        }
                    }
                });
            }
        };
    })();


    /* ========================================================
       LOCALIZATION
       ======================================================== */
    const localizeUI = (() => {
        const loadLocalizedText = (messageKey, callback) => {
            const localizedText = chrome.i18n.getMessage(messageKey);
            if (localizedText) {
                callback(localizedText);
            }
        };

        return {
            init: () => {
                loadLocalizedText("extension_name", (text) => document.title = text);
                loadLocalizedText("search_placeholder", (text) => document.getElementById('search-input').placeholder = text);
                loadLocalizedText("search_active_msg", (text) => document.getElementById('search-status-msg').textContent = text);
                loadLocalizedText("overflow_btn_title", (text) => document.getElementById('overflow-btn').title = text);
                loadLocalizedText("overflow_rate_title", (text) => {
                    document.getElementById('link-rate').title = text;
                    document.getElementById('text-rate').textContent = text;
                });
                loadLocalizedText("overflow_report_title", (text) => {
                    document.getElementById('link-report').title = text;
                    document.getElementById('text-report').textContent = text;
                });

                Object.entries({
                    'cm-create-folder': 'cm_add_folder',
                    'cm-create-bookmark': 'cm_add_bookmark',
                    'cm-rename': 'cm_rename',
                    'cm-delete': 'cm_delete'
                }).forEach(([id, messageKey]) => loadLocalizedText(messageKey, (text) => document.getElementById(id).textContent = text));
            }
        };
    })();


    /* ========================================================
       BOOTSTRAP / INITIALIZATION
       ======================================================== */
    localizeUI.init();
    ThemeManager.init();
    HeaderManager.init();
    BookmarkManager.init();
    DragDropManager.init(BookmarkManager.refreshUI);
    SearchManager.init();
    ContextMenuManager.init(BookmarkManager.refreshUI);
});