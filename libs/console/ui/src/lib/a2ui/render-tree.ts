import {
  A2UI_COMPONENT_TYPES,
  A2UI_MAX_COMPONENTS,
  A2UI_MAX_DEPTH,
  type A2uiComponent,
  type A2uiComponentType,
} from '@linkops/shared/a2ui-protocol';

/** A node the registry knows how to render — one of the six whitelisted types. */
export interface A2uiOkNode {
  kind: 'ok';
  id: string;
  type: A2uiComponentType;
  /** The raw component, for a leaf to read its own type-specific properties from. */
  definition: A2uiComponent;
  children: A2uiRenderNode[];
}

/** A labelled fallback — the degraded shape a broken or hostile subtree renders as. */
export interface A2uiFallbackNode {
  kind: 'fallback';
  label: string;
}

export type A2uiRenderNode = A2uiOkNode | A2uiFallbackNode;

const WHITELIST = new Set<string>(A2UI_COMPONENT_TYPES);

function isWhitelisted(type: string): type is A2uiComponentType {
  return WHITELIST.has(type);
}

/** The ids a component points to, in `child`-then-`children` order. */
function childIdsOf(definition: A2uiComponent): string[] {
  return [
    ...(definition.child !== undefined ? [definition.child] : []),
    ...(definition.children ?? []),
  ];
}

/**
 * Walks a Surface's flat component list from its root, into the tree the
 * renderer actually draws. Every safety property but the pointer guard lives
 * here: the whitelist, the depth cap, the total-component cap and path-scoped
 * cycle detection. A broken or hostile branch renders a labelled fallback in
 * its own place; it never stops a sibling from rendering, and it never
 * recurses unboundedly — the walk is depth-first and every branch is a fixed
 * number of calls deep before it must stop, one way or another.
 *
 * Not unit-tested on its own, by the same reasoning
 * `docs/specs/04-spec-console.md` gave for `FleetStore`: every property this
 * function is responsible for is observable from the rendered DOM, which is
 * where it is asserted.
 */
interface TreeContext {
  byId: Map<string, A2uiComponent>;
  budget: { remaining: number };
}

/**
 * Renders a list of child ids up to the remaining budget, and stops —
 * rather than mapping every one of them regardless — the moment it runs
 * out, with one trailing fallback marking that the rest were cut.
 */
function renderChildren(
  ctx: TreeContext,
  childIds: readonly string[],
  path: readonly string[],
): A2uiRenderNode[] {
  const rendered: A2uiRenderNode[] = [];

  for (const childId of childIds) {
    if (ctx.budget.remaining <= 0) {
      rendered.push({
        kind: 'fallback',
        label: 'Too many components to render',
      });
      break;
    }

    ctx.budget.remaining -= 1;
    rendered.push(visit(ctx, childId, path));
  }

  return rendered;
}

function visit(
  ctx: TreeContext,
  id: string,
  path: readonly string[],
): A2uiRenderNode {
  const definition = ctx.byId.get(id);

  if (definition === undefined) {
    return { kind: 'fallback', label: `Missing component "${id}"` };
  }

  if (path.includes(id)) {
    return { kind: 'fallback', label: 'A component cannot contain itself' };
  }

  if (path.length >= A2UI_MAX_DEPTH) {
    return { kind: 'fallback', label: 'Too deeply nested to render' };
  }

  if (!isWhitelisted(definition.component)) {
    return {
      kind: 'fallback',
      label: `Unknown component "${definition.component}"`,
    };
  }

  const nextPath = [...path, id];

  return {
    kind: 'ok',
    id,
    type: definition.component,
    definition,
    children: renderChildren(ctx, childIdsOf(definition), nextPath),
  };
}

/**
 * Walks a Surface's flat component list from its root, into the tree the
 * renderer actually draws. Every safety property but the pointer guard lives
 * here: the whitelist, the depth cap, the total-component cap and path-scoped
 * cycle detection.
 */
export function buildA2uiTree(
  components: readonly A2uiComponent[],
  rootId: string,
): A2uiRenderNode {
  const ctx: TreeContext = {
    byId: new Map(components.map((component) => [component.id, component])),
    budget: { remaining: A2UI_MAX_COMPONENTS - 1 },
  };

  return visit(ctx, rootId, []);
}
