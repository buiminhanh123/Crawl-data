import os

REPLACEMENTS = {
    "{APP_NAME}": "Newland Portal",
    "{APP_DESCRIPTION}": "Newland Product Scraper and Explorer",
    "{APP_SUBTITLE}": "Crawler & Manager",
    "{PORT}": "3002"
}

FILE_MAPPING = {
    # Frontend
    "daco-webapp-builder/templates/frontend/globals.css": "frontend/src/app/globals.css",
    "daco-webapp-builder/templates/frontend/layout.js": "frontend/src/app/layout.js",
    "daco-webapp-builder/templates/frontend/ClientLayout.js": "frontend/src/components/ClientLayout.js",
    "daco-webapp-builder/templates/frontend/Sidebar.js": "frontend/src/components/Sidebar.js",
    "daco-webapp-builder/templates/frontend/AuthProvider.js": "frontend/src/components/AuthProvider.js",
    "daco-webapp-builder/templates/frontend/Toast.js": "frontend/src/components/Toast.js",
    "daco-webapp-builder/templates/frontend/api.js": "frontend/src/lib/api.js",
    "daco-webapp-builder/templates/frontend/login-page.js": "frontend/src/app/login/page.js",
    
    # Server
    "daco-webapp-builder/templates/server/server.js": "server/server.js",
    "daco-webapp-builder/templates/server/auth.js": "server/auth.js",
    "daco-webapp-builder/templates/server/db.js": "server/db.js",
    "daco-webapp-builder/templates/server/auth.routes.js": "server/routes/auth.routes.js"
}

def copy_and_replace():
    base_dir = r"E:\sp\Newland"
    
    for src_rel, dest_rel in FILE_MAPPING.items():
        src_path = os.path.join(base_dir, src_rel.replace("/", "\\"))
        dest_path = os.path.join(base_dir, dest_rel.replace("/", "\\"))
        
        print(f"Copying {src_path} -> {dest_path}...")
        
        if not os.path.exists(src_path):
            print(f"Error: Source file {src_path} does not exist!")
            continue
            
        with open(src_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Perform replacements
        for placeholder, value in REPLACEMENTS.items():
            content = content.replace(placeholder, value)
            
        # Ensure directory exists
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        
        with open(dest_path, "w", encoding="utf-8") as f:
            f.write(content)
            
    print("All template files copied successfully.")

if __name__ == "__main__":
    copy_and_replace()
