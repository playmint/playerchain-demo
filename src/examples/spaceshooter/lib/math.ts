// abs, acos, acosh, asin, asinh, atan, atan2,
// atanh, cbrt, ceil, clz32, cos, cosh, exp, expm1,
// floor, hypot, log, log10, log1p, log2, max,
// min, pow, round, sign, sin, sinh, sqrt, tan, tanh,
// trunc

export function patchMathLib() {
    console.log('patching math lib');

    [
        'abs',
        'acos',
        'acosh',
        'asin',
        'asinh',
        'atan',
        'atan2',
        'atanh',
        'cbrt',
        'ceil',
        'clz32',
        'cos',
        'cosh',
        'exp',
        'expm1',
        'floor',
        'hypot',
        'log',
        'log10',
        'log1p',
        'log2',
        'max',
        'min',
        'pow',
        'round',
        'sign',
        'sin',
        'sinh',
        'sqrt',
        'tan',
        'tanh',
        'trunc',
    ].forEach((funcName) => {
        globalThis.Math[funcName] = (function (originalFunc) {
            return function (...args) {
                return Math.fround(originalFunc.apply(Math, args));
            };
        })(Math[funcName]);
    });
}

// Random seed and random number generator as explained in https://github.com/bryc/code/blob/master/jshash/PRNGs.md

export function xmur3(str: string) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        (h = Math.imul(h ^ str.charCodeAt(i), 3432918353)),
            (h = (h << 13) | (h >>> 19));
    }
    return function () {
        (h = Math.imul(h ^ (h >>> 16), 2246822507)),
            (h = Math.imul(h ^ (h >>> 13), 3266489909));
        return (h ^= h >>> 16) >>> 0;
    };
}

export function mulberry32(a: number) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return Math.fround(((t ^ (t >>> 14)) >>> 0) / 4294967296);
    };
}
