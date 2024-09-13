import { Encryption } from './encryption';
import * as NAT from './nat';
import Packet, { PacketPublish } from './packets';

const MAX_BANDWIDTH = 1024 * 32;

/**
 * A `RemotePeer` represents an initial, discovered, or connected remote peer.
 * Typically, you will not need to create instances of this class directly.
 */
export class RemotePeer {
    peerId: string;
    address = null;
    port = 0;
    natType = null;
    clusters = {};
    pingId = null;
    distance = 0;
    connected = false;
    opening = 0;
    probed = 0;
    proxy: any = null;
    clock = 0;
    uptime = 0;
    lastUpdate = 0;
    lastRequest = 0;
    localPeer: any = null;
    indexed?: boolean;
    socket: any;

    /**
     * `RemotePeer` class constructor.
     * @param {{
     *   peerId: string,
     *   address?: string,
     *   port?: number,
     *   natType?: number,
     *   clusters: object,
     *   reflectionId?: string,
     *   distance?: number,
     *   publicKey?: string,
     *   privateKey?: string,
     *   clock?: number,
     *   lastUpdate?: number,
     *   lastRequest?: number
     * }} o
     */
    constructor(o, peer?: any) {
        this.localPeer = peer;

        if (!o.peerId) {
            throw new Error('expected .peerId');
        }
        this.peerId = o.peerId;
        if (o.indexed) {
            o.natType = NAT.UNRESTRICTED;
        }
        if (o.natType && !NAT.isValid(o.natType)) {
            throw new Error(`invalid .natType (${o.natType})`);
        }

        const cid = Buffer.from(o.clusterId || '').toString('base64');
        const scid = Buffer.from(o.subclusterId || '').toString('base64');

        if (cid && scid) {
            this.clusters[cid] = { [scid]: { rateLimit: MAX_BANDWIDTH } };
        }

        Object.assign(this, o);
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

        const cache = new Map();
        const packets = await this.localPeer._message2packets(
            PacketPublish,
            args.message,
            args,
        );
        if (packets.length > 1) {
            throw new Error(
                '<<<< STREAM COMPOSE DISABLED AND PACKET TOO LARGE FOR ONE >>>>',
            );
        }

        if (this.proxy) {
            this.localPeer._onDebug(
                `>> WRITE STREAM HAS PROXY ${this.proxy.address}:${this.proxy.port}`,
            );
        }
        const address = this.proxy ? this.proxy.address : this.address;
        const port = this.proxy ? this.proxy.port : this.port;

        for (const packet of packets) {
            const from = this.localPeer.peerId.slice(0, 6);
            const to = this.peerId.slice(0, 6);
            this.localPeer._onDebug(
                `>> WRITE STREAM (from=${from}, to=${to}, via=${address}:${port})`,
            );

            const pid = packet.packetId.toString('hex');
            cache.set(pid, packet);
            this.localPeer.gate.set(pid, 1);
            await this.localPeer.send(
                await Packet.encode(packet),
                port,
                address,
                this.socket,
            );
        }

        // const head = packets.find((p) => p.index === 0); // has a head, should compose
        // const p = await this.localPeer.cache.compose(head, cache);
        return [];
    }
}
