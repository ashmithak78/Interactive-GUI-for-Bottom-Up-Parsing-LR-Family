
function transFromSteps(steps) {
  const t = {};
  for (const s of steps) {
    if (!s.edge) continue;
    (t[s.edge.from] = t[s.edge.from] || {})[s.edge.label] = s.edge.to;
  }
  return t;
}

function groupItems(raw) {          
  const m = new Map();
  for (const it of raw) {
    const k = it.prod + "." + it.dot;
    if (!m.has(k)) m.set(k, { prod: it.prod, dot: it.dot, las: [] });
    const g = m.get(k);
    if (!g.las.includes(it.la)) g.las.push(it.la);
  }
  return [...m.values()].map(g => ({ ...g, las: g.las.sort() }));
}


function firstSeq(beta, a, first) {    
  const out = new Set();
  for (const X of beta) {
    for (const t of first[X]) if (t !== EPS) out.add(t);
    if (!first[X].has(EPS)) return out;
  }
  out.add(a);
  return out;
}

function closureLA(items, G, first) {
  const res = [...items];
  const has = (p, d, l) => res.some(r => r.prod === p && r.dot === d && r.la === l);
  for (let k = 0; k < res.length; k++) {
    const it = res[k], rhs = G.productions[it.prod].rhs, B = rhs[it.dot];
    if (B && G.nonTerminals.includes(B)) {
      const las = firstSeq(rhs.slice(it.dot + 1), it.la, first);
      for (const p of G.productions)
        if (p.lhs === B)
          for (const b of las) if (!has(p.id, 0, b)) res.push({ prod: p.id, dot: 0, la: b });
    }
  }
  return res;
}

function buildCLR(G, first) {
  const states = [], steps = [], trans = {}, byKey = {};
  const keyOf = raw => [...new Set(raw.map(i => i.prod + "." + i.dot + "." + i.la))].sort().join("|");
  const mk = (id, rawKernel, from) => {
    const raw = closureLA(rawKernel, G, first);
    return { id, name: String(id), raw, kernel: groupItems(rawKernel), items: groupItems(raw), from };
  };

  const k0 = [{ prod: 0, dot: 0, la: "$" }];
  states.push(mk(0, k0, null)); byKey[keyOf(k0)] = 0; trans[0] = {};
  steps.push({ type: "addState", stateId: 0, edge: null,
               note: `Start: I0 = closure({ [${G.start} → •${G.original}, $] })` });

  for (let i = 0; i < states.length; i++) {
    const st = states[i], symbols = [];
    for (const it of st.raw) {
      const s = G.productions[it.prod].rhs[it.dot];
      if (s && !symbols.includes(s)) symbols.push(s);
    }
    for (const X of symbols) {
      const kernel = st.raw.filter(it => G.productions[it.prod].rhs[it.dot] === X)
                           .map(it => ({ prod: it.prod, dot: it.dot + 1, la: it.la }));
      const key = keyOf(kernel);
      if (byKey[key] === undefined) {
        const id = states.length;
        states.push(mk(id, kernel, { state: i, symbol: X }));
        byKey[key] = id; trans[id] = {}; trans[i][X] = id;
        steps.push({ type: "addState", stateId: id, edge: { from: i, to: id, label: X },
                     note: `goto(I${i}, ${X}) = new state I${id}` });
      } else {
        const id = byKey[key]; trans[i][X] = id;
        steps.push({ type: "addEdge", stateId: id, edge: { from: i, to: id, label: X },
                     note: `goto(I${i}, ${X}) = I${id} (already exists, only edge added)` });
      }
    }
  }
  return { states, steps, trans };
}


