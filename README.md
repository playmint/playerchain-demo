# &nbsp; ![playerchainBanner_2](https://github.com/user-attachments/assets/1f195369-23d2-45ed-9358-1a9014b7d15a)

> [!NOTE]  
> _Playerchains are a peer-to-peer network architecture for running **responsive,** **multiplayer** games that are **decentralised** and **verifiable**._

### We’ve built a demo game you can play!
<p align="left">
<img src="https://github.com/user-attachments/assets/2ba2e026-c9ec-47b9-ade4-84f8aca77d40" width="400" />
</p>

### Download and start a playerchain with your friends

[![Download button](https://custom-icon-badges.demolab.com/badge/-Download-blue?style=for-the-badge&logo=download&logoColor=white "Download zip")](https://github.com/playmint/playerchain-demo/releases/latest)

<br />

> [!TIP]  
> _By playing the game together, you and your friends become nodes on your own playerchain._

<br />

## Why Playerchains?

_Playerchains are a way for players to have full control of their own responsive, multiplayer games without relying on anyone or anything beyond their own gaming machine._

:balance_scale: &nbsp; We’re interested in moving control of your games away from corporations back to you!

:desktop_computer: &nbsp; For multiplayer games, that means removing the reliance on central servers.

:atom_symbol: &nbsp; Public blockchains are decentralised, but you still rely on external compute. This is expensive and constrains performance.

:white_check_mark: &nbsp; Playerchains remove reliance on anyone outside your game’s group.

<br />

## How do Playerchains work?

:handshake: &nbsp; Games built on playerchain netcode allow the player's machines to connect and share inputs in realtime.

:ledger: &nbsp; Each player maintains their own history of actions and connected players combine this into a [DAG](https://en.wikipedia.org/wiki/Directed_acyclic_graph).

:stopwatch: &nbsp; Cutting edge distributed systems protocols ensure everyone agrees on the inputs with fast finality.

:crystal_ball: &nbsp; Game logic runs in deterministic lockstep with prediction and rollback; an established netcode pattern.

:lock_with_ink_pen: &nbsp; Inputs are cryptographically signed, so gameplay and results are provable and allow for player attestations.

:chains: &nbsp; This unlocks interop with blockchains, leaderboard servers, community tools, or other playerchain games.

:crown: &nbsp; Each player maintains their own sovereign blockchain with an immutable history of their actions.

:atom_symbol: &nbsp; The individual chains combine to form an emergent blocklace.

:earth_africa: &nbsp; This global lattice, with a plurality of partial views, opens up new possibilities for connecting worlds.

:speech_balloon: &nbsp; If you have comments or feedback, we'd love to hear from you! Come speak to us [in discord](https://discord.com/invite/VdXWWNaqGN)

<br />

## Contributors

### Todo
- [x] Instructions to build and run from source
- [ ] Host a prebuilt ssc from the Playmint/Socket fork
- [ ] Licensing info
- [ ] Guidance for contributors

### To build and run from source

>[!WARNING]
>building ssc has platform specific dependencies that we don't document, but we hope to provide a prebuilt install package in future.

build `ssc` from the `playmint-next` branch of [playmint/socket](https://github.com/playmint/socket)

```
macos:

rm -rf build; ./bin/clean.sh && NO_IOS=1 NO_ANDROID=1 VERBOSE=1 ./bin/install.sh


windows:

rm -force .\build\ ; .\bin\install.ps1 -verbose
```

then ...
- run `pnpm i` to install stuff
- run `pnpm dev` to run dev build with hmr or `npm start` to run dev build close to prod
- run `pnpm build` to build prod (but you will need an apple id setup - the github action does this for you

<br />

## References & Inspiration

- :memo: &nbsp; [Blocklace paper](https://arxiv.org/abs/2402.08068)
- :memo: &nbsp; [Cordial Miners paper](https://arxiv.org/abs/2205.09174)
- :memo: &nbsp; [Latica p2p protocol](https://socketsupply.qa/guides#Network%20Protocol)
