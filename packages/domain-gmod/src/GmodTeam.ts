import { type GmodTeamInput, GmodTeamSchema } from '@gmod/schema/gmod/GmodTeamSchema.js';

export class GmodTeam {
  public readonly id: number;
  public readonly name: string;

  private constructor(data: GmodTeamInput) {
    const parsed = GmodTeamSchema.parse(data);
    this.id = parsed.id;
    this.name = parsed.name;
  }

  public static from(data: unknown): GmodTeam {
    return new GmodTeam(data as GmodTeamInput);
  }

  public getName(): string {
    return this.name;
  }

  public getID(): number {
    return this.id;
  }
}