function buildLALR(G, first) {
  const clr = buildCLR(G, first);
  const coreKey = st => st.kernel.map(i => i.prod + "." + i.dot).sort().join("|");
  const groups = new Map();
  for (const st of clr.states) {
    const k = coreKey(st);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(st);
  }
  const unite = lists => {
    const m = new Map();
    for (const list of lists) for (const it of list) {
      const k = it.prod + "." + it.dot;
      if (!m.has(k)) m.set(k, { prod: it.prod, dot: it.dot, las: [] });
      const g = m.get(k);
      for (const l of it.las) if (!g.las.includes(l)) g.las.push(l);
    }
    return [...m.values()].map(g => ({ ...g, las: g.las.sort() }));
  };

  const alias = {}, merged = [], steps = clr.steps.slice();
  let anyMerge = false;
  for (const [, mem] of groups) {
    const id = mem[0].id;
    mem.forEach(m => alias[m.id] = id);
    const st = { id, name: mem.map(m => m.id).join(","), members: mem.map(m => m.id),
                 kernel: unite(mem.map(m => m.kernel)), items: unite(mem.map(m => m.items)), from: mem[0].from };
    merged.push(st);
    if (mem.length > 1) {
      anyMerge = true;
      steps.push({ type: "merge", members: st.members, target: id, state: st,
        note: `MERGE ${st.members.map(m => "I" + m).join(" + ")} → I${st.name}: same core, lookaheads united, e.g. ${itemStr(st.kernel[0])}` });
    }
  }
  if (!anyMerge)
    steps.push({ type: "note", note: "No two CLR(1) states share a core, so LALR(1) has the same states as CLR(1)." });

  const trans = {};
  for (const s of clr.states) {
    const a = alias[s.id];
    trans[a] = trans[a] || {};
    for (const X in clr.trans[s.id]) trans[a][X] = alias[clr.trans[s.id][X]];
  }
  return { states: merged, clrStates: clr.states, steps, trans };
}


function buildCollection(G, first, variant) {
  if (variant === "CLR(1)") return buildCLR(G, first);
  if (variant === "LALR(1)") return buildLALR(G, first);
  const r = buildLR0(G);                       
  r.states.forEach(s => s.name = String(s.id));
  r.trans = transFromSteps(r.steps);
  return r;
}


function buildTable(G, states, trans, variant, follow) {
  const nameOf = {};
  states.forEach(s => nameOf[s.id] = s.name);
  const cells = {}, steps = [];
  function put(i, sym, act, why) {
    const k = i + "|" + sym;
    if (!cells[k]) cells[k] = [];
    if (cells[k].includes(act)) return;
    cells[k].push(act);
    steps.push({ state: i, sym, act, why, key: k });
  }

  for (const st of states) {
    const i = st.id;
    for (const it of st.items) {
      const p = G.productions[it.prod], next = p.rhs[it.dot], txt = itemStr(it);
      if (next !== undefined) {
        const j = trans[i][next];
        if (G.terminals.includes(next))
          put(i, next, "s" + j, `${txt}: • before terminal '${next}', goto(I${nameOf[i]},${next}) = I${nameOf[j]} → shift`);
        else
          put(i, next, "g" + j, `${txt}: • before non-terminal ${next}, goto(I${nameOf[i]},${next}) = I${nameOf[j]}`);
      } else if (it.prod === 0) {
        put(i, "$", "acc", `${txt}: augmented production complete → accept`);
      } else {
        let las, src;
        if (variant === "LR(0)")       { las = G.terminals;        src = "every terminal"; }
        else if (variant === "SLR(1)") { las = [...follow[p.lhs]]; src = `FOLLOW(${p.lhs}) = { ${las.join(", ")} }`; }
        else                           { las = it.las;             src = `its lookaheads { ${las.join(", ")} }`; }
        for (const a of las)
          put(i, a, "r" + it.prod, `${txt}: complete item → reduce by production ${it.prod} on ${src}`);
      }
    }
  }

  const conflicts = [];
  for (const k in cells) {
    const acts = cells[k];
    if (acts.length < 2) continue;
    const [state, sym] = k.split("|");
    const red = acts.filter(a => a[0] === "r").length;
    const sh = acts.filter(a => a[0] === "s" || a === "acc").length;
    conflicts.push({ key: k, state: +state, sym, acts, type: (sh && red) ? "Shift-Reduce" : "Reduce-Reduce" });
  }
  return { cells, steps, conflicts, variant, nameOf };
}

