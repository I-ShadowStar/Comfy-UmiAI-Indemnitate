import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const ENABLE_PREQUEUE_PREVIEW = true;

app.registerExtension({
    name: "UmiAI.TextBypass",
    async setup() {
        if (!ENABLE_PREQUEUE_PREVIEW || !api || !api.queuePrompt) {
            console.log("[UmiTextBypass] Prequeue preview disabled");
            return;
        }

        if (api._umiBypassPreviewWrapped) {
            return;
        }

        const originalQueuePrompt = api.queuePrompt.bind(api);
        api.queuePrompt = async function(number, prompt, ...rest) {
            let updatedPrompt = prompt;
            try {
                if (!updatedPrompt && app && typeof app.graphToPrompt === "function") {
                    const res = app.graphToPrompt();
                    updatedPrompt = (res && (res.output || res.prompt)) || res || updatedPrompt;
                }
                if (updatedPrompt) {
                    const payload = JSON.stringify({ prompt: updatedPrompt });
                    const requestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body: payload };
                    const response = api.fetchApi
                        ? await api.fetchApi("/umi/bypass_preview", requestInit)
                        : await fetch("/umi/bypass_preview", requestInit);
                    if (response && response.ok) {
                        const data = await response.json();
                        if (data && data.prompt) {
                            updatedPrompt = data.prompt;
                        }
                    }
                }
            } catch (e) {
                console.warn("[UmiTextBypass] Prequeue preview failed:", e);
            }
            return originalQueuePrompt(number, updatedPrompt, ...rest);
        };
        api._umiBypassPreviewWrapped = true;
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "UmiTextBypass") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            if (onNodeCreated) onNodeCreated.apply(this, arguments);
            const legacyMatchedWidget = this.widgets?.find(w => w.name === "matched");
            if (legacyMatchedWidget) {
                legacyMatchedWidget.type = "hidden";
                legacyMatchedWidget.hidden = true;
                legacyMatchedWidget.computeSize = () => [0, -4];
                this.setSize(this.computeSize());
            }
            const legacyMatchedInputIndex = this.inputs?.findIndex(i => i?.name === "matched");
            if (legacyMatchedInputIndex !== undefined && legacyMatchedInputIndex >= 0) {
                this.removeInput(legacyMatchedInputIndex);
                this.setSize(this.computeSize());
            }
        };
    }
});
