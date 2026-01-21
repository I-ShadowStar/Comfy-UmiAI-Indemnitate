import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

class LoraBrowserPanel {
  constructor() {
    this.element = null;
    this.loras = [];
    this.filtered = [];
    this.selected = null;
    this.searchTerm = "";
    this.globalStrength = 1.0;
    this.localStrength = 1.0;
    this.currentPage = 0;
    this.pageSize = 30;
    this.cardSize = "medium";
    this.sourceFilter = "all";
    this.pathFilter = "";
    this.tagsOnly = false;
    this.baseModels = [];
    this.selectedBaseModels = new Set();
    this.hasLoaded = false;
    this.expandedFolders = new Set(["Lora"]);
    this.resizeObserver = null;
    this.showAllTags = false;
    this.manualFolderSelection = false;
    this.fetchStats = { current: 0, total: 0, currentName: "" };
  }

  async fetchLoras() {
    try {
      const response = await fetch("/umiapp/loras");
      const data = await response.json();
      this.loras = data.loras || [];
      this.baseModels = data.base_models || [];
      return this.loras;
    } catch (error) {
      console.error("[Umi LoRA Browser] Failed to fetch LoRAs:", error);
      return [];
    }
  }

  createPanel() {
    const panel = document.createElement("div");
    panel.className = "umi-lora-browser";
    panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100vw;
            height: 100vh;
            background: #0f1115;
            z-index: 10000;
            display: none;
            color: #d7dae0;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        `;

    panel.innerHTML = `
            <style>
                .umi-lb-root { display: flex; flex-direction: column; height: 100%; width: 100%; position: relative; }
                
                /* Header */
                .umi-lb-header { display: flex; align-items: center; padding: 12px 18px; border-bottom: 1px solid #20242c; background: linear-gradient(135deg, #1d2230 0%, #151a24 100%); gap: 16px; height: 60px; box-sizing: border-box; }
                .umi-lb-title { font-size: 18px; font-weight: 600; color: #8fc6ff; white-space: nowrap; }
                .umi-lb-search-container { flex: 1; display: flex; justify-content: center; max-width: 600px; margin: 0 auto; position: relative; }
                .umi-lb-search-input { width: 100%; padding: 8px 12px; background: #12161f; border: 1px solid #3b4250; border-radius: 6px; color: #fff; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.2) inset; }
                .umi-lb-search-input:focus { border-color: #8fc6ff; outline: none; }
                .umi-lb-search-help { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 10px; color: #5b6b85; cursor: help; }
                .umi-lb-actions { display: flex; gap: 12px; align-items: center; white-space: nowrap; }
                .umi-lb-btn { background: #2a303b; color: #d7dae0; border: 1px solid #3b4250; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; height: 32px; position: relative; display: inline-flex; align-items: center; justify-content: center; }
                .umi-lb-btn:hover { border-color: #5b6b85; background: #323a46; }
                
                /* Danger Button */
                .umi-lb-btn-danger { color: #ff6b6b; border-color: #502a2a; }
                .umi-lb-btn-danger:hover { background: #3b2020; border-color: #ff6b6b; }

                /* Gold Button Style */
                .umi-lb-btn-gold { background: #b58900; color: #10141d; border: 1px solid #dcb538; font-weight: 600; width: 100%; margin-top: 8px; }
                .umi-lb-btn-gold:hover { background: #dcb538; color: #000; border-color: #ffe680; }

                .umi-lb-select { background: #1c212b; color: #d7dae0; border: 1px solid #3b4250; padding: 0 8px; border-radius: 6px; font-size: 12px; height: 32px; }

                /* Layout */
                .umi-lb-body { display: grid; grid-template-columns: 280px minmax(0, 1fr) 360px; height: calc(100% - 60px); width: 100%; }
                .umi-lb-sidebar { border-right: 1px solid #20242c; padding: 14px; overflow-y: auto; background: #12161f; display: flex; flex-direction: column; gap: 16px; }
                .umi-lb-main { position: relative; overflow: hidden; display: flex; flex-direction: column; min-width: 0; background: #0f1115; }
                .umi-lb-grid { display: grid; align-content: start; justify-content: start; gap: 12px; padding: 14px; overflow-y: auto; flex: 1; }
                
                /* Grid Sizes */
                .grid-small { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
                .grid-medium { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
                .grid-large { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }

                /* Pagination */
                .umi-lb-pagination { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid #20242c; background: #10141d; height: 50px; box-sizing: border-box; }
                .umi-lb-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; background: #1c212b; border: 1px solid #2a303b; padding: 4px 8px; border-radius: 6px; }
                .umi-lb-page-input { background: transparent; border: 1px solid #3b4250; color: #8fc6ff; width: 35px; text-align: center; font-size: 11px; border-radius: 4px; margin: 0 4px; }

                /* Tree */
                .umi-lb-tree { font-size: 12px; line-height: 1.6; user-select: none; }
                .umi-lb-tree-item { display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 4px; cursor: pointer; color: #c1c7d4; transition: background 0.1s; }
                .umi-lb-tree-item:hover { background: rgba(255, 255, 255, 0.05); }
                .umi-lb-tree-item.active-folder { color: #d7dae0; font-weight: 600; }
                .umi-lb-tree-file { font-size: 11px; color: #8b93a6; padding: 3px 6px 3px 24px; cursor: pointer; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .umi-lb-tree-file:hover { color: #fff; background: rgba(255, 255, 255, 0.05); }
                .umi-lb-tree-file.selected { background: rgba(33, 150, 243, 0.2); color: #64b5f6; border: 1px solid rgba(33, 150, 243, 0.3); }
                .umi-lb-tree-toggle { width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; font-size: 10px; color: #6c757d; }
                .umi-lb-tree-toggle.collapsed { transform: rotate(-90deg); }
                .umi-lb-tree-children { margin-left: 7px; border-left: 1px solid #2a303b; }

                /* Details */
                .umi-lb-details { border-left: 1px solid #20242c; padding: 14px; overflow-y: auto; overflow-x: visible; background: #12161f; min-width: 0; position: relative; }
                .umi-lb-detail-image-container { position: relative; width: 100%; height: 400px; background: #000; border-radius: 6px; overflow: hidden; margin-bottom: 10px; border: 1px solid #2a303b; }
                .umi-lb-detail-image { width: 100%; height: 100%; object-fit: contain; }
                
                /* Editable Fields */
                .umi-lb-editable { padding: 4px; border: 1px dashed transparent; border-radius: 4px; transition: all 0.2s; }
                .umi-lb-editable:hover { border-color: #3b4250; background: #1c212b; cursor: text; }
                .umi-lb-editable:focus { border-color: #8fc6ff; background: #161b25; outline: none; border-style: solid; }

                .umi-lb-detail-title { font-size: 14px; color: #8fc6ff; margin-bottom: 4px; font-weight: 600; line-height: 1.4; word-break: break-all; }
                .umi-lb-detail-meta { font-size: 11px; color: #9aa3b2; margin-bottom: 12px; line-height: 1.5; }
                .umi-lb-detail-label { font-size: 11px; color: #8b93a6; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
                .umi-lb-detail-box { background: #1c212b; border: 1px solid #2a303b; border-radius: 6px; padding: 8px; font-size: 12px; color: #d7dae0; max-height: 160px; overflow-y: auto; white-space: pre-wrap; }
                .umi-lb-detail-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
                
                /* Dropdown Menu */
                .umi-lb-dropdown { position: absolute; top: 100%; right: 0; left: auto; background: #2a303b; border: 1px solid #3b4250; border-radius: 6px; padding: 4px 0; z-index: 10050; display: none; min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
                .umi-lb-dropdown.show { display: block; }
                .umi-lb-dropdown-item { padding: 8px 12px; font-size: 12px; color: #d7dae0; cursor: pointer; white-space: nowrap; }
                .umi-lb-dropdown-item:hover { background: #3b4250; color: #fff; }

                /* Card Styles */
                .umi-lb-card { background: #1a1f2b; border: 1px solid #2a303b; border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.1s ease, border-color 0.1s ease; position: relative; display: flex; flex-direction: column; height: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .umi-lb-card:hover { border-color: #4c6b9a; transform: translateY(-2px); }
                .umi-lb-card.selected { border-color: #8fc6ff; box-shadow: 0 0 0 1px #8fc6ff inset; }
                .umi-lb-thumb { width: 100%; height: 100%; background: #000; position: relative; overflow: hidden; }
                .umi-lb-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
                
                /* Heights based on class */
                .grid-small .umi-lb-thumb { min-height: 140px; }
                .grid-medium .umi-lb-thumb { min-height: 200px; }
                .grid-large .umi-lb-thumb { min-height: 380px; }

                /* Overlay & Tags */
                .umi-lb-overlay { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 8px 6px; background: linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0) 100%); z-index: 5; pointer-events: none; }
                .umi-lb-card-name { font-size: 11px; font-weight: 600; color: #fff; margin-bottom: 2px; white-space: normal; word-break: break-word; text-shadow: 0 1px 2px black; line-height: 1.2; }
                .grid-small .umi-lb-overlay { display: none; }
                .umi-lb-badge { position: absolute; top: 6px; right: 6px; background: rgba(47, 125, 75, 0.9); color: #fff; padding: 2px 6px; font-size: 9px; border-radius: 4px; z-index: 6; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
                
                .umi-lb-tags { display: flex; gap: 4px; margin-top: 4px; overflow: hidden; flex-wrap: nowrap; height: 15px; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); transition: height 0.2s ease; }
                .umi-lb-show-tags .umi-lb-tags { flex-wrap: wrap; height: auto; mask-image: none; -webkit-mask-image: none; overflow: visible; }
                .umi-lb-tag { background: rgba(255, 255, 255, 0.15); color: #e0e0e0; font-size: 9px; padding: 0 4px; border-radius: 3px; backdrop-filter: blur(2px); white-space: nowrap; flex-shrink: 0; line-height: 14px; margin-bottom: 2px; }

                /* Inputs */
                .umi-lb-section { margin-bottom: 12px; }
                .umi-lb-section-title { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8b93a6; margin-bottom: 6px; border-bottom: 1px solid #2a303b; padding-bottom: 4px; font-weight: 600; }
                .umi-lb-input { width: 100%; padding: 6px 8px; background: #1c212b; border: 1px solid #313847; border-radius: 6px; color: #d7dae0; font-size: 12px; }
                .umi-lb-checkbox { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #c1c7d4; cursor: pointer; user-select: none; }
                .umi-lb-slider-row { display: flex; align-items: center; gap: 8px; }
                .umi-range { flex: 1; cursor: pointer; }
                .umi-range-val { font-family: monospace; color: #8fc6ff; min-width: 32px; text-align: right; }

                /* Modal Styles */
                .umi-lb-modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 20000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); opacity: 0; transition: opacity 0.2s; pointer-events: none; }
                .umi-lb-modal-overlay.open { opacity: 1; pointer-events: auto; }
                .umi-lb-modal { background: #1c212b; border: 1px solid #3b4250; border-radius: 8px; width: 90%; max-width: 600px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.6); transform: scale(0.95); transition: transform 0.2s; overflow: hidden; }
                .umi-lb-modal-overlay.open .umi-lb-modal { transform: scale(1); }
                .umi-lb-modal-header { padding: 14px 18px; border-bottom: 1px solid #2a303b; display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #8fc6ff; background: #151a24; border-radius: 8px 8px 0 0; }
                .umi-lb-modal-close { cursor: pointer; font-size: 18px; color: #8b93a6; }
                .umi-lb-modal-close:hover { color: #fff; }
                .umi-lb-modal-body { padding: 20px; overflow-y: auto; background: #0f1115; }
                
                /* Fetch Options Modal Grid */
                .umi-lb-fetch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
                .umi-lb-fetch-option { 
                    background: #2a303b; padding: 14px; border-radius: 6px; border: 2px solid #3b4250; cursor: pointer; transition: all 0.2s; 
                    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; min-height: 80px;
                }
                .umi-lb-fetch-option:hover { border-color: #5b6b85; background: #323a46; }
                .umi-lb-fetch-option.selected { border-color: #8fc6ff; background: #1d2230; }
                .umi-lb-fetch-title { font-weight: 600; font-size: 13px; color: #d7dae0; margin-bottom: 4px; }
                .umi-lb-fetch-desc { font-size: 11px; color: #9aa3b2; line-height: 1.4; }

                /* Status Bar in Header */
                .umi-lb-status { 
                    font-size: 11px; color: #8fc6ff; font-family: monospace; 
                    display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
                    min-width: 120px; text-align: right;
                    margin-left: 12px;
                }
                .umi-lb-status-line { line-height: 1.2; }

                /* Modal Grids (Images) */
                .umi-lb-img-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
                .umi-lb-img-choice { width: 100%; aspect-ratio: 2/3; object-fit: contain; background: #000; border-radius: 4px; border: 2px solid #2a303b; cursor: pointer; transition: all 0.1s; }
                .umi-lb-img-choice:hover { border-color: #8fc6ff; box-shadow: 0 0 10px rgba(143, 198, 255, 0.2); }
                
                .umi-lb-tag-grid { display: flex; flex-wrap: wrap; gap: 8px; }
                .umi-lb-int-tag { background: #2a303b; padding: 6px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid #3b4250; color: #d7dae0; transition: all 0.1s; }
                .umi-lb-int-tag:hover { background: #323a46; border-color: #8fc6ff; color: #fff; }
                .umi-lb-int-tag.copied { background: #2f7d4b; border-color: #4CAF50; color: #fff; }

            </style>
            <div class="umi-lb-root">
                <div class="umi-lb-header">
                    <div class="umi-lb-title">LoRA Browser</div>
                    <div class="umi-lb-search-container">
                        <input class="umi-lb-search-input" data-role="search" placeholder="Search LoRAs or tags (supports 'tag:', 'lora:', regex, +, -)" />
                        <span class="umi-lb-search-help" title="Advanced Search:
'cat girl' - OR search
+'cat' +'girl' - AND search
-'3d' - Exclude
tag:anime - Search tags only
lora:xl - Search filenames only
regex:^SDXL.* - Regex search
/pattern/ - Regex search">?</span>
                    </div>
                    
                    <!-- Status Bar -->
                    <div class="umi-lb-status" data-role="status-bar">
                        <span class="umi-lb-status-line">Ready</span>
                    </div>

                    <div style="width: 1px; height: 24px; background: #3b4250; margin: 0 4px;"></div>

                    <div class="umi-lb-actions">
                        <label class="umi-lb-checkbox" title="Toggle full activation text on thumbnails">
                            <input type="checkbox" data-role="expand-tags" /> Expand Tags
                        </label>
                        <div style="width: 1px; height: 24px; background: #3b4250; margin: 0 4px;"></div>
                        <label class="umi-lb-checkbox" title="Global Default Strength">Global Str</label>
                        <div class="umi-lb-slider-row" style="width: 120px;">
                             <input type="range" class="umi-range" data-role="global-strength" min="0" max="3" step="0.1" value="1.0" />
                             <span class="umi-range-val" data-role="global-strength-val">1.0</span>
                        </div>
                        <select class="umi-lb-select" data-role="card-size">
                            <option value="small">Small</option>
                            <option value="medium" selected>Medium</option>
                            <option value="large">Large</option>
                        </select>
                        <button class="umi-lb-btn" data-action="fetch-all">Fetch CivitAI</button>
                        <button class="umi-lb-btn" data-action="close">Close</button>
                    </div>
                </div>
                <div class="umi-lb-body">
                    <aside class="umi-lb-sidebar">
                        <div class="umi-lb-section">
                            <button class="umi-lb-btn" style="width:100%" data-action="refresh">Refresh LoRAs</button>
                        </div>
                        <div class="umi-lb-section">
                            <div class="umi-lb-section-title">Base Model</div>
                            <div class="umi-lb-tag-grid" data-role="base-model-filters"></div>
                        </div>
                        <div class="umi-lb-section" style="flex:1; overflow-y:auto; min-height:0;">
                            <div class="umi-lb-section-title">Folder Browser</div>
                            <div class="umi-lb-tree" data-role="folder-tree"></div>
                        </div>
                    </aside>
                    <main class="umi-lb-main">
                        <div class="umi-lb-grid grid-medium" data-role="grid"></div>
                        <div class="umi-lb-pagination" data-role="pagination"></div>
                    </main>
                    <aside class="umi-lb-details" data-role="details">
                        <div class="umi-lb-details-empty" style="color:#7b8499;text-align:center;padding:20px;font-size:12px;">Select a LoRA</div>
                    </aside>
                </div>
                <!-- Modal Container -->
                <div class="umi-lb-modal-overlay" id="umi-lb-modal">
                    <div class="umi-lb-modal">
                        <div class="umi-lb-modal-header">
                            <span class="umi-lb-modal-title">Title</span>
                            <span class="umi-lb-modal-close">&times;</span>
                        </div>
                        <div class="umi-lb-modal-body"></div>
                    </div>
                </div>
            </div>
            <!-- Hidden File Input for Image Upload -->
            <input type="file" id="umi-lb-file-input" accept="image/*" style="display:none" />
        `;

    this.element = panel;
    document.body.appendChild(panel);
    
    this.resizeObserver = new ResizeObserver(() => {
        if (this.element.style.display !== 'none') {
            this.recalculatePageSize();
        }
    });
    this.resizeObserver.observe(this.element.querySelector('.umi-lb-main'));

    this.bindEvents();
    
    const modalOverlay = panel.querySelector('#umi-lb-modal');
    const modalClose = panel.querySelector('.umi-lb-modal-close');
    const closeModal = () => modalOverlay.classList.remove('open');
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
  }

