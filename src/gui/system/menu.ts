import application from 'socket:application';
import process from 'socket:process';
import { hardReset } from '../../runtime/utils';

const isMobile = ['android', 'ios'].includes(process.platform);
const isWindows = ['win32', 'win'].includes(process.platform);
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
                shortcut: '4',
                handler: newTestRunnerWindow,
            },
            {
                name: '---',
            },
            {
                name: 'Rebuild state',
                shortcut: '6',
                handler: async () => {
                    const w = window as any;
                    if (w.db) {
                        await w.db.state.clear();
                    }
                },
            },
            {
                name: 'Hard Reset!',
                shortcut: '7',
                handler: async () => {
                    hardReset()
                        .then(() => window.location.reload())
                        .catch((err) =>
                            console.error(`hard-reset-fail: ${err}`),
                        );
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

export async function setContextMenu() {
    // WORK ON THIS
    console.log('1');
    const win = await application.getCurrentWindow();
    console.log('2');
    const menuString = toMenuString(menuWin);
    console.log('3');
    console.log('Menu String:\n', menuString);
    await win.setContextMenu({ index: 0, value: menuString });
    console.log('4');
    
    window.addEventListener('menuItemSelected', (event) => {
        handleMenuSelection(event.detail.parent, event.detail.title).catch(
            (err) => console.error(err),
        );
    });
    
    console.log('5');

}

// problems:
// 1) by default there were spaces and Edit and Other were not visible, when I removed the spaces, they were visible 
// 2) NEEDS to have a shortcut !?
// I realised that there was 0 difference with the const string and the build string... so I added a sleep timer and it started working. (but shortcuts can't be empty)
const testMenu = `
        App:
          Foo: f
          Bar: b;
        Edit:
          Cut: x
          Copy: c
          Paste: v
          Delete: _
          Select All: a;
        Other:
          Apple: _
          Another Test: T
          !Im Disabled: I
          Some Thing: S + Meta
          ---
          Bazz: s + Meta, Control, Alt;
      `;

const menuSubstream = `
        Dev:
          New Player: p + CommandOrControl
          ---
          View Test Runner: 1
          ---
          Rebuild state: 2
          Hard Reset!: 3;`;

export async function setSystemMenu() {
    // if (isWindows) {
    //     return;
    // }
    // setup menu
    if (!isMobile) {
        const menuMacString = toMenuString(menu);
        //const menuWinString = toMenuString(menuWin);
        console.log(menuMacString);
        //console.log('menuSubstream:', menuSubstream, 'menuWinString:', menuWinString);
        // wait 1 second
        await new Promise((resolve) => setTimeout(resolve, 100));
        await application.setSystemMenu({ index: 0, value: menuMacString });
        
        window.addEventListener('menuItemSelected', (event) => {
            handleMenuSelection(event.detail.parent, event.detail.title).catch(
                (err) => console.error(err),
            );
        });
    }
}

function toMenuString(inputMenu: Menu[]) {
    let menuString = '';
    for (const item of inputMenu) {
        console.log('trying to add:', item.name, 'subitems:', item.items.length);
        if (item.visible && !item.visible()) {
            console.log('skipped item:', item.name);
            continue;
        }
        menuString += `\n${item.name}:\n`;
        for (const subitem of item.items) {
            if (subitem.visible && !subitem.visible()) {
                console.log('skipped subitem:', subitem.name);
                continue;
            }
            if (subitem.name === '---') {
                menuString += '    ---\n';
            } else {
                menuString += `    ${subitem.name}: ${subitem.shortcut}\n`;
            }
        }
        menuString = menuString.slice(0, -1) + ';';
    }
    return menuString;
}

const menuWin: Menu[] = [
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
                        .then(() => window.location.reload())
                        .catch((err) =>
                            console.error(`hard-reset-fail: ${err}`),
                        );
                },
            },
        ],
    },

];