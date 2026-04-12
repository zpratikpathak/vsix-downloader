// Global state to store fetched extensions
        let loadedExtensions = [];
        let currentModalExtension = null;
        let currentPage = 1;
        let currentQuery = '';
        let currentSort = 0;

        document.getElementById('searchInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') searchExtensions(true);
        });

        // Load trending extensions on init
        window.onload = () => {
            document.getElementById('searchInput').focus();
            loadTrending();
        };

        function copyToClipboard(text, btnElement) {
            navigator.clipboard.writeText(text).then(() => {
                const icon = btnElement.querySelector('i');
                icon.className = 'fa-solid fa-check text-emerald-400 text-xs';
                setTimeout(() => {
                    icon.className = 'fa-regular fa-copy text-xs';
                }, 2000);
            });
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
                            <div class="bg-surface/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-800 hover:border-primary/50 transition-colors" onclick="document.getElementById('searchInput').value='${ext.extensionName}'; searchExtensions(true);">
                                <img src="${iconSrc}" class="w-12 h-12 rounded-lg bg-slate-900 p-1" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'">
                                <div class="min-w-0 flex-1">
                                    <h4 class="text-white font-medium truncate text-sm">${ext.displayName || ext.extensionName}</h4>
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
                    platformBadge = `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 truncate">${targetPlatform}</span>`;
                }

                const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage${targetPlatform ? `?targetPlatform=${targetPlatform}` : ''}`;
                const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;
                
                const badge = isPreRelease 
                    ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 whitespace-nowrap">Pre-release</span>`
                    : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 whitespace-nowrap">Stable</span>`;

                const copyCmd = `code --install-extension ${publisher}.${extensionName}@${v.version}`;

                // Notice: no group-hover here to prevent massive browser lag when hovering the main card
                return `<div onclick="event.stopPropagation()" data-version="${v.version}" class="flex items-center justify-between p-2 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:border-primary/50 transition-colors cursor-default overflow-hidden">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="w-6 h-6 rounded bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-box text-slate-500 text-[10px]"></i>
                        </div>
                        <div class="flex flex-col min-w-0 justify-center">
                            <span class="font-mono text-[11px] text-slate-200 truncate leading-tight">v${v.version}</span>
                            <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
                                ${badge}
                                ${platformBadge}
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 ml-2">
                        <button onclick="copyToClipboard('${copyCmd}', this)" title="Copy CLI Install Command" class="text-slate-400 hover:text-white hover:bg-slate-600 rounded p-1.5 transition-colors focus:outline-none shrink-0">
                            <i class="fa-regular fa-copy text-[10px]"></i>
                        </button>
                        <a href="${downloadUrl}" download title="Download VSIX" class="text-slate-400 hover:text-primary hover:bg-primary/10 rounded p-1.5 transition-colors shrink-0">
                            <i class="fa-solid fa-download text-[10px]"></i>
                        </a>
                    </div>
                </div>`;
            }).join('');

            grid.innerHTML = html;

            if (matching.length > 50) {
                grid.innerHTML += `<div class="text-center py-3 text-[11px] text-slate-500 font-mono italic">Showing top 50 of ${matching.length} matching versions. Click the card to view all.</div>`;
            }
        }

        function filterCardVersions(extId) {
            const ext = loadedExtensions.find(e => (e.publisher.publisherName + '_' + e.extensionName) === extId);
            if (ext) {
                renderCardVersions(extId, ext.versions);
            }
        }

        async function searchExtensions(isNewSearch = false) {
            const query = document.getElementById('searchInput').value.trim();
            const sortSelect = document.getElementById('sortSelect');
            const sortBy = sortSelect ? parseInt(sortSelect.value) : 0;
            if (!query) return;

            if (isNewSearch) {
                currentPage = 1;
                currentQuery = query;
                currentSort = sortBy;
                loadedExtensions = [];
                document.getElementById('resultsGrid').innerHTML = '';
            }

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
            
            // Remove previous load more button if exists
            const existingLoadMore = document.getElementById('loadMoreContainer');
            if (existingLoadMore) existingLoadMore.remove();
            
            // Set Loading State
            if (isNewSearch) {
                btnText.classList.add('hidden');
                btnLoader.classList.remove('hidden');
                welcomeState.classList.add('hidden');
                errorState.classList.add('hidden');
                emptyState.classList.add('hidden');
                breadcrumbs.classList.add('hidden');
            } else {
                // If loading more, append a loader to grid
                resultsGrid.innerHTML += `<div id="gridLoader" class="flex justify-center p-8"><div class="loader-spinner"></div></div>`;
            }

            try {
                const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: [{ criteria: [{ filterType: 10, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                        assetTypes: [], flags: 33171 // Bitmask for versions and properties
                    })
                });

                if (!response.ok) throw new Error('Marketplace API connection refused.');

                const data = await response.json();
                const extensions = data.results[0].extensions;
                
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
                        const publisherDisplayName = (ext.publisher.displayName || publisher).replace(/`/g, "'").replace(/\\/g, "\\\\");
                        const displayName = (ext.displayName || extensionName).replace(/`/g, "'").replace(/\\/g, "\\\\");
                        const description = (ext.shortDescription || 'No description provided by publisher.').replace(/`/g, "'").replace(/\\/g, "\\\\");
                        
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
                        card.className = `group flex flex-col md:flex-row gap-6 p-6 bg-surface/50 hover:bg-surface backdrop-blur-sm border border-slate-800 hover:border-primary/50 rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer card-enter`;
                        card.style.animationDelay = `${animationDelay}s`;
                        card.onclick = () => openModal(index);
                        card.innerHTML = `
                            <!-- Icon -->
                            <div class="shrink-0 flex justify-center md:justify-start">
                                <div class="w-20 h-20 bg-slate-900 rounded-xl p-2 border border-slate-800 shadow-inner overflow-hidden flex items-center justify-center">
                                    <img src="${iconSrc}" alt="Icon" class="w-16 h-16 object-contain" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'">
                                </div>
                            </div>
                            
                            <!-- Content -->
                            <div class="flex-1 min-w-0 pointer-events-none">
                                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                                    <div>
                                        <h3 class="text-xl font-semibold text-white tracking-tight flex flex-wrap items-center gap-3">
                                            ${displayName}
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 font-mono tracking-normal">
                                                ${publisherDisplayName}
                                            </span>
                                            ${depsHtml}
                                        </h3>
                                        <p class="text-slate-400 mt-1.5 text-sm leading-relaxed line-clamp-2">${description}</p>
                                    </div>
                                    
                                    <!-- Stats -->
                                    <div class="flex flex-row md:flex-col gap-4 md:gap-2 shrink-0 md:text-right">
                                        ${downloads > 0 ? `<div class="text-xs font-mono text-slate-400"><i class="fa-solid fa-download w-4 opacity-50"></i> ${formattedDownloads}</div>` : ''}
                                        ${rating > 0 ? `<div class="text-xs font-mono text-slate-400"><i class="fa-solid fa-star w-4 text-amber-400/70"></i> ${rating}</div>` : ''}
                                    </div>
                                </div>

                                <!-- Versions Matrix -->
                                <div class="mt-5 pt-5 border-t border-slate-800/50 group-hover:border-slate-700 transition-colors pointer-events-auto">
                                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                                        <div class="flex items-center gap-2 mt-1">
                                            <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-primary transition-colors">All Versions (${ext.versions.length})</h4>
                                            <span class="text-[10px] font-mono text-slate-600 border border-slate-800 rounded px-1.5">.vsix</span>
                                        </div>
                                        <div class="flex flex-wrap items-center justify-end gap-2 z-10" onclick="event.stopPropagation();">
                                            <select id="cardOs-${extId}" onchange="filterCardVersions('${extId}')" class="bg-slate-900 border border-slate-700 rounded-md py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-primary font-mono outline-none cursor-pointer">
                                                <option value="">All OS</option>
                                                <option value="win32">Windows</option>
                                                <option value="linux">Linux</option>
                                                <option value="alpine">Alpine Linux</option>
                                                <option value="darwin">Mac</option>
                                                <option value="web">Web</option>
                                                <option value="universal">Universal</option>
                                            </select>
                                            <select id="cardRelease-${extId}" onchange="filterCardVersions('${extId}')" class="bg-slate-900 border border-slate-700 rounded-md py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-primary font-mono outline-none cursor-pointer">
                                                <option value="">All Types</option>
                                                <option value="stable">Stable</option>
                                                <option value="pre-release">Pre-release</option>
                                            </select>
                                            <div class="relative w-full sm:w-32">
                                                <i class="fa-solid fa-filter absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                                                <input type="text" id="cardSearch-${extId}" oninput="filterCardVersions('${extId}')" class="w-full bg-slate-900 border border-slate-700 rounded-md py-1 pl-6 pr-2 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" placeholder="Filter...">
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
                            <button onclick="currentPage++; searchExtensions(false);" class="bg-surface hover:bg-slate-800 border border-slate-700 hover:border-primary/50 text-slate-300 hover:text-white font-mono text-sm py-3 px-8 rounded-xl transition-colors shadow-lg shadow-black/20 focus:outline-none flex items-center gap-2">
                                <i class="fa-solid fa-rotate-right"></i> Load More Results
                            </button>
                        `;
                        resultsGrid.parentNode.appendChild(loadMoreBtn);
                    }
                } else {
                    if (isNewSearch) emptyState.classList.remove('hidden');
                }
            } catch (error) {
                console.error("Fetch error:", error);
                errorState.classList.remove('hidden');
                errorMsg.textContent = error.message;
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
            const publisherDisplayName = ext.publisher.displayName || publisher;
            const displayName = ext.displayName || extensionName;

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
            document.getElementById('modalReleaseFilter').value = ''; // Reset Release

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

        function filterVersions() {
            renderModalVersions();
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
                const size = 50;
                const chunk = matching.slice(start, start + size);
                const html = chunk.map(v => {
                    let targetPlatform = v.targetPlatform || '';
                    let platformBadge = '';
                    
                    // If targetPlatform is specified and not empty, show it
                    if (targetPlatform && targetPlatform !== 'universal') {
                        platformBadge = `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600 truncate min-w-0 max-w-full">${targetPlatform}</span>`;
                    }

                    const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage${targetPlatform ? `?targetPlatform=${targetPlatform}` : ''}`;
                    const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;

                    const badge = isPreRelease 
                        ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 whitespace-nowrap">Pre-release</span>`
                        : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 whitespace-nowrap">Stable</span>`;

                    const copyCmd = `code --install-extension ${publisher}.${extensionName}@${v.version}`;

                    return `
                        <div class="flex items-center justify-between p-2.5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:border-primary/50 transition-colors group cursor-default overflow-hidden">
                            <div class="flex items-center gap-2 min-w-0">
                                <div class="w-7 h-7 rounded bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 group-hover:border-primary/50 transition-colors">
                                    <i class="fa-solid fa-box text-slate-500 group-hover:text-primary transition-colors text-xs"></i>
                                </div>
                                <div class="flex flex-col min-w-0 justify-center">
                                    <span class="font-mono text-[11px] text-slate-200 group-hover:text-white transition-colors truncate leading-tight">v${v.version}</span>
                                    ${platformBadge ? `<div class="flex mt-0.5">${platformBadge}</div>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0 ml-2">
                                ${badge}
                                <button onclick="copyToClipboard('${copyCmd}', this)" title="Copy CLI Install Command" class="text-slate-400 hover:text-white hover:bg-slate-600 rounded p-1.5 transition-colors focus:outline-none shrink-0">
                                    <i class="fa-regular fa-copy text-xs"></i>
                                </button>
                                <a href="${downloadUrl}" download title="Download VSIX" class="text-slate-400 hover:text-primary hover:bg-primary/10 rounded p-1.5 transition-colors shrink-0">
                                    <i class="fa-solid fa-download text-xs"></i>
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
                    const moreBtn = `<button id="modalLoadMoreBtn" onclick="window.loadMoreModalVersions(${start + size})" class="col-span-full py-3 mt-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-mono transition-colors border border-slate-700 focus:outline-none">Load More Versions (${remaining} remaining)</button>`;
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
