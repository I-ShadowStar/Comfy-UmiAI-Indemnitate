import { app } from "../../scripts/app.js";

// =============================================================================
// PART 1: AUTOCOMPLETE LOGIC (Enhanced with Keyboard Navigation)
// =============================================================================

class AutoCompletePopup {
    constructor() {
        this.element = document.createElement("div");
        Object.assign(this.element.style, {
            position: "absolute",
            display: "none",
            backgroundColor: "#1e1e1e",
            border: "1px solid #61afef", // Blue border to indicate active state
            zIndex: "9999",
            maxHeight: "250px",
            overflowY: "auto",
            color: "#e0e0e0",
            fontFamily: "'Consolas', 'Monaco', monospace",
            fontSize: "13px",
            borderRadius: "4px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.8)",
            minWidth: "250px"
        });
        document.body.appendChild(this.element);
        
        this.visible = false;
        this.items = [];
        this.selectedIndex = 0;
        this.onSelectCallback = null;
    }

    show(x, y, options, onSelect) {
        this.items = options;
        this.onSelectCallback = onSelect;
        this.selectedIndex = 0; // Reset selection to top
        this.visible = true;

        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
        this.element.style.display = "block";
        this.render();
    }

    hide() {
        this.element.style.display = "none";
        this.visible = false;
        this.items = [];
    }

    render() {
        this.element.innerHTML = "";

        // Header
        const header = document.createElement("div");
        Object.assign(header.style, {
            padding: "4px 8px", fontSize: "11px", color: "#888",
            borderBottom: "1px solid #333", backgroundColor: "#252525"
        });
        header.innerText = this.items.length > 50 
            ? `Showing 50 of ${this.items.length} matches...` 
            : `${this.items.length} Suggestions`;
        this.element.appendChild(header);

        // List Items
        this.items.slice(0, 50).forEach((opt, index) => {
            const div = document.createElement("div");
            div.innerText = opt;
            
            // Base Styles
            Object.assign(div.style, {
                cursor: "pointer", padding: "6px 10px",
                borderBottom: "1px solid #2a2a2a", transition: "background 0.05s"
            });

            // Highlight Selected
            if (index === this.selectedIndex) {
                div.style.backgroundColor = "#2d4f6c"; // Selected Blue
                div.style.color = "#fff";
                div.style.borderLeft = "3px solid #61afef";
            } else {
                div.style.backgroundColor = "transparent";
                div.style.borderLeft = "3px solid transparent";
            }
            
            // Mouse Interaction
            div.onmouseover = () => {
                this.selectedIndex = index;
                this.render(); // Re-render to update highlights
            };
            
            div.onmousedown = (e) => {
                e.preventDefault(); 
                this.triggerSelection();
            };
            
            this.element.appendChild(div);
        });

        // Auto-Scroll to keep selection in view
        if (this.element.children[this.selectedIndex + 1]) {
            const activeEl = this.element.children[this.selectedIndex + 1];
            // Simple logic to keep element in view
            if (activeEl.offsetTop < this.element.scrollTop) {
                this.element.scrollTop = activeEl.offsetTop;
            } else if (activeEl.offsetTop + activeEl.offsetHeight > this.element.scrollTop + this.element.offsetHeight) {
                this.element.scrollTop = activeEl.offsetTop + activeEl.offsetHeight - this.element.offsetHeight;
            }
        }
    }

    // Keyboard Navigation Handlers
    navigate(direction) {
        if (!this.visible) return;
        
        const max = Math.min(this.items.length, 50) - 1;
        if (direction === 1) {
            this.selectedIndex = this.selectedIndex >= max ? 0 : this.selectedIndex + 1;
        } else {
            this.selectedIndex = this.selectedIndex <= 0 ? max : this.selectedIndex - 1;
        }
        this.render();
    }

    triggerSelection() {
        if (this.visible && this.items[this.selectedIndex] && this.onSelectCallback) {
            this.onSelectCallback(this.items[this.selectedIndex]);
            this.hide();
        }
    }
}

