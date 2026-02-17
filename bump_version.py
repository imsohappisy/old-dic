import re
import os

def increment_version():
    file_path = 'index.html'
    if not os.path.exists(file_path):
        print(f"Error: {file_path} not found.")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find version badge: <div class="version-badge">v1.0.7</div>
    version_pattern = r'(<div class="version-badge">v)(\d+)\.(\d+)\.(\d+)(</div>)'
    match = re.search(version_pattern, content)
    
    if match:
        prefix, major, minor, patch, suffix = match.groups()
        new_patch = int(patch) + 1
        new_version = f"{prefix}{major}.{minor}.{new_patch}{suffix}"
        
        new_content = content[:match.start()] + new_version + content[match.end():]
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f"Version bumped from {major}.{minor}.{patch} to {major}.{minor}.{new_patch}")
    else:
        print("Error: Version badge not found in index.html")

if __name__ == "__main__":
    increment_version()
