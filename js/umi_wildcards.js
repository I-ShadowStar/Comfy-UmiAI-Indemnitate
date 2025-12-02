import { app } from "../../scripts/app.js";

// =============================================================================
// PART 1: AUTOCOMPLETE LOGIC
// =============================================================================

class AutoCompletePopup {
    constructor() {
        this.element = document.createElement("div");
        Object.assign(this.element.style, {
            position: "absolute",
            display: "none",
            backgroundColor: "#1e1e1e",
            border: "1px solid #444",
            zIndex: "9999",
            maxHeight: "250px",
            overflowY: "auto",
            color: "#e0e0e0",
            fontFamily: "'Consolas', 'Monaco', monospace",
            fontSize: "13px",
            borderRadius: "6px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            minWidth: "200px"
        });
        document.body.appendChild(this.element);
        this.visible = false;
    }

    show(x, y, options, onSelect) {
        this.element.innerHTML = "";
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
        this.element.style.display = "block";
        this.visible = true;

        if (options.length === 0) {
            this.hide();
            return;
        }

        const header = document.createElement("div");
        header.style.padding = "4px 8px";
        header.style.fontSize = "11px";
        header.style.color = "#888";
        header.style.borderBottom = "1px solid #333";
        header.style.backgroundColor = "#252525";
        header.innerText = options.length > 50 ? `Showing 50 of ${options.length} matches...` : "Suggestions";
        this.element.appendChild(header);

        options.slice(0, 50).forEach(opt => {
            const div = document.createElement("div");
            div.innerText = opt;
            div.style.cursor = "pointer";
            div.style.padding = "6px 10px";
            div.style.borderBottom = "1px solid #2a2a2a";
            div.style.transition = "background 0.1s";
            
            div.onmouseover = () => div.style.backgroundColor = "#2d4f6c"; 
            div.onmouseout = () => div.style.backgroundColor = "transparent";
            
            div.onmousedown = (e) => {
                e.preventDefault(); 
                onSelect(opt);
                this.hide();
            };
            this.element.appendChild(div);
        });
    }

