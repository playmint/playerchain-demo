import application from 'socket:application';
import process from 'socket:process';

const isMobile = ['android', 'ios'].includes(process.platform);
const isProduction = false; // import.meta.env.MODE === 'production'

interface MenuItem {
    name: string;
    shortcut?: string;
    visible?: () => boolean;
    handler?: () => Promise<any>;
}

interface Menu {
    name: string;
    visible?: () => boolean;
    items: Array<MenuItem>;
}

const menu: Menu[] = [
    {
        name: 'Substream',
        items: [
            {
                name: 'About Substream',
                shortcut: '_',
            },
            {
                name: 'Settings...',
                shortcut: ', + CommandOrControl',
            },
            {
                name: '---',
            },
            {
                name: 'Hide',
                shortcut: 'h + CommandOrControl',
                visible: () => process.platform == 'darwin',
            },
            {
                name: 'Hide Others',
                shortcut: 'h + Control + Meta',
                visible: () => process.platform == 'darwin',
            },
            {
                name: '---',
                visible: () => process.platform == 'darwin',
            },
            {
                name: 'Quit',
                shortcut: 'q + CommandOrControl',
            },
        ],
    },
    {
        name: 'Edit',
        items: [
            {
                name: 'Select All',
                shortcut: 'a + CommandOrControl',
                handler: async () => document.execCommand('selectAll'),
            },
            {
                name: 'Cut',
                shortcut: 'x + CommandOrControl',
                handler: async () => document.execCommand('cut'),
            },
            {
                name: 'Copy',
                shortcut: 'c + CommandOrControl',
                handler: async () => document.execCommand('copy'),
            },
            {
                name: 'Paste',
                shortcut: 'v + CommandOrControl',
                handler: async () => document.execCommand('paste'),
            },
        ],
    },
    {
        name: 'Dev',
        visible: () => !isProduction,
        items: [
            {
                name: 'New Player',
                shortcut: 'p + CommandOrControl',
                handler: newPlayerWindow,
            },
            {
                name: '---',
            },
            {
                name: 'View Test Runner',
                shortcut: '',
                handler: newTestRunnerWindow,
            },
            {
                name: '---',
            },
            {
                name: 'Rebuild state',
                shortcut: '',
                handler: async () => {
                    const w = window as any;
                    if (w.db) {
                        await w.db.state.clear();
                    }
                },
            },
            {
                name: 'Hard Reset!',
                shortcut: '',
                handler: async () => {
                    const dbs = await window.indexedDB.databases();
                    await Promise.all(
                        dbs.map((db: any) =>
                            window.indexedDB.deleteDatabase(db.name),
                        ),
                    );
                    localStorage.clear();
                    window.location.reload();
                },
            },
        ],
    },
];

async function newPlayerWindow() {
    const windows = await application.getWindows();
    const maxIndex = Math.max(...windows.values().map((w) => w.index));
    await application.createWindow({
        index: maxIndex + 1,
        closable: true,
        titlebarStyle: 'hidden',
        path: `${window.origin}/index.html`,
        width: 1152,
        height: 768,
        minWidth: 640,
        minHeight: 480,
    });
}

async function newTestRunnerWindow() {
    const windows = await application.getWindows();
    const maxIndex = Math.max(...windows.values().map((w) => w.index));
    await application.createWindow({
        index: maxIndex + 1,
        closable: true,
        path: '/src/tests/tests.html',
        titlebarStyle: 'hidden',
        width: 500,
        height: 700,
        minWidth: 500,
        minHeight: 700,
    });
}

function unhandledMenuSelection(parent: string, title: string) {
    alert(`unhandled menu item ${parent} -> ${title}`);
}

async function handleMenuSelection(parent: string, title: string) {
    if (title === '---') {
        return;
    }
    for (const item of menu) {
        if (item.name === parent) {
            for (const subitem of item.items) {
                if (subitem.name === title) {
                    if (subitem.handler) {
                        return subitem.handler();
                    }
                }
            }
        }
    }
    return unhandledMenuSelection(parent, title);
}

export async function setSystemMenu() {
    // setup menu
    if (!isMobile) {
        let menuString = '';
        for (const item of menu) {
            if (item.visible && !item.visible()) {
                continue;
            }
            menuString += `${item.name}:\n`;
            for (const subitem of item.items) {
                if (subitem.visible && !subitem.visible()) {
                    continue;
                }
                if (subitem.name === '---') {
                    menuString += '    ---\n';
                } else {
                    menuString += `    ${subitem.name}: ${subitem.shortcut}\n`;
                }
            }
            menuString += ';\n';
        }
        await application.setSystemMenu({ index: 0, value: menuString });

        window.addEventListener('menuItemSelected', (event) => {
            handleMenuSelection(event.detail.parent, event.detail.title).catch(
                (err) => console.error(err),
            );
        });
    }
}
