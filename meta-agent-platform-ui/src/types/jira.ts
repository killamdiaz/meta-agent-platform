export type SimilarIssue = {
  key: string;
  summary?: string;
  rootCause?: string;
  howSolved?: string;
  solvedBy?: string;
  resolutionComment?: string;
  timeTaken?: string;
  similarityScore?: number;
};
