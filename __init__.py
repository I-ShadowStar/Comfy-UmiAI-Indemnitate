from .nodes import (UmiSaveImage,
                    # UmiAIWildcardNode,  # Full version - uncomment for debugging
                    # UmiPoseGenerator, UmiEmotionGenerator,
                    # UmiEmotionStudio, UmiCharacterCreator as UmiCharacterCreator2,
                    # UmiSpriteGenerator as UmiSpriteGenerator2, UmiDatasetGenerator as UmiDatasetGenerator2,
                    # UmiPositionControl as UmiPositionControl2, UmiVisualCameraControl as UmiVisualCameraControl2,
                    UMI_SETTINGS, umi_debug_print)
from .nodes_lite import UmiAIWildcardNodeLite, UmiTextBypass  # Lite version (default for users)
# from .nodes_model_manager import UmiModelManager, UmiModelSelector
from server import PromptServer
from aiohttp import web
import os
import importlib.util
import glob
import yaml
import json
import subprocess
import sys
import folder_paths 

# --- New Imports for Lora Fetcher ---
from .fetch.fetcher import CivitaiFetcher

# Initialize the fetcher logic
fetcher = CivitaiFetcher()

# Disabled optional modules
_umi_utilities = None
_bgrm = None

# try:
#     from . import umi_utilities as _umi_utilities
# except Exception:
#     try:
#         import umi_utilities as _umi_utilities
#     except Exception:
#         _umi_utilities = None
#
# try:
#     from . import bgrm as _bgrm
# except Exception:
#     try:
#         import bgrm as _bgrm
#     except Exception:
#         _bgrm = None

# 1. Setup the API Route
def _resolve_umi_asset_path(*parts):
    base_dir = os.path.dirname(__file__)
    util_path = os.path.join(base_dir, "umi_utilities", *parts)
    if os.path.exists(util_path):
        return util_path
    return os.path.join(base_dir, *parts)

def _get_umi_character_loader():
    if _umi_utilities is None:
        return None
    try:
        from .umi_utilities.nodes_character import CharacterLoader
        return CharacterLoader
    except Exception:
        return None

UTILITIES_MODEL_CATEGORIES = {
    "background_removal",
    "face_detection",
    "llm_models",
    "qwen_loras",
    "sam",
    "segmentation",
}

UTILITIES_MODEL_PREFIXES = {
    "models/loras/qwen/": "qwen_loras",
    "models/ultralytics/bbox/": "face_detection",
    "models/segmentation/": "segmentation",
    "models/sam/": "sam",
    "models/RMBG/": "background_removal",
    "models/llm/": "llm_models",
}

def _infer_model_category(model):
    category = model.get("category")
    if category:
        return category
    local_path = model.get("local_path") or ""
    if local_path:
        norm_path = local_path.replace("\\", "/")
        for prefix, cat in UTILITIES_MODEL_PREFIXES.items():
            if norm_path.startswith(prefix):
                return cat
    for f in model.get("files") or []:
        file_path = f.get("local_path") or ""
        norm_path = file_path.replace("\\", "/")
        for prefix, cat in UTILITIES_MODEL_PREFIXES.items():
            if norm_path.startswith(prefix):
                return cat
    return None

def _filter_models_for_core(config):
    if _umi_utilities is not None:
        return config
    filtered = []
    for model in config.get("models", []):
        category = _infer_model_category(model)
        if category in UTILITIES_MODEL_CATEGORIES:
            continue
        filtered.append(model)
    return {**config, "models": filtered}

def get_wildcard_data():
    wildcards_path = os.path.join(os.path.dirname(__file__), "wildcards")
    txt_files = []      # For __ autocomplete (txt files only)
    yaml_files = []     # YAML file names
    tags = set()        # Tags from YAML files for <[ autocomplete
    basenames = {}      # Maps basename -> full path for quick lookup
    
    if os.path.exists(wildcards_path):
        # 1. Scan TXT files (for __ wildcards)
        for filepath in glob.glob(os.path.join(wildcards_path, '**', '*.txt'), recursive=True):
            rel_path = os.path.relpath(filepath, wildcards_path)
            tag_name = os.path.splitext(rel_path)[0].replace(os.sep, '/')
            txt_files.append(tag_name)
            
            # Add basename mapping (filename without extension)
            basename = os.path.splitext(os.path.basename(filepath))[0]
            if basename not in basenames:
                basenames[basename] = tag_name
        
        # 2. Scan YAML files (for tags)
        for filepath in glob.glob(os.path.join(wildcards_path, '**', '*.yaml'), recursive=True):
            rel_path = os.path.relpath(filepath, wildcards_path)
            tag_name = os.path.splitext(rel_path)[0].replace(os.sep, '/')
            yaml_files.append(tag_name)
            
            # Add basename mapping
            basename = os.path.splitext(os.path.basename(filepath))[0]
            if basename not in basenames:
                basenames[basename] = tag_name
            
            # Parse YAML for Tags
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)
                    if isinstance(data, dict):
                        for entry in data.values():
                            if isinstance(entry, dict) and 'Tags' in entry:
                                for t in entry['Tags']:
                                    tags.add(str(t).strip())
            except Exception as e:
                umi_debug_print(f"[UmiAI] Error parsing YAML {filepath}: {e}")

    # Return separated data
    return {
        "files": sorted(txt_files),           # Legacy/combined (for backwards compat)
        "wildcards": sorted(txt_files),       # TXT files only (for __ autocomplete)
        "yaml_files": sorted(yaml_files),     # YAML file names
        "tags": sorted(list(tags)),           # Tags from YAML (for <[ autocomplete)
        "basenames": basenames,               # Basename -> full path mapping
        "loras": folder_paths.get_filename_list("loras"),
        "lint_cleaner_enabled": UMI_SETTINGS.get('lint_cleaner_enabled', True),
    }

def get_optional_dependency_status():
    dependencies = {
        "opencv-python": "cv2",
        "transformers": "transformers",
        "torchvision": "torchvision",
        "transparent-background": "transparent_background"
    }
    installed = []
    missing = []
    for package_name, module_name in dependencies.items():
        if importlib.util.find_spec(module_name) is None:
            missing.append(package_name)
        else:
            installed.append(package_name)
    return {"installed": installed, "missing": missing}

# ==============================================================================
# LORA BROWSER ROUTES
# ==============================================================================

def get_target_file(filename):
    """Wrapper to find the full path of a lora file."""
    return folder_paths.get_full_path("loras", filename)

