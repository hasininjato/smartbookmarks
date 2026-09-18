import * as vscode from 'vscode';

export function getExtendedPresetIcons(): { label: string; description: string }[] {
    return [
        // 🛠️ Development & Code
        { label: '$(bug) bug', description: vscode.l10n.t('Bugs, anomalies') },
        { label: '$(code) code', description: vscode.l10n.t('Code snippet, function') },
        { label: '$(tools) tools', description: vscode.l10n.t('Tooling, refactoring, helpers') },
        { label: '$(terminal) terminal', description: vscode.l10n.t('Commands, shell scripts') },
        { label: '$(gear) gear', description: vscode.l10n.t('Configuration, settings') },
        { label: '$(symbol-keyword) symbol-keyword', description: vscode.l10n.t('Business logic, algorithm') },
        { label: '$(symbol-class) symbol-class', description: vscode.l10n.t('Component, class') },
        { label: '$(database) database', description: vscode.l10n.t('DB query, data model') },
        { label: '$(git-merge) git-merge', description: vscode.l10n.t('Git branching, merge') },
        { label: '$(bracket) bracket', description: vscode.l10n.t('Structure, brackets') },

        // 🛡️ Security & Performance
        { label: '$(shield) shield', description: vscode.l10n.t('Security, authentication, tokens') },
        { label: '$(lock) lock', description: vscode.l10n.t('Permissions, restricted access') },
        { label: '$(key) key', description: vscode.l10n.t('API keys, secrets') },
        { label: '$(pulse) pulse', description: vscode.l10n.t('Monitoring, metrics, health') },
        { label: '$(flame) flame', description: vscode.l10n.t('High urgency, hotfix') },

        // 📋 Organization & Tasks
        { label: '$(checklist) checklist', description: vscode.l10n.t('Tasks, TODOs, checks') },
        { label: '$(notebook) notebook', description: vscode.l10n.t('Documentation notes') },
        { label: '$(eye) eye', description: vscode.l10n.t('To review, Code Review') },
        { label: '$(pin) pin', description: vscode.l10n.t('Pinned, important reference') },
        { label: '$(target) target', description: vscode.l10n.t('Goal, key milestone') },
        { label: '$(bookmark) bookmark', description: vscode.l10n.t('Standard bookmark') },
        { label: '$(tag) tag', description: vscode.l10n.t('Standard tag') },

        // ⚠️ Status & Alerts
        { label: '$(star) star', description: vscode.l10n.t('Important, favorite') },
        { label: '$(alert) alert', description: vscode.l10n.t('Warning, attention') },
        { label: '$(warning) warning', description: vscode.l10n.t('Critical point') },
        { label: '$(info) info', description: vscode.l10n.t('Additional information') },
        { label: '$(verified) verified', description: vscode.l10n.t('Validated, verified') },
        { label: '$(pass) pass', description: vscode.l10n.t('Success, test passed') },

        // 🎨 Interface & UI
        { label: '$(heart) heart', description: vscode.l10n.t('Highlight, UI/UX') },
        { label: '$(paintcan) paintcan', description: vscode.l10n.t('Design, styles, CSS') },
        { label: '$(lightbulb) lightbulb', description: vscode.l10n.t('Idea, proposal') },
        { label: '$(globe) globe', description: vscode.l10n.t('Network, API, Web, i18n') },
        { label: '$(cloud) cloud', description: vscode.l10n.t('Cloud services, Serverless') },
        { label: '$(server) server', description: vscode.l10n.t('Server, Backend') },
        { label: '$(bell) bell', description: vscode.l10n.t('Notifications, events') }
    ];
}