import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Umi.Sidebar",
    async setup() {
        if (!app.extensionManager?.registerSidebarTab) {
            console.log("[UmiAI] Sidebar Tab API not found (Old ComfyUI version?)");
            return;
        }

        // Add custom icon style
        const style = document.createElement("style");
        style.textContent = `
            .umi-sidebar-menu {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 12px;
                background: #12161f;
                height: 100%;
            }
            .umi-sidebar-title {
                font-size: 16px;
                font-weight: 600;
                color: #8fc6ff;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid #20242c;
            }
            .umi-sidebar-btn {
                background: #1c212b;
                color: #d7dae0;
                border: 1px solid #2a303b;
                padding: 10px 14px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                text-align: left;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .umi-sidebar-btn:hover {
                background: #2a303b;
                border-color: #8fc6ff;
                color: #fff;
                transform: translateX(4px);
            }
            .umi-sidebar-btn span {
                font-size: 16px;
            }
        `;
        document.head.appendChild(style);

        app.extensionManager.registerSidebarTab({
            id: "umi.sidebar",
            icon: "mdi mdi-head-cog-outline",
            title: "UmiAI",
            tooltip: "UmiAI Tools",
            type: "custom",
            render: (el) => {
                const container = document.createElement("div");
                container.className = "umi-sidebar-menu";

                const title = document.createElement("div");
                title.className = "umi-sidebar-title";
                title.textContent = "UmiAI Control Panel";
                container.appendChild(title);

                const tools = [
                    { label: "Settings", icon: "⚙️", action: () => window.umiSettingsDialog?.show() },
                    { label: "Lora Browser", icon: "🎴", action: () => window.umiLoraBrowser?.show() },
                    { label: "Image Browser", icon: "🖼️", action: () => window.umiImageBrowser?.show() },
                    { label: "Prompt History", icon: "📜", action: () => window.umiHistoryBrowser?.show() },
                    { label: "YAML Tag Manager", icon: "🏷️", action: () => window.umiYamlManager?.show() },
                    { label: "File Editor", icon: "📝", action: () => window.umiFileEditor?.show() },
                ];

                tools.forEach(tool => {
                    const btn = document.createElement("button");
                    btn.className = "umi-sidebar-btn";
                    btn.innerHTML = `<span>${tool.icon}</span> ${tool.label}`;
                    btn.onclick = () => {
                        tool.action();
                    };
                    container.appendChild(btn);
                });

                // Add version info or other footer if needed
                const footer = document.createElement("div");
                footer.style.marginTop = "auto";
                footer.style.fontSize = "10px";
                footer.style.color = "#5b6b85";
                footer.style.textAlign = "center";
                footer.textContent = "UmiAI v1.5";
                container.appendChild(footer);

                el.appendChild(container);
            }
        });
    }
});
