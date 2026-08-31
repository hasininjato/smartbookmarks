import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';

/**
 * Récupère l'identifiant de l'auteur du signet.
 * Ordre de priorité :
 * 1. Git config user.name (CLI)
 * 2. Git config user.email (CLI)
 * 3. Extension VS Code Git (user.name puis user.email)
 * 4. Session OS (username)
 * 5. 'Inconnu'
 * 
 * @param filePath Chemin absolu du fichier (optionnel)
 */
export function getGitUser(filePath?: string): { name: string; email: string } {
    let name = '';
    let email = '';

    const cwd = filePath ? path.dirname(filePath) : process.cwd();

    // Configuration explicite et sécurisée des options execSync
    const execOptions: ExecSyncOptions = {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
    };

    // 1. Recherche via Git CLI (Nom puis Email)
    try {
        const result = execSync('git config user.name', execOptions);
        name = typeof result === 'string' ? result.trim() : '';
    } catch {
        // Ignorer l'erreur si hors dépôt Git ou CLI indisponible
    }

    try {
        const result = execSync('git config user.email', execOptions);
        email = typeof result === 'string' ? result.trim() : '';
    } catch {
        // Ignorer
    }

    // Si on a l'email mais pas de nom, on utilise l'email comme nom d'affichage principal
    if (!name && email) {
        name = email;
    }

    // 2. Fallback via l'extension VS Code Git native (si le CLI n'a rien renvoyé)
    if (!name) {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (gitExtension) {
                const api = gitExtension.getAPI(1);
                if (api.repositories.length > 0) {
                    const repo = filePath
                        ? api.repositories.find((r: any) => filePath.startsWith(r.rootUri.fsPath)) || api.repositories[0]
                        : api.repositories[0];

                    const config = repo?.state?.config;
                    name = config?.['user.name'] || config?.['user.email'] || '';
                    email = config?.['user.email'] || '';
                }
            }
        } catch {
            // Ignorer si l'API n'est pas accessible
        }
    }

    // 3. Fallback sur la session de l'OS (Nom de compte Windows/Mac/Linux)
    if (!name) {
        try {
            name = os.userInfo().username?.trim() || '';
        } catch {
            name = '';
        }
    }

    // 4. Retour final garanti
    return {
        name: name || 'Unknown',
        email: email || ''
    };
}