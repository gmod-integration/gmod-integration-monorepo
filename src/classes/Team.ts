import { TeamInput, TeamSchema } from '../schemas/TeamSchema.js';

export class Team {
  public readonly id: number;
  public readonly name: string;

  private constructor(data: TeamInput) {
    TeamSchema.parse(data);
    this.id = data.id;
    this.name = data.name;
  }

  public static from(data: unknown): Team {
    return new Team(data as TeamInput);
  }

  public getName(): string {
    return this.name;
  }

  public getID(): number {
    return this.id;
  }
}