@PromptServer.instance.routes.get("/umiapp/loras")
async def get_loras(request):
    """
    Scans the Lora directory and returns a list of files 
    along with their associated metadata (.json, .civitai.info) and preview images.
    """
    lora_names = folder_paths.get_filename_list("loras")
    loras = []
    base_models = set()
    
    for name in lora_names:
        full_path = get_target_file(name)
        if not full_path: continue
        
        base, ext = os.path.splitext(full_path)
        
        # Define sidecar file paths
        civitai_info_path = f"{base}.civitai.info"
        json_path = f"{base}.json"
        preview_path = f"{base}.preview.png"
        
        civitai_data = {}
        override_data = {}
        civitai_info_tags = []
        
        # Load .civitai.info (Raw CivitAI data) and normalize structure
        if os.path.exists(civitai_info_path):
            try:
                with open(civitai_info_path, 'r', encoding='utf-8') as f:
                    raw_civitai_data = json.load(f)
                    
                    # Normalize the nested structure to match frontend expectations
                    parent_model = raw_civitai_data.get("parent_model_data", {})
                    model_id = raw_civitai_data.get("modelId") or raw_civitai_data.get("id") or parent_model.get("id")
                    
                    # Extract URL - check multiple possible locations
                    url = raw_civitai_data.get("url")
                    if not url and model_id:
                        url = f"https://civitai.com/models/{model_id}"
                    elif not url and parent_model.get("id"):
                        url = f"https://civitai.com/models/{parent_model.get('id')}"
                    
                    # Extract preview URL from images array
                    preview_url = None
                    if raw_civitai_data.get("images"):
                        images = raw_civitai_data["images"]
                        if isinstance(images, list) and len(images) > 0:
                            preview_url = images[0].get("url") if isinstance(images[0], dict) else None
                    
                    # Extract activation text/tags for civitai_info_tags
                    activation_text = raw_civitai_data.get("activation text", "")
                    if not activation_text:
                        # Try to get from trainedWords
                        trained_words = raw_civitai_data.get("trainedWords", [])
                        if trained_words:
                            activation_text = ", ".join(trained_words) if isinstance(trained_words, list) else str(trained_words)
                    
                    if activation_text:
                        civitai_info_tags = [t.strip() for t in str(activation_text).split(",") if t.strip()]
                    
                    # Build normalized civitai_data structure
                    civitai_data = {
                        "id": model_id,
                        "name": parent_model.get("name") or raw_civitai_data.get("name", ""),
                        "description": parent_model.get("description") or raw_civitai_data.get("description", ""),
                        "tags": parent_model.get("tags", raw_civitai_data.get("tags", [])),
                        "trigger_words": raw_civitai_data.get("trainedWords", []),
                        "base_model": raw_civitai_data.get("baseModel", "Unknown"),
                        "preview_url": preview_url,
                        "url": url,
                        "creator": parent_model.get("creator", {}).get("username", raw_civitai_data.get("creator", "Unknown")),
                        "nsfw": raw_civitai_data.get("nsfw", "None")
                    }
            except Exception as e:
                umi_debug_print(f"[Umi LoRA Browser] Error loading .civitai.info for {name}: {e}")
                civitai_data = {}
                civitai_info_tags = []
            
        # Load .json (Manual/Override metadata)
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    json_data = json.load(f)
                    # Map standard JSON fields to the format expected by our JS frontend
                    activation_text = (
                        json_data.get("activation text")
                        or json_data.get("activation_text")
                        or json_data.get("trainedWords")
                        or json_data.get("trained_words")
                        or json_data.get("triggerWords")
                        or json_data.get("trigger_words")
                        or ""
                    )
                    tags = json_data.get("tags", [])
                    activation_tags = [t.strip() for t in str(activation_text).split(",") if t.strip()] if activation_text else []
                    override_data = {
                        "description": json_data.get("description", ""),
                        "tags": tags,
                        "activation_tags": activation_tags,
                        "activation_text": activation_text,
                        "nickname": json_data.get("name", ""),
                        "preview_url": json_data.get("preview_url", "")
                    }
            except: pass

        # Check for local preview image (support multiple extensions)
        local_preview = None
        preview_exts = [
            ".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp",
            ".png", ".jpg", ".jpeg", ".webp"
        ]
        for ext in preview_exts:
            preview_candidate = f"{base}{ext}"
            if os.path.exists(preview_candidate):
                # Pass the relative filename so we can fetch it via /umiapp/preview
                local_preview = name.rsplit('.', 1)[0] + ext
                break

        base_model = civitai_data.get("base_model") or ""
        if base_model:
            base_models.add(str(base_model))

        loras.append({
            "name": name,
            "filename": name,
            "civitai": civitai_data,
            "override": override_data,
            "local_preview": local_preview,
            "civitai_info_tags": civitai_info_tags,
            "base_model": base_model
        })

    return web.json_response({"loras": loras, "base_models": sorted(base_models)})

# Note: /umiapp/loras/civitai/single endpoint is handled in nodes.py
# This endpoint was removed to avoid conflicts - nodes.py has more complete implementation
# with hash-based lookup, name search fallback, and proper sidecar file handling

@PromptServer.instance.routes.post("/umiapp/loras/civitai/batch")
async def fetch_all_civitai(request):
    """Trigger the fetcher.py logic for all files with a specific mode."""
    data = await request.json()
    mode = data.get("mode", "update_missing") # Default to update_missing
    lora_names = folder_paths.get_filename_list("loras")
    
    processed_count = 0
    results = []
    
    for lora_name in lora_names:
        full_path = get_target_file(lora_name)
        if full_path:
            # Determine flags based on mode
            force_fetch = False
            fetch_preview = False
            fetch_info = False
            fetch_json = False
            
            if mode == "update_missing":
                # Default behavior: fill gaps
                force_fetch = False
                fetch_preview = True
                fetch_info = True
                fetch_json = True
            elif mode == "replace_previews":
                force_fetch = False
                fetch_preview = True
                fetch_info = False
                fetch_json = False
            elif mode == "replace_civitai_info":
                force_fetch = True # We want to replace this specific file
                fetch_preview = False
                fetch_info = True
                fetch_json = False
            elif mode == "replace_json_info":
                force_fetch = True
                fetch_preview = False
                fetch_info = False
                fetch_json = True
            elif mode == "replace_json_and_civitai":
                force_fetch = True
                fetch_preview = False
                fetch_info = True
                fetch_json = True
            elif mode == "replace_all":
                force_fetch = True
                fetch_preview = True
                fetch_info = True
                fetch_json = True
            
            actions = fetcher.process_file(full_path, 
                                            force_fetch=force_fetch, 
                                            fetch_preview=fetch_preview, 
                                            fetch_info=fetch_info, 
                                            fetch_json=fetch_json)
            if actions:
                processed_count += 1
                results.append({"name": lora_name, "actions": actions})
                
    return web.json_response({"success": True, "count": processed_count, "results": results})

@PromptServer.instance.routes.post("/umiapp/loras/overrides/save")
async def save_overrides(request):
    """Saves edits from the UI (tags, description, name) to the .json file."""
    data = await request.json()
    lora_name = data.get("lora_name")
    override = data.get("override", {})
    full_path = get_target_file(lora_name)
    
    if full_path:
        base, _ = os.path.splitext(full_path)
        json_path = f"{base}.json"
        
        existing = {}
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            except: pass
            
        # Update existing JSON with new values
        existing["description"] = override.get("description", existing.get("description", ""))
        if "tags" in override and override.get("tags") is not None:
            existing["tags"] = override.get("tags", existing.get("tags", []))
        if "activation_text" in override:
            existing["activation text"] = override.get("activation_text", existing.get("activation text", ""))
        existing["name"] = override.get("nickname", existing.get("name", ""))
        existing["preview_url"] = override.get("preview_url", existing.get("preview_url", ""))
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(existing, f, indent=4, ensure_ascii=False)
            
        return web.json_response({"success": True})

    return web.json_response({"success": False})

@PromptServer.instance.routes.post("/umiapp/loras/manage/open")
async def open_location(request):
    """Opens the file location in the OS file explorer."""
    data = await request.json()
    lora_name = data.get("lora_name")
    full_path = get_target_file(lora_name)
    
    if full_path and os.path.exists(full_path):
        folder = os.path.dirname(full_path)
        if sys.platform == 'win32':
            subprocess.Popen(['explorer', '/select,', full_path])
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', '-R', full_path])
        else:
            subprocess.Popen(['xdg-open', folder])
        return web.json_response({"success": True})
        
    return web.json_response({"success": False})

@PromptServer.instance.routes.post("/umiapp/loras/manage/delete")
async def delete_lora(request):
    """Deletes the Lora and its associated files."""
    data = await request.json()
    lora_name = data.get("lora_name")
    full_path = get_target_file(lora_name)
    
    if full_path:
        success, msg = fetcher.delete_lora_files(full_path)
        return web.json_response({"success": success, "message": msg})
        
    return web.json_response({"success": False})

@PromptServer.instance.routes.post("/umiapp/loras/upload_preview")
async def upload_preview(request):
    """Handles manual image upload for previews."""
    reader = await request.multipart()
    image_field = await reader.next()
    lora_name_field = await reader.next()
    
    if not image_field or not lora_name_field:
        return web.json_response({"success": False})
        
    lora_name = await lora_name_field.text()
    full_path = get_target_file(lora_name)
    
    if full_path:
        base, _ = os.path.splitext(full_path)
        preview_path = f"{base}.preview.png"
        
        with open(preview_path, 'wb') as f:
            while True:
                chunk = await image_field.read_chunk()
                if not chunk: break
                f.write(chunk)
                
        return web.json_response({"success": True})

    return web.json_response({"success": False})

