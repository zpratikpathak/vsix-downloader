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

        function isPackageId(query) {
            return /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(query);
        }

        function extractPackageId(query) {
            try {
                const url = new URL(query);
                if (url.hostname === 'marketplace.visualstudio.com' && url.pathname.startsWith('/items')) {
                    const itemName = url.searchParams.get('itemName');
                    if (itemName) return itemName;
                }
            } catch (_) {}
            return query;
        }

        // ---- Platform helpers ----
        // Map a raw VS Code targetPlatform tag to a human-friendly label + icon.
        const PLATFORM_LABELS = {
            'win32-x64':    { os: 'win32',  label: 'Windows', detail: '64-bit (x64)' },
            'win32-arm64':  { os: 'win32',  label: 'Windows', detail: 'ARM64' },
            'win32-ia32':   { os: 'win32',  label: 'Windows', detail: '32-bit (x86)' },
            'darwin-x64':   { os: 'darwin', label: 'macOS',   detail: 'Intel (x64)' },
            'darwin-arm64': { os: 'darwin', label: 'macOS',   detail: 'Apple Silicon' },
            'linux-x64':    { os: 'linux',  label: 'Linux',   detail: '64-bit (x64)' },
            'linux-arm64':  { os: 'linux',  label: 'Linux',   detail: 'ARM64' },
            'linux-armhf':  { os: 'linux',  label: 'Linux',   detail: 'ARM 32-bit' },
            'alpine-x64':   { os: 'alpine', label: 'Alpine Linux', detail: '64-bit (x64)' },
            'alpine-arm64': { os: 'alpine', label: 'Alpine Linux', detail: 'ARM64' },
            'web':          { os: 'web',    label: 'Web',     detail: 'Browser' },
            'universal':    { os: 'universal', label: 'Universal', detail: 'Any system' }
        };

        const OS_ICONS = {
            win32: 'fa-brands fa-windows',
            darwin: 'fa-brands fa-apple',
            linux: 'fa-brands fa-linux',
            alpine: 'fa-brands fa-linux',
            web: 'fa-solid fa-globe',
            universal: 'fa-solid fa-box'
        };

        function titleCase(str) {
            return String(str).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        // Returns { os, label, detail, iconClass, raw } for any platform tag.
        function friendlyPlatform(tag) {
            const raw = tag || 'universal';
            const known = PLATFORM_LABELS[raw];
            if (known) {
                return { ...known, raw, iconClass: OS_ICONS[known.os] || 'fa-solid fa-box' };
            }
            // Graceful fallback for unknown / future tags.
            const osKey = raw.split('-')[0];
            return {
                os: osKey,
                label: titleCase(osKey),
                detail: raw.includes('-') ? titleCase(raw.split('-').slice(1).join('-')) : '',
                iconClass: OS_ICONS[osKey] || 'fa-solid fa-microchip',
                raw
            };
        }

        // Build the small platform badge HTML used in version rows.
        function platformBadgeHtml(tag, size) {
            if (!tag || tag === 'universal') return '';
            const fp = friendlyPlatform(tag);
            const text = fp.detail ? `${fp.label} · ${fp.detail}` : fp.label;
            const ts = size === 'sm' ? 'text-[10px]' : 'text-[9px]';
            return `<span title="${escapeHTML(fp.raw)}" class="inline-flex items-center gap-1 ${ts} px-1.5 py-0.5 rounded bg-white/10 text-slate-300 border border-white/20 shrink-0 whitespace-nowrap"><i class="${fp.iconClass} text-slate-400" aria-hidden="true"></i>${escapeHTML(text)}</span>`;
        }

        // ---- User platform detection (best-effort) ----
        // { os, arch, tag, confident, label }
        let userPlatform = null;

        async function detectUserPlatform() {
            let os = 'unknown';
            const ua = (navigator.userAgent || '').toLowerCase();
            const platform = (navigator.platform || '').toLowerCase();
            if (/win/.test(ua) || /win/.test(platform)) os = 'win32';
            else if (/mac|iphone|ipad|ipod/.test(ua) || /mac/.test(platform)) os = 'darwin';
            else if (/android/.test(ua)) os = 'linux';
            else if (/linux/.test(ua) || /linux/.test(platform)) os = 'linux';

            let arch = 'unknown';
            let confident = false;
            try {
                if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
                    const hv = await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']);
                    const a = (hv.architecture || '').toLowerCase();
                    const bits = hv.bitness || '';
                    if (a === 'arm') { arch = bits === '64' ? 'arm64' : 'armhf'; confident = true; }
                    else if (a === 'x86') { arch = bits === '64' ? 'x64' : 'ia32'; confident = true; }
                }
            } catch (_) {}

            if (arch === 'unknown') {
                // Fallback sniffing from UA string.
                if (/arm64|aarch64/.test(ua)) arch = 'arm64';
                else if (/armv7|armhf|\barm\b/.test(ua)) arch = 'armhf';
                else if (/x64|x86_64|win64|wow64|amd64/.test(ua)) arch = 'x64';
                else { arch = 'x64'; } // sensible default for desktop
            }

            // Build the candidate target-platform tag.
            let tag = `${os}-${arch}`;
            if (os === 'unknown') tag = null;
            // We can only confidently recommend for the unambiguous desktop matrix.
            const recommendable = (os === 'win32' || os === 'darwin' || os === 'linux')
                && (arch === 'x64' || arch === 'arm64');

            const fp = tag ? friendlyPlatform(tag) : null;
            userPlatform = {
                os,
                arch,
                tag,
                confident: confident && recommendable,
                recommendable,
                label: fp ? (fp.detail ? `${fp.label} · ${fp.detail}` : fp.label) : 'your system'
            };
            return userPlatform;
        }

        // Find the best matching version for the user's platform.
        // Prefers exact platform tag; only used when we can recommend confidently.
        function getRecommendedVersion(versions, releaseFilter) {
            if (!userPlatform || !userPlatform.recommendable || !userPlatform.tag) return null;
            const wantStable = releaseFilter !== 'pre-release';
            const isStable = v => !(v.properties && v.properties.some(p => p.key === 'Microsoft.VisualStudio.Code.PreRelease' && p.value === 'true'));
            // Candidate versions matching the user's exact platform tag.
            const exact = versions.filter(v => (v.targetPlatform || '') === userPlatform.tag);
            if (exact.length === 0) return null;
            const preferred = exact.filter(v => wantStable ? isStable(v) : !isStable(v));
            return (preferred[0] || exact[0]) || null;
        }

        // True when an extension publishes only universal (no platform-specific) builds.
        function isExtensionUniversalOnly(versions) {
            return versions.every(v => !v.targetPlatform || v.targetPlatform === 'universal');
        }

        // Build a highlighted "Recommended for your system" CTA row.
        function recommendedRowHtml(v, publisher, extensionName, size) {
            if (!v) return '';
            const tp = v.targetPlatform || '';
            const downloadUrl = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${extensionName}/${v.version}/vspackage${tp ? `?targetPlatform=${tp}` : ''}`;
            const copyCmd = `code --install-extension ${publisher}.${extensionName}@${v.version}`;
            const sysLabel = (userPlatform && userPlatform.label) ? userPlatform.label : 'your system';
            const big = size === 'sm';
            const titleTs = big ? 'text-xs' : 'text-[11px]';
            const subTs = big ? 'text-[11px]' : 'text-[10px]';
            const iconBox = big ? 'w-9 h-9' : 'w-8 h-8';
            return `<div data-recommended="true" onclick="event.stopPropagation()" class="recommended-version flex items-center justify-between gap-2 p-2.5 rounded-xl overflow-hidden">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="${iconBox} rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                        <i class="${OS_ICONS[(userPlatform && userPlatform.os) || 'universal'] || 'fa-solid fa-box'} text-primary ${big ? 'text-sm' : 'text-xs'}" aria-hidden="true"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <i class="fa-solid fa-circle-check text-primary ${subTs}" aria-hidden="true"></i>
                            <span class="${titleTs} font-semibold text-white truncate">Recommended for your system</span>
                        </div>
                        <div class="${subTs} text-slate-400 font-mono truncate">v${v.version} &middot; ${escapeHTML(sysLabel)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="copyToClipboard('${copyCmd}', this)" aria-label="Copy CLI Install Command" title="Copy CLI Install Command" class="text-slate-300 hover:text-white hover:bg-white/20 rounded p-1.5 transition-colors focus:outline-none shrink-0">
                        <i class="fa-regular fa-copy ${subTs}" aria-hidden="true"></i>
                    </button>
                    <a href="${downloadUrl}" onclick="triggerDownload(event, this)" download class="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white font-semibold ${subTs} px-3 py-1.5 rounded-lg transition-colors shrink-0 whitespace-nowrap focus:outline-none">
                        <i class="fa-solid fa-download ${subTs}" aria-hidden="true"></i> Download
                    </a>
                </div>
            </div>`;
        }

        // ---- Autocomplete suggestions ----
        function debounce(fn, delay) {
            let t;
            const wrapped = function (...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), delay);
            };
            wrapped.cancel = () => clearTimeout(t);
            return wrapped;
        }

        let suggestionItems = [];
        let suggestionActiveIndex = -1;
        let suggestionAbortController = null;
        let searchEpoch = 0;

        function cancelSuggestions() {
            searchEpoch++;
            if (typeof debouncedSuggest !== 'undefined' && debouncedSuggest.cancel) debouncedSuggest.cancel();
            if (suggestionAbortController) suggestionAbortController.abort();
            closeSuggestions();
        }

        function closeSuggestions() {
            const box = document.getElementById('suggestions');
            box.classList.add('hidden');
            box.innerHTML = '';
            suggestionItems = [];
            suggestionActiveIndex = -1;
            document.getElementById('searchInput').setAttribute('aria-expanded', 'false');
            document.getElementById('searchInput').removeAttribute('aria-activedescendant');
        }

        function renderSuggestions(items) {
            const box = document.getElementById('suggestions');
            suggestionItems = items;
            suggestionActiveIndex = -1;
            if (!items.length) { closeSuggestions(); return; }
            box.innerHTML = items.map((it, i) => `
                <div id="suggestion-${i}" role="option" aria-selected="false" data-index="${i}"
                    class="suggestion-item flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-white/5 last:border-0">
                    <img src="${it.icon}" alt="" class="w-9 h-9 rounded-md bg-black/40 p-0.5 shrink-0" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg'">
                    <div class="min-w-0 flex-1">
                        <div class="text-sm text-white truncate">${escapeHTML(it.name)}</div>
                        <div class="text-[11px] text-slate-500 font-mono truncate">${escapeHTML(it.publisher)}</div>
                    </div>
                    ${it.installs ? `<div class="text-[11px] text-slate-500 font-mono shrink-0"><i class="fa-solid fa-download opacity-50 mr-1"></i>${it.installs}</div>` : ''}
                </div>`).join('');
            box.querySelectorAll('.suggestion-item').forEach(el => {
                el.addEventListener('mousedown', (e) => { e.preventDefault(); selectSuggestion(parseInt(el.dataset.index)); });
            });
            box.classList.remove('hidden');
            document.getElementById('searchInput').setAttribute('aria-expanded', 'true');
        }

        function moveSuggestionHighlight(dir) {
            const box = document.getElementById('suggestions');
            if (box.classList.contains('hidden') || !suggestionItems.length) return;
            suggestionActiveIndex = (suggestionActiveIndex + dir + suggestionItems.length) % suggestionItems.length;
            box.querySelectorAll('.suggestion-item').forEach((el, i) => {
                const active = i === suggestionActiveIndex;
                el.classList.toggle('is-active', active);
                el.setAttribute('aria-selected', active ? 'true' : 'false');
                if (active) el.scrollIntoView({ block: 'nearest' });
            });
            document.getElementById('searchInput').setAttribute('aria-activedescendant', `suggestion-${suggestionActiveIndex}`);
        }

        function selectSuggestion(index) {
            const it = suggestionItems[index];
            if (!it) return;
            document.getElementById('searchInput').value = it.query;
            closeSuggestions();
            searchExtensions(true);
        }

        async function fetchSuggestions(query) {
            if (suggestionAbortController) suggestionAbortController.abort();
            suggestionAbortController = new AbortController();
            const epoch = searchEpoch;
            try {
                const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filters: [{ criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }, { filterType: 10, value: query }], pageNumber: 1, pageSize: 6, sortBy: 0, sortOrder: 0 }],
                        assetTypes: [], flags: 33171
                    }),
                    signal: suggestionAbortController.signal
                });
                if (!response.ok) return;
                const data = await response.json();
                const exts = data.results[0].extensions || [];
                const items = exts.map(ext => {
                    let icon = 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Visual_Studio_Code_1.35_icon.svg';
                    if (ext.versions[0] && ext.versions[0].files) {
                        const iconFile = ext.versions[0].files.find(f => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
                        if (iconFile) icon = iconFile.source;
                    }
                    let installs = '';
                    if (ext.statistics) {
                        const dl = ext.statistics.find(s => s.statisticName === 'install');
                        if (dl) installs = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(dl.value);
                    }
                    return {
                        name: ext.displayName || ext.extensionName,
                        publisher: ext.publisher.displayName || ext.publisher.publisherName,
                        query: ext.publisher.publisherName + '.' + ext.extensionName,
                        icon, installs
                    };
                });
                // Only render if no search started meanwhile and the input still matches
                if (searchEpoch === epoch && document.getElementById('searchInput').value.trim() === query) renderSuggestions(items);
            } catch (err) {
                if (err.name !== 'AbortError') console.error('Suggestion fetch failed', err);
            }
        }

        const debouncedSuggest = debounce((q) => fetchSuggestions(q), 250);

        const searchInputEl = document.getElementById('searchInput');
        searchInputEl.addEventListener('input', function () {
            const raw = this.value.trim();
            if (!raw) { showRecentInDropdown(); return; }
            // Skip suggestions for exact inputs (Marketplace URL or publisher.name id)
            if (raw.length < 2 || extractPackageId(raw) !== raw || isPackageId(raw)) {
                closeSuggestions();
                return;
            }
            debouncedSuggest(raw);
        });
        searchInputEl.addEventListener('keydown', function (e) {
            const open = !document.getElementById('suggestions').classList.contains('hidden');
            if (e.key === 'ArrowDown') {
                if (open) { e.preventDefault(); moveSuggestionHighlight(1); }
            } else if (e.key === 'ArrowUp') {
                if (open) { e.preventDefault(); moveSuggestionHighlight(-1); }
            } else if (e.key === 'Enter') {
                if (open && suggestionActiveIndex >= 0) { e.preventDefault(); selectSuggestion(suggestionActiveIndex); }
                else { closeSuggestions(); searchExtensions(true); }
            } else if (e.key === 'Escape') {
                closeSuggestions();
            }
        });
        searchInputEl.addEventListener('blur', function () {
            setTimeout(closeSuggestions, 150);
        });
        searchInputEl.addEventListener('focus', function () {
            if (!this.value.trim()) showRecentInDropdown();
        });

        // ---- Recent searches (localStorage) ----
        const RECENT_KEY = 'vsix-recent';
        const RECENT_MAX = 8;

        function getRecentSearches() {
            try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
            catch (_) { return []; }
        }
        function addRecentSearch(q) {
            if (!q) return;
            q = q.trim();
            if (!q) return;
            let list = getRecentSearches().filter(item => item.toLowerCase() !== q.toLowerCase());
            list.unshift(q);
            list = list.slice(0, RECENT_MAX);
            localStorage.setItem(RECENT_KEY, JSON.stringify(list));
        }
        function removeRecentSearch(q) {
            const list = getRecentSearches().filter(item => item.toLowerCase() !== q.toLowerCase());
            localStorage.setItem(RECENT_KEY, JSON.stringify(list));
        }
        function clearRecentSearches() {
            localStorage.removeItem(RECENT_KEY);
        }

        function recentSearchesHTML() {
            const recents = getRecentSearches();
            if (!recents.length) return '';
            const chips = recents.map(q => `
                <span class="recent-chip cursor-pointer" data-recent-run="${escapeHTML(q)}" title="Search ${escapeHTML(q)}">
                    <i class="fa-solid fa-clock-rotate-left text-slate-500 text-[10px]"></i>
                    <span class="truncate max-w-[160px]">${escapeHTML(q)}</span>
                    <button type="button" class="recent-chip__remove" data-recent-remove="${escapeHTML(q)}" aria-label="Remove ${escapeHTML(q)} from recent searches"><i class="fa-solid fa-xmark text-[10px]"></i></button>
                </span>`).join('');
            return `
                <div id="recentBlock" class="mb-8">
                    <div class="flex items-center justify-center gap-3 mb-3">
                        <span class="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Recent</span>
                        <button type="button" data-recent-clear class="text-[11px] text-slate-500 hover:text-red-400 transition-colors focus:outline-none">Clear all</button>
                    </div>
                    <div class="flex flex-wrap justify-center gap-2">${chips}</div>
                </div>`;
        }

        function showRecentInDropdown() {
            const recents = getRecentSearches();
            const box = document.getElementById('suggestions');
            if (!recents.length) { closeSuggestions(); return; }
            box.innerHTML = `<div class="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">Recent searches</div>` +
                recents.map(q => `
                    <div role="option" class="suggestion-item flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer border-b border-white/5 last:border-0" data-recent-run="${escapeHTML(q)}">
                        <span class="flex items-center gap-3 min-w-0"><i class="fa-solid fa-clock-rotate-left text-slate-500 text-xs"></i><span class="text-sm text-slate-300 truncate">${escapeHTML(q)}</span></span>
                        <button type="button" class="recent-chip__remove" data-recent-remove="${escapeHTML(q)}" aria-label="Remove ${escapeHTML(q)} from recent searches"><i class="fa-solid fa-xmark text-[10px]"></i></button>
                    </div>`).join('');
            box.classList.remove('hidden');
            document.getElementById('searchInput').setAttribute('aria-expanded', 'true');
        }

        function refreshRecentUI() {
            const block = document.getElementById('recentBlock');
            if (block) {
                const html = recentSearchesHTML();
                if (html) block.outerHTML = html; else block.remove();
            }
            const box = document.getElementById('suggestions');
            if (!box.classList.contains('hidden') && !document.getElementById('searchInput').value.trim()) {
                showRecentInDropdown();
            }
        }

        // Delegated handlers for recent chips / rows
        document.addEventListener('mousedown', function (e) {
            const removeEl = e.target.closest('[data-recent-remove]');
            if (removeEl) { e.preventDefault(); e.stopPropagation(); removeRecentSearch(removeEl.dataset.recentRemove); refreshRecentUI(); return; }
            const clearEl = e.target.closest('[data-recent-clear]');
            if (clearEl) { e.preventDefault(); clearRecentSearches(); refreshRecentUI(); return; }
            const runEl = e.target.closest('[data-recent-run]');
            if (runEl) {
                e.preventDefault();
                document.getElementById('searchInput').value = runEl.dataset.recentRun;
                closeSuggestions();
                searchExtensions(true);
            }
        });

        // Load trending extensions on init
        window.onload = () => {
            detectUserPlatform();
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

        // Download tracking in localStorage
        const DOWNLOAD_COUNT_KEY = 'vsix-download-count';
        
        function getDownloadCount() {
            try { return parseInt(localStorage.getItem(DOWNLOAD_COUNT_KEY)) || 0; }
            catch (_) { return 0; }
        }
        
        function incrementDownloadCount() {
            const count = getDownloadCount() + 1;
            localStorage.setItem(DOWNLOAD_COUNT_KEY, count);
            return count;
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

            // Increment download counter and show toast
            const downloadCount = incrementDownloadCount();
            if (!document.querySelector('#toast-container .pointer-events-auto')) {
                showStarToast(downloadCount);
            }
        }

        // Collection of funny messages for the star toast
        const starMessages = [
            // Message 1 - Default (original)
            {
                title: "Did I help you?",
                message: "If this tool saved you time, help me out by giving the repository a ⭐️ on GitHub!"
            },
            // Message 2
            {
                title: "Lucky streak begins! 🍀",
                message: "That's 2 downloads! Legend says starring the repo now will bring you good fortune all week! ✨"
            },
            // Message 3
            {
                title: "Another one! 🎉",
                message: "That's 3 downloads! At this rate, you'll owe me at least half a star... or maybe a full one? 😉"
            },
            // Message 4
            {
                title: "You're on a roll! 🔥",
                message: "4 extensions downloaded! I'm not saying you owe me a GitHub star, but... actually, yes I am. 🌟"
            },
            // Message 5
            {
                title: "High five! ✋",
                message: "5 extensions! That's one star-worthy milestone right there. Just saying... 🌠"
            },
            // Message 6
            {
                title: "Extension collector detected! 📦",
                message: "6 downloads? Wow! If you starred the repo, it would make my day. If not... I'll just keep counting. 👀"
            },
            // Message 7
            {
                title: "Lucky number 7! 🍀",
                message: "7 extensions downloaded! Legend says if you star the repo now, you'll have good luck for a week! ✨"
            },
            // Message 8
            {
                title: "Half a dozen +2! 🎯",
                message: "8 downloads and counting! At what number does a GitHub star become mandatory? Asking for a friend... 🤔"
            },
            // Message 9
            {
                title: "Almost double digits! 🚀",
                message: "9 extensions! One more and you hit the big 10! Maybe celebrate with a GitHub star? 🎊"
            },
            // Message 10+
            {
                title: "You're a power user! 💪",
                message: "10+ downloads! You've officially used this tool more than most. A GitHub star would mean the world! 🌍⭐"
            },
            // Message 11 (15+)
            {
                title: "Extension hoarder spotted! 🏆",
                message: "15+ extensions?! You're making me blush! 😊 That GitHub star button is looking pretty lonely though..."
            },
            // Message 12 (20+)
            {
                title: "Unbelievable dedication! 🎖️",
                message: "20+ downloads! At this point, we're basically best friends. Best friends give each other GitHub stars, right? 🤝"
            },
            // Message 13 (30+)
            {
                title: "Are you downloading ALL the extensions?! 🤯",
                message: "30+ extensions! I've lost count! If you haven't starred the repo yet, this is your sign from the universe! 🌌"
            },
            // Message 14 (50+)
            {
                title: "LEGEND STATUS ACHIEVED! 👑",
                message: "50+ DOWNLOADS?! You're officially the MVP! That GitHub star would be the cherry on top of this epic achievement! 🍒✨"
            }
        ];

        function getStarMessage(downloadCount) {
            if (downloadCount >= 50) return starMessages[13];
            if (downloadCount >= 30) return starMessages[12];
            if (downloadCount >= 20) return starMessages[11];
            if (downloadCount >= 15) return starMessages[10];
            if (downloadCount >= 10) return starMessages[9];
            if (downloadCount >= 1 && downloadCount <= 9) return starMessages[downloadCount - 1];
            return starMessages[0]; // Default
        }

        function showStarToast(downloadCount = 1) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            // Remove any existing toast before showing a new one
            const existingToast = container.querySelector('.pointer-events-auto');
            if (existingToast) {
                existingToast.remove();
            }

            const gifs = ['images/brunoPeekingBottom-cropped.gif', 'images/finnickPeekingBottom-cropped.gif'];
            const selectedGif = gifs[Math.floor(Math.random() * gifs.length)];
            
            const messageData = getStarMessage(downloadCount);

            const wrapper = document.createElement('div');
            wrapper.className = 'relative transform transition-all duration-500 translate-y-10 opacity-0 pointer-events-auto max-w-sm';

            wrapper.innerHTML = `
                <img src="${selectedGif}" alt="" class="absolute left-1/2 -translate-x-1/2 w-24 h-24 object-contain pointer-events-none transition-opacity duration-500 opacity-0 z-0" style="bottom: calc(100% - 12px)" />
                <div class="bg-surface border border-white/20 shadow-2xl rounded-xl p-4 flex items-start gap-4 relative z-10">
                    <div class="text-amber-400 mt-0.5 shrink-0">
                        <i class="fa-solid fa-star text-lg"></i>
                    </div>
                    <div class="flex-1">
                        <h4 class="text-sm font-semibold text-white mb-1">${messageData.title}</h4>
                        <p class="text-xs text-slate-400 mb-3 leading-relaxed">${messageData.message}</p>
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
                </div>
            `;

            container.appendChild(wrapper);

            requestAnimationFrame(() => {
                setTimeout(() => {
                    wrapper.classList.remove('translate-y-10', 'opacity-0');
                }, 50);
            });

            const delay = Math.random() * 10000;
            setTimeout(() => {
                const img = wrapper.querySelector('img');
                if (img) img.classList.replace('opacity-0', 'opacity-100');
            }, delay);
        }

        async function loadTrending() {
            const welcomeState = document.getElementById('welcomeState');
            welcomeState.innerHTML = recentSearchesHTML() + `
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
                    welcomeState.innerHTML = recentSearchesHTML() + `
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
                            <div class="bg-surface/50 border border-white/10 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-black/20 hover:border-primary/50 transition-colors" onclick="document.getElementById('searchInput').value='${ext.publisher.publisherName}.${ext.extensionName}'; searchExtensions(true);">
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
                welcomeState.innerHTML = recentSearchesHTML() + `
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
                const recHostEmpty = document.getElementById(`rec-${extId}`);
                if (recHostEmpty) recHostEmpty.innerHTML = '';
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
                let platformBadge = platformBadgeHtml(targetPlatform, 'xs');

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

            let recommendedHtml = '';
            // Show recommended version at top when no search term is entered
            if (!searchTerm) {
                const recV = getRecommendedVersion(matching, releaseFilter);
                recommendedHtml = recommendedRowHtml(recV, publisher, extensionName, 'xs');
            }
            // Pin the recommended row above the scrollable list so its glow isn't clipped.
            const recHost = document.getElementById(`rec-${extId}`);
            if (recHost) recHost.innerHTML = recommendedHtml;

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

        function scrollSearchToTop() {
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            document.getElementById('searchBar').scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
        }

        function showResultsSkeleton(count = 4) {
            const grid = document.getElementById('resultsGrid');
            if (!grid) return;
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-card flex flex-col md:flex-row gap-6 p-6 bg-surface/40 border border-white/10 rounded-2xl">
                        <div class="shrink-0 flex justify-center md:justify-start">
                            <div class="skeleton w-20 h-20 rounded-xl"></div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="skeleton h-5 w-40 max-w-[50%]"></div>
                                <div class="skeleton h-4 w-20 rounded"></div>
                            </div>
                            <div class="skeleton h-3 w-full max-w-md mb-2"></div>
                            <div class="skeleton h-3 w-2/3 max-w-sm"></div>
                            <div class="mt-5 pt-5 border-t border-white/5 flex gap-2">
                                <div class="skeleton h-8 w-24 rounded-md"></div>
                                <div class="skeleton h-8 w-24 rounded-md"></div>
                                <div class="skeleton h-8 w-28 rounded-md"></div>
                            </div>
                        </div>
                    </div>`;
            }
            grid.innerHTML = html;
        }

        function clearResultsSkeleton() {
            document.querySelectorAll('#resultsGrid .skeleton-card').forEach(el => el.remove());
        }
        let lastSearchQuery = '';
        function retryLastSearch() {
            const input = document.getElementById('searchInput');
            if (lastSearchQuery) input.value = lastSearchQuery;
            searchExtensions(true);
        }
        async function searchExtensions(isNewSearch = false, autoOpenFirst = false) {
            cancelSuggestions();
            const rawQuery = document.getElementById('searchInput').value.trim();
            const query = extractPackageId(rawQuery);
            if (query !== rawQuery) {
                document.getElementById('searchInput').value = query;
            }
            if (query) lastSearchQuery = query;
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
                errorState.classList.add('hidden');
                breadcrumbs.classList.add('hidden');
                document.getElementById('emptyStateTitle').textContent = 'Keep typing to search';
                document.getElementById('emptyStateMsg').textContent = `Please enter at least 2 characters — "${query}" is too short.`;
                emptyState.classList.remove('hidden');
                scrollSearchToTop();
                return;
            }

            if (isNewSearch) {
                currentPage = 1;
                currentQuery = query;
                currentSort = sortBy;
                loadedExtensions = [];
                resultsGrid.innerHTML = '';
                addRecentSearch(query);
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
                showResultsSkeleton(4);
            }

            try {
                const apiUrl = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';
                const apiHeaders = { 'Accept': 'application/json; charset=utf-8; api-version=7.2-preview.1', 'Content-Type': 'application/json' };
                const apiFlags = 33171; // Bitmask for versions and properties

                let response, data, extensions;
                let searchTier = '';

                // Tier 1: Package ID filter (only when query looks like publisher.extensionName)
                if (isPackageId(currentQuery)) {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: apiHeaders,
                        body: JSON.stringify({
                            filters: [{ criteria: [{ filterType: 7, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                            assetTypes: [], flags: apiFlags
                        })
                    });

                    if (response.ok) {
                        data = await response.json();
                        extensions = data.results[0].extensions;
                        if (extensions && extensions.length > 0) {
                            searchTier = 'Tier 1 (package ID filter)';
                        }
                    }
                }

                // Tier 2: Generic text search (fallback or default for non-package-ID queries)
                if (!searchTier) {
                    response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: apiHeaders,
                        body: JSON.stringify({
                            filters: [{ criteria: [{ filterType: 10, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                            assetTypes: [], flags: apiFlags
                        })
                    });

                    if (response.ok) {
                        data = await response.json();
                        extensions = data.results[0].extensions;
                        if (extensions && extensions.length > 0) {
                            searchTier = 'Tier 2 (generic text search)';
                        }
                    }

                    // Tier 3: VS Code-only scoped search (fallback on 500 or empty results)
                    if (!searchTier) {
                        response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: apiHeaders,
                            body: JSON.stringify({
                                filters: [{ criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }, { filterType: 10, value: currentQuery }], pageNumber: currentPage, pageSize: 15, sortBy: currentSort, sortOrder: 0 }],
                                assetTypes: [], flags: apiFlags
                            })
                        });

                        if (response.ok) {
                            data = await response.json();
                            extensions = data.results[0].extensions;
                            if (extensions && extensions.length > 0) {
                                searchTier = 'Tier 3 (VS Code extensions only)';
                            }
                        }
                    }
                }

                if (!response.ok) throw new Error('Marketplace API connection refused.');

                // Safety net: hoist exact match for dot-containing queries that bypassed Tier 1
                if (isNewSearch && extensions && extensions.length > 0 && currentQuery.includes('.') && searchTier !== 'Tier 1 (package ID filter)') {
                    const exactMatchIndex = extensions.findIndex(ext => (ext.publisher.publisherName + '.' + ext.extensionName).toLowerCase() === currentQuery.toLowerCase());
                    if (exactMatchIndex > 0) {
                        const exactMatch = extensions.splice(exactMatchIndex, 1)[0];
                        extensions.unshift(exactMatch);
                    }
                }
                
                // Remove grid loader if exists
                const gridLoader = document.getElementById('gridLoader');
                if (gridLoader) gridLoader.remove();
                clearResultsSkeleton();

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

                        const cardUniversalOnly = isExtensionUniversalOnly(ext.versions);
                        const cardOsControl = cardUniversalOnly
                            ? `<span class="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md py-1 px-2 whitespace-nowrap"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Works on every system</span>`
                            : `<select id="cardOs-${extId}" onchange="filterCardVersions('${extId}')" class="bg-black/40 border border-white/20 rounded-md py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-primary font-mono outline-none cursor-pointer">
                                                <option value="" class="bg-surface text-white">All OS</option>
                                                <option value="win32" class="bg-surface text-white">Windows</option>
                                                <option value="linux" class="bg-surface text-white">Linux</option>
                                                <option value="alpine" class="bg-surface text-white">Alpine Linux</option>
                                                <option value="darwin" class="bg-surface text-white">Mac</option>
                                                <option value="web" class="bg-surface text-white">Web</option>
                                                <option value="universal" class="bg-surface text-white">Universal</option>
                                            </select>`;

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
                                            ${cardOsControl}
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
                                    <div id="rec-${extId}" class="mb-2 px-0.5"></div>
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
                    } else if (isNewSearch) {
                        // Bring the search bar to the top so fresh results are in view
                        scrollSearchToTop();
                    }
                } else {
                    if (isNewSearch) {
                        document.getElementById('emptyStateTitle').textContent = 'No extensions found';
                        document.getElementById('emptyStateMsg').textContent = `No extensions found for "${query}". Try a different search term.`;
                        emptyState.classList.remove('hidden');
                        scrollSearchToTop();
                    }
                }
            } catch (error) {
                console.error("Fetch error:", error);
                clearResultsSkeleton();
                errorState.classList.remove('hidden');
                errorMsg.textContent = error.message;
                document.getElementById('errorQuery').textContent = `"${query}"`;
                if (isNewSearch) scrollSearchToTop();
                
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

            // Don't preset the OS filter - show all versions by default
            const modalUniversalOnly = isExtensionUniversalOnly(ext.versions);
            const osFilterEl = document.getElementById('modalOsFilter');
            const universalNote = document.getElementById('modalUniversalNote');
            osFilterEl.value = ''; // Show all OS versions by default
            // Universal-only extensions don't need an OS chooser.
            osFilterEl.classList.toggle('hidden', modalUniversalOnly);
            if (universalNote) universalNote.classList.toggle('hidden', !modalUniversalOnly);
            document.getElementById('modalReleaseFilter').value = 'stable'; // Reset Release

            renderModalVersions(); // Render all initially

            // Show Modal
            document.getElementById('extModal').classList.remove('hidden');

            // Reset the versions list scroll AFTER the modal is visible so a new
            // extension always opens at the top (scrollTop is a no-op while display:none).
            const modalScroll = document.getElementById('modalVersionsScroll');
            if (modalScroll) modalScroll.scrollTop = 0;

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
                    let platformBadge = platformBadgeHtml(targetPlatform, 'sm');

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
                                <div class="flex flex-col gap-1 min-w-0">
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
                    let recommendedHtml = '';
                    // Show recommended version at top when no search term is entered
                    if (!searchTerm) {
                        const recV = getRecommendedVersion(ext.versions, releaseFilter);
                        const row = recommendedRowHtml(recV, publisher, extensionName, 'sm');
                        if (row) recommendedHtml = `<div class="col-span-full">${row}</div>`;
                    }
                    grid.innerHTML = recommendedHtml + html;
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
