import * as vscode from 'vscode';

export function getExtendedPresetIcons(): { label: string; description: string }[] {
    return [
        // 🛠️ Development & Code
        { label: '$(bug) bug', description: '' },
        { label: '$(code) code', description: '' },
        { label: '$(tools) tools', description: '' },
        { label: '$(terminal) terminal', description: '' },
        { label: '$(gear) gear', description: '' },
        { label: '$(symbol-keyword) symbol-keyword', description: '' },
        { label: '$(symbol-class) symbol-class', description: '' },
        { label: '$(database) database', description: '' },
        { label: '$(git-merge) git-merge', description: '' },
        { label: '$(bracket) bracket', description: '' },

        // 🛡️ Security & Performance
        { label: '$(shield) shield', description: '' },
        { label: '$(lock) lock', description: '' },
        { label: '$(key) key', description: '' },
        { label: '$(pulse) pulse', description: '' },
        { label: '$(flame) flame', description: '' },

        // 📋 Organization & Tasks
        { label: '$(checklist) checklist', description: '' },
        { label: '$(notebook) notebook', description: '' },
        { label: '$(eye) eye', description: '' },
        { label: '$(pin) pin', description: '' },
        { label: '$(target) target', description: '' },
        { label: '$(bookmark) bookmark', description: '' },
        { label: '$(tag) tag', description: '' },

        // ⚠️ Status & Alerts
        { label: '$(star) star', description: '' },
        { label: '$(alert) alert', description: '' },
        { label: '$(warning) warning', description: '' },
        { label: '$(info) info', description: '' },
        { label: '$(verified) verified', description: '' },
        { label: '$(pass) pass', description: '' },

        // 🎨 Interface & UI
        { label: '$(heart) heart', description: '' },
        { label: '$(paintcan) paintcan', description: '' },
        { label: '$(lightbulb) lightbulb', description: '' },
        { label: '$(globe) globe', description: '' },
        { label: '$(cloud) cloud', description: '' },
        { label: '$(server) server', description: '' },
        { label: '$(bell) bell', description: '' }
    ];
}