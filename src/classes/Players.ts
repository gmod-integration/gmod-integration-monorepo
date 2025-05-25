import { PlayerInput, PlayerSchema } from '../schemas/PlayerSchema.js';
import { Angle } from './Angle.js';
import { Branch } from './Branch.js';
import { CustomValues } from './CustomValues.js';
import { Position } from './Position.js';
import { Team } from './Team.js';

export class Player {
  public steamID64: string;
  public steamID: string;
  public name: string;
  public userGroup: string;
  public kills: number;
  public deaths: number;
  public connectTime?: number;
  public adjustedTime?: number;
  public timeLastTeamChange?: number;
  public ping?: number;
  public fps?: number;
  public branch?: Branch;
  public team: Team;
  public position: Position;
  public angle: Angle;
  public customValues?: CustomValues;

  private constructor(data: PlayerInput) {
    const parsed = PlayerSchema.parse(data);
    this.steamID64 = parsed.steamID64;
    this.steamID = parsed.steamID;
    this.name = parsed.name;
    this.userGroup = parsed.userGroup;
    this.kills = parsed.kills;
    this.deaths = parsed.deaths;
    this.connectTime = parsed.connectTime;
    this.adjustedTime = parsed.adjustedTime;
    this.timeLastTeamChange = parsed.timeLastTeamChange;
    this.ping = parsed.ping;
    this.fps = parsed.fps;
    this.branch = parsed.branch ? Branch.from(parsed.branch) : undefined;
    this.team = Team.from(parsed.team);
    this.position = Position.from(parsed.position);
    this.angle = Angle.from(parsed.angle);
    this.customValues = parsed.customValues ? CustomValues.from(parsed.customValues) : undefined;
  }

  public static from(data: unknown): Player {
    return new Player(data as PlayerInput);
  }
}
