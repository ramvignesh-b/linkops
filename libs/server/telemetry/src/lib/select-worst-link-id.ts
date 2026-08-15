import type { LinkId, TelemetrySample } from '@linkops/shared/domain';

/**
 * The Fleet Summary's `worstLinkId` selection: lowest `snrDb` among Links
 * that have a Sample, ties broken on lowest `id`, no-Sample Links excluded
 * entirely — they never appear in `samples` at all, so there is no "no
 * Sample" case to special-case here. `null` when nothing has reported.
 */
export function selectWorstLinkId(
  samples: ReadonlyMap<LinkId, TelemetrySample>,
): LinkId | null {
  let worst: TelemetrySample | null = null;

  for (const sample of samples.values()) {
    if (
      worst === null ||
      sample.snrDb < worst.snrDb ||
      (sample.snrDb === worst.snrDb && sample.linkId < worst.linkId)
    ) {
      worst = sample;
    }
  }

  return worst === null ? null : worst.linkId;
}
