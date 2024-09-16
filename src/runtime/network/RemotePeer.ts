import { ByRandom } from '../utils';
import type Peer from './Peer';
import { Encryption } from './encryption';
import Packet, { PacketPublish, PacketPublishProxied } from './packets';

const MAX_BANDWIDTH = 1024 * 32;

export type RemotePeerConfig = {
    peerId: string;
    address: string;
    port: number;
    natType: number;
    indexed?: boolean;
    clusterId?: string;
    subclusterId?: string;
    clock?: number;
    localPeer: Peer;
};

/**
 * A `RemotePeer` represents an initial, discovered, or connected remote peer.
 * Typically, you will not need to create instances of this class directly.
 */
export class RemotePeer {
    peerId: string;
    address: string;
    port = 0;
    natType: number;
    clusters = {};
    pingId = null;
    distance = 0;
    connected: boolean = false;
    opening = 0;
    probed = 0;
    proxies: Map<string, RemotePeer> = new Map();
    clock = 0;
    uptime = 0;
    lastUpdate = 0;
    lastRequest = 0;
    localPeer: Peer;
    indexed?: boolean;
    socket?: any;

    /**
     * `RemotePeer` class constructor.
     */
    constructor(o: RemotePeerConfig) {
        this.localPeer = o.localPeer;
        this.peerId = o.peerId;
        this.address = o.address;
        this.port = o.port;
        this.indexed = o.indexed;
        this.natType = o.natType;
        this.clock = o.clock || 0;

        const cid = Buffer.from(o.clusterId || '').toString('base64');
        const scid = Buffer.from(o.subclusterId || '').toString('base64');
        if (cid && scid) {
            this.clusters[cid] = { [scid]: { rateLimit: MAX_BANDWIDTH } };
        }

        // Object.assign(this, o); // FIXME: do this properly
    }

    async write(sharedKey, args) {
        const keys = await Encryption.createKeyPair(sharedKey);

        if (!this.localPeer) {
            throw new Error('expected .localPeer');
        }
        args.subclusterId = keys.publicKey;
        args.clusterId = this.localPeer.clusterId;
        args.usr3 = Buffer.from(this.peerId, 'hex');
        args.usr4 = Buffer.from(this.localPeer.peerId, 'hex');
        args.message = this.localPeer.encryption.seal(args.message, keys);

        // do we need a proxy? if so get a random proxy from the map
        const proxy =
            this.proxies.size > 0
                ? Array.from(this.proxies.values()).sort(ByRandom)[0]
                : null;

        const cache = new Map();
        const packets = await this.localPeer._message2packets(
            proxy ? PacketPublishProxied : PacketPublish,
            args.message,
            args,
        );

        const address = proxy ? proxy.address : this.address;
        const port = proxy ? proxy.port : this.port;
        const from = this.localPeer.peerId.slice(0, 6);
        const to = this.peerId.slice(0, 6);

        if (packets.length > 1) {
            this.localPeer._onDebug(
                `X DROP STREAM NO COMPOSE ALLOWED (from=${from}, to=${to}, via=${address}:${port} proxy=${!!proxy})`,
            );
            return [];
        }

        for (const packet of packets) {
            const pid = packet.packetId.toString('hex');
            this.localPeer._onDebug(
                `>> WRITE STREAM (pid=${pid.slice(0, 6)} from=${from}, to=${to}, via=${address}:${port} proxy=${!!proxy} proxies=${this.proxies.size})`,
            );
            cache.set(pid, packet);
            this.localPeer.gate.set(pid, 1);
            await this.localPeer.send(
                await Packet.encode(packet),
                port,
                address,
                this.socket,
            );
        }

        return [];
    }
}
