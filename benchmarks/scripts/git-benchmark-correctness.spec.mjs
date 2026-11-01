import { describe, expect, it } from 'vitest';
import { branchStateMatches, hasBranchFailure } from './git-benchmark-correctness.mjs';

describe('branch correctness', () => {
  it('requires both the checked out HEAD and branch ref to match', () => {
    expect(branchStateMatches({ branchHeadMatches: true, branchRefMatches: true })).toBe(true);
    expect(branchStateMatches({ branchHeadMatches: false, branchRefMatches: true })).toBe(false);
    expect(branchStateMatches({ branchHeadMatches: true, branchRefMatches: false })).toBe(false);
  });

  it('counts initial branch failures even when the workflow returns a sample', () => {
    expect(hasBranchFailure({ branchHeadMatches: false, branchRefMatches: true })).toBe(true);
    expect(hasBranchFailure({ branchHeadMatches: true, branchRefMatches: true })).toBe(false);
  });

  it('counts a branch ref or HEAD lost after reopening', () => {
    expect(
      hasBranchFailure({
        branchHeadMatches: true,
        branchRefMatches: true,
        reopen: { branchHeadMatches: true, branchRefMatches: false }
      })
    ).toBe(true);
    expect(
      hasBranchFailure({
        branchHeadMatches: true,
        branchRefMatches: true,
        reopen: { branchHeadMatches: true, branchRefMatches: true }
      })
    ).toBe(false);
  });

  it('does not require reopen checks for in-memory samples', () => {
    expect(hasBranchFailure({ branchHeadMatches: true, branchRefMatches: true })).toBe(false);
  });
});
