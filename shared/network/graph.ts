import { polylineLength } from "../geo/distance.ts";
import type { NetworkLink } from "../sources/nh-arcgis/normalise.ts";

/** Link forms that carry through traffic on a road (excludes slip roads and the like). */
const THROUGH_FORMS = new Set(["DC", "SC", "R", "DL", "L", "SR"]);

export interface Network {
  links: Map<string, NetworkLink>;
  lengths: Map<string, number>;
  /** `${road}|${nodeId}` → traversable through-links leaving that node on that road. */
  outgoing: Map<string, { link: NetworkLink; to: string }[]>;
  /** nodeId → junction ids it belongs to (S5 Junction_Reference). */
  nodeJunctions: Map<string, Set<string>>;
  /** junctionId → S5 junction name (e.g. "M6 J41"). */
  junctionNames: Map<string, string>;
}

export function buildNetwork(
  links: NetworkLink[],
  junctionRefs: { junctionId: string; nodeId: string }[],
  junctions: { junctionId: string; name: string }[],
): Network {
  const network: Network = {
    links: new Map(),
    lengths: new Map(),
    outgoing: new Map(),
    nodeJunctions: new Map(),
    junctionNames: new Map(junctions.map((j) => [j.junctionId, j.name])),
  };
  const addEdge = (link: NetworkLink, from: string, to: string): void => {
    const key = `${link.road}|${from}`;
    const list = network.outgoing.get(key) ?? [];
    list.push({ link, to });
    network.outgoing.set(key, list);
  };
  for (const link of links) {
    network.links.set(link.id, link);
    network.lengths.set(link.id, link.geometry.reduce((sum, line) => sum + polylineLength(line), 0));
    if (!THROUGH_FORMS.has(link.form)) continue;
    addEdge(link, link.startNode, link.endNode);
    if (link.twoWay) addEdge(link, link.endNode, link.startNode);
  }
  for (const { junctionId, nodeId } of junctionRefs) {
    const set = network.nodeJunctions.get(nodeId) ?? new Set<string>();
    set.add(junctionId);
    network.nodeJunctions.set(nodeId, set);
  }
  return network;
}

export interface TracedPath {
  /** Ordered nodes n0..nk, with linkIds[i] running from nodes[i] to nodes[i+1]. */
  nodes: string[];
  linkIds: string[];
  lengthMetres: number;
}

/** Shortest directed path between two nodes using only through-links of one road. Null if none exists. */
export function tracePath(network: Network, road: string, from: string, to: string): TracedPath | null {
  if (from === to) return null;
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; linkId: string }>();
  const done = new Set<string>();
  // Networks per road are small (hundreds of nodes), so a simple O(n²) Dijkstra is adequate and easy to verify.
  while (true) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [node, d] of dist) {
      if (!done.has(node) && d < best) {
        best = d;
        current = node;
      }
    }
    if (current === null) return null;
    if (current === to) break;
    done.add(current);
    for (const { link, to: next } of network.outgoing.get(`${road}|${current}`) ?? []) {
      const candidate = best + (network.lengths.get(link.id) ?? 0);
      if (candidate < (dist.get(next) ?? Number.POSITIVE_INFINITY)) {
        dist.set(next, candidate);
        prev.set(next, { node: current, linkId: link.id });
      }
    }
  }
  const nodes = [to];
  const linkIds: string[] = [];
  let node = to;
  while (node !== from) {
    const step = prev.get(node);
    if (!step) return null;
    linkIds.unshift(step.linkId);
    nodes.unshift(step.node);
    node = step.node;
  }
  return { nodes, linkIds, lengthMetres: dist.get(to) ?? 0 };
}
