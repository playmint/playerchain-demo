import platform from 'runtime:platform';
import { sleep } from '../../runtime/timers';
import { hardReset } from '../../runtime/utils';

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

const devMenu: Menu = {
    name: 'Dev',
    visible: () => true,
    items: [
        {
            name: 'New Player',
            shortcut: 'p + CommandOrControl',
            handler: platform.newPlayerWindow,
        },
        {
            name: '---',
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
        name: 'PlayerchainDemo',
        items: [
            {
                name: 'About PlayerchainDemo',
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
                visible: () => platform.os == 'darwin',
            },
            {
                name: 'Hide Others',
                shortcut: 'h + Control + Meta',
                visible: () => platform.os == 'darwin',
            },
            {
                name: '---',
                visible: () => platform.os == 'darwin',
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
}

export async function setSystemMenu() {
    if (platform.isWindows) {
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
    if (!platform.isMobile) {
        const menuString = toMenuString(sysMenu);
        const index = await platform.getCurrentWindowIndex();
        await platform.setSystemMenu({
            index,
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