// =============================================================================
// PART 2: THE PROFESSIONAL USER GUIDE UI
// =============================================================================

const HELP_STYLES = `
    .umi-help-modal {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.85); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(8px); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .umi-help-content {
        background: #181818; width: 1000px; max-width: 95%; height: 90%;
        border-radius: 12px; box-shadow: 0 0 60px rgba(0,0,0,0.9);
        border: 1px solid #333; display: flex; flex-direction: column; overflow: hidden;
    }
    .umi-help-header {
        background: #202020; padding: 20px 40px; border-bottom: 1px solid #333;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    .umi-help-header h2 { margin: 0; color: #fff; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
    .umi-help-header .version { font-size: 12px; color: #666; font-weight: normal; margin-left: 10px; background: #111; padding: 2px 6px; border-radius: 4px; }
    .umi-help-close {
        background: #333; color: #ccc; border: 1px solid #444; padding: 8px 20px;
        border-radius: 6px; cursor: pointer; font-weight: 600; transition: 0.2s;
    }
    .umi-help-close:hover { background: #cc4444; color: white; border-color: #cc4444; }
    .umi-help-body {
        padding: 40px; overflow-y: auto; color: #ccc; line-height: 1.7;
        scrollbar-width: thin; scrollbar-color: #444 #181818;
    }
    
    /* Layout */
    .umi-section { margin-bottom: 50px; }
    .umi-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px; }
    
    /* Typography */
    h3 { color: #61afef; border-bottom: 1px solid #333; padding-bottom: 10px; margin-top: 0; font-size: 20px; font-weight: 600; display: flex; align-items: center; }
    h4 { color: #e5c07b; margin-bottom: 8px; margin-top: 20px; font-size: 15px; font-weight: 600; }
    p { margin-top: 0; font-size: 14px; color: #abb2bf; }
    
    /* Components */
    .umi-code {
        background: #282c34; padding: 2px 6px; border-radius: 4px; 
        font-family: "Consolas", "Monaco", monospace; color: #98c379; border: 1px solid #3e4451; font-size: 0.9em;
    }
    .umi-block {
        background: #282c34; padding: 15px; border-radius: 6px; 
        font-family: "Consolas", "Monaco", monospace; color: #abb2bf; border-left: 4px solid #61afef;
        margin: 10px 0; white-space: pre-wrap; font-size: 12px; overflow-x: auto;
    }
    .umi-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px; border: 1px solid #333; }
    .umi-table th { text-align: left; background: #252525; border-bottom: 1px solid #444; padding: 10px; color: #fff; }
    .umi-table td { border-bottom: 1px solid #333; padding: 10px; color: #bbb; background: #1e1e1e; }
    .umi-table tr:last-child td { border-bottom: none; }
    
    /* Callouts */
    .callout { padding: 15px; border-radius: 6px; margin-top: 20px; font-size: 13px; border-left: 4px solid; }
    .callout-info { background: #1c242c; border-color: #61afef; color: #d1d9e6; }
    .callout-warn { background: #2c2222; border-color: #e06c75; color: #e6d1d1; }
    .callout-success { background: #1e2620; border-color: #98c379; color: #d1e6d6; }
    
    /* Wiring Diagram Style */
    .step-list { margin: 0; padding: 0; list-style: none; counter-reset: step; }
    .step-list li { position: relative; padding-left: 30px; margin-bottom: 10px; font-size: 14px; }
    .step-list li::before { 
        counter-increment: step; content: counter(step); 
        position: absolute; left: 0; top: 0; width: 20px; height: 20px; 
        background: #333; color: #fff; border-radius: 50%; 
        text-align: center; line-height: 20px; font-size: 11px; font-weight: bold;
    }

    /* Details/Summary */
    details { background: #21252b; border-radius: 6px; padding: 10px; margin-bottom: 10px; border: 1px solid #333; transition: 0.2s; }
    details[open] { background: #282c34; border-color: #444; }
    summary { cursor: pointer; font-weight: 600; color: #e0e0e0; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center; }
    summary::after { content: "+"; color: #61afef; font-weight: bold; font-size: 16px; }
    details[open] summary::after { content: "−"; }
    details[open] summary { margin-bottom: 15px; border-bottom: 1px solid #3e4451; padding-bottom: 10px; }
`;

