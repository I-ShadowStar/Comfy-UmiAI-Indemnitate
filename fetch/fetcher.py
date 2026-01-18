import os
import json
import time
import hashlib
import requests
import urllib3
import re
import urllib.parse
from datetime import datetime
from tqdm import tqdm

# Disable SSL warnings
urllib3.disable_warnings()

class CivitaiFetcher:
    """
    Handles fetching and saving metadata/previews for LoRA files 
    directly alongside the model files.
    """
    
    CIVITAI_INFO_SUFFIX = ".civitai.info"
    A1111_JSON_SUFFIX = ".json"
    PREVIEW_SUFFIX = ".preview.png"
    EXTS = {".safetensors", ".ckpt", ".pt", ".bin"}
    
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False

    def gen_file_sha256(self, filename):
        hash_sha256 = hashlib.sha256()
        blksize = 1024 * 1024
        total_size = os.path.getsize(filename)
        # Using simple read for library usage, tqdm can be optional or handled by caller
        with open(filename, "rb") as f:
            for chunk in iter(lambda: f.read(blksize), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest().upper()

    def get_civitai_data(self, file_hash):
        version_url = f"https://civitai.com/api/v1/model-versions/by-hash/{file_hash}"
        try:
            v_resp = self.session.get(version_url, timeout=30)
            if v_resp.status_code != 200: return None
            v_data = v_resp.json()
            model_id = v_data.get("modelId")
            if model_id:
                model_url = f"https://civitai.com/api/v1/models/{model_id}"
                m_resp = self.session.get(model_url, timeout=30)
                if m_resp.status_code == 200:
                    m_data = m_resp.json()
                    v_data["parent_model_data"] = m_data
            return v_data
        except Exception as e:
            print(f"Error fetching Civitai data: {e}")
            return None

    def get_civitai_data_by_name(self, name):
        """Fallback: search CivitAI by model name and build version data."""
        if not name:
            return None
        try:
            query = urllib.parse.quote(name)
            search_url = f"https://civitai.com/api/v1/models?query={query}&types=LORA&limit=5"
            resp = self.session.get(search_url, timeout=30)
            if resp.status_code != 200:
                return None
            data = resp.json()
            items = data.get("items", [])
            model = None
            for item in items:
                if item.get("name", "").lower() == name.lower():
                    model = item
                    break
            if not model:
                return None
            versions = model.get("modelVersions", [])
            if not versions:
                return None
            latest_version = versions[0]
            return {
                "id": latest_version.get("id"),
                "modelId": model.get("id"),
                "name": latest_version.get("name", ""),
                "baseModel": latest_version.get("baseModel", "Unknown"),
                "trainedWords": latest_version.get("trainedWords", []),
                "images": latest_version.get("images", []),
                "description": latest_version.get("description", ""),
                "parent_model_data": model,
            }
        except Exception as e:
            print(f"Error fetching Civitai data by name '{name}': {e}")
            return None

    def is_json_missing_data(self, filepath):
        """Checks if .json has empty vital fields."""
        if not os.path.exists(filepath): return True
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                checks = [
                    data.get("description"),
                    data.get("activation text"),
                    data.get("id"),
                    data.get("creator"),
                    data.get("url")
                ]
                if not all(checks): return True
        except: return True
        return False

    def process_file(self, file_path, force_fetch=False, fetch_preview=True, fetch_info=True, fetch_json=True):
        """
        Main method to process a single LoRA file.
        Returns a list of actions performed (strings).
        """
        if not os.path.exists(file_path):
            return ["File not found"]

        base, ext = os.path.splitext(file_path)
        if ext.lower() not in self.EXTS:
            return ["Invalid extension"]

        info_file = f"{base}{self.CIVITAI_INFO_SUFFIX}"
        json_file = f"{base}{self.A1111_JSON_SUFFIX}"
        preview_file = f"{base}{self.PREVIEW_SUFFIX}"

        # Determine what needs to be done
        do_info = fetch_info and (force_fetch or not os.path.exists(info_file))
        do_json = fetch_json and (force_fetch or self.is_json_missing_data(json_file))
        do_prev = fetch_preview and (force_fetch or not os.path.exists(preview_file))

        if not (do_info or do_json or do_prev):
            return []

        file_hash = self.gen_file_sha256(file_path)
        data = self.get_civitai_data(file_hash)

        if not data:
            # Fallback to name search when hash lookup fails
            name = os.path.basename(base)
            data = self.get_civitai_data_by_name(name)

        if not data:
            print(f"[CivitaiFetcher] No CivitAI data found for {os.path.basename(file_path)}")
            return ["CivitAI data not found"]

        actions = []
        parent = data.get("parent_model_data", {})
        full_desc = parent.get("description") or data.get("description") or ""
        trigger_words = ", ".join(data.get("trainedWords", []))
        tags = parent.get("tags", [])
        creator = parent.get("creator", {}).get("username", "Unknown")
        model_url = f"https://civitai.com/models/{data.get('modelId')}"
        base_model = data.get("baseModel", "Unknown")
        
        preview_url_api = ""
        if data.get("images"):
            preview_url_api = data["images"][0].get("url", "")

        # 1. Save .civitai.info (Raw Data)
        if do_info:
            if "model" not in data: data["model"] = {}
            data["model"]["description"] = full_desc
            # Ensure URL is easily accessible
            data["url"] = model_url 
            with open(info_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            actions.append("Info saved")

        # 2. Save .json (Metadata for Browser/A1111)
        if do_json:
            existing_data = {}
            if os.path.exists(json_file):
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        existing_data = json.load(f)
                except: pass
            
            metadata_json = {
                "id": existing_data.get("id") or data.get("modelId"),
                "name": existing_data.get("name") or parent.get("name") or os.path.basename(base),
                "description": existing_data.get("description") or full_desc,
                "sd version": existing_data.get("sd version") or base_model,
                "activation text": existing_data.get("activation text") or trigger_words,
                "tags": existing_data.get("tags") or tags,
                "creator": existing_data.get("creator") or creator,
                "url": existing_data.get("url") or model_url,
                "preview_url": existing_data.get("preview_url") or preview_url_api,
                "preferred weight": existing_data.get("preferred weight") or 0,
                "extensions": existing_data.get("extensions") or {
                    "sd_civitai_helper": {"version": "1.8.13-standalone", "last_update": int(time.time()), "skeleton_file": False}
                },
                "negative text": existing_data.get("negative text") or "",
                "notes": existing_data.get("notes") or ""
            }
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(metadata_json, f, indent=4, ensure_ascii=False)
            actions.append("JSON metadata saved")

        # 3. Save Preview Image
        if do_prev and preview_url_api:
            try:
                img_resp = self.session.get(preview_url_api, timeout=20)
                if img_resp.status_code == 200:
                    with open(preview_file, 'wb') as f:
                        f.write(img_resp.content)
                    actions.append("Preview image saved")
            except: 
                actions.append("Preview fetch failed")

        return actions

    def delete_lora_files(self, file_path):
        """Deletes the lora and its associated metadata/preview files."""
        if not os.path.exists(file_path):
            return False, "File not found"
        
        base, _ = os.path.splitext(file_path)
        files_to_remove = [
            file_path,
            f"{base}{self.CIVITAI_INFO_SUFFIX}",
            f"{base}{self.A1111_JSON_SUFFIX}",
            f"{base}{self.PREVIEW_SUFFIX}"
        ]
        
        removed = []
        for f in files_to_remove:
            if os.path.exists(f):
                try:
                    os.remove(f)
                    removed.append(os.path.basename(f))
                except Exception as e:
                    print(f"Failed to delete {f}: {e}")

        return True, f"Deleted: {', '.join(removed)}"

# Standalone execution compatibility
if __name__ == "__main__":
    import sys
    print("--- Civitai Standalone Tool (Refactored) ---")
    target_path = input("Drag folder here: ").strip('"')
    if not os.path.isdir(target_path):
        print("Invalid path."); sys.exit()

    fetcher = CivitaiFetcher()
    
    print("\nScanning...")
    count = 0
    for root, dirs, files in os.walk(target_path):
        for filename in files:
            file_path = os.path.join(root, filename)
            base, ext = os.path.splitext(file_path)
            if ext.lower() in CivitaiFetcher.EXTS:
                # Default mode: Missing only
                actions = fetcher.process_file(file_path, force_fetch=False)
                if actions:
                    print(f"[{filename}]: {', '.join(actions)}")
                    count += 1
    print(f"\nDone. Processed {count} files.")