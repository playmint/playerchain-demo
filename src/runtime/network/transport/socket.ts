import Buffer from 'socket:buffer';
import EventEmitter from 'socket:events';
import { Encryption, network } from 'socket:network';
import { MessageEncoder } from '../messages';
import { Channel, Keypair, Packet, Transport } from '../types';
import { isInputPacket } from '../utils';

const CLUSTER_ID =
    'SUBSTREM_GAME_CLUSTER_570C5DB1-4CC2-4753-86ED-2212A93A8E9E_2';

export class SocketTransport implements Transport {
    peerId: Uint8Array;
    signingKeys: Keypair;
    channel: Channel;
    subcluster?: EventEmitter;
    onPacket?: ((packet: Packet) => void) | undefined;
    _ready: Promise<void>;
    peers: any[] = [];
    numPlayers: number;
    enc: MessageEncoder;

    // temp
    port?: number;
    address?: string;

    constructor({
        channel,
        peerId,
        signingKeys,
        port,
        address,
        numPlayers,
        enc,
    }: {
        peerId: Uint8Array;
        channel: Channel;
        port?: number;
        address?: string;
        signingKeys: Keypair;
        numPlayers: number;
        enc: MessageEncoder;
    }) {
        console.log('using socket transport:', channel.name);
        this.signingKeys = signingKeys;
        this.peerId = peerId;
        this.channel = channel;
        this.port = port;
        this.address = address;
        this.numPlayers = numPlayers;
        (this.enc = enc), (this._ready = this.init());
    }

    async ready(): Promise<void> {
        return this._ready;
    }

    async init(): Promise<void> {
        const clusterId = await Encryption.createClusterId(CLUSTER_ID);
        const net = await network({
            clusterId,
            peerId: this.peerId,
            signingKeys: this.signingKeys,
            limitExempt: true,
            worker: false,
            // temp overrides for farms to talk to self
            // FIXME: remove this or expose it properly via config
            port: this.port,
            probeInternalPort: this.port ? this.port + 1 : 0,
            address: this.address,
        });

        await new Promise((resolve, reject) => {
            let resolved = false;
            net.on('#ready', (info) => {
                console.log('Peer ready', info);
                if (!resolved) {
                    resolved = true;
                    resolve(true);
                }
            });

            net.on('#error', (err) => {
                console.error('Network failed to setup:', err);
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });
        });

        // net.on('#debug', (...args) => {
        //     console.log('#network debug:', ...args);
        // });

        const sharedSecret = this.channel.secret;
        const subclusterSharedKey =
            await Encryption.createSharedKey(sharedSecret);
        const subcluster = (this.subcluster = await net.subcluster({
            sharedKey: subclusterSharedKey,
        }));
        if (!subcluster) {
            throw new Error('Failed to create subcluster');
        }

        // horible hack for key exchange
        // just keep annoucing our public key
        setInterval(() => {
            subcluster.emit('key', this.signingKeys.publicKey);
        }, 5000);

        subcluster.on('#join', (peer) => {
            const existingPeer = this.peers.find(
                (p) => p.peerId === peer.peerId,
            );
            if (existingPeer) {
                console.log('peer already exists');
                return;
            }
            this.peers.push(peer);
            peer.on('key', (key) => {
                this.enc.keys.set(Buffer.from(peer.peerId).toString(), key);
            });
            peer.on('action', (b, metadata) => {
                this.processIncomingPacket(b, metadata);
            });
            console.log(
                '#################### JOINED SUBCLUSTER ####################',
            );
            console.log(`[${this.peerId}] gained a friend:`, peer.peerId);
            console.log(
                '###########################################################',
            );
            peer.emit('key', this.signingKeys.publicKey);
        });

        for (;;) {
            if (this.enc.keys.size == this.numPlayers) {
                console.log('CONNECTED');
                break;
            }
            console.log(
                `[${this.peerId}]`,
                `waiting for all ${this.numPlayers} public keys`,
            );
            // (this.subcluster as unknown as any).join();
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        subcluster.on('#error', (...args) => {
            console.log('#error', ...args);
        });
        subcluster.on('#debug', (...args) => {
            console.log('#debug', ...args);
        });
    }

    private processIncomingPacket(buf: Buffer, metadata: unknown) {
        if (typeof metadata !== 'object' || metadata === null) {
            console.warn(
                'recv invalid metadata: expected object got:',
                metadata,
            );
            return;
        }
        if (!('verified' in metadata) || !metadata.verified) {
            console.warn('recv unverified packet', metadata);
            return;
        }
        try {
            const { msg: data } = this.enc.decode(buf);
            if (!isInputPacket(data)) {
                console.warn('recv invalid packet', data);
                return;
            }
            if (!this.onPacket) {
                console.warn('recv packet but no handler', data);
                return;
            }
            this.onPacket(data);
        } catch (err) {
            console.error('failed to parse packet', buf, err);
        }
    }

    sendPacket(buf: Buffer): boolean {
        if (!this.subcluster) {
            console.error('attempt to use subcluster before ready');
            return false;
        }
        if (this.peers.length === 0) {
            console.error('no friends to send to');
            return false;
        }

        this.peers.forEach((peer) => {
            try {
                // console.log(`[${this.peerId}]`, 'DIRECT SEND >>', peer.peerId);
                peer.emit('action', buf).catch((err) => {
                    console.error('DIRECT SEND FAIL', err);
                });
            } catch (err) {
                console.log('DIRECT FAIL', err);
            }
        });
        return true;
        // console.log(
        //     'sent packet:',
        //     packet,
        //     'to',
        //     (this.subcluster as any).peers?.size ?? 0,
        // );
    }
}
