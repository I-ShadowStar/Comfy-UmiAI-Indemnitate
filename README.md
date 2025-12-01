# 📘 UmiAI Wildcard Processor

**A "Logic Engine" for ComfyUI Prompts.**

UmiAI transforms static prompts into dynamic, context-aware workflows. It introduces **Persistent Variables**, **Conditional Logic**, **Sequential Cycles**, and **External Data Fetching** (Danbooru) directly into your prompt text box.

## ✨ Key Features

* **🧠 Persistent Variables:** Define a choice once (`$hair={Red|Blue}`) and reuse it (`$hair`) anywhere to ensure consistency across complex prompts.
* **🔀 Conditional Logic:** `[if keyword : True Text | False Text]` logic gates. Perfect for ensuring your character's outfit matches the background genre automatically.
* **🎨 Danbooru Integration:** Type `char:name` to automatically fetch visual appearance tags (eyes, hair, outfit) from Danbooru.
* **🔁 Sequential Cycles:** `{~A|B|C}` cycles through options deterministically based on the seed. Essential for XY Plots and Grid comparisons.
* **⌨️ Autocomplete:** Built-in popup for Files (`__`) and Tags (`<`) directly in the text box.
* **📏 Resolution Control:** Set `@@width=1024@@` inside your prompt to control image size contextually.

---

## 🛠️ Installation

### Method 1: Manual Install (Recommended)
1.  Navigate to your `ComfyUI/custom_nodes/` folder.
2.  Clone this repository:
    ```bash
    git clone [https://github.com/Tinuva88/ComfyUI-UmiAI.git](https://github.com/Tinuva88/ComfyUI-UmiAI.git)
    ```
3.  **⚠️ IMPORTANT:** Rename the folder to `UmiAI_Wildcards` if it isn't already.
    * ❌ `UmiAI v1.0` (Spaces break the Python import!)
    * ✅ `UmiAI_Wildcards`
4.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
5.  **Restart ComfyUI** completely.

### Method 2: ComfyUI Manager
* **Install via Git URL:** Copy the URL of this repository and paste it into the "Install via Git URL" field in ComfyUI Manager.

---

## 🔌 Wiring Guide

The UmiAI node acts as the "Central Brain" of your workflow.

### 1. Connect Prompts
* **Text Output** ➔ `CLIP Text Encode` (Positive)
* **Negative Output** ➔ `CLIP Text Encode` (Negative)
    * *This enables inline features like `**watermark**` removal.*

### 2. Connect Resolution (Crucial!)
To allow the node to control image size (e.g., `@@width=1024@@`), you must connect it to your Latent node.
1.  **Right-Click** your `Empty Latent Image` node.
2.  Select **Convert width to input**.
3.  Select **Convert height to input**.
4.  Connect the **Width/Height** wires from UmiAI to the Latent node.

> **⚠️ Note on Batch Size:**
> Do **not** use the "Batch Size" widget on the Empty Latent node if you want prompt variations. You will get X copies of the same image.
> Instead, use the **"Queue Batch"** setting in the ComfyUI Extra Options menu.

---

## ⚡ Quick Syntax Cheat Sheet

| Feature | Syntax | Example |
| :--- | :--- | :--- |
| **Random Choice** | `{a|b|c}` | `{Red|Blue|Green}` |
| **Variables** | `$var={opts}` | `$hair={Red|Blue}` ... `$hair` |
| **String Filters** | `$var.filter` | `$var.clean` / `$var.upper` |
| **Logic Gate** | `[if Key : A | B]` | `[if Cyberpunk : Techwear | Armor]` |
| **Danbooru** | `char:name` | `char:frieren` |
| **Sequential** | `{~a|b|c}` | `{~Front|Side|Back}` |
| **Set Size** | `@@w=X, h=Y@@` | `@@width=1024, height=1536@@` |

---

## 🚀 Example Workflow: The "Context-Aware" Character

Copy this prompt into the node to test the full logic capabilities. It auto-selects a genre, then ensures the **Outfit**, **Weapon**, and **Resolution** all match that genre.

```text
$genre={High Fantasy|Cyberpunk|Post-Apocalyptic}
$view={~Portrait|Landscape}

// Logic: Set resolution based on View
[if Portrait: @@width=1024, height=1536@@][if Landscape: @@width=1536, height=1024@@]

(Masterpiece), A $view of a warrior, female.
She is wearing [if Fantasy: plate armor][if Cyberpunk: tech jacket][if Post-Apocalyptic: rags].
She is holding [if Fantasy: a sword | [if Cyberpunk: a pistol | a crowbar]].

The background is a $genre landscape.
**watermark, text, blurry, nsfw**