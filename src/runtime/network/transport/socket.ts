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
            // temp overrides for farms to talk to self
            // FIXME: remove this or expose it properly via config
            port: this.port,
            probeInternalPort: this.port ? this.port + 1 : 0,
            address: this.address,
        });

        await new Promise((resolve, reject) => {
            net.on('#ready', () => {
                console.log('Network is kinda ready...');
                resolve(true);
            });

            net.on('#error', (err) => {
                console.error('Network failed to setup:', err);
                reject(err);
            });
        });
        // Should be ready here...
        console.log('Network is ready!');

        const sharedSecret = this.channel.secret;
        const subclusterSharedKey =
            await Encryption.createSharedKey(sharedSecret);
        this.subcluster = await net.subcluster({
            sharedKey: subclusterSharedKey,
        });
        if (!this.subcluster) {
            throw new Error('Failed to create subcluster');
        }

        this.subcluster.on('action', this.processIncomingPacket.bind(this));
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

    sendPacket(packet: Packet): void {
        if (!this.subcluster) {
            console.error('attempt to use subcluster before ready');
            return;
        }
        this.subcluster.emit('action', Buffer.from(JSON.stringify(packet)));
        // console.log(
        //     'sent packet:',
        //     packet,
        //     'to',
        //     (this.subcluster as any).peers?.size ?? 0,
        // );
    }
}
