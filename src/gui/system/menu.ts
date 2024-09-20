import application from 'socket:application';
import process from 'socket:process';
import { sleep } from '../../runtime/timers';
import { hardReset } from '../../runtime/utils';

const isMobile = /android|ios/.test(process.platform);
export const isWindows = /win32/.test(process.platform);
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

export const devMenu: Menu = {
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
            shortcut: '1',
            handler: newTestRunnerWindow,
        },
        {
            name: '---',
        },
        {
            name: 'Rebuild state',
            shortcut: '2',
            handler: async () => {
                const w = window as any;
                if (w.db) {
                    await w.db.state.clear();
                }
            },
        },
        {
            name: 'Hard Reset!',
            shortcut: '3',
            handler: async () => {
                hardReset()
                    .then(() => sleep(1000))
                    .then(() => window.location.reload())
                    .catch((err) => alert(`hard-reset-fail: ${err}`));
            },
        },
    ],
};

const sysMenu: Menu[] = [
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
    devMenu,
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

async function handleMenuSelection(
    menu: Menu[],
    parent: string,
    title: string,
    isContextMenu?: boolean,
) {
    for (const item of menu) {
        if (!isContextMenu && item.name !== parent) {
            continue;
        }
        for (const subitem of item.items) {
            if (subitem.name === title) {
                if (subitem.handler) {
                    return subitem.handler();
                }
            }
        }
    }
    if (title === '---') {
        return;
    }
    return unhandledMenuSelection(parent, title);
}

export async function setSystemMenu() {
    if (isWindows) {
        // causes duplicate menus on windows
        // for now we are putting important items in the "menu" button top right
        // of the layout.
        return;
    }
    if (globalThis.__hasSetSystemMenu) {
        return;
    }
    globalThis.__hasSetSystemMenu = true;
    // setup menu
    if (!isMobile) {
        const menuString = toMenuString(sysMenu);
        const win = await application.getCurrentWindow();
        await application.setSystemMenu({
            index: win.index,
            value: menuString,
        });

        window.addEventListener('menuItemSelected', (event) => {
            handleMenuSelection(
                sysMenu,
                event.detail.parent,
                event.detail.title,
            ).catch((err) => console.error(err));
        });
    }
}

export async function setContextMenu(menu: Menu[]) {
    if (isMobile) {
        return;
    }
    const menuString = toMenuString(menu, true);
    const win = await application.getCurrentWindow();
    await win
        .setContextMenu({
            index: win.index,
            value: menuString,
        })
        .then((value) =>
            handleMenuSelection(menu, '---', value as unknown as string, true),
        );
}

function toMenuString(menu: Menu[], isContext?: boolean) {
    let menuString = '';
    for (const item of menu) {
        if (item.visible && !item.visible()) {
            continue;
        }
        if (!isContext) {
            // context menus don't have titles
            menuString += `\n${item.name}:\n`;
        }
        for (const subitem of item.items) {
            if (subitem.visible && !subitem.visible()) {
                continue;
            }
            if (subitem.name === '---') {
                menuString += '    ---\n';
            } else {
                menuString += `    ${subitem.name}: ${isContext ? subitem.name : subitem.shortcut}\n`;
            }
        }
        menuString = menuString.slice(0, -1) + (isContext ? '' : ';');
    }
    return menuString;
}
