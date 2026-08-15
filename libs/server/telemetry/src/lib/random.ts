/**
 * The Simulator's only source of randomness — constructor-injected rather
 * than a direct `Math.random` call, so a test can supply a fixed or scripted
 * sequence and assert exact walked values. Returns a number in `[0, 1)`,
 * exactly `Math.random`'s own contract, which is what production wires in.
 */
export type Random = () => number;
