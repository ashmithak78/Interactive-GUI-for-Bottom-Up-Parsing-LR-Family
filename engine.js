const EPS = "ε";


function parseGrammar(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l);
  if (lines.length === 0) throw new Error("Grammar is empty.");

  const raw = [];
  for (const line of lines) {
    const parts = line.split(/->|→/);
    if (parts.length !== 2) throw new Error("Bad line (use  A -> B C | D ):  " + line);
    const lhs = parts[0].trim();
    if (!lhs || /\s/.test(lhs)) throw new Error("Bad left side in: " + line);
    for (const alt of parts[1].split("|")) {
      let rhs = alt.trim().split(/\s+/).filter(x => x);
      if (rhs.length === 0 || (rhs.length === 1 && (rhs[0] === "eps" || rhs[0] === EPS))) rhs = [];
      raw.push({ lhs, rhs });
    }
  }

  const original = raw[0].lhs;
  const lhsSet = new Set(raw.map(p => p.lhs));
  let aug = original + "'";
  while (lhsSet.has(aug)) aug += "'";

  const productions = [{ id: 0, lhs: aug, rhs: [original] }];
  raw.forEach((p, i) => productions.push({ id: i + 1, lhs: p.lhs, rhs: p.rhs }));

  const nonTerminals = [aug, ...[...lhsSet]];
  const terminals = [];
  for (const p of productions)
    for (const s of p.rhs)
      if (!nonTerminals.includes(s) && !terminals.includes(s)) terminals.push(s);
  terminals.push("$");

  return { start: aug, original, productions, nonTerminals, terminals };
}


function computeFirst(G) {
  const first = {};
  G.nonTerminals.forEach(n => first[n] = new Set());
  G.terminals.forEach(t => first[t] = new Set([t]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of G.productions) {
      const before = first[p.lhs].size;
      let allEps = true;
      for (const X of p.rhs) {
        for (const a of first[X]) if (a !== EPS) first[p.lhs].add(a);
        if (!first[X].has(EPS)) { allEps = false; break; }
      }
      if (allEps) first[p.lhs].add(EPS);
      if (first[p.lhs].size !== before) changed = true;
    }
  }
  return first;
}

function computeFollow(G, first) {
  const follow = {};
  G.nonTerminals.forEach(n => follow[n] = new Set());
  follow[G.start].add("$");
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of G.productions) {
      for (let i = 0; i < p.rhs.length; i++) {
        const B = p.rhs[i];
        if (!G.nonTerminals.includes(B)) continue;
        const before = follow[B].size;
        let allEps = true;
        for (let j = i + 1; j < p.rhs.length; j++) {
          const X = p.rhs[j];
          for (const a of first[X]) if (a !== EPS) follow[B].add(a);
          if (!first[X].has(EPS)) { allEps = false; break; }
        }
        if (allEps) for (const a of follow[p.lhs]) follow[B].add(a);
        if (follow[B].size !== before) changed = true;
      }
    }
  }
  return follow;
}


function closure(items, G) {
  const result = [...items];
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of result) {
      const next = G.productions[it.prod].rhs[it.dot];     
      if (next && G.nonTerminals.includes(next)) {
        for (const p of G.productions) {
          if (p.lhs === next && !result.some(r => r.prod === p.id && r.dot === 0)) {
            result.push({ prod: p.id, dot: 0 });
            changed = true;
          }
        }
      }
    }
  }
  return result;
}


function gotoKernel(items, X, G) {
  return items
    .filter(it => G.productions[it.prod].rhs[it.dot] === X)
    .map(it => ({ prod: it.prod, dot: it.dot + 1 }));
}


function buildLR0(G) {
  const states = [];
  const steps = [];
  const keyOf = items => items.map(i => i.prod + "." + i.dot).sort().join("|");
  const byKernel = {};


  const k0 = [{ prod: 0, dot: 0 }];
  states.push({ id: 0, kernel: k0, items: closure(k0, G), from: null });
  byKernel[keyOf(k0)] = 0;
  steps.push({ type: "addState", stateId: 0, edge: null,
               note: "Start: I0 = closure({ " + G.start + " → •" + G.original + " })" });

  for (let i = 0; i < states.length; i++) {        
    const st = states[i];
    const symbols = [];                              
    for (const it of st.items) {
      const s = G.productions[it.prod].rhs[it.dot];
      if (s && !symbols.includes(s)) symbols.push(s);
    }
    for (const X of symbols) {
      const kernel = gotoKernel(st.items, X, G);
      const key = keyOf(kernel);
      if (byKernel[key] === undefined) {
        const id = states.length;
        states.push({ id, kernel, items: closure(kernel, G), from: { state: i, symbol: X } });
        byKernel[key] = id;
        steps.push({ type: "addState", stateId: id, edge: { from: i, to: id, label: X },
                     note: `goto(I${i}, ${X}) = new state I${id}` });
      } else {
        const id = byKernel[key];
        steps.push({ type: "addEdge", stateId: id, edge: { from: i, to: id, label: X },
                     note: `goto(I${i}, ${X}) = I${id} (already exists, only edge added)` });
      }
    }
  }
  return { states, steps };
}