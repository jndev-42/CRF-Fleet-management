import os
import json
import time
import sys
from github import Github, Auth
from anthropic import Anthropic

# Initialisation des clients API avec la nouvelle méthode d'authentification
auth = Auth.Token(os.environ["GITHUB_TOKEN"])
gh = Github(auth=auth)
anthropic_client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# Récupération du contexte de l'événement GitHub
with open(os.environ["GITHUB_EVENT_PATH"], "r") as f:
    event_data = json.load(f)

repo_name = os.environ["GITHUB_REPOSITORY"]
repo = gh.get_repo(repo_name)

if "issue" in event_data:
    issue_number = event_data["issue"]["number"]
else:
    issue_number = event_data["number"]

issue = repo.get_issue(number=issue_number)
labels = [l.name for l in issue.labels]

# ==========================================
# GESTION DE L'ARBORESCENCE NEXT.JS / TS
# ==========================================

def get_repository_map():
    """Génère une carte de ton architecture Next.js pour l'étape de triage."""
    repo_map = []
    target_roots = ["src/app", "src/components", "src/lib", "scripts"]
    
    for base_folder in target_roots:
        if not os.path.exists(base_folder):
            continue
        for root, dirs, files in os.walk(base_folder):
            if any(p in root for p in ["__tests__", "node_modules"]):
                continue
            
            has_claude_md = "CLAUDE.md" in files or "claude.md" in files
            source_files = [f for f in files if f.endswith((".ts", ".tsx", ".css", ".json")) and f.upper() != "CLAUDE.MD"]
            
            if source_files or has_claude_md:
                repo_map.append({
                    "path": root,
                    "has_rules_file": has_claude_md,
                    "files": source_files
                })
                
    return json.dumps(repo_map, indent=2)

def ask_claude_for_scope(issue_title, issue_body, repo_map):
    """Première passe (Triage) : Claude choisit ses dossiers cibles."""
    system_prompt = (
        "Tu es un ingénieur principal. Analyse l'issue GitHub et la carte de l'application Next.js "
        "pour déterminer dans quel(s) sous-dossier(s) le travail doit être effectué.\n"
        "Réponds EXCLUSIVEMENT sous la forme d'un tableau JSON contenant les chemins des dossiers.\n"
        "INTERDICTION FORMELLE d'utiliser des balises markdown comme ```json. Renvoie UNIQUEMENT le tableau brut.\n"
        "Exemple : [\"src/components/vehicle\", \"src/app/vehicles\"]"
    )
    user_prompt = f"Issue: {issue_title}\nDescription: {issue_body}\n\nCarte du projet :\n{repo_map}"
    
    response = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000, 
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}]
    ).content[0].text
    
    try:
        # Nettoyage robuste des balises markdown potentielles
        clean_response = response.strip().strip('`').replace('json\n', '', 1).strip()
        start = clean_response.find('[')
        end = clean_response.rfind(']') + 1
        return json.loads(clean_response[start:end])
    except Exception as e:
        print(f"Erreur de parsing du scope ({e}). Réponse brute : {response}")
        return ["src/app", "src/components"] # Repli de sécurité

def get_scoped_codebase_context(target_directories):
    """Charge les CLAUDE.md transversaux + le code source des répertoires ciblés."""
    context = ""
    
    context += "=== CONTEXTES ET RÈGLES APPLICABLES (CLAUDE.md) ===\n"
    for root, dirs, files in os.walk("."):
        if any(p in root for p in [".git", "node_modules", ".next"]):
            continue
        for f_name in files:
            if f_name.upper() == "CLAUDE.MD":
                filepath = os.path.join(root, f_name)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        context += f"\n--- RÈGLES POUR LE DOSSIER {root} ---\n{f.read()}\n"
                except Exception:
                    pass

    context += "\n=== CODE SOURCE DE LA ZONE CIBLÉE ===\n"
    for folder in target_directories:
        if not os.path.exists(folder):
            continue
        for file in os.listdir(folder):
            filepath = os.path.join(folder, file)
            if os.path.isfile(filepath) and file.endswith((".ts", ".tsx", ".css")):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        context += f"\n--- CODE FIP (FILE): {filepath} ---\n{f.read()}\n"
                except Exception:
                    pass
    return context

def create_pull_request(branch_name, title, body):
    """Exécute Vitest et pousse la PR si tout est au vert."""
    print("🛠️ Lancement de la suite de tests Vitest...")
    
    test_result = os.system("npx vitest run")
    
    if test_result != 0:
        issue.create_comment(f"❌ **Claude** : Les tests unitaires/intégration via **Vitest** ont échoué. Création de la PR avortée pour éviter une régression.")
        sys.exit(1)
        
    print("✅ Tests validés. Préparation du commit et push...")
    os.system("git config --global user.name 'github-actions[bot]'")
    os.system("git config --global user.email 'github-actions[bot]@users.noreply.github.com'")
    os.system(f"git checkout -b {branch_name}")
    os.system("git add .")
    os.system(f"git commit -m '{title}'")
    os.system(f"git push origin {branch_name} --force")
    
    try:
        pr = repo.create_pull(title=title, body=body, head=branch_name, base="main")
        issue.create_comment(f"🚀 **Claude** : Code déployé sur la branche `{branch_name}` et validé par Vitest !\n👉 Pull Request créée : {pr.html_url}")
    except Exception as e:
        issue.create_comment(f"⚠️ Branch poussée mais échec de création de la PR sur GitHub : {e}")

def execute_batch_request(model, system_prompt, user_prompt):
    """Utilise l'API Batch d'Anthropic avec Prompt Caching."""
    batch_job = anthropic_client.beta.messages.batches.create(
        requests=[
            {
                "custom_id": f"issue-{issue_number}",
                "params": {
                    "model": model,
                    "max_tokens": 8192, 
                    "system": [
                        {
                            "type": "text",
                            "text": system_prompt,
                            "cache_control": {"type": "ephemeral"}
                        }
                    ],
                    "messages": [{"role": "user", "content": user_prompt}]
                }
            }
        ]
    )
    
    issue.create_comment(f"⏳ **Claude** : Tâche planifiée via l'API Batch ({model}). Traitement asynchrone en cours...")
    
    while True:
        status = anthropic_client.beta.messages.batches.retrieve(batch_job.id)
        if status.processing_status == "ended":
            break
        time.sleep(20)
        
    for result in anthropic_client.beta.messages.batches