@PromptServer.instance.routes.post("/umiapp/loras/preview/replace_url")
async def replace_preview_from_url(request):
    """Download a preview image from URL and save alongside the LoRA."""
    try:
        data = await request.json()
        lora_name = data.get("lora_name")
        url = data.get("url")
        if not lora_name or not url:
            return web.json_response({"success": False, "error": "lora_name and url required"}, status=400)

        full_path = get_target_file(lora_name)
        if not full_path:
            full_path = get_target_file(f"{lora_name}.safetensors")
        if not full_path:
            return web.json_response({"success": False, "error": "File not found"}, status=404)

        try:
            resp = requests.get(url, timeout=20)
            if resp.status_code != 200:
                return web.json_response({"success": False, "error": "Failed to download image"}, status=400)
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

        content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
        ext_map = {
            "image/png": ".preview.png",
            "image/jpeg": ".preview.jpg",
            "image/jpg": ".preview.jpg",
            "image/webp": ".preview.webp",
        }
        preview_ext = ext_map.get(content_type, ".preview.png")

        base, _ = os.path.splitext(full_path)
        # Remove existing preview sidecars (keep non-preview images)
        for ext in [".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp"]:
            path = f"{base}{ext}"
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

        preview_path = f"{base}{preview_ext}"
        with open(preview_path, "wb") as f:
            f.write(resp.content)

        rel_base = os.path.splitext(lora_name)[0]
        return web.json_response({"success": True, "path": f"{rel_base}{preview_ext}"})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)

@PromptServer.instance.routes.post("/umiapp/loras/internal_tags")
async def get_internal_tags(request):
    """Extract internal training tags from LoRA safetensors metadata."""
    try:
        data = await request.json()
        lora_name = data.get("lora_name")
        if not lora_name:
            return web.json_response({"success": False, "error": "lora_name required"}, status=400)

        lora_path = get_target_file(lora_name)
        if not lora_path:
            lora_path = get_target_file(f"{lora_name}.safetensors")
        if not lora_path:
            return web.json_response({"success": False, "error": "LoRA file not found"}, status=404)

        if not lora_path.endswith(".safetensors"):
            return web.json_response({"success": True, "tags": []})

        # Reuse blacklist similar to LoRAHandler
        blacklist = {
            "1girl", "1boy", "solo", "monochrome", "greyscale", "comic", "scenery",
            "translated", "commentary_request", "highres", "absurdres", "masterpiece",
            "best quality", "simple background", "white background", "transparent background"
        }

        from safetensors import safe_open
        tags = []
        tag_pairs = []
        with safe_open(lora_path, framework="pt", device="cpu") as f:
            metadata = f.metadata() or {}
            tags_str = metadata.get("ss_tag_frequency", "{}")
            try:
                tag_freq = json.loads(tags_str)
                if isinstance(tag_freq, dict):
                    all_tags = {}
                    for sub_dict in tag_freq.values():
                        if isinstance(sub_dict, dict):
                            all_tags.update(sub_dict)
                    sorted_tags = sorted(all_tags.items(), key=lambda x: x[1], reverse=True)
                    tag_pairs = [{"tag": t, "count": int(c)} for t, c in sorted_tags if t.lower() not in blacklist]
                    tags = [p["tag"] for p in tag_pairs]
            except Exception:
                tags = []

        return web.json_response({"success": True, "tags": tags, "tag_pairs": tag_pairs})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ==============================================================================
# EXISTING ROUTES (WILDCARDS, UTILITIES, MODELS)
# ==============================================================================

# Register the routes (aligned with nodes.py endpoints)
@PromptServer.instance.routes.get("/umiapp/wildcards")
async def fetch_wildcards(request):
    data = get_wildcard_data()
    return web.json_response(data)

