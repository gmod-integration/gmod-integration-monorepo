import { BranchInput, BranchSchema } from '../schemas/Branch.js';

export class Branch {
  public readonly branch: 'unknown' | 'dev' | 'prerelease' | 'x86-64';

  private constructor(data: BranchInput) {
    BranchSchema.parse(data);
    this.branch = data.branch;
  }

  public static from(data: unknown): Branch {
    return new Branch(data as BranchInput);
  }
}
