export const branchStateMatches = correctness =>
  correctness?.branchHeadMatches === true && correctness?.branchRefMatches === true;

export const hasBranchFailure = correctness =>
  !branchStateMatches(correctness) || (correctness.reopen !== undefined && !branchStateMatches(correctness.reopen));