@PromptServer.instance.routes.get("/umiapp/globals")
async def fetch_globals(request):
    """Fetch global variables from globals.yaml for autocomplete."""
    wildcards_path = os.path.join(os.path.dirname(__file__), "wildcards")
    globals_path = os.path.join(wildcards_path, "globals.yaml")
    variables = {}
    
    if os.path.exists(globals_path):
        try:
            with open(globals_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    for key, value in data.items():
                        # Store variable name (with $ prefix) and its value
                        var_name = key if key.startswith('$') else f'${key}'
                        variables[var_name] = str(value)
        except Exception as e:
            umi_debug_print(f"[UmiAI] Error loading globals.yaml: {e}")
    
    # Also check models/wildcards for globals
    models_wildcards = os.path.join(folder_paths.models_dir, "wildcards")
    models_globals = os.path.join(models_wildcards, "globals.yaml")
    
    if os.path.exists(models_globals):
        try:
            with open(models_globals, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    for key, value in data.items():
                        var_name = key if key.startswith('$') else f'${key}'
                        if var_name not in variables:  # Don't override
                            variables[var_name] = str(value)
        except Exception as e:
            umi_debug_print(f"[UmiAI] Error loading models globals.yaml: {e}")
    
    return web.json_response({
        "variables": variables,
        "count": len(variables)
    })

@PromptServer.instance.routes.get("/umiapp/deps")
async def get_dependency_status(request):
    return web.json_response(get_optional_dependency_status())

@PromptServer.instance.routes.get("/umiapp/utilities/status")
async def get_utilities_status(request):
    return web.json_response({"installed": _umi_utilities is not None})

@PromptServer.instance.routes.get("/umiapp/characters")
async def fetch_characters(request):
    """Fetch available characters and their profiles for autocomplete and external tools."""
    character_loader = _get_umi_character_loader()
    if character_loader is None:
        return web.json_response({
            "characters": [],
            "profiles": {},
            "count": 0
        })
    
    characters = character_loader.list_characters()
    character_data = {}
    
    for char_name in characters:
        if char_name == "none":
            continue
        data = character_loader.load_character(char_name)
        if data:
            character_data[char_name] = {
                "name": data.get('name', char_name),
                "description": data.get('description', ''),
                "lora": data.get('lora', ''),
                "outfits": list(data.get('outfits', {}).keys()),
                "emotions": list(data.get('emotions', {}).keys()),
                "poses": list(data.get('poses', {}).keys()),
            }
    
    return web.json_response({
        "characters": list(character_data.keys()),
        "profiles": character_data,
        "count": len(character_data)
    })

# VNCCS-style costume API
@PromptServer.instance.routes.get("/umiapp/character/costumes")
async def get_character_costumes(request):
    """List costumes for a character (VNCCS-compatible)."""
    character = request.query.get("character", "")
    if not character:
        return web.json_response([])
    
    chars_path = _resolve_umi_asset_path("characters", character)
    sheets_path = os.path.join(chars_path, "Sheets")
    
    costumes = []
    if os.path.exists(sheets_path):
        for item in os.listdir(sheets_path):
            if os.path.isdir(os.path.join(sheets_path, item)):
                costumes.append(item)
    
    return web.json_response(costumes)

# VNCCS-style character sheet preview
@PromptServer.instance.routes.get("/umiapp/character/preview")
async def get_character_preview(request):
    """Get cropped preview from character sheet (VNCCS-compatible)."""
    import io
    import re
    from PIL import Image
    
    character = request.query.get("character", "")
    if not character:
        return web.Response(status=404, text="No character specified")
    
    chars_path = _resolve_umi_asset_path("characters", character)
    
    # Try to find a sheet image
    sheet_dir = os.path.join(chars_path, "Sheets", "Naked", "neutral")
    if not os.path.exists(sheet_dir):
        # Try any costume
        sheets_base = os.path.join(chars_path, "Sheets")
        if os.path.exists(sheets_base):
            for costume in sorted(os.listdir(sheets_base)):
                path = os.path.join(sheets_base, costume, "neutral")
                if os.path.isdir(path):
                    sheet_dir = path
                    break
    
    if not os.path.exists(sheet_dir):
        return web.Response(status=404, text="Sheet not found")
    
    # Find the best sheet file (highest index)
    pattern = os.path.join(sheet_dir, "sheet_neutral_*.png")
    files = glob.glob(pattern)
    if not files:
        # Try any PNG
        files = glob.glob(os.path.join(sheet_dir, "*.png"))
    
    if not files:
        return web.Response(status=404, text="No sheet images found")
    
    def get_index(f):
        m = re.search(r'(\d+)', os.path.basename(f))
        return int(m.group(1)) if m else 0
    
    files.sort(key=get_index)
    best_file = files[-1]
    
    # Crop: Sheet is 6x2 grid, get last cell (row 1, col 5)
    try:
        img = Image.open(best_file)
        w, h = img.size
        item_w = w // 6
        item_h = h // 2
        
        row, col = 1, 5
        left = col * item_w
        upper = row * item_h
        right = left + item_w
        lower = upper + item_h
        
        crop = img.crop((left, upper, right, lower))
        
        img_byte_arr = io.BytesIO()
        crop.save(img_byte_arr, format='PNG')
        return web.Response(body=img_byte_arr.getvalue(), content_type='image/png')
    except Exception as e:
        return web.Response(status=500, text=str(e))

# VNCCS-style emotions API
@PromptServer.instance.routes.get("/umiapp/emotions")
async def get_emotions(request):
    """Get emotions config data (VNCCS-compatible)."""
    config_path = _resolve_umi_asset_path("emotions-config", "emotions.json")
    
    if not os.path.exists(config_path):
        return web.json_response({"error": "emotions.json not found"}, status=404)
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return web.json_response(data)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# Emotion image server
@PromptServer.instance.routes.get("/umiapp/emotion/image")
async def get_emotion_image(request):
    """Serve emotion image by safe_name."""
    from urllib.parse import unquote
    
    name = request.query.get("name", "")
    if not name or ".." in name or "/" in name or "\\" in name:
        return web.Response(status=400)
    
    name = unquote(name).strip()
    image_path = _resolve_umi_asset_path("emotions-config", "images", f"{name}.png")
    
    if not os.path.exists(image_path):
        return web.Response(status=404)
    
    return web.FileResponse(image_path)


@PromptServer.instance.routes.get("/umiapp/preview")
async def preview_content(request):
    """Unified preview route: Handles Lora Image Previews (path) and Wildcard File Previews (file)."""
    
    # 1. Handle Lora Image Preview (path param)
    path = request.query.get("path", "")
    if path:
        lora_roots = folder_paths.get_folder_paths("loras")
        # Absolute path: allow only if inside lora roots
        if os.path.isabs(path):
            abs_path = os.path.abspath(path)
            for root in lora_roots:
                if os.path.commonpath([abs_path, os.path.abspath(root)]) == os.path.abspath(root):
                    if os.path.exists(abs_path):
                        return web.FileResponse(abs_path)
            return web.Response(status=403, text="Access denied")
        # Relative path: resolve under lora roots
        for root in lora_roots:
            candidate = os.path.join(root, path)
            if os.path.exists(candidate):
                return web.FileResponse(candidate)

    # 2. Handle Wildcard Preview (file param) - Legacy logic
    filename = request.query.get("file", "")
    if not filename:
        return web.json_response({"error": "No file or path specified"}, status=400)
    
    wildcards_path = os.path.join(os.path.dirname(__file__), "wildcards")
    entries = []
    
    # Search for the file
    for ext in ['txt', 'yaml', 'yml', 'csv']:
        # Try direct path
        file_path = os.path.join(wildcards_path, f"{filename}.{ext}")
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    if ext == 'txt':
                        # Read first 15 lines
                        lines = []
                        for i, line in enumerate(f):
                            if i >= 15:
                                lines.append("... (more entries)")
                                break
                            line = line.strip()
                            if line and not line.startswith('#'):
                                # Strip tags (:: separator) for preview
                                if '::' in line:
                                    line = line.split('::')[0]
                                lines.append(line)
                        entries = lines
                    elif ext in ['yaml', 'yml']:
                        data = yaml.safe_load(f)
                        if isinstance(data, dict):
                            entries = list(data.keys())[:15]
                            if len(data) > 15:
                                entries.append(f"... (+{len(data) - 15} more)")
                    elif ext == 'csv':
                        import csv as csv_module
                        reader = csv_module.reader(f)
                        for i, row in enumerate(reader):
                            if i >= 15:
                                entries.append("... (more entries)")
                                break
                            if row:
                                entries.append(row[0])
                return web.json_response({
                    "file": filename,
                    "type": ext,
                    "entries": entries,
                    "count": len(entries)
                })
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)
        
        # Try recursive search
        for root, dirs, files in os.walk(wildcards_path):
            for f in files:
                name_without_ext = os.path.splitext(f)[0]
                rel_path = os.path.relpath(os.path.join(root, f), wildcards_path)
                rel_name = os.path.splitext(rel_path)[0].replace(os.sep, '/')
                if rel_name.lower() == filename.lower() or name_without_ext.lower() == filename.lower():
                    return await preview_wildcard_file(os.path.join(root, f), filename)
    
    return web.json_response({"file": filename, "entries": [], "error": "File not found"})

async def preview_wildcard_file(file_path, filename):
    """Helper to preview a specific wildcard file."""
    entries = []
    ext = os.path.splitext(file_path)[1].lower()[1:]
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            if ext == 'txt':
                lines = []
                for i, line in enumerate(f):
                    if i >= 15:
                        lines.append("... (more entries)")
                        break
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # Strip tags (:: separator) for preview
                        if '::' in line:
                            line = line.split('::')[0]
                        lines.append(line)
                entries = lines
            elif ext in ['yaml', 'yml']:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    entries = list(data.keys())[:15]
                    if len(data) > 15:
                        entries.append(f"... (+{len(data) - 15} more)")
        return web.json_response({
            "file": filename,
            "type": ext,
            "entries": entries,
            "count": len(entries)
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/umiapp/refresh")
async def refresh_wildcards(request):
    # Trigger a cache clear for BOTH full and lite nodes
    from .nodes import GLOBAL_CACHE, GLOBAL_INDEX, FILE_MTIME_CACHE
    from .nodes_lite import GLOBAL_CACHE_LITE, GLOBAL_INDEX_LITE, FILE_MTIME_CACHE_LITE

    # Clear full node cache (including mtime cache)
    GLOBAL_CACHE.clear()
    GLOBAL_INDEX['built'] = False
    GLOBAL_INDEX['files'] = set()
    GLOBAL_INDEX['entries'] = {}
    GLOBAL_INDEX['tags'] = set()
    FILE_MTIME_CACHE.clear()  # Fix 12: Clear modification time cache on refresh

    # Clear lite node cache (including mtime cache)
    GLOBAL_CACHE_LITE.clear()
    GLOBAL_INDEX_LITE['built'] = False
    GLOBAL_INDEX_LITE['files'] = set()
    GLOBAL_INDEX_LITE['entries'] = {}
    GLOBAL_INDEX_LITE['tags'] = set()
    FILE_MTIME_CACHE_LITE.clear()  # Fix 12: Clear modification time cache on refresh

    # Return fresh data
    data = get_wildcard_data()
    return web.json_response({
        "status": "success",
        "count": len(data.get("files", [])) + len(data.get("tags", [])),
        **data
    })

# ==============================================================================
# SETTINGS MANAGEMENT API
# ==============================================================================

@PromptServer.instance.routes.get("/umiapp/settings")
async def get_settings(request):
    """Get current UmiAI settings."""
    return web.json_response({"settings": UMI_SETTINGS})

@PromptServer.instance.routes.post("/umiapp/settings/update")
async def update_settings(request):
    """Update UmiAI settings and reload nodes."""
    try:
        data = await request.json()
        new_settings = data.get("settings", {})

        # Read current settings file
        settings_path = os.path.join(os.path.dirname(__file__), "umi_settings.json")

        # Load existing settings (preserving comments)
        existing_content = ""
        if os.path.exists(settings_path):
            with open(settings_path, 'r', encoding='utf-8') as f:
                existing_content = f.read()

        # Parse existing JSON to update values
        try:
            # Load without comments for parsing
            import re
            json_without_comments = re.sub(r'//.*?$', '', existing_content, flags=re.MULTILINE)
            current_settings = json.loads(json_without_comments)
        except:
            current_settings = {}

        # Update with new values
        current_settings.update(new_settings)

        # Write back to file with pretty formatting
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(current_settings, f, indent=4)

        # Reload settings in memory
        from .nodes import load_umi_settings

        # Load fresh settings from file
        fresh_settings = load_umi_settings()

        # Update all references to UMI_SETTINGS dictionary
        global UMI_SETTINGS
        UMI_SETTINGS.clear()
        UMI_SETTINGS.update(fresh_settings)

        # Also update in nodes module (same dictionary object)
        from . import nodes
        nodes.UMI_SETTINGS.clear()
        nodes.UMI_SETTINGS.update(fresh_settings)

        # nodes_lite imports UMI_SETTINGS from nodes, so it references the same dict
        # The .clear() and .update() above should propagate to nodes_lite automatically

        umi_debug_print(f"[UmiAI] Settings reloaded: auto_clean={fresh_settings.get('auto_clean')}, error_lint={fresh_settings.get('error_lint')}")

        return web.json_response({
            "status": "success",
            "message": "Settings updated successfully. Changes will take effect immediately.",
            "settings": UMI_SETTINGS
        })

    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

@PromptServer.instance.routes.post("/umiapp/settings/reset")
async def reset_settings(request):
    """Reset settings to defaults."""
    try:
        # Get default settings
        from .nodes import load_umi_settings

        defaults = {
            'use_folder_paths': False,
            'csv_namespace': True,
            'yaml_namespace': True,
            'rng_streams': False,
            'auto_clean': True,
            'error_lint': False,
            'lint_cleaner_enabled': True,
            'enable_llm_features': False,
            'enable_danbooru_features': False,
            'enable_tag_autocomplete': True,
            'enable_debug_output': False,
        }

        # Write defaults to file
        settings_path = os.path.join(os.path.dirname(__file__), "umi_settings.json")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(defaults, f, indent=4)

        # Reload settings
        global UMI_SETTINGS
        UMI_SETTINGS.clear()
        UMI_SETTINGS.update(load_umi_settings())

        from . import nodes
        nodes.UMI_SETTINGS.clear()
        nodes.UMI_SETTINGS.update(load_umi_settings())

        return web.json_response({
            "status": "success",
            "message": "Settings reset to defaults",
            "settings": UMI_SETTINGS
        })

    except Exception as e:
        return web.json_response({
            "status": "error",
            "message": str(e)
        }, status=500)

# ==============================================================================
# MODEL DOWNLOADER API (VNCCS-STYLE REPO SUPPORT)
# ==============================================================================

import asyncio
import threading
import traceback
import requests
import queue
import urllib.parse

try:
    from huggingface_hub import hf_hub_download, hf_hub_url
    HF_HUB_AVAILABLE = True
except Exception:
    HF_HUB_AVAILABLE = False

# Universal download queue to avoid contention
download_queue = queue.Queue()
download_status = {}

def resolve_path(relative_path):
    base = getattr(folder_paths, "base_path", os.getcwd())
    return os.path.abspath(os.path.join(base, relative_path))

def get_installed_version_info():
    registry_path = resolve_path("umi_installed_models.json")
    if os.path.exists(registry_path):
        try:
            with open(registry_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def update_installed_version(model_name, version):
    registry_path = resolve_path("umi_installed_models.json")
    data = get_installed_version_info()
    data[model_name] = version
    with open(registry_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def get_umi_config():
    config_path = resolve_path("umi_user_config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_umi_config(new_data):
    config_path = resolve_path("umi_user_config.json")
    data = get_umi_config()
    data.update(new_data)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def _convert_manifest_to_config(manifest):
    version = str(manifest.get("version", "1.0"))
    models = []
    for category_key, category in manifest.get("categories", {}).items():
        target_dir = category.get("target_dir", "")
        for model in category.get("models", []):
            filename = model.get("filename", "")
            local_path = os.path.join("models", target_dir, filename).replace("\\", "/")
            files = []
            if model.get("files"):
                for f in model.get("files", []):
                    file_name = f.get("filename") or f.get("name") or ""
                    file_local = f.get("local_path")
                    if not file_local and file_name:
                        file_local = os.path.join("models", target_dir, file_name).replace("\\", "/")
                    files.append({
                        "filename": file_name,
                        "local_path": file_local or "",
                        "url": f.get("url", ""),
                        "hf_repo": f.get("hf_repo", model.get("hf_repo", "")),
                        "hf_path": f.get("hf_path", ""),
                    })
            models.append({
                "name": model.get("name", filename),
                "version": version,
                "local_path": local_path,
                "description": model.get("description", ""),
                "url": model.get("url", ""),
                "hf_repo": model.get("hf_repo", ""),
                "hf_path": model.get("hf_path", ""),
                "category": category_key,
                "files": files
            })
    return {"models": models}


def _fetch_model_config(repo_id):
    if not HF_HUB_AVAILABLE:
        raise RuntimeError("huggingface_hub is not installed.")

    try:
        path = hf_hub_download(repo_id=repo_id, filename="model_updater.json", local_files_only=False)
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        path = hf_hub_download(repo_id=repo_id, filename="models_manifest.json", local_files_only=False)
        with open(path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        return _convert_manifest_to_config(manifest)


def worker_loop():
    while True:
        task = download_queue.get()
        if task is None:
            break

        repo_id, model_name, target_model = task

        try:
            file_entries = target_model.get("files") or []
            if not file_entries:
                file_entries = [{
                    "filename": os.path.basename(target_model.get("local_path", "")),
                    "local_path": target_model.get("local_path", ""),
                    "url": target_model.get("url", ""),
                    "hf_repo": target_model.get("hf_repo", ""),
                    "hf_path": target_model.get("hf_path", "")
                }]

            for index, file_entry in enumerate(file_entries):
                file_name = file_entry.get("filename") or os.path.basename(file_entry.get("local_path", "")) or "file"
                download_status[model_name] = {
                    "status": "downloading",
                    "message": f"Downloading {file_name}...",
                    "progress": 0,
                    "file": file_name,
                    "file_index": index + 1,
                    "file_count": len(file_entries)
                }

                url = ""
                headers = {}

                file_repo_id = file_entry.get("hf_repo") or target_model.get("hf_repo") or repo_id
                if file_entry.get("url") or target_model.get("url"):
                    url = file_entry.get("url") or target_model.get("url", "")

                    if "civitai.com/models/" in url and "api/download" not in url:
                        parsed = urllib.parse.urlparse(url)
                        qs = urllib.parse.parse_qs(parsed.query)
                        if "modelVersionId" in qs:
                            ver_id = qs["modelVersionId"][0]
                            url = f"https://civitai.com/api/download/models/{ver_id}"
                            print(f"[UmiAI] Auto-converted Civitai Web Link to API: {url}")

                    if "civitai.com" in url:
                        user_config = get_umi_config()
                        civitai_token = user_config.get("civitai_token", "")
                        if civitai_token:
                            headers = {"Authorization": f"Bearer {civitai_token}"}
                else:
                    if not HF_HUB_AVAILABLE:
                        raise RuntimeError("huggingface_hub is not installed.")

                    filename = file_entry.get("hf_path") or target_model.get("hf_path", "")
                    if filename.startswith(f"{file_repo_id}/"):
                        filename = filename[len(file_repo_id) + 1:]
                    url = hf_hub_url(file_repo_id, filename)
                    token = os.environ.get("HF_TOKEN")
                    if token:
                        headers = {"Authorization": f"Bearer {token}"}

                response = requests.get(url, headers=headers, stream=True, allow_redirects=True)
                response.raise_for_status()

                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0

                temp_dir = os.path.join(folder_paths.base_path, "temp")
                os.makedirs(temp_dir, exist_ok=True)
                sanitized_name = "".join(x for x in model_name if x.isalnum())
                temp_filename = f"umi_{sanitized_name}_{index + 1}.tmp"
                temp_path = os.path.join(temp_dir, temp_filename)

                with open(temp_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                mb_done = downloaded / (1024 * 1024)
                                mb_total = total_size / (1024 * 1024)
                                msg = f"{file_name}: {mb_done:.1f}/{mb_total:.1f} MB"
                                download_status[model_name] = {
                                    "status": "downloading",
                                    "message": msg,
                                    "progress": percent,
                                    "file": file_name,
                                    "file_index": index + 1,
                                    "file_count": len(file_entries)
                                }
                            else:
                                mb_done = downloaded / (1024 * 1024)
                                download_status[model_name] = {
                                    "status": "downloading",
                                    "message": f"{file_name}: {mb_done:.1f} MB",
                                    "progress": 0,
                                    "file": file_name,
                                    "file_index": index + 1,
                                    "file_count": len(file_entries)
                                }

                download_status[model_name]["message"] = f"Installing {file_name}..."
                target_rel_path = file_entry.get("local_path") or target_model.get("local_path", "")
                if not target_rel_path:
                    raise RuntimeError(f"Missing local_path for {model_name}")

                target_abs_path = resolve_path(target_rel_path)
                target_dir = os.path.dirname(target_abs_path)
                os.makedirs(target_dir, exist_ok=True)

                import shutil
                shutil.move(temp_path, target_abs_path)
                umi_debug_print(f"[UmiAI] Installed {model_name} -> {target_abs_path}")

            update_installed_version(model_name, target_model.get("version", ""))
            download_status[model_name] = {"status": "success", "message": "Installed"}

        except Exception as e:
            is_auth_error = False
            if isinstance(e, requests.exceptions.HTTPError):
                if e.response.status_code == 401:
                    is_auth_error = True

            err_msg = str(e)
            status_code = "error"

            if is_auth_error:
                status_code = "auth_required"
                err_msg = "API Key Required"
            elif "404" in err_msg or "EntryNotFoundError" in err_msg:
                err_msg = "File not found (404)"

            download_status[model_name] = {"status": status_code, "message": err_msg}
            umi_debug_print(f"[UmiAI] Download failed for {model_name}: {err_msg}")
        finally:
            download_queue.task_done()

threading.Thread(target=worker_loop, daemon=True).start()

@PromptServer.instance.routes.get("/umiapp/models/status")
async def get_download_status(request):
    return web.json_response(download_status)

@PromptServer.instance.routes.post("/umiapp/models/save_token")
async def save_api_token(request):
    try:
        data = await request.json()
        token = data.get("token", "")
        save_umi_config({"civitai_token": token})
        return web.json_response({"status": "saved"})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.post("/umiapp/models/set_active")
async def set_active_version(request):
    try:
        data = await request.json()
        model_name = data.get("model_name")
        version = data.get("version")

        if not model_name or not version:
            return web.json_response({"error": "Missing parameters"}, status=400)

        update_installed_version(model_name, version)
        return web.json_response({"status": "updated", "message": f"Set active version for {model_name} to {version}"})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/umiapp/models/check")
async def check_models(request):
    repo_id = request.rel_url.query.get("repo_id", "")
    if not repo_id:
        return web.json_response({"error": "No repo_id provided"}, status=400)

    if " " in repo_id or repo_id.strip() == "":
        return web.json_response({"error": f"Invalid Repo ID format: '{repo_id}'"}, status=400)

    if not HF_HUB_AVAILABLE:
        return web.json_response({"error": "huggingface_hub is not installed"}, status=500)

    try:
        def fetch_config():
            return _fetch_model_config(repo_id)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        config = await loop.run_in_executor(None, fetch_config)
        config = _filter_models_for_core(config)

        active_registry = get_installed_version_info()

        grouped_models = {}
        for model in config.get("models", []):
            name = model["name"]
            grouped_models.setdefault(name, []).append(model)

        models_status = []
        for name, variants in grouped_models.items():
            try:
                from packaging import version
                variants.sort(key=lambda x: version.parse(x["version"]), reverse=True)
            except Exception:
                variants.sort(key=lambda x: str(x["version"]), reverse=True)

            latest = variants[0]
            active_ver = active_registry.get(name, None)

            installed_versions = []
            for v in variants:
                files = v.get("files") or []
                if files:
                    all_found = True
                    for f in files:
                        file_path = f.get("local_path") or ""
                        if not file_path:
                            all_found = False
                            break
                        if not os.path.exists(resolve_path(file_path)):
                            all_found = False
                            break
                    if all_found:
                        installed_versions.append(v["version"])
                else:
                    full_path = resolve_path(v.get("local_path", ""))
                    if os.path.exists(full_path):
                        installed_versions.append(v["version"])

            if active_ver and active_ver not in installed_versions:
                active_ver = None

            if not active_ver and installed_versions:
                for v in variants:
                    if v["version"] in installed_versions:
                        active_ver = v["version"]
                        break

            status = "missing"
            if active_ver:
                status = "installed" if active_ver == latest["version"] else "outdated"
            elif installed_versions:
                status = "outdated"

            models_status.append({
                "name": name,
                "status": status,
                "active_version": active_ver,
                "installed_versions": installed_versions,
                "version": latest["version"],
                "versions": variants,
                "description": latest.get("description", "")
            })

        return web.json_response({"models": models_status})

    except Exception as e:
        err_msg = str(e)
        if "HFValidationError" in err_msg or "Repo id" in err_msg:
            return web.json_response({"error": f"Invalid Repo ID: {repo_id}"}, status=400)
        if "404" in err_msg or "NotFound" in err_msg:
            return web.json_response({"error": "Repository or config not found"}, status=404)

        traceback.print_exc()
        return web.json_response({"error": f"{str(e)}"}, status=500)

@PromptServer.instance.routes.post("/umiapp/models/download")
async def download_model(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    repo_id = data.get("repo_id")
    model_name = data.get("model_name")
    target_version = data.get("version")

    if not repo_id or " " in repo_id:
        return web.json_response({"error": "Invalid Repo ID"}, status=400)

    if not HF_HUB_AVAILABLE:
        return web.json_response({"error": "huggingface_hub is not installed"}, status=500)

    try:
        def fetch_config_sync():
            return _fetch_model_config(repo_id)

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        config = await loop.run_in_executor(None, fetch_config_sync)

        target_model = next((m for m in config["models"]
                             if m["name"] == model_name and m["version"] == target_version), None)

        if not target_model:
            target_model = next((m for m in config["models"] if m["name"] == model_name), None)

        if not target_model:
            return web.json_response({"error": f"Model '{model_name}' (v{target_version}) not found in config"}, status=404)

        download_status[model_name] = {"status": "queued", "message": "Queued in backend..."}
        download_queue.put((repo_id, model_name, target_model))

        return web.json_response({"status": "queued", "message": f"Download queued for {model_name}"})

    except Exception as e:
        if "HFValidationError" in str(e):
            return web.json_response({"error": "Invalid Repo ID"}, status=400)
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/umiapp/models/progress")
async def get_download_progress(request):
    download_id = request.query.get("id", "")
    if download_id and download_id in download_status:
        return web.json_response(download_status[download_id])
    return web.json_response(download_status)

# 2. Mappings
CORE_NODE_CLASS_MAPPINGS = {
    "UmiAIWildcardNode": UmiAIWildcardNodeLite,  # Unified node (Lite version for users)
    # Full version available in nodes.py for debugging - uncomment to use instead of Lite:
    # "UmiAIWildcardNode": UmiAIWildcardNode,
    "UmiSaveImage": UmiSaveImage,
    "UmiTextBypass": UmiTextBypass,
    # Disabled nodes - uncomment to re-enable
    # "UmiPoseGenerator": UmiPoseGenerator,
    # "UmiEmotionGenerator": UmiEmotionGenerator,
    # "UmiEmotionStudio": UmiEmotionStudio,
    # "UmiCharacterDesigner": UmiCharacterCreator2,
    # "UmiModelManager": UmiModelManager,
    # "UmiModelSelector": UmiModelSelector,
}

CORE_NODE_DISPLAY_NAME_MAPPINGS = {
    "UmiAIWildcardNode": "UmiAI Wildcard Processor",
    "UmiSaveImage": "Umi Save Image (with metadata)",
    "UmiTextBypass": "Umi Bypass",
    # Disabled nodes - uncomment to re-enable
    # "UmiPoseGenerator": "Umi Pose Generator",
    # "UmiEmotionGenerator": "Umi Emotion Generator",
    # "UmiEmotionStudio": "Umi Emotion Studio",
    # "UmiCharacterDesigner": "Umi Character Designer",
    # "UmiModelManager": "Umi Model Manager",
    # "UmiModelSelector": "Umi Model Selector",
}

NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(CORE_NODE_CLASS_MAPPINGS)
if _umi_utilities is not None:
    NODE_CLASS_MAPPINGS.update(_umi_utilities.NODE_CLASS_MAPPINGS)
if _bgrm is not None:
    NODE_CLASS_MAPPINGS.update(_bgrm.NODE_CLASS_MAPPINGS)

NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS.update(CORE_NODE_DISPLAY_NAME_MAPPINGS)
if _umi_utilities is not None:
    NODE_DISPLAY_NAME_MAPPINGS.update(_umi_utilities.NODE_DISPLAY_NAME_MAPPINGS)
if _bgrm is not None:
    NODE_DISPLAY_NAME_MAPPINGS.update(_bgrm.NODE_DISPLAY_NAME_MAPPINGS)

# 3. Expose the web directory
WEB_DIRECTORY = "./js"

# ==============================================================================
# EXECUTION INTERCEPTOR FOR TEXT BYPASS
# ==============================================================================
# Hook into prompt execution to dynamically bypass nodes based on runtime conditions

# Don't install execution hook - it's too fragile across ComfyUI versions
# Instead, rely on the frontend JS to set bypass mode before queue submission
print("[UmiTextBypass] Using frontend-based bypass control (see js/umi_text_bypass.js)")

def _umi_coerce_value(value, default, value_type):
    if value is None:
        return default
    try:
        if value_type == int:
            return int(float(value))
        if value_type == float:
            return float(value)
        if value_type == str:
            if isinstance(value, (int, float)):
                return str(value)
            return str(value)
    except Exception:
        return default
    return value

def _umi_is_link_value(value):
    return isinstance(value, (list, tuple)) and len(value) >= 2

_UMI_BYPASS_OUTPUT_INDEX = {
    "IMAGE": 0,
    "LATENT": 1,
    "CONDITIONING": 2,
    "MODEL": 3,
    "CLIP": 4,
    "STRING": 5,
}

def _umi_get_prompt_graph(prompt_payload):
    if isinstance(prompt_payload, (list, tuple)) and prompt_payload:
        prompt_payload = prompt_payload[0]
    if isinstance(prompt_payload, dict) and "prompt" in prompt_payload:
        return prompt_payload["prompt"]
    if isinstance(prompt_payload, dict):
        return prompt_payload
    return None

def _umi_collect_downstream_nodes(prompt_graph):
    downstream = {}
    for node_id, node_data in prompt_graph.items():
        inputs = node_data.get("inputs", {})
        for input_val in inputs.values():
            if _umi_is_link_value(input_val):
                src_id = str(input_val[0])
                downstream.setdefault(src_id, set()).add(str(node_id))
    return downstream

def _umi_collect_downstream_links(prompt_graph):
    downstream = {}
    for node_id, node_data in prompt_graph.items():
        inputs = node_data.get("inputs", {})
        for input_name, input_val in inputs.items():
            if _umi_is_link_value(input_val):
                src_id = str(input_val[0])
                src_output = int(input_val[1]) if len(input_val) > 1 else 0
                downstream.setdefault(src_id, []).append((str(node_id), input_name, src_output))
    return downstream

def _umi_collect_output_indices(downstream, node_id):
    output_indices = set()
    for _, _, src_output in downstream.get(str(node_id), []):
        output_indices.add(int(src_output))
    return output_indices

def _umi_get_bypass_output_index(node_inputs):
    passthrough_type = node_inputs.get("passthrough_type", "IMAGE")
    if _umi_is_link_value(passthrough_type):
        return None
    return _UMI_BYPASS_OUTPUT_INDEX.get(str(passthrough_type))

def _umi_parse_matched_list(value):
    if value is None or _umi_is_link_value(value):
        return None
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return None
    return None

def _umi_parse_match_index(value):
    if _umi_is_link_value(value):
        return None
    return _umi_coerce_value(value, 0, int)

def _umi_replace_output_nodes(prompt_payload, old_id, new_id):
    if not isinstance(prompt_payload, dict):
        return 0
    replaced = 0
    for key in ("output", "outputs"):
        output_list = prompt_payload.get(key)
        if not isinstance(output_list, list):
            continue
        for idx, val in enumerate(output_list):
            if str(val) == str(old_id):
                output_list[idx] = str(new_id)
                replaced += 1
    return replaced

def _umi_compute_bypass_for_node(node_inputs):
    text_val = node_inputs.get("text", "")
    seed_val = node_inputs.get("seed", 0)
    bypass_phrase_val = node_inputs.get("bypass_phrase", "")
    bypass_phrases_val = node_inputs.get("bypass_phrases", "")
    input_negative_val = node_inputs.get("input_negative", "")

    # Skip if required inputs are linked
    if (_umi_is_link_value(text_val) or _umi_is_link_value(seed_val)
            or _umi_is_link_value(bypass_phrase_val) or _umi_is_link_value(bypass_phrases_val)):
        umi_debug_print("[UmiTextBypass] Preview bypass skipped: linked inputs detected")
        return None, None

    text = _umi_coerce_value(text_val, "", str)
    seed = _umi_coerce_value(seed_val, 0, int)
    bypass_phrase = _umi_coerce_value(bypass_phrase_val, "", str)
    bypass_phrases = _umi_coerce_value(bypass_phrases_val, "", str)
    input_negative = _umi_coerce_value(input_negative_val, "", str)

    # LLM/Vision optional inputs (only use if not linked)
    image_input = None
    if UMI_SETTINGS.get('enable_llm_features', False):
        image_val = node_inputs.get("image", None)
        if _umi_is_link_value(image_val):
            umi_debug_print("[UmiTextBypass] Preview bypass skipped: linked image input detected")
            return None
        image_input = image_val

    vision_model = _umi_coerce_value(node_inputs.get("vision_model", "None"), "None", str)
    refiner_model = _umi_coerce_value(node_inputs.get("refiner_model", "None"), "None", str)
    vision_temperature = _umi_coerce_value(node_inputs.get("vision_temperature", 0.6), 0.6, float)
    refiner_temperature = _umi_coerce_value(node_inputs.get("refiner_temperature", 0.7), 0.7, float)
    max_tokens = _umi_coerce_value(node_inputs.get("max_tokens", 800), 800, int)
    custom_system_prompt = _umi_coerce_value(node_inputs.get("custom_system_prompt", ""), "", str)

    danbooru_threshold = _umi_coerce_value(node_inputs.get("danbooru_threshold", 0.70), 0.70, float)
    danbooru_max_tags = _umi_coerce_value(node_inputs.get("danbooru_max_tags", 15), 15, int)

    wildcard_node = UmiAIWildcardNodeLite()
    matched, _, matched_list = wildcard_node.preview_bypass_matched(
        text=text,
        seed=seed,
        bypass_phrase=bypass_phrase,
        bypass_phrases=bypass_phrases,
        input_negative=input_negative,
        image_input=image_input,
        vision_model=vision_model,
        refiner_model=refiner_model,
        vision_temperature=vision_temperature,
        refiner_temperature=refiner_temperature,
        max_tokens=max_tokens,
        custom_system_prompt=custom_system_prompt,
        danbooru_threshold=danbooru_threshold,
        danbooru_max_tags=danbooru_max_tags,
    )
    return matched, matched_list

def _umi_bypass_prompt_handler(prompt_payload):
    try:
        prompt_graph = _umi_get_prompt_graph(prompt_payload)
        if not isinstance(prompt_graph, dict):
            print("[UmiTextBypass DEBUG] prompt_graph is not a dict!")
            return prompt_payload

        print(f"\n[UmiTextBypass DEBUG] ===== ANALYZING PROMPT GRAPH =====")
        print(f"[UmiTextBypass DEBUG] Total nodes in graph: {len(prompt_graph)}")
        print(f"[UmiTextBypass DEBUG] Node types:")
        for nid, ndata in prompt_graph.items():
            if isinstance(ndata, dict):
                print(f"  Node {nid}: {ndata.get('class_type', 'UNKNOWN')}")

        wildcard_cache = {}
        backend_controls = _umi_has_execution_blocker()
        bypass_nodes = 0
        umi_debug_print("[UmiTextBypass] Prompt handler invoked")

        for node_id, node_data in prompt_graph.items():
            if node_data.get("class_type") != "UmiTextBypass":
                continue
            print(f"[UmiTextBypass DEBUG] FOUND UmiTextBypass node: {node_id}")
            bypass_nodes += 1

            inputs = node_data.get("inputs", {})
            matched_input = inputs.get("matched", None)
            matched_list_input = inputs.get("matched_list", None)
            match_index_input = inputs.get("match_index", 0)
            matched_value = None
            matched_list = None

            downstream = _umi_collect_downstream_links(prompt_graph)
            targets = downstream.get(str(node_id), [])
            if backend_controls:
                for target_id, _, _ in targets:
                    target_node = prompt_graph.get(target_id)
                    if not isinstance(target_node, dict):
                        continue
                    target_node["mode"] = 0
                continue

            if matched_list_input is not None:
                if _umi_is_link_value(matched_list_input):
                    src_id = str(matched_list_input[0])
                    cached = wildcard_cache.get(src_id)
                    if cached is None:
                        src_node = prompt_graph.get(src_id, {})
                        if src_node.get("class_type") in ("UmiAIWildcardNodeLite", "UmiAIWildcardNode"):
                            single, match_list = _umi_compute_bypass_for_node(src_node.get("inputs", {}))
                            cached = {"single": single, "list": match_list}
                            wildcard_cache[src_id] = cached
                    if cached:
                        matched_list = cached.get("list")
                else:
                    matched_list = _umi_parse_matched_list(matched_list_input)

            if matched_list is not None:
                match_index = _umi_parse_match_index(match_index_input)
                if match_index is not None and 0 <= match_index < len(matched_list):
                    matched_value = bool(matched_list[match_index])

            if matched_value is None:
                if _umi_is_link_value(matched_input):
                    src_id = str(matched_input[0])
                    cached = wildcard_cache.get(src_id)
                    if cached is None:
                        src_node = prompt_graph.get(src_id, {})
                        if src_node.get("class_type") in ("UmiAIWildcardNodeLite", "UmiAIWildcardNode"):
                            single, match_list = _umi_compute_bypass_for_node(src_node.get("inputs", {}))
                            cached = {"single": single, "list": match_list}
                            wildcard_cache[src_id] = cached
                    if cached:
                        matched_value = cached.get("single")
                elif matched_input is not None:
                    matched_value = bool(matched_input)

            if matched_value is None:
                umi_debug_print(f"[UmiTextBypass] Skipping node {node_id}: unable to compute matched")
                continue

            bypass_output_idx = _umi_get_bypass_output_index(inputs)
            if bypass_output_idx is None:
                umi_debug_print(f"[UmiTextBypass] Skipping node {node_id}: passthrough_type is linked or unknown")
                continue

            target_ids = {target_id for target_id, _, _ in targets}
            if matched_value:
                continue

            for target_id in target_ids:
                output_indices = _umi_collect_output_indices(downstream, target_id)
                if len(output_indices) > 1:
                    print(f"[UmiTextBypass] Skipping target {target_id}: multiple output indices {sorted(output_indices)}")
                    continue
                if output_indices and bypass_output_idx not in output_indices:
                    print(f"[UmiTextBypass] Skipping target {target_id}: passthrough output {bypass_output_idx} does not match target output {list(output_indices)[0]}")
                    continue

                rewired = 0
                for dst_id, input_name, _ in downstream.get(str(target_id), []):
                    dst_node = prompt_graph.get(dst_id)
                    if not isinstance(dst_node, dict):
                        continue
                    dst_inputs = dst_node.get("inputs", {})
                    if input_name in dst_inputs and _umi_is_link_value(dst_inputs[input_name]):
                        link_src = str(dst_inputs[input_name][0])
                        if link_src == str(target_id):
                            dst_inputs[input_name] = [str(node_id), int(bypass_output_idx)]
                            rewired += 1

                outputs_replaced = _umi_replace_output_nodes(prompt_payload, target_id, node_id)
                print(f"[UmiTextBypass] Rewired target {target_id} -> bypass {node_id}: links={rewired}, outputs={outputs_replaced}")

        umi_debug_print(f"[UmiTextBypass] Prompt handler complete: {bypass_nodes} bypass nodes")
        return prompt_payload
    except Exception as e:
        print(f"[UmiTextBypass] Prompt handler failed: {e}")
        return prompt_payload

def _umi_has_execution_blocker():
    try:
        from comfy.execution import ExecutionBlocker
        return ExecutionBlocker is not None
    except Exception:
        pass
    try:
        from comfy.utils import ExecutionBlocker
        return ExecutionBlocker is not None
    except Exception:
        return False

def _umi_prompt_handler_wrapper(*args, **kwargs):
    if args:
        prompt_payload = args[0]
        updated = _umi_bypass_prompt_handler(prompt_payload)
        if len(args) == 1:
            return updated
        if len(args) == 2:
            return (updated, args[1])
        return (updated,) + args[1:]
    if "prompt" in kwargs:
        kwargs["prompt"] = _umi_bypass_prompt_handler(kwargs["prompt"])
    return kwargs

def _umi_install_prompt_handler():
    try:
        ps = PromptServer.instance
        print("[UmiTextBypass] Attempting to install backend prompt handler")
        print("[UmiTextBypass] PromptServer attrs:", [a for a in dir(ps) if "prompt" in a.lower()])
        if hasattr(ps, "add_on_prompt_handler"):
            ps.add_on_prompt_handler(_umi_prompt_handler_wrapper)
            print("[UmiTextBypass] Installed backend prompt handler via PromptServer.add_on_prompt_handler")
            return
        if hasattr(ps, "add_on_prompt"):
            ps.add_on_prompt(_umi_prompt_handler_wrapper)
            print("[UmiTextBypass] Installed backend prompt handler via PromptServer.add_on_prompt")
            return

        pq = getattr(ps, "prompt_queue", None)
        if pq is not None:
            print("[UmiTextBypass] prompt_queue attrs:", [a for a in dir(pq) if "prompt" in a.lower()])
            if hasattr(pq, "add_on_prompt_handler"):
                pq.add_on_prompt_handler(_umi_prompt_handler_wrapper)
                print("[UmiTextBypass] Installed backend prompt handler via prompt_queue.add_on_prompt_handler")
                return
            if hasattr(pq, "add_on_prompt"):
                pq.add_on_prompt(_umi_prompt_handler_wrapper)
                print("[UmiTextBypass] Installed backend prompt handler via prompt_queue.add_on_prompt")
                return
            handlers = getattr(pq, "on_prompt_handlers", None)
            if isinstance(handlers, list):
                handlers.append(_umi_prompt_handler_wrapper)
                print("[UmiTextBypass] Installed backend prompt handler via prompt_queue.on_prompt_handlers")
                return

        print("[UmiTextBypass] Backend prompt handler not supported; using frontend bypass")
    except Exception as e:
        print(f"[UmiTextBypass] Failed to install prompt handler: {e}")

_umi_install_prompt_handler()

@PromptServer.instance.routes.post("/umi/bypass_preview")
async def _umi_bypass_preview(request):
    import sys
    try:
        data = await request.json()
    except Exception as e:
        print(f"[UmiTextBypass DEBUG] JSON parse error: {e}", flush=True)
        return web.json_response({"error": "invalid json"}, status=400)

    prompt_payload = data.get("prompt")
    if prompt_payload is None:
        print("[UmiTextBypass DEBUG] /umi/bypass_preview: prompt_payload is None", flush=True)
        return web.json_response({"prompt": None})

    print(f"[UmiTextBypass DEBUG] /umi/bypass_preview called", flush=True)
    print(f"[UmiTextBypass DEBUG] prompt_payload type: {type(prompt_payload)}", flush=True)
    print(f"[UmiTextBypass DEBUG] prompt_payload keys: {list(prompt_payload.keys()) if isinstance(prompt_payload, dict) else 'not a dict'}", flush=True)
    sys.stdout.flush()

    try:
        updated = _umi_bypass_prompt_handler(prompt_payload)
    except Exception as e:
        print(f"[UmiTextBypass DEBUG] Handler exception: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return web.json_response({"prompt": prompt_payload})
    if isinstance(updated, dict) and "prompt" in updated:
        prompt_payload = updated.get("prompt")
    else:
        prompt_payload = updated
    return web.json_response({"prompt": prompt_payload})

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
