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
    PlayerSchema.parse(data);
    this.steamID64 = data.steamID64;
    this.steamID = data.steamID;
    this.name = data.name;
    this.userGroup = data.userGroup;
    this.kills = data.kills;
    this.deaths = data.deaths;
    this.connectTime = data.connectTime;
    this.adjustedTime = data.adjustedTime;
    this.timeLastTeamChange = data.timeLastTeamChange;
    this.ping = data.ping;
    this.fps = data.fps;
    this.branch = data.branch ? Branch.from(data.branch) : undefined;
    this.team = Team.from(data.team);
    this.position = Position.from(data.position);
    this.angle = Angle.from(data.angle);
    this.customValues = data.customValues ? CustomValues.from(data.customValues) : undefined;
  }

  public static from(data: unknown): Player {
    return new Player(data as PlayerInput);
  }
}
