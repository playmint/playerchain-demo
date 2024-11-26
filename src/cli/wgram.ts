import dgram from 'node:dgram';
import { pathToFileURL } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

interface DgramMessage {
    type: 'dgram';
    payload: number[];
    port: number;
    address: string;
}

export class WgramProxyServer {
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();

    constructor(port: number) {
        this.wss = new WebSocketServer({ port });
        this.setupServer();
    }

    private setupServer() {
        this.wss.on('connection', (ws: WebSocket) => {
            // Create a UDP socket for this connection
            const socket = dgram.createSocket('udp4');
            this.clients.add(ws);

            // Bind the socket and notify client when ready
            socket.bind(0, () => {
                const socketInfo = socket.address();
                if (typeof socketInfo === 'string') {
                    throw new Error('Expected socketInfo to be an object');
                }
                ws.send(
                    JSON.stringify({
                        type: 'socket_info',
                        address: socketInfo.address,
                        port: socketInfo.port,
                        family: socketInfo.family,
                    }),
                );
            });

            // Handle incoming UDP messages
            socket.on('message', (msg: Uint8Array, rinfo: any) => {
                if (ws.readyState === WebSocket.OPEN) {
                    const response = {
                        type: 'dgram',
                        payload: Array.from(msg),
                        address: rinfo.address,
                        family: rinfo.family,
                        port: rinfo.port,
                        size: rinfo.size,
                    };
                    ws.send(JSON.stringify(response));
                }
            });

            // Handle incoming WebSocket messages
            ws.on('message', (data: string) => {
                try {
                    const message: DgramMessage = JSON.parse(data.toString());

                    if (message.type === 'dgram') {
                        const payload = new Uint8Array(message.payload);
                        socket.send(
                            payload,
                            message.port,
                            message.address,
                            (err: any) => {
                                if (err) {
                                    console.error(
                                        'Error sending UDP packet:',
                                        err,
                                    );
                                }
                            },
                        );
                    }
                } catch (err) {
                    console.error('Error processing message:', err);
                }
            });

            ws.on('close', () => {
                this.clients.delete(ws);
                socket.close();
            });

            // Handle UDP socket errors
            socket.on('error', (err: any) => {
                console.error('UDP Socket error:', err);
                ws.close();
            });
        });
    }

    close() {
        this.wss.close();
    }
}

// Add this at the bottom of your existing test-server.ts
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = new WgramProxyServer(8080);
    console.log('WebSocket server running on ws://localhost:8080', server);
}
