import { QuickJSContext, getQuickJS } from 'quickjs-emscripten';
import { InputPacket } from '../network/types';

export class Updater {
    constructor() {}

    public prevEntities: any;

    static async create({
        renderPort,
        updaterPort,
    }: {
        renderPort: MessagePort;
        updaterPort: MessagePort;
    }) {
        const instance = new Updater();

        console.log('Creating QuickJS context');

        const sandboxBundle = await (await fetch('/sandbox/index.js')).text();

        const QuickJS = await getQuickJS();
        const runtime = QuickJS.newRuntime();
        const vm = runtime.newContext();

        const consoleHandle = this.getConsoleHandle(vm);
        vm.setProp(vm.global, 'console', consoleHandle);
        consoleHandle.dispose();

        const sandboxInitResult = vm.evalCode(sandboxBundle, 'index.js');

        if (sandboxInitResult.error) {
            console.log(
                'Bundle eval failed:',
                vm.dump(sandboxInitResult.error),
            );
            sandboxInitResult.error.dispose();
        } else {
            console.log(
                'Bundle eval Success:',
                vm.dump(sandboxInitResult.value),
            );
            sandboxInitResult.value.dispose();
        }

        let _prevEntities: any;

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

            console.time('updateLogic');

            console.time('evalCode');
            const result = vm.evalCode(
                `update(${JSON.stringify(actionsByRound)});`,
            );
            console.timeEnd('evalCode');

            if (result.error) {
                console.log('Update eval failed:', vm.dump(result.error));
                result.error.dispose();
            } else {
                console.time('dump');
                const entities = vm.dump(result.value);
                _prevEntities = entities;
                console.timeEnd('dump');

                result.value.dispose();

                console.timeEnd('updateLogic');
                // renderPort.postMessage(entities);
            }

            // const mem = QuickJS.getWasmMemory();
            // const used = mem.buffer.byteLength;
            // console.log(`Memory used: ${used / 1024 / 1024} MB`);
            // console.log(runtime.dumpMemoryUsage());
        };

        return instance;
    }

    private static getConsoleHandle(vm: QuickJSContext) {
        const consoleHandle = vm.newObject();

        const logHandle = vm.newFunction('log', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.log(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'log', logHandle);
        logHandle.dispose();

        const warnHandle = vm.newFunction('warn', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.warn(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'warn', warnHandle);
        warnHandle.dispose();

        const errorHandle = vm.newFunction('error', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.error(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'error', errorHandle);
        errorHandle.dispose();

        const debugHandle = vm.newFunction('debug', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.debug(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'debug', debugHandle);
        debugHandle.dispose();

        const timeHandle = vm.newFunction('time', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.time(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'time', timeHandle);
        timeHandle.dispose();

        const timeEndHandle = vm.newFunction('timeEnd', (...args) => {
            const nativeArgs = args.map(vm.dump);
            console.timeEnd(...nativeArgs);
        });
        vm.setProp(consoleHandle, 'timeEnd', timeEndHandle);
        timeEndHandle.dispose();

        return consoleHandle;
    }
}
