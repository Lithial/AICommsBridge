import { createTwoFilesPatch } from "diff";

export function computeUnifiedDiff(before: string, after: string, filename = "file"): string {
  return createTwoFilesPatch(filename, filename, before, after, "", "");
}
