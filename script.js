// Global state to store fetched extensions
        let loadedExtensions = [];
        let currentModalExtension = null;

        document.getElementById('searchInput').addEventListener('keypress', function (e) {
            if (e.key === 'Enter') searchExtensions();
        });

        // Focus input on load
        window.onload = () => document.getElementById('searchInput').focus();

        function resetSearch() {
            document.getElementById('searchInput').value = '';
            document.getElementById('breadcrumbs').classList.add('hidden');
            document.getElementById('resultsGrid').innerHTML = '';
            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('errorState').classList.add('hidden');
            document.getElementById('welcomeState').classList.remove('hidden');
            document.getElementById('searchInput').focus();
        }

        function filterCardVersions(extId, searchTerm) {
            searchTerm = searchTerm.toLowerCase().trim();
            const versionItems = document.querySelectorAll(`.version-item-${extId}`);
            
            let visibleCount = 0;
            versionItems.forEach(item => {
                const version = item.getAttribute('data-version').toLowerCase();
                if (version.includes(searchTerm)) {
                    item.style.display = 'inline-flex';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            const emptyMsg = document.getElementById(`empty-msg-${extId}`);
            if (visibleCount === 0) {
                emptyMsg.style.display = 'block';
            } else {
                emptyMsg.style.display = 'none';
            }
        }

        async function searchExtensions() {
            const query = document.getElementById('searchInput').value.trim();
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
            
            // Set Loading State
            btnText.classList.add('hidden');
            btnLoader.classList.remove('hidden');
            welcomeState.classList.add('hidden');
            errorState.classList.add('hidden');
            emptyState.classList.add('hidden');
            breadcrumbs.classList.add('hidden');
            resultsGrid.innerHTML = '';
            loadedExtensions = [];

            try {
                const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filters: [{
                            criteria: [{ filterType: 10, value: query }],
                            pageNumber: 1,
                            pageSize: 15,
                            sortBy: 0,
                            sortOrder: 0
                        }],
                        assetTypes: [],
                        flags: 33171 // Bitmask for versions and properties
                    })
                });

                if (!response.ok) throw new Error('Marketplace API connection refused.');

                const data = await response.json();
                const extensions = data.results[0].extensions;
                
                if (extensions && extensions.length > 0) {
                    loadedExtensions = extensions; // Save to global state
                    breadcrumbs.classList.remove('hidden');
                    breadcrumbQuery.textContent = query;

                    extensions.forEach((ext, index) => {
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
                        const versionsHtml = ext.versions.map(v => {
                            const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage`;
                            const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;
                            
                            if (isPreRelease) {
                                return `<a href="${downloadUrl}" onclick="event.stopPropagation()" data-version="${v.version}" title="Download Pre-release v${v.version}" class="version-item-${extId} version-tag inline-flex items-center px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded text-xs font-mono transition-all shrink-0">
                                    <i class="fa-solid fa-flask text-[10px] mr-1.5 opacity-70"></i>${v.version}
                                </a>`;
                            } else {
                                return `<a href="${downloadUrl}" onclick="event.stopPropagation()" data-version="${v.version}" title="Download Stable v${v.version}" class="version-item-${extId} version-tag inline-flex items-center px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded text-xs font-mono transition-all shrink-0">
                                    <i class="fa-solid fa-download text-[10px] mr-1.5 opacity-70"></i>${v.version}
                                </a>`;
                            }
                        }).join('');

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
                                        <h3 class="text-xl font-semibold text-white tracking-tight flex items-center gap-3 truncate">
                                            ${displayName}
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700 font-mono tracking-normal">
                                                ${publisherDisplayName}
                                            </span>
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
                                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                        <div class="flex items-center gap-2">
                                            <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-primary transition-colors">All Versions (${ext.versions.length})</h4>
                                            <span class="text-[10px] font-mono text-slate-600 border border-slate-800 rounded px-1.5">.vsix</span>
                                        </div>
                                        <div class="relative w-full sm:w-48">
                                            <i class="fa-solid fa-filter absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px]"></i>
                                            <input type="text" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()" oninput="filterCardVersions('${extId}', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-md py-1 pl-6 pr-2 text-[10px] text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" placeholder="Filter versions...">
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                                        ${versionsHtml}
                                    </div>
                                    <div id="empty-msg-${extId}" class="hidden text-center py-2">
                                        <p class="text-slate-500 text-[10px]">No versions match your search.</p>
                                    </div>
                                </div>
                            </div>
                        `;
                        resultsGrid.appendChild(card);
                    });
                } else {
                    emptyState.classList.remove('hidden');
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

            renderModalVersions(''); // Render all initially

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
            const term = document.getElementById('versionSearch').value.trim().toLowerCase();
            renderModalVersions(term);
        }

        function renderModalVersions(searchTerm) {
            if (!currentModalExtension) return;

            const grid = document.getElementById('modalVersionsGrid');
            const emptyState = document.getElementById('modalEmptyState');
            const ext = currentModalExtension;
            const publisher = ext.publisher.publisherName;
            const extensionName = ext.extensionName;

            let matchCount = 0;
            let html = '';

            ext.versions.forEach(v => {
                if (searchTerm && !v.version.toLowerCase().includes(searchTerm)) {
                    return; // Skip if it doesn't match
                }
                
                matchCount++;
                const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage`;
                const isPreRelease = v.properties ? v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true') : false;

                const badge = isPreRelease 
                    ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">Pre-release</span>`
                    : `<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Stable</span>`;

                html += `
                    <a href="${downloadUrl}" download class="flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:border-primary/50 transition-colors group">
                        <div class="flex items-center gap-3">
                            <i class="fa-solid fa-box text-slate-500 group-hover:text-primary transition-colors"></i>
                            <span class="font-mono text-sm text-slate-200 group-hover:text-white transition-colors">v${v.version}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            ${badge}
                            <i class="fa-solid fa-download text-slate-500 group-hover:text-primary transition-colors"></i>
                        </div>
                    </a>
                `;
            });

            grid.innerHTML = html;

            if (matchCount === 0) {
                grid.classList.add('hidden');
                emptyState.classList.remove('hidden');
            } else {
                grid.classList.remove('hidden');
                emptyState.classList.add('hidden');
            }
        }

        // Close modal on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !document.getElementById('extModal').classList.contains('hidden')) {
                closeModal();
            }
        });
