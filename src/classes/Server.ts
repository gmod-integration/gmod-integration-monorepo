import { ServerInput, ServerSchema } from '../schemas/ServerSchema.js';
import { Player } from './Players.js';

export class Server {
  public readonly hostname: string;
  public readonly ip: string;
  public readonly port: number;
  public readonly map: string;
  public readonly players: number;
  public readonly playersList: Player[];
  public readonly maxPlayers: number;
  public readonly gameMode: string;
  public readonly uptime: number;

  private constructor(data: ServerInput) {
    ServerSchema.parse(data);
    this.hostname = data.hostname;
    this.ip = data.ip;
    this.port = data.port;
    this.map = data.map;
    this.players = data.players;
    this.playersList = data.playersList.map((player) => Player.from(player));
    this.maxPlayers = data.maxPlayers;
    this.gameMode = data.gameMode;
    this.uptime = data.uptime;
  }

  public static from(data: unknown): Server {
    return new Server(data as ServerInput);
  }
}
