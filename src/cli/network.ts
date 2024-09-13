import dgram from 'node:dgram';
import events from 'node:events';
import api from '../runtime/network/api';

const network = (options) => api(options, events, dgram);

export { network };
export default network;
