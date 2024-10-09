# Playerchains

Playerchains are a network architecture for running **responsive,** **multiplayer** games that are **decentralised** and **verifiable**.

We’ve built a Playerchain demo game for you to play.

Start a Playerchain with your friends.

**Download the Demo** <br>
[Stable](https://github.com/playmint/playerchain-demo/releases/tag/v0.0.33) <br>
[Latest](https://github.com/playmint/playerchain-demo/releases/latest)

By playing our Space Shooter game, you become a node on your own Playerchain along with the other players in the session.


## Why Playerchains

***Playerchains are a way for players to have full control of their own responsive, multiplayer games without relying on anyone or anything beyond their own gaming machine.***

We’re interested in moving control of your games away from corporations back to you. For multiplayer games, that means removing the reliance on servers.

One way to do that is run games on a public blockchain because these run on a decentralised set of nodes. We’ve tried this and its a step in the right direction but they’re not capable of running responsive games and games rely on blockchain nodes.

Playerchains remove any reliance on anyone outside your game’s group.


## How do Playerchains work?

Game code built on Playerchain netcode allows each player’s machine to connect and share their inputs with each other in realtime. 

Cutting edge distributed systems protocols ensure everyone agrees on everyone else’s inputs with fast finality. Specifically each player maintains their own history of actions and connected players combine this into a DAG structure.

Deterministic game logic runs in lockstep with prediction and rollback; an established patter for multiplayer game netcode.

Each input is cryptographically signed so whole game sessions can be verified and results attributed to the players. This could be on a blockchain, on a leaderboard server or someone else’s Playerchain game.

Under the hood, each player essentially maintains their own sovereign blockchain containing an immutable history of their actions. The individual chains combine to form a blocklace. The nature of a global lace with different partial views opens up possibilities for new ways to persist and connect worlds that we are still exploring.


## Contribute

[Check out our contributors page](CONTRIBUTE.md)
