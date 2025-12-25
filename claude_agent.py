import asyncio
import json
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, ToolUseBlock, TextBlock, ResultMessage, create_sdk_mcp_server, tool
import subprocess
import os

async def main():
    # 1. Metadaten lesen
    try:
        with open("/home/user/app/CLAUDE.md", "r") as f:
            instructions = f.read()
    except:
        print("Kein CLAUDE.md")

    def run_git_cmd(cmd: str):
        """Executes a Git command and throws an error on failure"""
        print(f"[DEPLOY] Executing: {cmd}")
        result = subprocess.run(
            cmd,
            shell=True,
            cwd="/home/user/app",
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            raise Exception(f"Git Error ({cmd}): {result.stderr}")
        return result.stdout

    @tool("deploy_to_github",
    "Initializes Git, commits EVERYTHING, and pushes it to the configured repository. Use this ONLY at the very end.",
    {})
    async def deploy_to_github(args):
        try:
            run_git_cmd("git config --global user.email 'lilo@livinglogic.de'")
            run_git_cmd("git config --global user.name 'Lilo'")
            
            git_push_url = os.getenv('GIT_PUSH_URL')
            appgroup_id = os.getenv('REPO_NAME')
            livingapps_api_key = os.getenv('LIVINGAPPS_API_KEY')
            
            # Prüfe ob Repo existiert und übernehme .git History
            print("[DEPLOY] Prüfe ob Repo bereits existiert...")
            try:
                run_git_cmd(f"git clone {git_push_url} /tmp/old_repo")
                run_git_cmd("cp -r /tmp/old_repo/.git /home/user/app/.git")
                print("[DEPLOY] ✅ History vom existierenden Repo übernommen")
            except:
                # Neues Repo - von vorne initialisieren
                print("[DEPLOY] ✅ Neues Repo wird initialisiert")
                run_git_cmd("git init")
                run_git_cmd("git checkout -b main")
                run_git_cmd(f"git remote add origin {git_push_url}")
            
            # Neuen Code committen
            run_git_cmd("git add -A")
            run_git_cmd("git commit -m 'Lilo Auto-Deploy' --allow-empty")
            run_git_cmd("git push origin main")
            
            print("[DEPLOY] ✅ Push erfolgreich!")
            
            # Ab hier: Warte auf Dashboard und aktiviere Links
            if livingapps_api_key and appgroup_id:
                import httpx
                import time
                
                headers = {
                    "X-API-Key": livingapps_api_key,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
                
                try:
                    # 1. Hole alle App-IDs der Appgroup
                    print(f"[DEPLOY] Lade Appgroup: {appgroup_id}")
                    resp = httpx.get(
                        f"https://my.living-apps.de/rest/appgroups/{appgroup_id}",
                        headers=headers,
                        timeout=30
                    )
                    resp.raise_for_status()
                    appgroup = resp.json()
                    
                    app_ids = [app_data["id"] for app_data in appgroup.get("apps", {}).values()]
                    print(f"[DEPLOY] Gefunden: {len(app_ids)} Apps")
                    
                    if not app_ids:
                        print("[DEPLOY] ⚠️ Keine Apps gefunden")
                        return {"content": [{"type": "text", "text": "✅ Deployment erfolgreich!"}]}
                    
                    dashboard_url = f"https://my.living-apps.de/github/{appgroup_id}/"
                    
                    # 2. Warte bis Dashboard verfügbar ist
                    print(f"[DEPLOY] ⏳ Warte auf Dashboard: {dashboard_url}")
                    max_attempts = 180  # Max 180 Sekunden warten
                    for attempt in range(max_attempts):
                        try:
                            check_resp = httpx.get(dashboard_url, timeout=5)
                            if check_resp.status_code == 200:
                                print(f"[DEPLOY] ✅ Dashboard ist verfügbar!")
                                break
                        except:
                            pass
                        
                        if attempt < max_attempts - 1:
                            time.sleep(1)
                        else:
                            print("[DEPLOY] ⚠️ Timeout - Dashboard nicht erreichbar")
                            return {"content": [{"type": "text", "text": "✅ Deployment erfolgreich! Dashboard-Links konnten nicht aktiviert werden."}]}
                    
                    # 3. Aktiviere Dashboard-Links
                    print("[DEPLOY] 🎉 Aktiviere Dashboard-Links...")
                    for app_id in app_ids:
                        try:
                            # URL aktivieren
                            httpx.put(
                                f"https://my.living-apps.de/rest/apps/{app_id}/params/la_page_header_additional_url",
                                headers=headers,
                                json={"description": "dashboard_url", "type": "string", "value": dashboard_url},
                                timeout=10
                            )
                            # Title aktualisieren
                            httpx.put(
                                f"https://my.living-apps.de/rest/apps/{app_id}/params/la_page_header_additional_title",
                                headers=headers,
                                json={"description": "dashboard_title", "type": "string", "value": "Dashboard"},
                                timeout=10
                            )
                            print(f"[DEPLOY]   ✓ App {app_id} aktiviert")
                        except Exception as e:
                            print(f"[DEPLOY]   ✗ App {app_id}: {e}")
                    
                    print("[DEPLOY] ✅ Dashboard-Links erfolgreich hinzugefügt!")
                    
                except Exception as e:
                    print(f"[DEPLOY] ⚠️ Fehler beim Hinzufügen der Dashboard-Links: {e}")

            return {
                "content": [{"type": "text", "text": "✅ Deployment erfolgreich! Code wurde gepusht und Dashboard-Links hinzugefügt."}]
            }

        except Exception as e:
            return {"content": [{"type": "text", "text": f"Deployment Failed: {str(e)}"}], "is_error": True}

    deployment_server = create_sdk_mcp_server(
        name="deployment",
        version="1.0.0",
        tools=[deploy_to_github]
    )

    # 3. Optionen konfigurieren
    options = ClaudeAgentOptions(
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": instructions
        },
        mcp_servers={"deploy_tools": deployment_server},
        permission_mode="acceptEdits",
        allowed_tools=["Bash", "Write", "Read", "Edit", "Glob", "Grep", "Task", "TodoWrite",
        "mcp__deploy_tools__deploy_to_github"
        ],
        cwd="/home/user/app",
        model="claude-sonnet-4-5-20250929",
    )

    print(f"[LILO] Initialisiere Client")

    # 4. Der Client Lifecycle
    async with ClaudeSDKClient(options=options) as client:
        
        # Anfrage senden
        await client.query("Baue das Dashboard")

        # 5. Antwort-Schleife
        # receive_response() liefert alles bis zum Ende des Auftrags
        async for message in client.receive_response():
            
            # A. Wenn er denkt oder spricht
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        #als JSON-Zeile ausgeben
                        print(json.dumps({"type": "think", "content": block.text}), flush=True)
                    
                    elif isinstance(block, ToolUseBlock):
                        print(json.dumps({"type": "tool", "tool": block.name, "input": str(block.input)}), flush=True)

            # B. Wenn er fertig ist (oder Fehler)
            elif isinstance(message, ResultMessage):
                status = "success" if not message.is_error else "error"
                print(json.dumps({"type": "result", "status": status, "cost": message.total_cost_usd}), flush=True)

if __name__ == "__main__":
    asyncio.run(main())