const HELP_HTML = `
    <div class="umi-section">
        <h3>🔌 Setup & Wiring (The "Passthrough")</h3>
        <p>The UmiAI node acts as the "Central Brain". You must pass your <strong>Model</strong> and <strong>CLIP</strong> through it so it can apply LoRAs automatically.</p>
        
        <div class="umi-grid-2">
            <div class="callout callout-success" style="margin-top: 0;">
                <h4 style="margin-top:0">Step 1: The Main Chain</h4>
                <ul class="step-list">
                    <li>Connect <strong>Checkpoint Loader</strong> (Model & CLIP) &#10142; <strong>UmiAI Node</strong> (Inputs).</li>
                    <li>Connect <strong>UmiAI Node</strong> (Model & CLIP Outputs) &#10142; <strong>KSampler</strong> or <strong>Text Encode</strong> nodes.</li>
                </ul>
                <p style="margin-top:10px; font-size:12px; opacity:0.8"><em>This "Passthrough" connection allows the node to inject LoRAs on the fly.</em></p>
            </div>
            
            <div class="callout callout-info" style="margin-top: 0;">
                <h4 style="margin-top:0">Step 2: Prompts & Hot-Swapping</h4>
                <ul class="step-list">
                    <li>Connect <strong>Text/Negative</strong> outputs to your CLIP Text Encodes.</li>
                    <li><strong>Hot-Swap Files:</strong> Added a new wildcard? Set <code>autorefresh</code> to <strong>"Yes"</strong>, queue once, then set back to "No". No restart needed!</li>
                </ul>
            </div>
        </div>
        
         <div class="callout callout-warn">
            <strong>⚠️ Note on Batch Size:</strong><br>
            Use the <strong>"Queue Batch"</strong> setting in the ComfyUI Extra Options menu (checkboxes on the right menu) to generate variations. Do not use the widget batch size on the Latent node, or you will get identical duplicates.
        </div>
    </div>

    <div class="umi-section">
        <h3>⚡ Syntax Cheat Sheet</h3>
        <div class="umi-grid-2">
            <div>
                <h4 style="margin-top:0">🎲 Dynamic Prompts</h4>
                <table class="umi-table">
                    <tr><td><span class="umi-code">{a|b}</span></td><td>Random choice.</td></tr>
                    <tr><td><span class="umi-code">{a|b} ... {1|2}</span></td><td><strong>Sync:</strong> 2 lists of equal size will always match indices.</td></tr>
                    <tr><td><span class="umi-code">{2$$a|b|c}</span></td><td>Pick 2 unique.</td></tr>
                    <tr><td><span class="umi-code">__*__</span></td><td><strong>Wildcard Wildcard:</strong> Pick from ANY file.</td></tr>
                    <tr><td><span class="umi-code">__folder/*__</span></td><td>Pick any file in 'folder'.</td></tr>
                </table>
            </div>
            <div>
                <h4 style="margin-top:0">🎛️ Tools & Logic</h4>
                <table class="umi-table">
                    <tr><td><span class="umi-code">$var={...}</span></td><td>Define variable.</td></tr>
                    <tr><td><span class="umi-code">[if K : A | B]</span></td><td>Logic Gate.</td></tr>
                    <tr><td><span class="umi-code">[shuffle: a, b]</span></td><td>Randomize order.</td></tr>
                    <tr><td><span class="umi-code">[clean: a, , b]</span></td><td>Fix bad formatting.</td></tr>
                    <tr><td><span class="umi-code">text --neg: bad</span></td><td>Scoped Negative.</td></tr>
                    <tr><td><span class="umi-code">&lt;lora:name:1.0&gt;</span></td><td>Load LoRA (Auto).</td></tr>
                    <tr><td><span class="umi-code">@@width=768...@@</span></td><td>Set Resolution.</td></tr>
                </table>
            </div>
        </div>
    </div>

    <div class="umi-section">
        <h3>🔋 LoRA Loading (Internal)</h3>
        <p>The node now patches the Model and CLIP for you. You do not need any external LoRA Loader nodes.</p>

        <div class="umi-block">// Syntax: &lt;lora:Filename:Strength&gt;

// Basic usage (Strength defaults to 1.0)
&lt;lora:pixel_art_v2&gt;

// With Strength
&lt;lora:add_detail:0.5&gt;

// Inside logic or variables!
$style={ &lt;lora:anime:1.0&gt; | &lt;lora:realistic:0.8&gt; }
A photo of a cat, $style</div>

        <div class="callout callout-info">
            <h4 style="margin-top:0">🔍 New: LoRA Tag Inspector & Injector</h4>
            <p>Don't know the trigger words for your LoRA? The node can now read the .safetensors metadata.</p>
            <div class="umi-grid-2" style="margin-bottom:0; gap:15px; margin-top:10px;">
                <div style="background: #151515; padding: 10px; border-radius: 6px;">
                    <strong>👁️ See the Tags</strong><br>
                    <span style="font-size:12px; color:#888;">Connect the new <strong>lora_info</strong> output string to a "Show Text" or "Preview Text" node. It will list every loaded LoRA and their top training tags.</span>
                </div>
                <div style="background: #151515; padding: 10px; border-radius: 6px;">
                    <strong>💉 Auto-Inject</strong><br>
                    <span style="font-size:12px; color:#888;">Use the <strong>lora_tags_behavior</strong> widget to automatically <em>Append</em> or <em>Prepend</em> the most common training tags to your prompt.</span>
                </div>
            </div>
        </div>

        <div class="callout callout-success">
            <strong>✨ Auto-Detection (Standard & Z-Image):</strong><br>
            The node automatically inspects the LoRA file.<br>
            • If it is a <strong>Standard LoRA</strong>, it loads normally.<br>
            • If it detects <strong>Z-Image keys</strong> (unfused QKV), it automatically applies the QKV fusion patch.<br>
            You don't need to do anything special—just use the tag!
        </div>
    </div>
    
    <div class="umi-section">
        <h3>📂 Creating & Using Wildcards</h3>
        <p>You can create your own lists in the <code>wildcards/</code> folder. The system now supports <strong>Hot-Swapping</strong> (using autorefresh) and <strong>Recursive Scanning</strong> (files in subfolders work!).</p>
        
        <div class="umi-grid-2">
            <div>
                <h4>1. Simple Text Lists (.txt)</h4>
                <p>Create a file named <code>wildcards/colors.txt</code>:</p>
                <div class="umi-block">Red
Blue
Green</div>
                <p><strong>Usage:</strong></p>
                <div class="umi-block">A __colors__ dress.</div>
            </div>
            
            <div>
                <h4>2. Advanced Tag Lists (.yaml)</h4>
                <p>The node <strong>auto-detects</strong> two formats:</p>
                <div class="umi-block">// Format A: Umi (Entry-Based)
Crimson:
  Prompts: ["red fire"]
  Tags: [fire]

// Format B: Nested (Folder-Like)
clothes:
  bottoms:
    - jeans
    - skirt</div>
                <p style="font-size:12px">Usage: <code>&lt;[Crimson]&gt;</code> or <code>__clothes/bottoms__</code></p>
            </div>
        </div>

        <div class="callout callout-success">
            <strong>🌟 New: "Wildcard Wildcards" (Globbing)</strong><br>
            Use <code>*</code> to pick from multiple files at once. This works on TXT, CSV, and YAML keys!<br>
            • <code>__*__</code> : Pick a random line from <strong>EVERY</strong> file found.<br>
            • <code>__style/*__</code> : Pick from any file inside the "style" folder (or starting with "style").<br>
            • <code>__char/*/outfit__</code> : Great for nested YAMLs (e.g., char/rin/outfit).
        </div>
        
        <div style="margin-top: 20px;">
            <h4>3. CSV Data Injection (Correlated Variables)</h4>
            <p>Use <code>.csv</code> files to link multiple attributes together (e.g. Ensuring a "Paladin" always has "Plate Armor"). The node picks a <strong>single random row</strong> and maps the headers to variables.</p>
            
            <div class="umi-block">// 1. Trigger the file to lock in a random row
__card.csv__

// 2. Use the headers as variables
A fantasy $name holding a $weapon, wearing $armor.</div>
        </div>
    </div>

    <div class="umi-section">
        <h3>💾 Variables & Persistence</h3>
        <p>Define a choice once, store it, and reuse it. This ensures character consistency across a prompt.</p>
        
        <div class="umi-block">// 1. Assignment (Hidden from final output)
$hair={Blonde|Red|Neon Pink}

// 2. Usage (Replaces with the stored value)
A photo of a woman with $hair hair. The wind blows her $hair hair.</div>

        <div class="callout callout-info">
            <strong>📸 The "Snapshot" Rule:</strong><br>
            Variables are resolved <strong>ONCE</strong> when defined. They are static snapshots.<br>
            Wildcards (<code>__file__</code>) are resolved <strong>EVERY TIME</strong> they are used.<br>
            Use variables for consistency (Eyes/Hair). Use Wildcards for chaos (Backgrounds).
        </div>
    </div>

    <div class="umi-section">
        <h3>🔀 Conditional Logic</h3>
        <p>Inject text only if a specific keyword exists in the resolved prompt.</p>
        
        <div class="umi-block">// Syntax: [if Keyword : True Text | False Text]

$class={Knight|Cyberpunk}

[if Knight : holding a sword | holding a laser gun]</div>

        <div class="callout callout-warn">
            <strong>⚠️ CRITICAL SYNTAX RULE: The "Pipe Conflict"</strong><br>
            Never use the pipe <code>|</code> symbol inside a variable definition.<br>
            ❌ <code>$var = { [if A : x | y] }</code> (Breaks the parser)<br>
            ✅ <code>$var = { [if A : x] [if B : y] }</code> (Split logic works perfectly!)
        </div>
    </div>

    <div class="umi-section">
        <h3>🎨 Danbooru Character Expander</h3>
        <p>Type <code>char:character_name</code> to automatically fetch visual tags (hair, eyes, outfit) from Danbooru.</p>
        
        <table class="umi-table">
            <tr><th>Setting</th><th>Description</th></tr>
            <tr><td><strong>Threshold</strong></td><td>Strictness. High (0.8) = Core features only. Low (0.3) = Outfits/Details.</td></tr>
            <tr><td><strong>AutoRefresh</strong></td><td>Set to "Yes" to force a re-fetch from the API (bypassing cache).</td></tr>
        </table>
    </div>

    <div class="umi-section">
        <h3>🧠 Integrated LLM (Prompt Naturalizer)</h3>
        <p>Turn simple lists of tags into rich, descriptive, and natural sentences using a local LLM.</p>
        
        <div class="umi-grid-2">
            <div style="background: #151515; padding: 10px; border-radius: 6px;">
                <strong>1. Setup</strong><br>
                <span style="font-size:12px; color:#888;">Select <strong>"Download Recommended"</strong> in the <code>llm_model</code> widget. Wait for the download (auto-saves to <code>models/llm</code>).</span>
            </div>
            <div style="background: #151515; padding: 10px; border-radius: 6px;">
                <strong>2. Usage</strong><br>
                <span style="font-size:12px; color:#888;">Set <code>llm_prompt_enhancer</code> to <strong>"Yes"</strong>.<br>Input: "1girl, solo, beach"<br>Output: "A stunning close-up of a lone woman standing on a sunlit beach..."</span>
            </div>
        </div>
        <p style="font-size:12px; color:#888;">*Note: This feature automatically protects your LoRA tags &lt;...&gt; from being rewritten by the LLM.</p>
    </div>

    <div class="umi-section" style="margin-bottom: 0;">
        <h3>🚀 Production Workflows</h3>
        <p>Copy-paste these blocks to test the full power of the node.</p>
        
        <details>
            <summary>🧪 The RPG Generator (Advanced)</summary>
            <div class="umi-block">// 1. Synchronized Arrays (Deterministic Randomness)
// Since both have 2 options, they will always pick the same index (e.g., 1 & 1 or 2 & 2)
$class = {Paladin|Necromancer}
$weapon = {hammer|scythe}
$magic = {holy golden light|dark purple mist}

// 2. Formatting & Logic
// We use .title to make it look nice. We add .break to the ID to allow underscores.
Character: $class
Weapon Display: $class.title $weapon.title
Filename ID: $class.break_$weapon

// 3. Effect
Effect: glowing with $magic</div>
        </details>
        
        <details>
             <summary>🧪 The "Context-Aware" LoRA Switcher</summary>
             <div class="umi-block">$style = {Anime|Photorealistic}

// Logic: Load different LoRAs based on the random style
// Note: We use split [if] blocks to avoid the pipe syntax trap inside variables!
$lora_setup = { [if Anime : <lora:AnimeOutline:1.0>] [if Photorealistic : <lora:SkinTexture:0.8>] }

$lora_setup
A $style portrait of a girl.</div>
        </details>
        
        <details>
             <summary>🧪 Scoped Negatives & Post-Processing</summary>
             <div class="umi-block">// 1. Scoped Negatives:
// This negative prompt ONLY applies if this specific line is chosen.
A red car on a street --neg: blue, green, pedestrians

// 2. Formatting Cleaners:
// Randomize the list order and remove empty commas
[clean: [shuffle: 1girl, solo, __optional_hat__, __optional_glasses__]]</div>
        </details>
    </div>
`;