  updateStatus(message, subMessage = "") {
      const statusEl = this.element.querySelector('[data-role="status-bar"]');
      if(statusEl) {
          statusEl.innerHTML = `<span class="umi-lb-status-line">${message}</span>${subMessage ? `<span class="umi-lb-status-line" style="color:#9aa3b2">${subMessage}</span>` : ""}`;
      }
  }

  // --- Search Logic ---
  
  parseSearchQuery(query) {
      if (!query) return null;
      
      const result = {
          must: [],
          mustNot: [],
          should: [],
          type: 'standard'
      };
      
      // Explicit regex syntax /pattern/ or regex:pattern
      if ((query.startsWith('/') && query.endsWith('/')) || query.startsWith('regex:')) {
           try {
               let pattern = query.startsWith('regex:') ? query.substring(6) : query.slice(1, -1);
               result.regex = new RegExp(pattern, 'i');
               result.type = 'regex';
               return result;
           } catch(e) { console.warn("Invalid regex", e); }
      }

      // Advanced Tokenizer
      // Captures: (+/-), (scope:), (quoted string) OR (word)
      const regex = /([+\-]?)(?:(tag:|lora:))?(?:"([^"]+)"|(\S+))/g;
      let match;
      while ((match = regex.exec(query)) !== null) {
          const prefix = match[1]; // + or - or empty
          const scope = match[2];  // tag: or lora: or undefined
          const content = (match[3] || match[4]).toLowerCase();
          
          const item = { scope, content };
          
          if (prefix === '+') result.must.push(item);
          else if (prefix === '-') result.mustNot.push(item);
          else result.should.push(item);
      }
      return result;
  }

  checkMatch(lora, name, tags, term) {
      const checkContent = (text) => text.includes(term.content);
      
      if (term.scope === 'tag:') {
          return checkContent(tags);
      } else if (term.scope === 'lora:') {
          return checkContent(name);
      } else {
          // Global scope
          return checkContent(name) || checkContent(tags);
      }
  }

  applyFilters(list) {
    const query = this.parseSearchQuery(this.searchTerm);

    return list.filter((lora) => {
      const name = (lora.filename || lora.name).toLowerCase();
      const activations = this.getActivationTags(lora);
      const tags = (lora.tags || []).concat(activations.tags).join(" ").toLowerCase();
      const activationText = activations.tags.join(" ").toLowerCase();
      
      // Path Filter
      // When pathFilter is empty, show all loras (root folder shows everything)
      if (this.pathFilter !== "") {
        const relativeFilter = this.pathFilter.replace(/^Lora\//, "").toLowerCase();
        if (!name.startsWith(relativeFilter)) return false;
      }
      
      // Base Model Filter
      if (this.selectedBaseModels.size > 0) {
        const baseModel = (lora.base_model || lora.civitai?.base_model || "").toLowerCase();
        const match = [...this.selectedBaseModels].some((m) => m.toLowerCase() === baseModel);
        if (!match) return false;
      }

      // Advanced Search Filter
      if (query) {
          if (query.type === 'regex') {
              if (!query.regex.test(name) && !query.regex.test(tags)) return false;
          } else {
              // MUST NOT matches
              for (let term of query.mustNot) {
                  if (this.checkMatch(lora, name, tags, term)) return false;
              }
              // MUST matches
              for (let term of query.must) {
                  if (!this.checkMatch(lora, name, tags, term)) return false;
              }
              // SHOULD matches (If any exist, at least one must match, effectively behaving like OR search if used alone, or narrowing if mixed)
              // If user typed "cat girl", we usually treat that as AND in file search. 
              // If user typed "cat" "girl", standard search engines treat as AND.
              // We will treat non-prefixed terms as required (AND) to narrow down search as requested.
              for (let term of query.should) {
                  if (!this.checkMatch(lora, name, tags, term)) return false;
              }
          }
      }

      return true;
    });
  }

  // --- End Search Logic ---

  showFetchOptionsModal() {
      const html = `
        <div style="margin-bottom:10px;font-size:12px;color:#d7dae0;">Choose what data to fetch from CivitAI:</div>
        <div class="umi-lb-fetch-grid">
            <div class="umi-lb-fetch-option" data-mode="update_missing">
                <div class="umi-lb-fetch-title">Update Missing</div>
                <div class="umi-lb-fetch-desc">Fill in missing thumbnails, JSON, and CivitAI info files. Links models to CivitAI.</div>
            </div>
            <div class="umi-lb-fetch-option" data-mode="replace_previews">
                <div class="umi-lb-fetch-title">Replace Previews</div>
                <div class="umi-lb-fetch-desc">Fetch and replace preview images for all models.</div>
            </div>
            <div class="umi-lb-fetch-option" data-mode="replace_civitai_info">
                <div class="umi-lb-fetch-title">Replace CivitAI Info</div>
                <div class="umi-lb-fetch-desc">Refresh .civitai.info files with latest data.</div>
            </div>
            <div class="umi-lb-fetch-option" data-mode="replace_json_info">
                <div class="umi-lb-fetch-title">Replace JSON Info</div>
                <div class="umi-lb-fetch-desc">Overwrite .json metadata files with latest data.</div>
            </div>
            <div class="umi-lb-fetch-option" data-mode="replace_json_and_civitai">
                <div class="umi-lb-fetch-title">Replace JSON & Info</div>
                <div class="umi-lb-fetch-desc">Refresh both .json and .civitai.info files.</div>
            </div>
            <div class="umi-lb-fetch-option" style="border-color: #ff6b6b;" data-mode="replace_all">
                <div class="umi-lb-fetch-title" style="color: #ff6b6b;">Replace All</div>
                <div class="umi-lb-fetch-desc">Previews, Info, and JSON. Warning: Very slow.</div>
            </div>
        </div>
      `;
      
      const body = this.createModal("CivitAI Fetch Options", html);
      
      let selectedMode = null;
      
      body.querySelectorAll('.umi-lb-fetch-option').forEach(opt => {
          opt.addEventListener('click', () => {
              body.querySelectorAll('.umi-lb-fetch-option').forEach(o => o.classList.remove('selected'));
              opt.classList.add('selected');
              selectedMode = opt.dataset.mode;
          });
      });
      
      // Auto select first one
      body.querySelector('.umi-lb-fetch-option').click();

      // Add Start Button
      const startBtn = document.createElement('button');
      startBtn.className = 'umi-lb-btn umi-lb-btn-gold';
      startBtn.textContent = "Start Fetching";
      startBtn.style.marginTop = "20px";
      startBtn.style.width = "100%";
      startBtn.onclick = () => {
          if(selectedMode) {
              document.getElementById('umi-lb-modal').classList.remove('open');
              this.startBatchFetch(selectedMode);
          }
      };
      body.appendChild(startBtn);
  }

  async startBatchFetch(mode) {
      this.updateStatus("Initializing...", "Batch fetch started");
      
      try {
          this.showNotification("Starting batch fetch...", false);
          const res = await fetch("/umiapp/loras/civitai/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: mode })
          });
          
          const data = await res.json();
          if(data.success) {
              this.updateStatus("Fetch Complete", `Processed ${data.count} items`);
              this.showNotification(`Processed ${data.count} items`);
              
              // Reload data
              await this.loadLoras(true);
              this.renderFolderTree();
              this.renderLoras();
          } else {
              this.updateStatus("Error", "Batch fetch failed");
              this.showNotification("Batch fetch failed", true);
          }
      } catch (e) {
          console.error(e);
          this.updateStatus("Error", e.message);
          this.showNotification("Error during batch fetch", true);
      }
  }

  createModal(title, contentHTML) {
      const overlay = this.element.querySelector('#umi-lb-modal');
      const titleEl = overlay.querySelector('.umi-lb-modal-title');
      const bodyEl = overlay.querySelector('.umi-lb-modal-body');
      
      titleEl.textContent = title;
      bodyEl.innerHTML = contentHTML;
      overlay.classList.add('open');
      return bodyEl;
  }

  showInternalTagsModal(tagPairs) {
      if (!tagPairs || !tagPairs.length) {
          this.createModal("Internal Tags", `<div style="text-align:center; color:#9aa3b2; padding:20px;">No internal tags found in metadata.</div>`);
          return;
      }

      const sortedPairs = [...tagPairs].sort((a, b) => b.count - a.count);
      const counts = sortedPairs.map(p => p.count).sort((a, b) => a - b);
      const maxCount = Math.max(counts[counts.length - 1] || 1, 1);
      const topPercentCount = Math.max(1, Math.ceil(sortedPairs.length * 0.05));
      const topCount = Math.min(topPercentCount, 10);
      const topTags = new Set(sortedPairs.slice(0, topCount).map(p => p.tag));
      const percentile = (arr, p) => {
          const idx = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * p)));
          return arr[idx];
      };
      const lowBound = percentile(counts, 0.1);
      const highBound = percentile(counts, 0.9);
      const rangeCount = Math.max(1, highBound - lowBound);
      const getTagColor = (tag, count) => {
          if (topTags.has(tag)) return "#4fc3f7"; // blue for top 5%
          const clamped = Math.min(highBound, Math.max(lowBound, count));
          const ratio = (clamped - lowBound) / rangeCount; // 0..1
          if (ratio <= 0.5) {
              const t = ratio / 0.5;
              const r = 220;
              const g = Math.round(60 + (200 - 60) * t);
              const b = 60;
              return `rgb(${r}, ${g}, ${b})`; // red -> yellow
          }
          const t = (ratio - 0.5) / 0.5;
          const r = Math.round(220 - (220 - 60) * t);
          const g = 200;
          const b = 60;
          return `rgb(${r}, ${g}, ${b})`; // yellow -> green
      };
      const html = `
        <div style="margin-bottom:12px; font-size:12px; color:#8b93a6;">Filter tags by training count and click to copy.</div>
        <div class="umi-lb-slider-row" style="margin-bottom:10px;">
            <input type="range" class="umi-range" data-role="tag-threshold" min="1" max="${maxCount}" step="1" value="1" />
            <span class="umi-range-val" data-role="tag-threshold-val">1</span>
        </div>
        <div style="max-height:45vh; overflow-y:auto;">
            <div class="umi-lb-tag-grid" data-role="internal-tag-grid"></div>
        </div>
      `;
      
      const body = this.createModal("Internal Metadata Tags", html);
      const grid = body.querySelector('[data-role="internal-tag-grid"]');
      const slider = body.querySelector('[data-role="tag-threshold"]');
      const sliderVal = body.querySelector('[data-role="tag-threshold-val"]');

      const renderTags = (minCount) => {
          const filtered = sortedPairs.filter(p => p.count >= minCount);
          grid.innerHTML = filtered.map(({ tag, count }) => `
              <div class="umi-lb-int-tag" data-tag="${this.escapeHtmlAttr(tag)}" title="Count: ${count}" style="color:${this.escapeHtmlAttr(getTagColor(tag, count))}">
                  ${this.escapeHtml(tag)} <span style="opacity:0.7">(${count})</span>
              </div>
          `).join('');
          grid.querySelectorAll('.umi-lb-int-tag').forEach(btn => {
              btn.addEventListener('click', () => {
                  navigator.clipboard.writeText(btn.dataset.tag);
                  btn.classList.add('copied');
                  btn.textContent = "Copied!";
                  setTimeout(() => {
                      btn.classList.remove('copied');
                      btn.textContent = btn.dataset.tag;
                  }, 1000);
              });
          });
      };

      slider.addEventListener('input', () => {
          const val = parseInt(slider.value, 10) || 1;
          sliderVal.textContent = String(val);
          renderTags(val);
      });

      renderTags(1);
  }

  async fetchInternalTags(lora) {
      try {
          this.updateStatus("Loading tags...", lora.name);
          const res = await fetch("/umiapp/loras/internal_tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lora_name: lora.name })
          });
          const data = await res.json();
          if (data.success) {
              this.showInternalTagsModal(data.tag_pairs || []);
              this.updateStatus("Ready");
          } else {
              this.showInternalTagsModal([]);
              this.updateStatus("Ready");
          }
      } catch (e) {
          console.error(e);
          this.showInternalTagsModal([]);
          this.updateStatus("Ready");
      }
  }

  getCleanFileName(pathOrName) {
    if (!pathOrName) return "";
    let parts = pathOrName.split(/[\\/]/);
    let name = parts[parts.length - 1];
    return name.replace(/\.[^/.]+$/, "");
  }

  bindEvents() {
    const closeBtn = this.element.querySelector('[data-action="close"]');
    closeBtn.addEventListener("click", () => this.hide());

    const refreshBtn = this.element.querySelector('[data-action="refresh"]');
    refreshBtn.addEventListener("click", () => {
        // If they haven't manually navigated, we reset to Lora root
        if (!this.manualFolderSelection) {
            this.pathFilter = "";
        }
        this.loadLoras(true);
    });

    const searchInput = this.element.querySelector('[data-role="search"]');
    searchInput.addEventListener("input", (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.currentPage = 0;
      this.renderLoras();
    });

    // Base model filters are rendered dynamically; no static listeners needed here.

    const expandTags = this.element.querySelector('[data-role="expand-tags"]');
    expandTags.addEventListener("change", (e) => {
        const grid = this.element.querySelector('[data-role="grid"]');
        if (e.target.checked) grid.classList.add('umi-lb-show-tags');
        else grid.classList.remove('umi-lb-show-tags');
    });

    const globalSlider = this.element.querySelector('[data-role="global-strength"]');
    const globalVal = this.element.querySelector('[data-role="global-strength-val"]');
    globalSlider.addEventListener("input", (e) => {
      this.globalStrength = parseFloat(e.target.value);
      globalVal.textContent = this.globalStrength.toFixed(1);
    });

    const cardSizeSelect = this.element.querySelector('[data-role="card-size"]');
    cardSizeSelect.addEventListener("change", (e) => {
      this.cardSize = e.target.value;
      const grid = this.element.querySelector('[data-role="grid"]');
      grid.classList.remove("grid-small", "grid-medium", "grid-large");
      grid.classList.add(`grid-${this.cardSize}`);
      this.recalculatePageSize();
    });

    this.element.querySelectorAll('[data-action="fetch-all"]').forEach((btn) => {
      btn.addEventListener("click", () => this.showFetchOptionsModal());
    });

    const fileInput = document.getElementById('umi-lb-file-input');
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0] && this.selected) {
            const file = e.target.files[0];
            const formData = new FormData();
            formData.append('image', file);
            formData.append('lora_name', this.selected.name);
            
            try {
                this.showNotification("Uploading image...");
                const res = await fetch("/umiapp/loras/upload_preview", { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    this.showNotification("Preview updated");
                    // Save state before hard refresh
                    const selectedName = this.selected.name;
                    await this.loadLoras(true);
                    this.selected = this.loras.find(l => l.name === selectedName);
                    this.renderDetails();
                } else {
                    this.showNotification("Upload failed", true);
                }
            } catch (err) {
                this.showNotification("Error uploading", true);
            }
        }
        fileInput.value = '';
    });
  }

  recalculatePageSize() {
      const gridEl = this.element.querySelector('[data-role="grid"]');
      if (!gridEl) return;
      
      const containerWidth = gridEl.clientWidth;
      const containerHeight = gridEl.clientHeight;
      
      let itemWidth, itemHeight;
      if (this.cardSize === 'small') { itemWidth = 152; itemHeight = 150; }
      else if (this.cardSize === 'large') { itemWidth = 332; itemHeight = 390; }
      else { itemWidth = 232; itemHeight = 210; } 

      const cols = Math.floor(containerWidth / itemWidth);
      const rows = Math.floor(containerHeight / itemHeight);
      const newSize = Math.max(1, cols) * Math.max(1, rows);
      
      if (newSize !== this.pageSize) {
          this.pageSize = newSize;
          this.renderLoras();
      }
  }

  buildFolderTree() {
    const tree = { name: "Lora", children: {}, files: [] };
    this.loras.forEach(lora => {
      const path = lora.filename || lora.name;
      const parts = path.split(/[\\/]/);
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!current.children[folderName]) {
          current.children[folderName] = { name: folderName, children: {}, files: [], fullPath: parts.slice(0, i + 1).join("/") };
        }
        current = current.children[folderName];
      }
      current.files.push(lora);
    });
    return tree;
  }

  renderFolderTree() {
    const treeData = this.buildFolderTree();
    const container = this.element.querySelector('[data-role="folder-tree"]');
    container.innerHTML = this.createTreeNodeHTML(treeData, "Lora");
    
    container.querySelectorAll('.umi-lb-tree-item').forEach(el => {
      el.addEventListener('click', (e) => {
         const path = el.dataset.path;
         if (this.expandedFolders.has(path)) this.expandedFolders.delete(path);
         else this.expandedFolders.add(path);
         
         this.manualFolderSelection = true; // User manually clicked a folder
         this.pathFilter = path === "Lora" ? "" : path;
         this.currentPage = 0;
         this.renderFolderTree();
         this.renderLoras();
      });
    });

    container.querySelectorAll('.umi-lb-tree-file').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const filename = el.dataset.filename;
            const lora = this.loras.find(l => (l.filename || l.name) === filename);
            if (lora) {
                this.selected = lora;
                this.localStrength = this.globalStrength; 
                this.renderFolderTree();
                this.renderDetails();
            }
        });
    });
  }

  renderBaseModelFilters() {
    const container = this.element.querySelector('[data-role="base-model-filters"]');
    if (!container) return;
    container.innerHTML = "";
    if (!this.baseModels || !this.baseModels.length) {
      container.innerHTML = `<div style="font-size:11px;color:#7b8499;">No base models detected</div>`;
      return;
    }

    this.baseModels.forEach((model) => {
      const chip = document.createElement("div");
      chip.className = "umi-lb-tag";
      chip.textContent = model;
      chip.style.cursor = "pointer";
      chip.style.userSelect = "none";
      if (this.selectedBaseModels.has(model)) {
        chip.style.background = "rgba(79, 195, 247, 0.35)";
        chip.style.border = "1px solid rgba(79, 195, 247, 0.5)";
      } else {
        chip.style.border = "1px solid rgba(255,255,255,0.05)";
      }
      chip.addEventListener("click", () => {
        if (this.selectedBaseModels.has(model)) this.selectedBaseModels.delete(model);
        else this.selectedBaseModels.add(model);
        this.currentPage = 0;
        this.renderBaseModelFilters();
        this.renderLoras();
      });
      container.appendChild(chip);
    });
  }

  createTreeNodeHTML(node, path) {
    const isExpanded = this.expandedFolders.has(path);
    const hasChildren = Object.keys(node.children).length > 0;
    const isFolderActive = (path === "Lora" && this.pathFilter === "") || (this.pathFilter === path);
    
    let html = `
      <div class="umi-lb-tree-item ${isFolderActive ? 'active-folder' : ''}" data-path="${this.escapeHtmlAttr(path)}">
        <span class="umi-lb-tree-toggle ${isExpanded ? '' : 'collapsed'}" style="visibility: ${hasChildren ? 'visible' : 'hidden'}">▼</span>
        <span class="umi-lb-tree-name">${this.escapeHtml(node.name)}</span>
      </div>
    `;

    if (isExpanded) {
      html += `<div class="umi-lb-tree-children">`;
      Object.keys(node.children).sort().forEach(childKey => {
        html += this.createTreeNodeHTML(node.children[childKey], `${path}/${childKey}`);
      });
      node.files.sort((a,b) => a.name.localeCompare(b.name)).forEach(file => {
        const fName = file.filename || file.name;
        const isSelected = this.selected && (this.selected.filename || this.selected.name) === fName;
        html += `<div class="umi-lb-tree-file ${isSelected ? 'selected' : ''}" data-filename="${this.escapeHtmlAttr(fName)}" title="${this.escapeHtmlAttr(file.name)}">${this.escapeHtml(this.getCleanFileName(fName))}.safetensor</div>`;
      });
      html += `</div>`;
    }
    return html;
  }

  getActivationTags(lora) {
    const override = lora.override || {};
    const civitaiInfoTags = lora.civitai_info_tags || [];
    if (override.activation_tags && override.activation_tags.length > 0) return { tags: override.activation_tags, source: "override" };
    if (override.tags && override.tags.length > 0) return { tags: override.tags, source: "override" };
    if (civitaiInfoTags.length > 0) return { tags: civitaiInfoTags, source: "civitai_info" };
    if (lora.civitai?.trigger_words?.length > 0) return { tags: lora.civitai.trigger_words, source: "civitai" };
    if (lora.tags && lora.tags.length > 0) return { tags: lora.tags, source: "safetensors" };
    return { tags: [], source: "none" };
  }

  getPreviewUrl(lora) {
    const override = lora.override || {};
    // Timestamp helps force browser refresh of thumbnails when they change
    const timestamp = `&t=${Date.now()}`;
    if (lora.local_preview) return `/umiapp/preview?path=${encodeURIComponent(lora.local_preview)}${timestamp}`;
    if (override.preview_url) return override.preview_url;
    if (lora.civitai?.preview_url) return lora.civitai.preview_url;
    return null;
  }

  async loadLoras(force = false) {
    const grid = this.element.querySelector('[data-role="grid"]');
    if (this.loras.length > 0 && this.hasLoaded && !force) {
      this.recalculatePageSize(); 
      this.renderFolderTree();
      this.renderLoras();
      return;
    }
    
    // Perform fetch
    if (force || !this.hasLoaded) {
        grid.innerHTML = '<div class="umi-lb-details-empty">Loading...</div>';
        await this.fetchLoras();
        this.hasLoaded = true;
    }
    
    this.recalculatePageSize();
    this.renderFolderTree();
    this.renderBaseModelFilters();
    this.renderLoras();
  }

  renderLoras() {
    const grid = this.element.querySelector('[data-role="grid"]');
    this.filtered = this.applyFilters(this.loras);
    if (!this.filtered.length) {
      grid.innerHTML = '<div class="umi-lb-details-empty">No results found</div>';
      this.renderPagination();
      return;
    }

    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    const pageItems = this.filtered.slice(start, end);
    grid.innerHTML = pageItems.map((lora) => this.createCardHTML(lora)).join("");
    grid.querySelectorAll(".umi-lb-card").forEach((card, idx) => {
      card.addEventListener("click", () => {
        this.selected = pageItems[idx];
        this.localStrength = this.globalStrength; 
        this.renderFolderTree(); 
        this.renderDetails();
      });
    });
    this.renderPagination();
  }

  renderPagination() {
    const pagination = this.element.querySelector('[data-role="pagination"]');
    if (!pagination) return;
    const totalPages = Math.ceil(this.filtered.length / this.pageSize);
    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }
    pagination.innerHTML = `
        <button class="umi-lb-btn" data-page="${this.currentPage - 1}" ${this.currentPage === 0 ? "disabled" : ""}>Prev</button>
        <span class="umi-lb-chip">Page <input type="text" class="umi-lb-page-input" value="${this.currentPage + 1}" /> of ${totalPages}</span>
        <button class="umi-lb-btn" data-page="${this.currentPage + 1}" ${this.currentPage >= totalPages - 1 ? "disabled" : ""}>Next</button>
    `;
    pagination.querySelectorAll("button[data-page]:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.currentPage = parseInt(btn.dataset.page, 10);
        this.renderLoras();
      });
    });
    const pageInput = pagination.querySelector(".umi-lb-page-input");
    if(pageInput) {
        pageInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            let val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val > 0 && val <= totalPages) {
              this.currentPage = val - 1;
              this.renderLoras();
            } else { e.target.value = this.currentPage + 1; }
          }
        });
        pageInput.addEventListener("click", (e) => e.target.select());
    }
  }

  createCardHTML(lora) {
    const activation = this.getActivationTags(lora);
    const previewUrl = this.getPreviewUrl(lora);
    const cleanName = this.getCleanFileName(lora.filename || lora.name);
    const tags = activation.tags.slice(0, 20); 
    const tagHtml = tags.map((t) => `<span class="umi-lb-tag">#${this.escapeHtml(t)}</span>`).join("");
    const baseModel = lora.base_model || lora.civitai?.base_model || "";
    const badge = baseModel ? `<div class="umi-lb-badge">${this.escapeHtml(baseModel)}</div>` : "";
    const selectedClass = this.selected && this.selected.name === lora.name ? "selected" : "";

    return `
            <div class="umi-lb-card ${selectedClass}">
                <div class="umi-lb-thumb">
                    ${previewUrl ? `<img src="${previewUrl}" alt="${this.escapeHtmlAttr(cleanName)}" loading="lazy" />` : ""}
                    ${badge}
                    <div class="umi-lb-overlay">
                        <div class="umi-lb-card-name">${this.escapeHtml(cleanName)}</div>
                        <div class="umi-lb-tags">${tagHtml}</div>
                    </div>
                </div>
            </div>
        `;
  }

  renderDetails() {
    const details = this.element.querySelector('[data-role="details"]');
    if (!this.selected) {
      details.innerHTML = '<div class="umi-lb-details-empty" style="color:#7b8499;text-align:center;padding:20px;font-size:12px;">Select a LoRA</div>';
      return;
    }

    const lora = this.selected;
    const activation = this.getActivationTags(lora);
    const civitai = lora.civitai || {};
    const previewUrl = this.getPreviewUrl(lora);
    const override = lora.override || {};
    
    // Check local metadata for URL first
    const civitaiUrl = civitai.url || (lora.metadata && lora.metadata.url) || null;
    
    const displayName = override.nickname || this.getCleanFileName(lora.filename || lora.name);
    const tagList = override.activation_text || activation.tags.join(", ");
    const baseModel = civitai.base_model || "Unknown";
    const rawDescription = override.description || civitai.description || lora.local?.description || "";
    const description = this.stripHtml(rawDescription);

    details.innerHTML = `
            <div class="umi-lb-detail-section">
                <div class="umi-lb-detail-image-container">
                    ${previewUrl ? `<img class="umi-lb-detail-image" src="${previewUrl}" />` : ""}
                </div>
                
                <div class="umi-lb-detail-title umi-lb-editable" contenteditable="true" data-role="edit-name" title="Click to edit name">${this.escapeHtml(displayName)}</div>
                
                <div class="umi-lb-detail-meta">Source: ${this.escapeHtml(activation.source)} | Base: ${this.escapeHtml(baseModel)}</div>
                
                <div class="umi-lb-section">
                     <div class="umi-lb-detail-label">Specific Strength Override</div>
                     <div class="umi-lb-slider-row">
                         <input type="range" class="umi-range" data-role="local-strength" min="0" max="3" step="0.1" value="${this.localStrength}" />
                         <span class="umi-range-val" data-role="local-strength-val">${this.localStrength.toFixed(1)}</span>
                     </div>
                </div>

                <div class="umi-lb-detail-actions">
                    <button class="umi-lb-btn" data-action="insert">Insert</button>
                    <button class="umi-lb-btn" data-action="copy">Copy Tag</button>
                    <div style="position:relative; display:inline-block;">
                        <button class="umi-lb-btn" data-action="replace-preview">Replace Preview</button>
                        <div class="umi-lb-dropdown" id="umi-lb-preview-menu">
                            <div class="umi-lb-dropdown-item" data-action="preview-url">From URL</div>
                            <div class="umi-lb-dropdown-item" data-action="preview-local">From Computer</div>
                        </div>
                    </div>
                    ${civitaiUrl ? `<button class="umi-lb-btn" data-action="open">Open CivitAI</button>` : `<button class="umi-lb-btn" data-action="fetch">Fetch</button>`}
                    
                    <!-- New Manage Button -->
                    <div style="position:relative; display:inline-block;">
                        <button class="umi-lb-btn" data-action="manage">Manage</button>
                        <div class="umi-lb-dropdown" id="umi-lb-manage-menu">
                            <div class="umi-lb-dropdown-item" data-action="manage-open">Open Location</div>
                            <div class="umi-lb-dropdown-item" style="color:#ff6b6b" data-action="manage-delete">Delete Lora</div>
                        </div>
                    </div>

                </div>
            </div>
            
            <div class="umi-lb-detail-section">
                <div class="umi-lb-detail-label">Activation Tags (Edit and click Save)</div>
                <div class="umi-lb-detail-box umi-lb-editable" contenteditable="true" data-role="edit-tags">${this.escapeHtml(tagList)}</div>
                <button class="umi-lb-btn umi-lb-btn-gold" data-action="view-internal-tags">Internal Tags</button>
            </div>
            
            <div class="umi-lb-detail-section">
                <div class="umi-lb-detail-label">Description (Edit and click Save)</div>
                <div class="umi-lb-detail-box umi-lb-editable" contenteditable="true" data-role="edit-desc">${this.escapeHtml(description || "No description")}</div>
            </div>

            <button class="umi-lb-btn umi-lb-btn-gold" data-action="save-metadata" style="margin-top:10px; background:#4CAF50; color:white; border-color:#388E3C;">Save Metadata Changes</button>
        `;

    const locSlider = details.querySelector('[data-role="local-strength"]');
    const locVal = details.querySelector('[data-role="local-strength-val"]');
    if(locSlider) {
        locSlider.addEventListener('input', (e) => {
            this.localStrength = parseFloat(e.target.value);
            locVal.textContent = this.localStrength.toFixed(1);
        });
    }

    const nameEl = details.querySelector('[data-role="edit-name"]');
    const tagsEl = details.querySelector('[data-role="edit-tags"]');
    const descEl = details.querySelector('[data-role="edit-desc"]');

    // Logic for the Save Button
    const saveBtn = details.querySelector('[data-action="save-metadata"]');
    saveBtn.addEventListener('click', async () => {
        const nickname = nameEl.textContent.trim();
        const activationText = tagsEl.textContent.trim();
        const description = descEl.textContent.trim();
        const currentOverride = lora.override || {};
        await this.saveLoraOverride(lora.name, {
            ...currentOverride,
            nickname: nickname === this.getCleanFileName(lora.filename||lora.name) ? "" : nickname,
            activation_text: activationText,
            description: description
        });
        this.showNotification("Metadata Saved");
    });

    // Preview Dropdown
    const replaceBtn = details.querySelector('[data-action="replace-preview"]');
    const previewDropdown = document.getElementById('umi-lb-preview-menu');
    replaceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        previewDropdown.classList.toggle('show');
        manageDropdown.classList.remove('show'); // close other
    });
    
    // Manage Dropdown
    const manageBtn = details.querySelector('[data-action="manage"]');
    const manageDropdown = document.getElementById('umi-lb-manage-menu');
    manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        manageDropdown.classList.toggle('show');
        if (manageDropdown.classList.contains('show')) {
            // Render as fixed overlay to avoid clipping
            manageDropdown.style.position = 'fixed';
            manageDropdown.style.left = '';
            manageDropdown.style.right = '';
            manageDropdown.style.top = '';
            manageDropdown.style.bottom = '';

            const btnRect = manageBtn.getBoundingClientRect();
            const dropdownRect = manageDropdown.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

            let left = btnRect.right - dropdownRect.width;
            if (left < 8) left = btnRect.left;
            if (left + dropdownRect.width > viewportWidth - 8) {
                left = Math.max(8, viewportWidth - dropdownRect.width - 8);
            }

            manageDropdown.style.left = `${Math.round(left)}px`;
            manageDropdown.style.top = `${Math.round(btnRect.bottom)}px`;
        } else {
            manageDropdown.style.position = '';
        }
        previewDropdown.classList.remove('show'); // close other
    });

    const closeDropdowns = () => {
        previewDropdown.classList.remove('show');
        manageDropdown.classList.remove('show');
        manageDropdown.style.position = '';
    };
    document.addEventListener('click', closeDropdowns);

    // Manage Actions
    details.querySelector('[data-action="manage-open"]').addEventListener('click', async () => {
        try {
            this.showNotification("Opening folder...");
            await fetch("/umiapp/loras/manage/open", { 
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lora_name: lora.name, filename: lora.filename })
            });
        } catch(e) { console.error(e); }
    });

    details.querySelector('[data-action="manage-delete"]').addEventListener('click', async () => {
        if(confirm(`Are you sure you want to delete "${lora.name}" and all associated files?\nThis cannot be undone.`)) {
             try {
                const res = await fetch("/umiapp/loras/manage/delete", { 
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lora_name: lora.name, filename: lora.filename })
                });
                const data = await res.json();
                if(data.success) {
                    this.showNotification("Deleted");
                    this.selected = null;
                    await this.loadLoras(true);
                } else {
                    this.showNotification("Delete failed", true);
                }
            } catch(e) { console.error(e); this.showNotification("Delete failed", true); }
        }
    });

    details.querySelector('[data-action="preview-url"]').addEventListener('click', async () => {
        const url = prompt("Enter Image URL:");
        if (url) {
            await this.replaceLoraPreviewFromUrl(lora.name, url);
        }
    });

    details.querySelector('[data-action="preview-local"]').addEventListener('click', () => {
        document.getElementById('umi-lb-file-input').click();
    });

    details.querySelector('[data-action="view-internal-tags"]').addEventListener('click', () => {
        this.fetchInternalTags(lora);
    });

    details.querySelector('[data-action="insert"]').addEventListener("click", () => this.insertLora(lora));
    details.querySelector('[data-action="copy"]').addEventListener("click", () => {
      const text = `<lora:${lora.filename || lora.name}:${this.localStrength.toFixed(1)}>`;
      navigator.clipboard.writeText(text);
      this.showNotification("Copied");
    });
    
    const openBtn = details.querySelector('[data-action="open"]');
    if (openBtn) openBtn.addEventListener("click", () => window.open(civitaiUrl, "_blank"));
    const fetchBtn = details.querySelector('[data-action="fetch"]');
    if (fetchBtn) fetchBtn.addEventListener("click", () => this.fetchSingleCivitai(lora));
  }

  insertLora(lora) {
    const loraName = lora.filename || lora.name;
    const loraText = `<lora:${loraName}:${this.localStrength.toFixed(1)}>`;
    const activation = this.getActivationTags(lora);
    const activeNode = this.findActiveUmiNode();
    if (activeNode) {
      const promptWidget = activeNode.widgets.find((w) => w.name === "text");
      if (promptWidget) {
        let val = promptWidget.value || "";
        let newValue = val ? `${val}, ${loraText}` : loraText;
        if (activation.tags.length) newValue = `${newValue}, ${activation.tags.slice(0, 3).join(", ")}`;
        promptWidget.value = newValue;
        if (promptWidget.callback) promptWidget.callback(newValue);
        app.graph.setDirtyCanvas(true, true);
        this.showNotification(`Inserted`);
      }
    } else {
      navigator.clipboard.writeText(loraText);
      this.showNotification("Copied");
    }
  }

  findActiveUmiNode() {
    const sel = app.canvas.selected_nodes;
    if (sel) {
      for (const id in sel) {
        const n = app.graph.getNodeById(parseInt(id, 10));
        if (n && n.type.startsWith("UmiAIWildcard")) return n;
      }
    }
    return app.graph._nodes.find(n => n.type.startsWith("UmiAIWildcard")) || null;
  }

  async fetchSingleCivitai(lora) {
    try {
      this.updateStatus("Fetching...", lora.name);
      this.showNotification("Fetching...");
      const res = await fetch("/umiapp/loras/civitai/single", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lora_name: lora.name }),
      });
      const data = await res.json();
      if (data.success) {
        const currentName = this.selected?.name;
        const currentPage = this.currentPage;
        await this.loadLoras(true);
        this.selected = this.loras.find(item => item.name === currentName) || null;
        this.currentPage = currentPage;
        this.renderLoras();
        this.renderDetails();
        this.updateStatus("Ready");
        this.showNotification("Fetch Complete");
      } else {
        this.updateStatus("Error", "Fetch failed");
        this.showNotification("Fetch Failed", true);
      }
    } catch (e) {
        this.updateStatus("Error", e.message);
        this.showNotification("Error", true);
    }
  }

  async saveLoraOverride(loraName, override) {
    const res = await fetch("/umiapp/loras/overrides/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lora_name: loraName, override }),
    });
    const data = await res.json();
    if (data.success) {
        // Persist navigation and selection state
        const prevPage = this.currentPage;
        const prevName = this.selected?.name;
        await this.loadLoras(true);
        this.selected = this.loras.find(i => i.name === prevName) || null;
        this.currentPage = prevPage;
        this.renderLoras();
        this.renderDetails();
    }
  }

  async replaceLoraPreviewFromUrl(loraName, url) {
    try {
      this.showNotification("Updating preview...");
      const res = await fetch("/umiapp/loras/preview/replace_url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lora_name: loraName, url }),
      });
      const data = await res.json();
      if (data.success) {
        const prevName = this.selected?.name;
        const prevPage = this.currentPage;
        await this.loadLoras(true);
        this.selected = this.loras.find(i => i.name === prevName) || null;
        this.currentPage = prevPage;
        this.renderLoras();
        this.renderDetails();
        this.showNotification("Preview updated");
      } else {
        this.showNotification(data.error || "Preview update failed", true);
      }
    } catch (e) {
      console.error(e);
      this.showNotification("Preview update failed", true);
    }
  }

  showNotification(msg, isError = false) {
    const n = document.createElement("div");
    n.style.cssText = `position:fixed;top:20px;right:20px;background:${isError ? "#be5046" : "#2f7d4b"};color:white;padding:8px 14px;border-radius:6px;z-index:10002;font-size:12px;`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1500);
  }

  escapeHtml(t) { return !t ? "" : String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  escapeHtmlAttr(t) { return this.escapeHtml(t).replace(/\n/g, " "); }
  stripHtml(v) { if (!v) return ""; let doc = new DOMParser().parseFromString(String(v), "text/html"); return doc.body.textContent.trim() || ""; }
  async show() { if (!this.element) this.createPanel(); this.element.style.display = "block"; await this.loadLoras(); }
  hide() { if (this.element) this.element.style.display = "none"; }
}

const loraBrowser = new LoraBrowserPanel();
window.umiLoraBrowser = loraBrowser;
app.registerExtension({
  name: "Umi.LoraBrowser",
  async setup() {
    const menu = document.querySelector(".comfy-menu");
    if (menu) {
      const btn = document.createElement("button");
      btn.textContent = "LoRA Browser";
      btn.onclick = () => loraBrowser.show();
      menu.appendChild(btn);
    }
    document.addEventListener("keydown", (e) => { if (e.ctrlKey && e.key === "l") { e.preventDefault(); loraBrowser.show(); } });
  }
});