    hide() {
        this.element.style.display = "none";
        this.visible = false;
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
                <h4 style="margin-top:0">Step 2: Prompts & Resolution</h4>
                <ul class="step-list">
                    <li>Connect <strong>Text/Negative</strong> outputs to your CLIP Text Encodes.</li>
                    <li><strong>Resolution Control:</strong> Right-Click 'Empty Latent Image' &#10142; Convert width/height to input. Connect the wires.</li>
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
                    <tr><td><span class="umi-code">{1-3$$a|b|c}</span></td><td>Pick 1 to 3.</td></tr>
                    <tr><td><span class="umi-code">{~a|b|c}</span></td><td><strong>Sequential:</strong> Cycles by Seed.</td></tr>
                </table>
            </div>
            <div>
                <h4 style="margin-top:0">🎛️ Tools & Logic</h4>
                <table class="umi-table">
                    <tr><td><span class="umi-code">$var={...}</span></td><td>Define variable.</td></tr>
                    <tr><td><span class="umi-code">[if K : A | B]</span></td><td>Logic Gate.</td></tr>
                    <tr><td><span class="umi-code">&lt;lora:name:1.0&gt;</span></td><td>Load LoRA (Auto).</td></tr>
                    <tr><td><span class="umi-code">@@w=1024@@</span></td><td>Set Resolution.</td></tr>
                    <tr><td><span class="umi-code">**text**</span></td><td>Move to Negative.</td></tr>
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
        <p>You can create your own lists in the <code>wildcards/</code> folder and use them in ComfyUI.</p>
        
        <div class="umi-grid-2">
            <div>
                <h4>1. Simple Text Lists (.txt)</h4>
                <p>Create a file named <code>wildcards/colors.txt</code>:</p>
                <div class="umi-block">Red
Blue
Green</div>
                <p><strong>Usage:</strong> Type <code>__</code> to trigger autocomplete.</p>
                <div class="umi-block">A beautiful __colors__ dress.</div>
            </div>
            
            <div>
                <h4>2. Advanced Tag Lists (.yaml)</h4>
                <p>Create a file named <code>wildcards/styles.yaml</code>:</p>
                <div class="umi-block">Crimson Fire:
  Prompts:
    - "crimson red, blazing fire texture"
    - "deep ruby red, glowing embers"
  Tags:
    - color
    - red</div>
                <p><strong>Usage:</strong> Type <code>&lt;</code> to trigger autocomplete.</p>
                <div class="umi-block">&lt;[red]&gt; background.</div>
            </div>
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
            Variables are resolved <strong>ONCE</strong> when defined. They are static snapshots. You can use __wildcard__ in a variable to ALWAYS roll one specific outcome throughout your prompt.<br>
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
                    <h2>📘 UmiAI Reference Manual <span class="version">v1.1</span></h2>
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
// PART 3: REGISTRATION
// =============================================================================

app.registerExtension({
    name: "UmiAI.WildcardSystem",
    async setup() {
        const resp = await fetch("/umi/wildcards");
        this.data = await resp.json();
        this.popup = new AutoCompletePopup();
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "UmiAIWildcardNode") return;

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

            const textWidget = this.widgets.find(w => w.name === "text");
            if (!textWidget || !textWidget.inputEl) return;

            textWidget.inputEl.addEventListener("keyup", (e) => {
                const cursor = textWidget.inputEl.selectionStart;
                const text = textWidget.inputEl.value;
                const beforeCursor = text.substring(0, cursor);

                const matchFile = beforeCursor.match(/__([\w\/\-]*)$/);
                const matchTag = beforeCursor.match(/<([a-zA-Z0-9_\-\s]*)$/);
                const matchLora = beforeCursor.match(/<lora:([^>]*)$/);

                const ext = app.extensions.find(e => e.name === "UmiAI.WildcardSystem");
                if (!ext || !ext.data) return;

                let options = [];
                let triggerType = ""; 
                let matchIndex = 0;
                let query = "";

                if (matchFile) {
                    triggerType = "file";
                    query = matchFile[1].toLowerCase();
                    matchIndex = matchFile.index;
                    options = ext.data.files.filter(w => w.toLowerCase().includes(query));
                } else if (matchTag) {
                    triggerType = "tag";
                    query = matchTag[1].toLowerCase();
                    matchIndex = matchTag.index;
                    options = ext.data.tags.filter(t => t.toLowerCase().includes(query));
                } else if (matchLora) {
                    triggerType = "lora";
                    query = matchLora[1].toLowerCase();
                    matchIndex = matchLora.index;
                    if(ext.data.loras) {
                        options = ext.data.loras.filter(l => l.toLowerCase().includes(query));
                    }
                }

                if (triggerType && options.length > 0) {
                    const rect = textWidget.inputEl.getBoundingClientRect();
                    const topOffset = rect.top + 20 + (rect.height / 2); 
                    
                    ext.popup.show(rect.left + 20, topOffset, options, (selected) => {
                        let completion = "";
                        if (triggerType === "file") completion = `__${selected}__`;
                        else if (triggerType === "tag") completion = `<[${selected}]>`; 
                        else if (triggerType === "lora") completion = `<lora:${selected}:1.0>`;

                        const prefix = text.substring(0, matchIndex);
                        const suffix = text.substring(cursor);
                        textWidget.inputEl.value = prefix + completion + suffix;
                        if(textWidget.callback) textWidget.callback(textWidget.inputEl.value);
                        
                        const newCursorPos = (prefix + completion).length;
                        textWidget.inputEl.setSelectionRange(newCursorPos, newCursorPos);
                        textWidget.inputEl.focus();
                    });
                } else {
                    ext.popup.hide();
                }
            });

            document.addEventListener("mousedown", (e) => {
                const ext = app.extensions.find(e => e.name === "UmiAI.WildcardSystem");
                if (ext && ext.popup && e.target !== ext.popup.element && !ext.popup.element.contains(e.target) && e.target !== textWidget.inputEl) {
                    ext.popup.hide();
                }
            });
        };
    }
});