function showHelpModal() {
    if (!document.getElementById("umi-help-style")) {
        const style = document.createElement("style");
        style.id = "umi-help-style";
        style.innerHTML = HELP_STYLES;
        document.head.appendChild(style);
    }

    const modal = document.createElement("div");
    modal.className = "umi-help-modal";
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="umi-help-content">
            <div class="umi-help-header">
                <div>
                    <h2>📘 UmiAI Reference Manual <span class="version">v1.3</span></h2>
                </div>
                <button class="umi-help-close" onclick="this.closest('.umi-help-modal').remove()">CLOSE</button>
            </div>
            <div class="umi-help-body">
                ${HELP_HTML}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// =============================================================================
// PART 3: REGISTRATION & DYNAMIC VISIBILITY
// =============================================================================

app.registerExtension({
    name: "UmiAI.WildcardSystem",
    async setup() {
        // Fetch from the correct endpoint (matches your new Python)
        try {
            const resp = await fetch("/umiapp/wildcards");
            if (resp.ok) {
                // Returns flat array: ["clothes/pants", "style/anime", ...]
                this.wildcards = await resp.json(); 
            } else {
                this.wildcards = [];
            }
        } catch (e) {
            console.error("[UmiAI] Failed to load wildcards:", e);
            this.wildcards = [];
        }
        this.popup = new AutoCompletePopup();
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "UmiAIWildcardNode") return;

        // 1. Add Help Menu
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(_, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            options.push(null);
            options.push({
                content: "📘 Open UmiAI User Guide",
                callback: () => { showHelpModal(); }
            });
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);

            // ============================================================
            // DYNAMIC WIDGET VISIBILITY LOGIC
            // ============================================================
            const llmWidgets = ["llm_model", "llm_temperature", "llm_max_tokens", "custom_system_prompt"];
            const triggerName = "llm_prompt_enhancer";
            
            const triggerWidget = this.widgets.find(w => w.name === triggerName);
            
            if (triggerWidget) {
                this.widgets.forEach(w => {
                    if (llmWidgets.includes(w.name)) {
                        w.origType = w.type;
                        w.origComputeSize = w.computeSize;
                    }
                });

                const refreshWidgets = () => {
                    const visible = triggerWidget.value === "Yes";
                    let changed = false;

                    for (const w of this.widgets) {
                        if (llmWidgets.includes(w.name)) {
                            if (visible && w.type === "hidden") {
                                w.type = w.origType;
                                w.computeSize = w.origComputeSize;
                                changed = true;
                            } else if (!visible && w.type !== "hidden") {
                                w.type = "hidden";
                                w.computeSize = () => [0, -4]; 
                                changed = true;
                            }
                        }
                    }
                    if (changed) this.setSize(this.computeSize());
                };

                const prevCallback = triggerWidget.callback;
                triggerWidget.callback = (value) => {
                    if(prevCallback) prevCallback(value);
                    refreshWidgets();
                };
                refreshWidgets();
            }

            // ============================================================
            // AUTOCOMPLETE LOGIC (WITH ARROW KEYS)
            // ============================================================
            const textWidget = this.widgets.find(w => w.name === "text");
            if (!textWidget || !textWidget.inputEl) return;

            const inputEl = textWidget.inputEl;
            const ext = app.extensions.find(e => e.name === "UmiAI.WildcardSystem");

            // 1. INTERCEPT NAVIGATION (Arrow Keys, Enter, Tab)
            inputEl.addEventListener("keydown", (e) => {
                if (ext.popup.visible) {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        ext.popup.navigate(1); // Next
                        return;
                    } 
                    if (e.key === "ArrowUp") {
                        e.preventDefault();
                        ext.popup.navigate(-1); // Prev
                        return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        ext.popup.triggerSelection();
                        return;
                    }
                    if (e.key === "Escape") {
                        ext.popup.hide();
                        return;
                    }
                }
            });

            // 2. LISTEN FOR TYPING (To show the popup)
            inputEl.addEventListener("keyup", (e) => {
                // Ignore nav keys in this listener to prevent flashing
                if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;

                const cursor = inputEl.selectionStart;
                const text = inputEl.value;
                const beforeCursor = text.substring(0, cursor);

                // Regex Config
                const matchFile = beforeCursor.match(/__([\w\/\-]*)$/);
                const matchLora = beforeCursor.match(/<lora:([^>]*)$/);

                if (!ext || !ext.wildcards) return;

                let options = [];
                let triggerType = ""; 
                let matchIndex = 0;
                let query = "";

                // -- Wildcard Logic --
                if (matchFile) {
                    triggerType = "file";
                    query = matchFile[1].toLowerCase();
                    matchIndex = matchFile.index;
                    // Filter the flat list from Python
                    options = ext.wildcards.filter(w => w.toLowerCase().includes(query));
                } 
                // -- LoRA Logic (Basic Fallback) --
                else if (matchLora) {
                    triggerType = "lora";
                    query = matchLora[1].toLowerCase();
                    matchIndex = matchLora.index;
                    // Note: Your node currently only sends wildcards. 
                    // Add LoRA list in Python if you want this to work fully.
                    options = []; 
                }

                if (triggerType && options.length > 0) {
                    const rect = inputEl.getBoundingClientRect();
                    const topOffset = rect.top + 20 + (rect.height / 2); // Approximate pos
                    
                    ext.popup.show(rect.left + 20, topOffset, options, (selected) => {
                        let completion = "";
                        if (triggerType === "file") completion = `__${selected}__`;
                        else if (triggerType === "lora") completion = `<lora:${selected}:1.0>`;

                        const prefix = text.substring(0, matchIndex);
                        const suffix = text.substring(cursor);
                        
                        inputEl.value = prefix + completion + suffix;
                        
                        // Notify ComfyUI of change
                        if(textWidget.callback) textWidget.callback(inputEl.value);
                        
                        // Move cursor to end of inserted tag
                        const newCursorPos = (prefix + completion).length;
                        inputEl.setSelectionRange(newCursorPos, newCursorPos);
                        inputEl.focus();
                    });
                } else {
                    ext.popup.hide();
                }
            });

            // Close on outside click
            document.addEventListener("mousedown", (e) => {
                if (ext && ext.popup && e.target !== ext.popup.element && !ext.popup.element.contains(e.target) && e.target !== inputEl) {
                    ext.popup.hide();
                }
            });
        };
    }
});