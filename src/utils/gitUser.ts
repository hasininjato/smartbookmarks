import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';

/**
 * Retrieves the bookmark author's identifier.
 * Priority order:
 * 1. Git config user.name (CLI)
 * 2. Git config user.email (CLI)
 * 3. VS Code Git extension (user.name then user.email)
 * 4. OS session (username)
 * 5. 'Unknown'
 *
 * @param filePath Absolute file path (optional)
 */
export function getGitUser(filePath?: string): { name: string; email: string } {
    let name = '';
    let email = '';

    const cwd = filePath ? path.dirname(filePath) : process.cwd();

    // Explicit and secure execSync options
    const execOptions: ExecSyncOptions = {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
    };

    // 1. Look up via Git CLI (Name then Email)
    try {
        const result = execSync('git config user.name', execOptions);
        name = typeof result === 'string' ? result.trim() : '';
    } catch {
        // Ignore the error if outside a Git repository or if the CLI is unavailable
    }

    try {
        const result = execSync('git config user.email', execOptions);
        email = typeof result === 'string' ? result.trim() : '';
    } catch {
        // Ignore
    }

    // If we have an email but no name, use the email as the display name
    if (!name && email) {
        name = email;
    }

    // 2. Fallback to the native VS Code Git extension (if the CLI returned nothing)
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
            // Ignore if the API is not accessible
        }
    }

    // 3. Fallback to the OS session (Windows/Mac/Linux account name)
    if (!name) {
        try {
            name = os.userInfo().username?.trim() || '';
        } catch {
            name = '';
        }
    }

    // 4. Guaranteed final return
    return {
        name: name || vscode.l10n.t('Unknown'),
        email: email || ''
    };
}