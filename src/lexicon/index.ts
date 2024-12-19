/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  createServer as createXrpcServer,
  Server as XrpcServer,
  Options as XrpcOptions,
  AuthVerifier,
  StreamAuthVerifier,
} from '@atproto/xrpc-server'
import { schemas } from './lexicons'

export function createServer(options?: XrpcOptions): Server {
  return new Server(options)
}

export class Server {
  xrpc: XrpcServer
  com: ComNS

  constructor(options?: XrpcOptions) {
    this.xrpc = createXrpcServer(schemas, options)
    this.com = new ComNS(this)
  }
}

export class ComNS {
  _server: Server
  playmint: ComPlaymintNS

  constructor(server: Server) {
    this._server = server
    this.playmint = new ComPlaymintNS(server)
  }
}

export class ComPlaymintNS {
  _server: Server
  dev: ComPlaymintDevNS

  constructor(server: Server) {
    this._server = server
    this.dev = new ComPlaymintDevNS(server)
  }
}

export class ComPlaymintDevNS {
  _server: Server
  spaceshooter: ComPlaymintDevSpaceshooterNS

  constructor(server: Server) {
    this._server = server
    this.spaceshooter = new ComPlaymintDevSpaceshooterNS(server)
  }
}

export class ComPlaymintDevSpaceshooterNS {
  _server: Server

  constructor(server: Server) {
    this._server = server
  }
}

type SharedRateLimitOpts<T> = {
  name: string
  calcKey?: (ctx: T) => string
  calcPoints?: (ctx: T) => number
}
type RouteRateLimitOpts<T> = {
  durationMs: number
  points: number
  calcKey?: (ctx: T) => string
  calcPoints?: (ctx: T) => number
}
type HandlerOpts = { blobLimit?: number }
type HandlerRateLimitOpts<T> = SharedRateLimitOpts<T> | RouteRateLimitOpts<T>
type ConfigOf<Auth, Handler, ReqCtx> =
  | Handler
  | {
      auth?: Auth
      opts?: HandlerOpts
      rateLimit?: HandlerRateLimitOpts<ReqCtx> | HandlerRateLimitOpts<ReqCtx>[]
      handler: Handler
    }
type ExtractAuth<AV extends AuthVerifier | StreamAuthVerifier> = Extract<
  Awaited<ReturnType<AV>>,
  { credentials: unknown }
>
