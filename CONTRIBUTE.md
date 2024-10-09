# playerchain demo

proof of concept playerchain demonstration

[download](https://github.com/playmint/playerchain-demo/releases/latest)

### contributors

To build and run from source...

build `ssc` from the `playmint-next` branch of playmint/socket
```
macos:

rm -rf build; ./bin/clean.sh && NO_IOS=1 NO_ANDROID=1 VERBOSE=1 ./bin/install.sh


windows:

rm -force .\build\ ; .\bin\install.ps1 -verbose
```

then ...

run `pnpm i` to install stuff

run `pnpm dev` to run dev build with hmr or `npm start` to run dev build close to prod

run `pnpm build` to build prod (but you will need an apple id setup - the github action does this for you
