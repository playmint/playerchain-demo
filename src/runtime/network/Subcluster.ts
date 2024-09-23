import { Buffer } from 'socket:buffer';
import { isBufferLike } from 'socket:util';
import type Peer from './Peer';
import type { Keys } from './Peer';
import { Encryption } from './encryption';
import Packet, { CACHE_TTL } from './packets';

const MAX_BANDWIDTH = 1024 * 32;

export type SubclusterConfig = {
    clusterId: Uint8Array;
    rateLimit?: number; //MAX_BANDWIDTH;
    sharedKey: Uint8Array;
    signingKeys: Keys;
    localPeer: Peer;
};

export class Subcluster {
    clusterId: Uint8Array;
    scid: string;
    subclusterId: Uint8Array;
    rateLimit: number; //MAX_BANDWIDTH;
    sharedKey: Uint8Array;
    signingKeys: Keys;
    localPeer: Peer;
    onMsg?: (msg: Buffer) => void;
    onRPC?: (msg: Buffer) => void;

    constructor(config: SubclusterConfig) {
        this.signingKeys = config.signingKeys;
        this.subclusterId = this.signingKeys.publicKey;
        this.clusterId = config.clusterId;
        this.sharedKey = config.sharedKey;
        this.scid = Buffer.from(this.subclusterId).toString('base64');
        this.rateLimit = config.rateLimit ?? MAX_BANDWIDTH;
        this.localPeer = config.localPeer;
    }

    // find all peers connecetd to the localPeer that we know have
    // registreed an interest in this subcluster
    peers() {
        return Array.from(this.localPeer.peers.values()).filter((p) =>
            this.localPeer.peerMapping.get(p.peerId)?.has(this.scid),
        );
    }

    async stream(eventName, value, opts: any = {}) {
        opts.clusterId = this.clusterId;
        opts.subclusterId = this.subclusterId;

        let packets;

        const peers = this.peers();
        for (const p of peers) {
            const args = await this.pack(eventName, value, opts);
            const result = await p.localPeer.stream(p.peerId, this, args);
            if (!packets) {
                packets = result;
            }
        }
        return packets;
    }

    async publish(eventName, value, opts: any = {}) {
        opts.clusterId = this.clusterId;
        opts.subclusterId = this.subclusterId;

        const args = await this.pack(eventName, value, opts);

        const peers = this.peers();
        if (peers.length > 0) {
            console.log(
                'subcluster:publish rejected as there are peers - TODO allow this?',
            );
            // return sub.steram(eventName, value, opts);
        } else {
            return this.localPeer.publish(this, args);
        }
    }

    async pack(eventName: string, value: any, opts?: { ttl: number }) {
        if (eventName.length === 0) {
            throw new Error('event name too short');
        }

        if (opts?.ttl) {
            opts.ttl = Math.min(opts.ttl, CACHE_TTL);
        }

        const args: any = {
            clusterId: this.clusterId,
            ...opts,
            usr1: Buffer.from(eventName, 'utf8'),
        };

        if (!isBufferLike(value) && typeof value === 'object') {
            try {
                args.message = Buffer.from(JSON.stringify(value));
            } catch (err) {
                console.error(`pack-err: ${err}`);
            }
        } else {
            args.message = Buffer.from(value);
        }

        args.usr2 = Buffer.from(this.signingKeys.publicKey);
        args.sig = Encryption.sign(args.message, this.signingKeys.privateKey);

        return args;
    }

    // TODO: move to peer, why is this here?
    async unpack(packet): Promise<{ opened?: Buffer; verified?: boolean }> {
        let verified;
        const scid = Buffer.from(packet.subclusterId).toString('base64');
        if (this.scid !== scid) {
            return {};
        }

        const opened = await this.localPeer.open(packet.message, scid);

        if (!opened) {
            console.log('UNOPENED', packet);
            return {};
        }

        if (packet.sig) {
            try {
                //if (Encryption.verify(opened, packet.sig, packet.usr2)) {
                verified = true;
                //}
            } catch (_err) {
                console.log('UNVERIFIED', packet);
                return {};
            }
        }

        return { opened: Buffer.from(opened), verified };
    }

    async onPacket(packet: Packet) {
        const { verified, opened } = await this.unpack(packet);
        // if (verified) {
        //     packet.verified = true;
        // }
        // if (_peer.onDebug) {
        //     _peer.onDebug(
        //         _peer.peerId,
        //         `<-- SUBCLUSTER EMIT PACKET (pid=${packet.packetId.toString('hex').slice(0, 6)})`,
        //     );
        // }
        if (!opened) {
            console.warn('ignoring unopened');
            return;
        }
        if (!verified) {
            console.warn('ignoring unverified');
            return;
        }
        const eventName = packet.usr1.toString('utf8');
        switch (eventName) {
            case 'msg':
                if (this.onMsg) {
                    this.onMsg(opened);
                }
                return;
            case 'rpc':
                if (this.onRPC) {
                    this.onRPC(opened);
                }
                return;
            default:
                console.warn('unknown event', eventName);
                return;
        }
    }
}
