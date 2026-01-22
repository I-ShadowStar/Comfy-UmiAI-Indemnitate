import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ComfyDialog } from "../../scripts/ui.js";

// Settings Dialog
class UmiSettingsDialog extends ComfyDialog {
    constructor() {
        super();
        this.settings = {};
        this.element.classList.add("umi-settings-dialog");

        // Inject CSS to fix double scrollbar issue
        if (!document.getElementById('umi-settings-styles')) {
            const style = document.createElement('style');
            style.id = 'umi-settings-styles';
            style.textContent = `
                .umi-settings-dialog {
                    overflow: visible !important;
                }
                .umi-settings-dialog .comfy-modal-content {
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                    max-height: 80vh !important;
                }
            `;
            document.head.appendChild(style);
        }
    }

    async loadSettings() {
        try {
            const response = await api.fetchApi("/umiapp/settings");
            const data = await response.json();
            this.settings = data.settings || {};
        } catch (error) {
            console.error("Failed to load settings:", error);
            this.settings = {};
        }
    }

    async saveSettings() {
        try {
            const response = await api.fetchApi("/umiapp/settings/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings: this.settings })
            });
            const data = await response.json();

            if (data.status === "success") {
                this.close();
                app.ui.dialog.show(`
                    <div style="padding: 20px;">
                        <h3>✓ Settings Updated</h3>
                        <p>${data.message}</p>
                        <p style="margin-top: 10px; color: #888;">
                            Note: Some settings (like debug output) take effect immediately.
                            Settings-dependent node features will reload on next use.
                        </p>
                    </div>
                `);
            } else {
                app.ui.dialog.show(`
                    <div style="padding: 20px;">
                        <h3>⚠ Error</h3>
                        <p>${data.message}</p>
                    </div>
                `);
            }
        } catch (error) {
            app.ui.dialog.show(`
                <div style="padding: 20px;">
                    <h3>⚠ Error</h3>
                    <p>Failed to save settings: ${error.message}</p>
                </div>
            `);
        }
    }

    async resetSettings() {
        if (!confirm("Reset all settings to defaults?")) {
            return;
        }

        try {
            const response = await api.fetchApi("/umiapp/settings/reset", {
                method: "POST"
            });
            const data = await response.json();

            if (data.status === "success") {
                this.settings = data.settings;
                this.show(); // Refresh the dialog with new settings
                app.ui.dialog.show(`
                    <div style="padding: 20px;">
                        <h3>✓ Settings Reset</h3>
                        <p>${data.message}</p>
                    </div>
                `);
            }
        } catch (error) {
            app.ui.dialog.show(`
                <div style="padding: 20px;">
                    <h3>⚠ Error</h3>
                    <p>Failed to reset settings: ${error.message}</p>
                </div>
            `);
        }
    }

    createSettingRow(key, value, description) {
        const row = document.createElement("div");
        row.style.cssText = "margin: 15px 0; display: flex; align-items: center; gap: 10px;";

        const label = document.createElement("label");
        label.style.cssText = "flex: 1; cursor: pointer;";
        label.innerHTML = `
            <strong>${this.formatKey(key)}</strong>
            <div style="font-size: 0.9em; color: #888; margin-top: 2px;">${description}</div>
        `;

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = value;
        input.style.cssText = "width: 20px; height: 20px; cursor: pointer;";
        input.onchange = () => {
            this.settings[key] = input.checked;
        };

        label.onclick = () => {
            input.checked = !input.checked;
            input.onchange();
        };

        row.appendChild(label);
        row.appendChild(input);
        return row;
    }

    formatKey(key) {
        return key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getDescription(key) {
        const descriptions = {
            'use_folder_paths': 'Show folder paths in wildcards (__Series/File__ vs __File__)',
            'csv_namespace': 'Add $csv_ prefixed variables from CSV files',
            'yaml_namespace': 'Add $yaml_ prefixed variables from YAML files',
            'rng_streams': 'Use deterministic RNG streams per scope/tag',
            'auto_clean': 'Auto-clean prompts (remove extra commas/spaces, fix BREAK)',
            'error_lint': 'Show detailed error messages instead of user-friendly warnings',
            'lint_cleaner_enabled': 'Show prompt linting and cleaning UI banner',
            'enable_llm_features': 'Enable LLM/Vision features (vision models, refiner, etc.)',
            'enable_danbooru_features': 'Enable Danbooru API integration',
            'enable_tag_autocomplete': 'Enable tag autocomplete from CSV files',
            'enable_debug_output': 'Enable debug console output (warnings, errors, info)'
        };
        return descriptions[key] || 'No description available';
    }

    show() {
        this.loadSettings().then(() => {
            const content = document.createElement("div");
            content.style.cssText = "padding: 20px; min-width: 500px;";

            // Title
            const title = document.createElement("h2");
            title.textContent = "UmiAI Settings";
            title.style.cssText = "margin-top: 0; margin-bottom: 20px; color: #fff;";
            content.appendChild(title);

            // Settings rows - no max-height here since parent handles scrolling
            const settingsContainer = document.createElement("div");
            settingsContainer.style.cssText = "margin-bottom: 20px;";

            // Group settings by category
            const categories = {
                'Core Settings': ['use_folder_paths', 'csv_namespace', 'yaml_namespace', 'rng_streams'],
                'Processing': ['auto_clean', 'error_lint'],
                'UI Settings': ['lint_cleaner_enabled'],
                'Feature Toggles': ['enable_llm_features', 'enable_danbooru_features', 'enable_tag_autocomplete'],
                'Debug': ['enable_debug_output']
            };

            Object.entries(categories).forEach(([categoryName, keys]) => {
                const categoryTitle = document.createElement("h3");
                categoryTitle.textContent = categoryName;
                categoryTitle.style.cssText = "margin-top: 20px; margin-bottom: 10px; color: #aaa; font-size: 1em; border-bottom: 1px solid #444; padding-bottom: 5px;";
                settingsContainer.appendChild(categoryTitle);

                keys.forEach(key => {
                    if (key in this.settings) {
                        settingsContainer.appendChild(
                            this.createSettingRow(key, this.settings[key], this.getDescription(key))
                        );
                    }
                });
            });

            content.appendChild(settingsContainer);

            // Buttons
            const buttonContainer = document.createElement("div");
            buttonContainer.style.cssText = "display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;";

            const resetBtn = document.createElement("button");
            resetBtn.textContent = "Reset to Defaults";
            resetBtn.style.cssText = "padding: 8px 16px; cursor: pointer; background: #444; border: 1px solid #666; color: #fff; border-radius: 4px;";
            resetBtn.onmouseover = () => resetBtn.style.background = "#555";
            resetBtn.onmouseout = () => resetBtn.style.background = "#444";
            resetBtn.onclick = () => this.resetSettings();

            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "Cancel";
            cancelBtn.style.cssText = "padding: 8px 16px; cursor: pointer; background: #444; border: 1px solid #666; color: #fff; border-radius: 4px;";
            cancelBtn.onmouseover = () => cancelBtn.style.background = "#555";
            cancelBtn.onmouseout = () => cancelBtn.style.background = "#444";
            cancelBtn.onclick = () => this.close();

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save Settings";
            saveBtn.style.cssText = "padding: 8px 16px; cursor: pointer; background: #0066cc; border: 1px solid #0052a3; color: #fff; border-radius: 4px; font-weight: bold;";
            saveBtn.onmouseover = () => saveBtn.style.background = "#0052a3";
            saveBtn.onmouseout = () => saveBtn.style.background = "#0066cc";
            saveBtn.onclick = () => this.saveSettings();

            buttonContainer.appendChild(resetBtn);
            buttonContainer.appendChild(cancelBtn);
            buttonContainer.appendChild(saveBtn);
            content.appendChild(buttonContainer);

            super.show(content);
        });
    }
}

// Register extension and expose settings dialog globally
app.registerExtension({
    name: "UmiAI.Settings",
    async setup() {
        // Create and expose settings dialog instance globally for sidebar access
        const settingsDialog = new UmiSettingsDialog();
        window.umiSettingsDialog = settingsDialog;

        // Also add menu button for convenience (optional)
        const menu = document.querySelector(".comfy-menu");
        if (menu) {
            const settingsBtn = document.createElement("button");
            settingsBtn.textContent = "⚙ UmiAI Settings";
            settingsBtn.style.cssText = "margin-left: 5px;";
            settingsBtn.onclick = () => settingsDialog.show();
            menu.appendChild(settingsBtn);
        }
    }
});
