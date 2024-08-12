import { QuickJSContext, getQuickJS } from 'quickjs-emscripten';
import { InputPacket } from '../network/types';

export class Updater {
    constructor() {}

    static async create({
        renderPort,
        updaterPort,
    }: {
        renderPort: MessagePort;
        updaterPort: MessagePort;
    }) {
        const instance = new Updater();

        console.log('Creating QuickJS context');

        const sandbox = await (await fetch('/sandbox.js')).text();

        const QuickJS = await getQuickJS();
        const vm = QuickJS.newContext();

        const consoleHandle = this.getConsoleHandle(vm);
        vm.setProp(vm.global, 'console', consoleHandle);

        const sandboxInitResult = vm.evalCode(sandbox, 'sandbox.js');

        if (sandboxInitResult.error) {
            console.log('Execution failed:', vm.dump(sandboxInitResult.error));
            sandboxInitResult.error.dispose();
        } else {
            console.log('Success:', vm.dump(sandboxInitResult.value));
            sandboxInitResult.value.dispose();
        }

        updaterPort.onmessage = ({
            data: actionsByRound,
        }: {
            data: InputPacket[][];
        }) => {
            if (!actionsByRound[0]) {
                console.warn('actionsByRound[0] is undefined');
                return;
            }
            if (!actionsByRound[0][0]) {
                console.warn('actionsByRound[0][0] is undefined');
                return;
            }

            const actionsByRoundJSON = JSON.stringify(actionsByRound);
            const result = vm.evalCode(`update('${actionsByRoundJSON}');`);

            if (result.error) {
                console.log('Execution failed:', vm.dump(result.error));
                result.error.dispose();
            } else {
                // console.log('Success:', vm.dump(result.value));
                result.value.dispose();
            }
        };

        // vm.dispose();

        return instance;
    }

    private static getConsoleHandle(vm: QuickJSContext) {
        const consoleHandle = vm.newObject();

        const logHandle = vm.newFunction('log', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.log(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'log', logHandle);

        const warnHandle = vm.newFunction('warn', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.warn(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'warn', warnHandle);

        const errorHandle = vm.newFunction('error', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.error(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'error', errorHandle);

        const debugHandle = vm.newFunction('debug', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.debug(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'debug', debugHandle);

        return consoleHandle;
    }
}
