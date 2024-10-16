import _sodium from 'libsodium-wrappers';
import { Buffer } from 'socket:buffer';
import { isBufferLike } from 'socket:util';
import { ChainMessage, Message, MessageType, decodeMessage } from '../messages';
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
    onMsg?: (msg: Message, id: string) => void;
    onRPC?: (msg: Buffer) => void;
    seen: Set<string> = new Set();

    constructor(config: SubclusterConfig) {
        this.signingKeys = config.signingKeys;
        this.subclusterId = this.signingKeys.publicKey;
        this.clusterId = config.clusterId;
        this.sharedKey = config.sharedKey;
        this.scid = Buffer.from(this.subclusterId).toString('base64');
        this.rateLimit = config.rateLimit ?? MAX_BANDWIDTH;
        this.localPeer = config.localPeer;
    }

    async set(key: string, value: any) {
        this[key] = value;
    }

    // find all peers connecetd to the localPeer that we know have
    // registreed an interest in this subcluster
    private peers() {
        return Array.from(this.localPeer.peers.values()).filter((p) =>
            this.localPeer.peerMapping.get(p.peerId)?.has(this.scid),
        );
    }

    async getPeerInfo() {
        return this.peers().map((p) => ({
            peerId: p.peerId,
            connected: !!p.connected,
            proxy: !!p.proxies.size,
        }));
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
                    const m = decodeMessage(opened);
                    if (m.type !== MessageType.KEEP_ALIVE) {
                        // verify it
                        const [verified, id] = await this.verify(m);
                        if (!verified) {
                            return;
                        }
                        if (!id) {
                            return;
                        }
                        if (!m.sig) {
                            return;
                        }
                        // if (m.type === MessageType.INPUT) {
                        //     const sig = Buffer.from(m.sig).toString('hex');
                        //     if (this.seen.has(sig)) {
                        //         console.log('seen that one');
                        //         return;
                        //     }
                        //     this.seen.add(sig);
                        // }
                        this.onMsg(m, id);
                    } else {
                        this.onMsg(m, '');
                    }
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

    async verify(msg: ChainMessage): Promise<[true, string] | [false, null]> {
        await _sodium.ready;
        const sodium = _sodium;
        // return true;
        try {
            const { sig, ...unsigned } = msg;
            if (!sig) {
                throw new Error('no-sig');
            }
            const hash = await this.hash(unsigned);
            const pk = msg.peer;
            if (!pk) {
                throw new Error('no-pk');
            }
            const ok = sodium.crypto_sign_verify_detached(sig, hash, pk);
            if (!ok) {
                return [false, null];
            }
            // 64bits of the hash is the id
            // FIXME: we should think about this carefully!
            // this truncation does not affect the signature, but it does affect
            // the acks which are based on the id ... the pool of ids is not global
            // as it is per peer set, so _some_ truncation here can be tollerated
            // but it is possible for collisions in the db, so we may need to
            // store the with a composite key of peer and id
            const id = Buffer.from(hash.slice(0, 8)).toString('base64');
            return [true, id];
        } catch (err) {
            console.error(`
                verify-error
                msg=${msg}
                err=${err}
            `);
            return [false, null];
        }
    }

    async hash(msg: ChainMessage): Promise<Uint8Array> {
        await _sodium.ready;
        const sodium = _sodium;
        const values = [
            Buffer.from(msg.peer).toString('hex'),
            msg.parent ? Buffer.from(msg.parent).toString('base64') : null,
            msg.height,
            msg.type,
            msg.acks
                ? msg.acks.map((a) => Buffer.from(a).toString('base64'))
                : [],
            (msg as any).data || 0,
            (msg as any).round || 0,
        ];
        const data = JSON.stringify(values);
        // FIXME: is "BYTES_MIN" enough?
        return sodium.crypto_generichash(
            sodium.crypto_generichash_BYTES_MIN,
            data,
        );
    }
}