const showAct = (a, nameOf) => a[0] === "s" ? "s" + nameOf[+a.slice(1)]
                             : a[0] === "g" ? nameOf[+a.slice(1)] : a;


function parseString(G, cells, text, nameOf) {
  const toks = text.trim().split(/\s+/).filter(x => x).concat("$");
  const rows = [], stack = [0];
  const disp = () => stack.map(x => typeof x === "number" ? nameOf[x] : x).join(" ");
  let pos = 0;

  for (let guard = 0; guard < 1000; guard++) {
    const s = stack[stack.length - 1], a = toks[pos];
    const row = { stack: disp(), input: toks.slice(pos).join(" ") };
    rows.push(row);

    if (!G.terminals.includes(a)) {
      row.action = "ERROR"; row.note = `'${a}' is not a terminal of this grammar → REJECT`;
      return { rows, accepted: false };
    }
    const cell = cells[s + "|" + a];
    if (!cell) {
      row.action = "ERROR"; row.note = `ACTION[${nameOf[s]}, ${a}] is empty → REJECT (failed at state ${nameOf[s]} on '${a}')`;
      return { rows, accepted: false };
    }
    if (cell.length > 1) {
      row.action = "ERROR"; row.note = `ACTION[${nameOf[s]}, ${a}] has a conflict { ${cell.map(x => showAct(x, nameOf)).join(", ")} } → cannot decide`;
      return { rows, accepted: false };
    }
    const act = cell[0];
    if (act === "acc") { row.action = "ACCEPT"; row.note = "Input accepted"; return { rows, accepted: true }; }
    if (act[0] === "s") {
      const j = +act.slice(1);
      stack.push(a, j); pos++;
      row.action = "Shift " + a; row.note = `ACTION[${nameOf[s]}, ${a}] = ${showAct(act, nameOf)}: push '${a}' and state ${nameOf[j]}`;
    } else {
      const p = G.productions[+act.slice(1)];
      stack.length -= 2 * p.rhs.length;
      const t = stack[stack.length - 1], g = cells[t + "|" + p.lhs];
      if (!g) {
        row.action = "ERROR"; row.note = `GOTO[${nameOf[t]}, ${p.lhs}] is empty → REJECT`;
        return { rows, accepted: false };
      }
      const j = +g[0].slice(1);
      stack.push(p.lhs, j);
      row.action = `Reduce ${p.lhs} → ${p.rhs.length ? p.rhs.join(" ") : EPS}`;
      row.note = `${act}: pop ${2 * p.rhs.length} symbols, GOTO[${nameOf[t]}, ${p.lhs}] = ${nameOf[j]}; stack becomes ${disp()}`;
    }
  }
  return { rows, accepted: false };
}


let tbl = null, tIdx = -1, trace = null, pIdx = -1;

function initTable() {
  tbl = buildTable(G, result.states, result.trans, $("variant").value, follow);
  tIdx = -1; trace = null; pIdx = -1;
  renderTable(); renderTrace();
}

