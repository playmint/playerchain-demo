import Buffer from 'socket:buffer';
import EventEmitter from 'socket:events';
import { Encryption, network } from 'socket:network';
import { Channel, Keypair, Packet, Transport } from '../types';
import { isInputPacket } from '../utils';

const CLUSTER_ID = 'SUBSTREM_GAME_CLUSTER_570C5DB1-4CC2-4753-86ED-2212A93A8E9E';

export class SocketTransport implements Transport {
    peerId: Uint8Array;
    signingKeys: Keypair;
    channel: Channel;
    subcluster?: EventEmitter;
    onPacket?: ((packet: Packet) => void) | undefined;
    _ready: Promise<void>;
    peers: any[] = [];

    // temp
    port?: number;
    address?: string;

    constructor({
        channel,
        peerId,
        signingKeys,
        port,
        address,
    }: {
        peerId: Uint8Array;
        channel: Channel;
        signingKeys: Keypair;
        port?: number;
        address?: string;
    }) {
        console.log('using socket transport:', channel.name);
        this.signingKeys = signingKeys;
        this.peerId = peerId;
        this.channel = channel;
        this._ready = this.init();
        this.port = port;
        this.address = address;
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
        this.subcluster = await net.subcluster({
            sharedKey: subclusterSharedKey,
        });
        if (!this.subcluster) {
            throw new Error('Failed to create subcluster');
        }

        // this.subcluster.on('action', this.processIncomingPacket.bind(this));
        this.subcluster.on('#join', (peer) => {
            peer.on('action', this.processIncomingPacket.bind(this));
            console.log(
                '#################### JOINED SUBCLUSTER ####################',
            );
            console.log(`[${this.peerId}] gained a friend:`, peer.peerId);
            console.log(
                '###########################################################',
            );
            this.peers.push(peer);
            peer.emit('HELO', Buffer.from('HELO'));
        });

        for (;;) {
            if (this.peers.length > 0) {
                console.log('CONNECTED');
                break;
            }
            console.log(`[${this.peerId}]`, 'waiting for peer');
            this.subcluster.emit('HELO', Buffer.from('HELO'));
            (this.subcluster as unknown as any).join();
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        this.subcluster.on('#error', (...args) => {
            console.log('#error', ...args);
        });
        this.subcluster.on('#debug', (...args) => {
            console.log('#debug', ...args);
        });
    }

    private processIncomingPacket(bytes: unknown, metadata: unknown) {
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
        if (typeof bytes !== 'object' || bytes === null) {
            console.warn('recv invalid bytes: expected object got:', bytes);
            return;
        }
        try {
            const data = JSON.parse(Buffer.from(bytes).toString());
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
            console.error('failed to parse packet', bytes, err);
        }
    }

    sendPacket(packet: Packet): boolean {
        if (!this.subcluster) {
            console.error('attempt to use subcluster before ready');
            return false;
        }
        this.peers.forEach((peer) => {
            try {
                // console.log(`[${this.peerId}]`, 'DIRECT SEND >>', peer.peerId);
                peer.emit('action', Buffer.from(JSON.stringify(packet))).catch(
                    (err) => {
                        console.error('DIRECT SEND FAIL', err);
                    },
                );
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
