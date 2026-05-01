// Global state to store fetched extensions
        let loadedExtensions = [];
        let currentModalExtension = null;
        let currentPage = 1;
        let currentQuery = '';
        let currentSort = 0;

        function escapeHTML(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;")
                .replace(/`/g, "&#x60;");
        }

        document.getElementById('searchInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') searchExtensions(true);
        });

        // Load trending extensions on init
        window.onload = () => {
            const savedTheme = localStorage.getItem('vsix-theme') || 'default';
            document.documentElement.setAttribute('data-theme', savedTheme);
            const themeSelect = document.getElementById('themeSelect');
            if(themeSelect) themeSelect.value = savedTheme;

            const urlParams = new URLSearchParams(window.location.search);
            const extParam = urlParams.get('ext');
            if (extParam) {
                document.getElementById('searchInput').value = extParam;
                searchExtensions(true, true);
            } else {
                document.getElementById('searchInput').focus();
                loadTrending();
            }
        };

        function changeTheme(themeName) {
            document.documentElement.setAttribute('data-theme', themeName);
            localStorage.setItem('vsix-theme', themeName);
        }

        function copyToClipboard(text, btnElement) {
            const showSuccess = () => {
                const icon = btnElement.querySelector('i');
                icon.className = 'fa-solid fa-check text-emerald-400 text-xs';
                setTimeout(() => {
                    icon.className = 'fa-regular fa-copy text-xs';
                }, 2000);
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(showSuccess);
            } else {
                // Fallback for HTTP (non-secure) contexts
                const textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    showSuccess();
                } catch (err) {
                    console.error('Fallback clipboard copy failed', err);
                }
                document.body.removeChild(textArea);
            }
        }

        let hasShownStarToast = false;
        let hasShownFirewallToast = false;

        function showFirewallToast() {
            if (hasShownFirewallToast) return;
            const container = document.getElementById('toast-container');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = 'bg-red-900/40 border border-red-500/30 shadow-2xl rounded-xl p-4 flex items-start gap-4 transform transition-all duration-500 translate-y-10 opacity-0 pointer-events-auto max-w-sm backdrop-blur-md';
            
            toast.innerHTML = `
                <div class="text-red-400 mt-0.5 shrink-0">
                    <i class="fa-solid fa-shield-halved text-lg"></i>
                </div>
                <div class="flex-1">
                    <h4 class="text-sm font-semibold text-white mb-1">Network Blocked?</h4>
                    <p class="text-xs text-red-200/80 mb-3 leading-relaxed">VS Code Marketplace appears to be blocked on your network or behind a firewall. Please connect to a VPN and try again.</p>
                    <div class="flex gap-2">
                        <button onclick="this.closest('.pointer-events-auto').remove()" class="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-1.5 rounded-lg transition-colors font-medium">
                            Got it
                        </button>
                    </div>
                </div>
                <button onclick="this.closest('.pointer-events-auto').remove()" class="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            
            container.appendChild(toast);
            
            // Animate in
            requestAnimationFrame(() => {
                setTimeout(() => {
                    toast.classList.remove('translate-y-10', 'opacity-0');
                }, 50);
            });
            
            // Auto dismiss after 15 seconds
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('opacity-0', 'translate-y-2');
                    setTimeout(() => toast.remove(), 500);
                }
            }, 15000);

            hasShownFirewallToast = true;
        }

        function triggerDownload(e, btnElement) {
            e.stopPropagation();
            const icon = btnElement.querySelector('i');
            const originalClass = icon.className;
            
            // Extract the base text size from original classes (e.g. text-[10px] or text-xs)
            const sizeClassMatch = originalClass.match(/text-\[?\w+\]?/);
            const sizeClass = sizeClassMatch ? sizeClassMatch[0] : 'text-[10px]';

            icon.className = `fa-solid fa-circle-notch fa-spin text-primary ${sizeClass}`;
            setTimeout(() => {
                icon.className = originalClass; // Revert back to original icon to indicate download has started
            }, 1500); // Pulse spinner for 1.5 seconds to acknowledge the click

            if (!hasShownStarToast) {
                showStarToast();
                hasShownStarToast = true;
            }
        }

        function showStarToast() {
            const container = document.getElementById('toast-container');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = 'bg-surface border border-white/20 shadow-2xl rounded-xl p-4 flex items-start gap-4 transform transition-all duration-500 translate-y-10 opacity-0 pointer-events-auto max-w-sm';
            
            toast.innerHTML = `
                <div class="text-amber-400 mt-0.5 shrink-0">
                    <i class="fa-solid fa-star text-lg"></i>
                </div>
                <div class="flex-1">
                    <h4 class="text-sm font-semibold text-white mb-1">Did I help you?</h4>
                    <p class="text-xs text-slate-400 mb-3 leading-relaxed">If this tool saved you time, help me out by giving the repository a ⭐️ on GitHub!</p>
                    <div class="flex gap-2">
                        <a href="https://github.com/zpratikpathak/vsix-downloader" target="_blank" rel="noopener noreferrer" onclick="this.closest('.pointer-events-auto').remove()" class="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center shadow-lg shadow-amber-500/5">
                            <i class="fa-brands fa-github mr-1.5"></i> Star on GitHub
                        </a>
                        <button onclick="this.closest('.pointer-events-auto').remove()" class="text-xs bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-3 py-1.5 rounded-lg transition-colors">
                            Dismiss
                        </button>
                    </div>
                </div>
                <button onclick="this.closest('.pointer-events-auto').remove()" class="text-slate-500 hover:text-white transition-colors shrink-0">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            
            container.appendChild(toast);
            
            // Animate in
            requestAnimationFrame(() => {
                setTimeout(() => {
                    toast.classList.remove('translate-y-10', 'opacity-0');
                }, 50);
            });
            // Intentionally no auto-dismiss, waits for user action
        }

        async function loadTrending() {
            const welcomeState = document.getElementById('welcomeState');
            welcomeState.innerHTML = `
                <i class="fa-solid fa-fire text-4xl text-amber-500 mb-4"></i>
                <h2 class="text-xl font-medium text-slate-300">Trending Extensions</h2>
                <div class="loader-spinner mx-auto mt-4" style="border-top-color: #f59e0b;"></div>
            `;

            try {
                const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: [{ criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }, { filterType: 12, value: '4096' }], pageNumber: 1, pageSize: 6, sortBy: 4, sortOrder: 0 }],
                        assetTypes: [], flags: 33171
                    })
                });
                
                if (!response.ok) throw new Error('API Error');
                const data = await response.json();
                
                if (data.results[0].extensions && data.results[0].extensions.length > 0) {
                    welcomeState.innerHTML = `
                        <i class="fa-solid fa-fire text-4xl text-amber-500 mb-4"></i>
                        <h2 class="text-xl font-medium text-slate-300 mb-6">Trending Extensions</h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-4xl mx-auto" id="trendingGrid"></div>
                    `;
                    
                    const trendingGrid = document.getElementById('trendingGrid');
                    data.results[0].extensions.forEach(ext => {
                        let iconSrc = 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg';
                        if (ext.versions[0] && ext.versions[0].files) {
                            const iconFile = ext.versions[0].files.find(f => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
                            if (iconFile) iconSrc = iconFile.source;
                        }
                        
                        let downloads = 0;
                        if (ext.statistics) {
                            const dlStat = ext.statistics.find(s => s.statisticName === 'install');
                            if (dlStat) downloads = dlStat.value;
                        }
                        const formattedDownloads = new Intl.NumberFormat('en-US', { notation: "compact" }).format(downloads);

                        trendingGrid.innerHTML += `
                            <div class="bg-surface/50 border border-white/10 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-black/20 hover:border-primary/50 transition-colors" onclick="document.getElementById('searchInput').value='${ext.extensionName}'; searchExtensions(true);">
                                <img src="${iconSrc}" class="w-12 h-12 rounded-lg bg-black/40 p-1" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'">
                                <div class="min-w-0 flex-1">
                                    <h4 class="text-white font-medium truncate text-sm">${escapeHTML(ext.displayName || ext.extensionName)}</h4>
                                    <p class="text-slate-500 text-xs font-mono mt-1"><i class="fa-solid fa-download opacity-50 mr-1"></i>${formattedDownloads}</p>
                                </div>
                                <i class="fa-solid fa-arrow-right text-slate-600"></i>
                            </div>
                        `;
                    });
                }
            } catch (e) {
                welcomeState.innerHTML = `
                    <i class="fa-solid fa-terminal text-4xl text-slate-600 mb-4"></i>
                    <h2 class="text-xl font-medium text-slate-300">Awaiting input...</h2>
                `;
                
                // If trending fails to load due to network error, show firewall toast
                if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                    showFirewallToast();
                }
            }
        }

        function resetSearch() {
            document.getElementById('searchInput').value = '';
            document.getElementById('breadcrumbs').classList.add('hidden');
            document.getElementById('resultsGrid').innerHTML = '';
            document.getElementById('loadMoreContainer')?.remove();
            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('errorState').classList.add('hidden');
            document.getElementById('welcomeState').classList.remove('hidden');
            document.getElementById('searchInput').focus();
            loadTrending();
        }

        const cardVersionsState = {};

        function renderCardVersions(extId, versions) {
            const grid = document.getElementById(`versions-grid-${extId}`);
            const emptyMsg = document.getElementById(`empty-msg-${extId}`);
            if (!grid) return;

            if (cardVersionsState[extId]) clearTimeout(cardVersionsState[extId]);

            const searchInput = document.getElementById(`cardSearch-${extId}`);
            const osSelect = document.getElementById(`cardOs-${extId}`);
            const releaseSelect = document.getElementById(`cardRelease-${extId}`);

            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const osFilter = osSelect ? osSelect.value : '';
            const releaseFilter = releaseSelect ? releaseSelect.value : '';

            let matching = versions.filter(v => {
                if (searchTerm && !v.version.toLowerCase().includes(searchTerm)) return false;
                
                const targetPlatform = v.targetPlatform || 'universal';
                if (osFilter && osFilter !== 'universal' && targetPlatform !== 'universal' && !targetPlatform.includes(osFilter)) return false;
                if (osFilter === 'universal' && targetPlatform !== 'universal') return false;

                const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;
                if (releaseFilter === 'stable' && isPreRelease) return false;
                if (releaseFilter === 'pre-release' && !isPreRelease) return false;

                return true;
            });

            if (matching.length === 0) {
                grid.innerHTML = '';
                emptyMsg.style.display = 'block';
                return;
            }

            emptyMsg.style.display = 'none';

            // Extract publisher and extension name from extId
            const parts = extId.split('_');
            const publisher = parts[0];
            const extensionName = parts.slice(1).join('_');

            const chunk = matching.slice(0, 50);
            const html = chunk.map(v => {
                let targetPlatform = v.targetPlatform || '';
                let platformBadge = '';
                if (targetPlatform && targetPlatform !== 'universal') {
                    platformBadge = `<span class="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20 shrink-0 whitespace-nowrap">${targetPlatform}</span>`;
                }

                const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage${targetPlatform ? `?targetPlatform=${targetPlatform}` : ''}`;
                const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;
                
                const badge = isPreRelease 
                    ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 whitespace-nowrap">Pre-release</span>`
                    : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 whitespace-nowrap">Stable</span>`;

                const copyCmd = `code --install-extension ${publisher}.${extensionName}@${v.version}`;

                // Notice: no group-hover here to prevent massive browser lag when hovering the main card
                return `<div onclick="event.stopPropagation()" data-version="${v.version}" class="flex items-center justify-between p-2.5 rounded-xl border border-white/20 bg-black/20 hover:bg-white/10 hover:border-primary/50 transition-colors group cursor-default overflow-hidden">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-6 h-6 rounded bg-black/40 border border-white/20 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-box text-slate-500 text-[10px]"></i>
                        </div>
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="font-mono text-[11px] text-slate-200 truncate">v${v.version}</span>
                            ${platformBadge}
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 ml-2">
                        ${badge}
                        <button onclick="copyToClipboard('${copyCmd}', this)" aria-label="Copy CLI Install Command" title="Copy CLI Install Command" class="text-slate-400 hover:text-white hover:bg-white/20 rounded p-1.5 transition-colors focus:outline-none shrink-0">
                            <i class="fa-regular fa-copy text-[10px]" aria-hidden="true"></i>
                        </button>
                        <a href="${downloadUrl}" onclick="triggerDownload(event, this)" download aria-label="Download VSIX" title="Download VSIX" class="text-slate-400 hover:text-primary hover:bg-primary/10 rounded p-1.5 transition-colors shrink-0">
                            <i class="fa-solid fa-download text-[10px]" aria-hidden="true"></i>
                        </a>
                    </div>
                </div>`;
            }).join('');

            grid.innerHTML = html;

            if (matching.length > 50) {
                const extIndex = loadedExtensions.findIndex(e => (e.publisher.publisherName + '_' + e.extensionName) === extId);
                grid.innerHTML += `<div onclick="openModal(${extIndex})" class="text-center py-3 text-[11px] text-slate-400 hover:text-white font-mono italic cursor-pointer hover:bg-white/5 rounded-lg transition-colors border border-dashed border-white/20 mt-2">Showing top 50 of ${matching.length} matching versions. Click here to view all.</div>`;
            }
        }

        const filterCardVersionsTimeouts = {};
        function filterCardVersions(extId) {
            if (filterCardVersionsTimeouts[extId]) clearTimeout(filterCardVersionsTimeouts[extId]);
            filterCardVersionsTimeouts[extId] = setTimeout(() => {
                const ext = loadedExtensions.find(e => (e.publisher.publisherName + '_' + e.extensionName) === extId);
                if (ext) {
                    renderCardVersions(extId, ext.versions);
                }
            }, 150);
        }

        async function searchExtensions(isNewSearch = false, autoOpenFirst = false) {
            const query = document.getElementById('searchInput').value.trim();
            const sortSelect = document.getElementById('sortSelect');
            const sortBy = sortSelect ? parseInt(sortSelect.value) : 0;
            if (!query) return;

            // UI Elements
            const btnText = document.getElementById('btnText');
            const btnLoader = document.getElementById('btnLoader');
            const welcomeState = document.getElementById('welcomeState');
            const errorState = document.getElementById('errorState');
            const errorMsg = document.getElementById('errorMsg');
            const emptyState = document.getElementById('emptyState');
            const resultsGrid = document.getElementById('resultsGrid');
            const breadcrumbs = document.getElementById('breadcrumbs');
            const breadcrumbQuery = document.getElementById('breadcrumbQuery');

            if (query.length < 2) {
                btnText.classList.remove('hidden');
                btnLoader.classList.add('hidden');
                resultsGrid.innerHTML = '';
                welcomeState.classList.add('hidden');
                emptyState.classList.add('hidden');
                breadcrumbs.classList.add('hidden');
                errorState.classList.remove('hidden');
                errorMsg.innerHTML = 'Search query too broad. Please enter at least 2 characters to search.';
                return;
            }

            if (isNewSearch) {
                currentPage = 1;
                currentQuery = query;
                currentSort = sortBy;
                loadedExtensions = [];
                resultsGrid.innerHTML = '';
            }

            // Remove previous load more button if exists
            const existingLoadMore = document.getElementById('loadMoreContainer');
            if (existingLoadMore) {
                existingLoadMore.innerHTML = '<div class="loader-spinner border-white/20 border-t-primary mx-auto"></div>';
                existingLoadMore.id = 'gridLoader'; // Rename ID so it gets removed properly after fetch
            }
            
            // Set Loading State
            if (isNewSearch) {
                btnText.classList.add('hidden');
                btnLoader.classList.remove('hidden');
                welcomeState.classList.add('hidden');
                errorState.classList.add('hidden');
                emptyState.classList.add('hidden');
                breadcrumbs.classList.add('hidden');
            }

            try {
                let response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: [{ criteria: [{ filterType: 10, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                        assetTypes: [], flags: 33171 // Bitmask for versions and properties
                    })
                });

                // Fallback: If global search times out (500), try again with VS Code filter only
                if (!response.ok && response.status === 500) {
                    console.warn("Global search failed (likely timeout). Falling back to VS Code extensions only.");
                    response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                        method: 'POST',
                        headers: { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filters: [{ criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }, { filterType: 10, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                            assetTypes: [], flags: 33171
                        })
                    });
                }

                if (!response.ok) throw new Error('Marketplace API connection refused.');

                const data = await response.json();
                let extensions = data.results[0].extensions;
                
                // If it's a new search and a specific extension ID was queried (like via share link), hoist it to the very top
                if (isNewSearch && extensions && extensions.length > 0 && currentQuery.includes('.')) {
                    const exactMatchIndex = extensions.findIndex(ext => (ext.publisher.publisherName + '.' + ext.extensionName).toLowerCase() === currentQuery.toLowerCase());
                    if (exactMatchIndex > 0) {
                        const exactMatch = extensions.splice(exactMatchIndex, 1)[0];
                        extensions.unshift(exactMatch);
                    }
                }
                
                // Remove grid loader if exists
                const gridLoader = document.getElementById('gridLoader');
                if (gridLoader) gridLoader.remove();

                if (extensions && extensions.length > 0) {
                    const startIndex = loadedExtensions.length;
                    loadedExtensions = loadedExtensions.concat(extensions); // Save to global state
                    
                    if (isNewSearch) {
                        breadcrumbs.classList.remove('hidden');
                        breadcrumbQuery.textContent = currentQuery;
                    }

                    extensions.forEach((ext, loopIndex) => {
                        const index = startIndex + loopIndex;
                        const publisher = ext.publisher.publisherName;
                        const extensionName = ext.extensionName;
                        const publisherDisplayName = escapeHTML(ext.publisher.displayName || publisher);
                        const displayName = escapeHTML(ext.displayName || extensionName);
                        const description = escapeHTML(ext.shortDescription || 'No description provided by publisher.');
                        
                        // Icon logic
                        let iconSrc = 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg';
                        if (ext.versions[0] && ext.versions[0].files) {
                            const iconFile = ext.versions[0].files.find(f => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
                            if (iconFile) iconSrc = iconFile.source;
                        }

                        // Stats
                        let downloads = 0; let rating = 0;
                        if (ext.statistics) {
                            const dlStat = ext.statistics.find(s => s.statisticName === 'install');
                            if (dlStat) downloads = dlStat.value;
                            const ratingStat = ext.statistics.find(s => s.statisticName === 'averagerating');
                            if (ratingStat) rating = ratingStat.value.toFixed(1);
                        }
                        const formattedDownloads = new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(downloads);

                        const extId = publisher + '_' + extensionName;

                        // Extension Dependencies logic
                        let depsHtml = '';
                        const extPack = ext.properties ? ext.properties.find(p => p.key === 'Microsoft.VisualStudio.Code.ExtensionPack') : null;
                        const extDeps = ext.properties ? ext.properties.find(p => p.key === 'Microsoft.VisualStudio.Code.ExtensionDependencies') : null;
                        const depsCount = (extPack ? extPack.value.split(',').length : 0) + (extDeps ? extDeps.value.split(',').length : 0);
                        
                        if (depsCount > 0) {
                            depsHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" title="This extension requires ${depsCount} other extensions to function">
                                <i class="fa-solid fa-link mr-1"></i>${depsCount} Dependencies
                            </span>`;
                        }

                        // Render Card (make it clickable)
                        const card = document.createElement('div');
                        const animationDelay = index * 0.05; // Staggered delay based on index
                        card.className = `group flex flex-col md:flex-row gap-6 p-6 bg-surface/50 hover:bg-surface backdrop-blur-sm border border-white/10 hover:border-primary/50 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer card-enter`;
                        card.style.animationDelay = `${animationDelay}s`;
                        card.onclick = () => openModal(index);
                        card.innerHTML = `
                            <!-- Icon -->
                            <div class="shrink-0 flex justify-center md:justify-start">
                                <div class="w-20 h-20 bg-black/40 rounded-xl p-2 border border-white/10 shadow-inner overflow-hidden flex items-center justify-center">
                                    <img src="${iconSrc}" alt="Icon" class="w-16 h-16 object-contain" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'">
                                </div>
                            </div>
                            
                            <!-- Content -->
                            <div class="flex-1 min-w-0 pointer-events-none">
                                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                                    <div>
                                        <h3 class="text-xl font-semibold text-white tracking-tight flex flex-wrap items-center gap-3">
                                            ${displayName}
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-black/20 text-slate-400 border border-white/20 font-mono tracking-normal">
                                                ${publisherDisplayName}
                                            </span>
                                            ${depsHtml}
                                        </h3>
                                        <p class="text-slate-400 mt-1.5 text-sm leading-relaxed line-clamp-2">${description}</p>
                                    </div>
                                    
                                    <!-- Stats -->
                                    <div class="flex flex-row md:flex-col gap-4 md:gap-2 shrink-0 md:text-right pointer-events-auto">
                                        ${downloads > 0 ? `<div class="text-xs font-mono text-slate-400"><i class="fa-solid fa-download w-4 opacity-50"></i> ${formattedDownloads}</div>` : ''}
                                        ${rating > 0 ? `<div class="text-xs font-mono text-slate-400"><i class="fa-solid fa-star w-4 text-amber-400/70"></i> ${rating}</div>` : ''}
                                        <button onclick="event.stopPropagation(); copyToClipboard(window.location.origin + window.location.pathname + '?ext=${publisher}.${extensionName}', this)" title="Copy Direct Share Link" class="text-xs font-mono text-primary hover:text-white transition-colors mt-2 text-right focus:outline-none flex justify-end items-center gap-1.5 shrink-0">
                                            <span>Share</span> <i class="fa-solid fa-share-nodes"></i>
                                        </button>
                                    </div>
                                </div>

                                <!-- Versions Matrix -->
                                <div class="mt-5 pt-5 border-t border-white/5 group-hover:border-white/20 transition-colors pointer-events-auto">
                                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                                        <div class="flex items-center gap-2 mt-1">
                                            <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-primary transition-colors">All Versions (${ext.versions.length})</h4>
                                            <span class="text-[10px] font-mono text-slate-600 border border-white/10 rounded px-1.5">.vsix</span>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-end gap-2 z-10" onclick="event.stopPropagation();">
                                            <select id="cardOs-${extId}" onchange="filterCardVersions('${extId}')" class="bg-black/40 border border-white/20 rounded-md py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-primary font-mono outline-none cursor-pointer">
                                                <option value="" class="bg-surface text-white">All OS</option>
                                                <option value="win32" class="bg-surface text-white">Windows</option>
                                                <option value="linux" class="bg-surface text-white">Linux</option>
                                                <option value="alpine" class="bg-surface text-white">Alpine Linux</option>
                                                <option value="darwin" class="bg-surface text-white">Mac</option>
                                                <option value="web" class="bg-surface text-white">Web</option>
                                                <option value="universal" class="bg-surface text-white">Universal</option>
                                            </select>
                                            <select id="cardRelease-${extId}" onchange="filterCardVersions('${extId}')" class="bg-black/40 border border-white/20 rounded-md py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-primary font-mono outline-none cursor-pointer">
                                                <option value="" class="bg-surface text-white">All Types</option>
                                                <option value="stable" selected class="bg-surface text-white">Stable</option>
                                                <option value="pre-release" class="bg-surface text-white">Pre-release</option>
                                            </select>
                                            <div class="relative w-full sm:w-32">
                                                <i class="fa-solid fa-filter absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                                                <input type="text" id="cardSearch-${extId}" oninput="filterCardVersions('${extId}')" class="w-full bg-black/40 border border-white/20 rounded-md py-1 pl-6 pr-2 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" placeholder="Filter...">
                                            </div>
                                        </div>
                                    </div>
                                    <div id="versions-grid-${extId}" class="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2 z-10" onclick="event.stopPropagation();">
                                        <!-- Versions lazily loaded here -->
                                    </div>
                                    <div id="empty-msg-${extId}" class="hidden text-center py-2">
                                        <p class="text-slate-500 text-[10px]">No versions match your search.</p>
                                    </div>
                                </div>
                            </div>
                        `;
                        resultsGrid.appendChild(card);
                        renderCardVersions(extId, ext.versions, '');
                    });

                    // Add "Load More" button if we got a full page of results
                    if (extensions.length === 15) {
                        const loadMoreBtn = document.createElement('div');
                        loadMoreBtn.id = 'loadMoreContainer';
                        loadMoreBtn.className = 'flex justify-center mt-8';
                        loadMoreBtn.innerHTML = `
                            <button onclick="currentPage++; searchExtensions(false);" class="bg-surface hover:bg-black/20 border border-white/20 hover:border-primary/50 text-slate-300 hover:text-white font-mono text-sm py-3 px-8 rounded-xl transition-colors shadow-lg shadow-black/20 focus:outline-none flex items-center gap-2">
                                <i class="fa-solid fa-rotate-right"></i> Load More Results
                            </button>
                        `;
                        resultsGrid.parentNode.appendChild(loadMoreBtn);
                    }

                    if (autoOpenFirst && extensions.length > 0) {
                        openModal(0);
                        // Clean URL so refresh doesn't pop up again
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                } else {
                    if (isNewSearch) emptyState.classList.remove('hidden');
                }
            } catch (error) {
                console.error("Fetch error:", error);
                errorState.classList.remove('hidden');
                errorMsg.textContent = error.message;
                
                // Show firewall toast if it's likely a network error
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('refused')) {
                    showFirewallToast();
                }
            } finally {
                btnLoader.classList.add('hidden');
                btnText.classList.remove('hidden');
            }
        }

        // Modal Logic
        function openModal(index) {
            currentModalExtension = loadedExtensions[index];
            if (!currentModalExtension) return;

            const ext = currentModalExtension;
            
            // Set Headers
            const publisher = ext.publisher.publisherName;
            const extensionName = ext.extensionName;
            const publisherDisplayName = escapeHTML(ext.publisher.displayName || publisher);
            const displayName = escapeHTML(ext.displayName || extensionName);

            let iconSrc = 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg';
            if (ext.versions[0] && ext.versions[0].files) {
                const iconFile = ext.versions[0].files.find(f => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
                if (iconFile) iconSrc = iconFile.source;
            }

            document.getElementById('modalIcon').src = iconSrc;
            document.getElementById('modalTitle').textContent = displayName;
            document.getElementById('modalPublisher').textContent = publisherDisplayName;
            document.getElementById('versionSearch').value = ''; // Reset search

            document.getElementById('modalOsFilter').value = ''; // Reset OS
            document.getElementById('modalReleaseFilter').value = 'stable'; // Reset Release

            renderModalVersions(); // Render all initially

            // Show Modal
            document.getElementById('extModal').classList.remove('hidden');
            // Small delay to allow focus so transition is smooth
            setTimeout(() => document.getElementById('versionSearch').focus(), 50);
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            document.getElementById('extModal').classList.add('hidden');
            document.body.style.overflow = 'auto'; // Restore scroll
        }

        let filterVersionsTimeout = null;
        function filterVersions() {
            if (filterVersionsTimeout) clearTimeout(filterVersionsTimeout);
            filterVersionsTimeout = setTimeout(() => {
                renderModalVersions();
            }, 150);
        }

        let modalRenderTimeout = null;

        function renderModalVersions() {
            if (!currentModalExtension) return;

            const grid = document.getElementById('modalVersionsGrid');
            const emptyState = document.getElementById('modalEmptyState');
            const ext = currentModalExtension;
            const publisher = ext.publisher.publisherName;
            const extensionName = ext.extensionName;

            if (modalRenderTimeout) clearTimeout(modalRenderTimeout);

            const searchInput = document.getElementById('versionSearch');
            const osSelect = document.getElementById('modalOsFilter');
            const releaseSelect = document.getElementById('modalReleaseFilter');

            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const osFilter = osSelect ? osSelect.value : '';
            const releaseFilter = releaseSelect ? releaseSelect.value : '';

            let matching = ext.versions.filter(v => {
                if (searchTerm && !v.version.toLowerCase().includes(searchTerm)) return false;
                
                const targetPlatform = v.targetPlatform || 'universal';
                if (osFilter && osFilter !== 'universal' && targetPlatform !== 'universal' && !targetPlatform.includes(osFilter)) return false;
                if (osFilter === 'universal' && targetPlatform !== 'universal') return false;

                const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;
                if (releaseFilter === 'stable' && isPreRelease) return false;
                if (releaseFilter === 'pre-release' && !isPreRelease) return false;

                return true;
            });

            if (matching.length === 0) {
                grid.innerHTML = '';
                grid.classList.add('hidden');
                emptyState.classList.remove('hidden');
                return;
            }

            grid.classList.remove('hidden');
            emptyState.classList.add('hidden');

            window.loadMoreModalVersions = function(start) {
                // If it's the initial load, show 50. If user clicks "Load More", show all remaining.
                const size = start === 0 ? 50 : matching.length - start;
                const chunk = matching.slice(start, start + size);
                const html = chunk.map(v => {
                    let targetPlatform = v.targetPlatform || '';
                    let platformBadge = '';
                    
                    // If targetPlatform is specified and not empty, show it
                    if (targetPlatform && targetPlatform !== 'universal') {
                        platformBadge = `<span class="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20 shrink-0 whitespace-nowrap">${targetPlatform}</span>`;
                    }

                    const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage${targetPlatform ? `?targetPlatform=${targetPlatform}` : ''}`;
                    const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;

                    const badge = isPreRelease 
                        ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 whitespace-nowrap">Pre-release</span>`
                        : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 whitespace-nowrap">Stable</span>`;

                    const copyCmd = `code --install-extension ${publisher}.${extensionName}@${v.version}`;

                    return `
                        <div class="flex items-center justify-between p-2.5 rounded-xl border border-white/20 bg-black/20 hover:bg-white/10 hover:border-primary/50 transition-colors group cursor-default overflow-hidden">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="w-7 h-7 rounded bg-black/40 border border-white/20 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
                                    <i class="fa-solid fa-box text-slate-500 group-hover:text-primary transition-colors text-xs"></i>
                                </div>
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="font-mono text-[11px] text-slate-200 group-hover:text-white transition-colors truncate">v${v.version}</span>
                                    ${platformBadge}
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0 ml-2">
                                ${badge}
                                <button onclick="copyToClipboard('${copyCmd}', this)" aria-label="Copy CLI Install Command" title="Copy CLI Install Command" class="text-slate-400 hover:text-white hover:bg-white/20 rounded p-1.5 transition-colors focus:outline-none shrink-0">
                                    <i class="fa-regular fa-copy text-xs" aria-hidden="true"></i>
                                </button>
                                <a href="${downloadUrl}" onclick="triggerDownload(event, this)" download aria-label="Download VSIX" title="Download VSIX" class="text-slate-400 hover:text-primary hover:bg-primary/10 rounded p-1.5 transition-colors shrink-0">
                                    <i class="fa-solid fa-download text-xs" aria-hidden="true"></i>
                                </a>
                            </div>
                        </div>
                    `;
                }).join('');

                const loadMoreBtn = document.getElementById('modalLoadMoreBtn');
                if (loadMoreBtn) loadMoreBtn.remove();

                if (start === 0) {
                    grid.innerHTML = html;
                } else {
                    grid.insertAdjacentHTML('beforeend', html);
                }

                if (start + size < matching.length) {
                    const remaining = matching.length - (start + size);
                    const moreBtn = `<button id="modalLoadMoreBtn" onclick="window.loadMoreModalVersions(${start + size})" class="col-span-full py-3 mt-2 bg-black/20 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-sm font-mono transition-colors border border-white/20 focus:outline-none">Load All Remaining Versions (${remaining})</button>`;
                    grid.insertAdjacentHTML('beforeend', moreBtn);
                }
            };

            window.loadMoreModalVersions(0);
        }

        // Close modal on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !document.getElementById('extModal').classList.contains('hidden')) {
                closeModal();
            }
        });