function renderTable() {
  if (!tbl) return;
  const nameOf = tbl.nameOf, shown = {};
  for (let k = 0; k <= tIdx; k++) {
    const s = tbl.steps[k];
    (shown[s.key] = shown[s.key] || []).push(s.act);
  }
  const last = tIdx >= 0 ? tbl.steps[tIdx].key : null;
  const nts = G.nonTerminals.filter(n => n !== G.start);
  const cols = [...G.terminals, ...nts];

  let h = `<table class="lrtable"><tr><th rowspan="2">State</th><th colspan="${G.terminals.length}">ACTION</th><th colspan="${nts.length}">GOTO</th></tr><tr>`;
  cols.forEach(c => h += `<th>${esc(c)}</th>`);
  h += "</tr>";
  for (const st of result.states) {
    h += `<tr><td><b>${esc(st.name)}</b></td>`;
    for (const c of cols) {
      const k = st.id + "|" + c, v = shown[k];
      let cls = "";
      if (v && v.length > 1) cls = "conflict"; else if (k === last) cls = "newcell";
      h += `<td class="${cls}">${v ? esc(v.map(a => showAct(a, nameOf)).join(" / ")) + (v.length > 1 ? " ⚠" : "") : ""}</td>`;
    }
    h += "</tr>";
  }
  $("tableOut").innerHTML = h + "</table>";

  const total = tbl.steps.length;
  if (tIdx < 0) $("tableNote").textContent = "Press 'Next cell' to fill the table one entry at a time.";
  else {
    const s = tbl.steps[tIdx];
    $("tableNote").textContent = `Entry ${tIdx + 1}/${total}: [state ${nameOf[s.state]}, '${s.sym}'] = ${showAct(s.act, nameOf)}   ←   ${s.why}`;
  }
  $("tNextBtn").disabled = tIdx >= total - 1;

  let msg = "";
  for (const c of tbl.conflicts)
    if (shown[c.key] && shown[c.key].length > 1) {
      msg += `<div class="conflictmsg">⚠ <b>${c.type} conflict</b> in state I${esc(nameOf[c.state])} on '${esc(c.sym)}': { ${esc(c.acts.map(a => showAct(a, nameOf)).join(", "))} }. The grammar is <b>not ${tbl.variant}</b>.`;
      if (tbl.variant === "LALR(1)" && c.type === "Reduce-Reduce")
        msg += ` (Created by merging CLR(1) states; the grammar may still be CLR(1).)`;
      msg += `</div>`;
    }
  if (tIdx === total - 1 && !tbl.conflicts.length)
    msg += `<div class="okmsg">✔ No conflicts: the grammar is <b>${tbl.variant}</b>.</div>`;
  $("conflictOut").innerHTML = msg;
}

function renderTrace() {
  if (!trace) { $("traceOut").innerHTML = ""; $("pNextBtn").disabled = true; return; }
  let h = "<table><tr><th>Stack</th><th>Input</th><th>Action</th><th>Explanation</th></tr>";
  for (let k = 0; k <= pIdx; k++) {
    const r = trace.rows[k];
    h += `<tr class="${k === pIdx ? "newcell" : ""}"><td>${esc(r.stack)}</td><td>${esc(r.input)}</td><td>${esc(r.action)}</td><td>${esc(r.note)}</td></tr>`;
  }
  h += "</table>";
  if (pIdx === trace.rows.length - 1)
    h += trace.accepted ? `<div class="okmsg">✔ ACCEPT</div>` : `<div class="conflictmsg">✘ REJECT</div>`;
  $("traceOut").innerHTML = h;
  $("pNextBtn").disabled = pIdx >= trace.rows.length - 1;
}

function setupLR() {
  $("tNextBtn").onclick = () => { if (tbl && tIdx < tbl.steps.length - 1) { tIdx++; renderTable(); } };
  $("tAllBtn").onclick = () => { if (tbl) { tIdx = tbl.steps.length - 1; renderTable(); } };
  $("tResetBtn").onclick = () => { if (tbl) { tIdx = -1; renderTable(); } };
  $("parseBtn").onclick = () => {
    if (!tbl) return;
    trace = parseString(G, tbl.cells, $("inputStr").value, tbl.nameOf);
    pIdx = 0; renderTrace();
  };
  $("pNextBtn").onclick = () => { if (trace && pIdx < trace.rows.length - 1) { pIdx++; renderTrace(); } };
  $("pAllBtn").onclick = () => { if (trace) { pIdx = trace.rows.length - 1; renderTrace(); } };
}