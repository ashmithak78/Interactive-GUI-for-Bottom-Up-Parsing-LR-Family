
(function () {
  const SYM = { "<": "<·", "=": "=·", ">": "·>" };
  const E_ = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const prodStr = p => p.lhs + " → " + p.rhs.join(" ");

  function opPrepare(text) {
    const G = parseGrammar(text);                       
    const prods = G.productions.slice(1);               
    const NT = G.nonTerminals.filter(n => n !== G.start);
    const T = G.terminals.filter(t => t !== "$");
    const problems = [];
    for (const p of prods) {
      if (p.rhs.length === 0) problems.push(`${p.lhs} → ε : an empty production is not allowed in an operator grammar.`);
      for (let i = 0; i + 1 < p.rhs.length; i++)
        if (NT.includes(p.rhs[i]) && NT.includes(p.rhs[i + 1]))
          problems.push(`${prodStr(p)} : non-terminals ${p.rhs[i]} and ${p.rhs[i + 1]} are adjacent.`);
    }
    return { G, prods, NT, T, start: G.original, problems };
  }

  function opBuild(P) {
    const { prods, NT, T, start } = P;
    const isT = s => !NT.includes(s);
    const LEAD = {}, TRAIL = {};
    NT.forEach(n => { LEAD[n] = new Set(); TRAIL[n] = new Set(); });
    const steps = [];

    const add = (kind, A, t, why) => {
      const S = (kind === "lead" ? LEAD : TRAIL)[A];
      if (!S.has(t)) { S.add(t); steps.push({ type: kind, nt: A, t, why }); }
    };
    let before;
    do {
      before = steps.length;
      for (const p of prods) {
        const r = p.rhs, ps = prodStr(p);
        const f = r[0];
        if (isT(f)) add("lead", p.lhs, f, `${ps}: the right side starts with terminal ${f}`);
        else {
          for (const t of [...LEAD[f]]) add("lead", p.lhs, t, `${ps}: all of LEADING(${f}) belongs to LEADING(${p.lhs})`);
          if (r.length > 1 && isT(r[1])) add("lead", p.lhs, r[1], `${ps}: terminal ${r[1]} comes right after non-terminal ${f}`);
        }
        const l = r[r.length - 1];
        if (isT(l)) add("trail", p.lhs, l, `${ps}: the right side ends with terminal ${l}`);
        else {
          for (const t of [...TRAIL[l]]) add("trail", p.lhs, t, `${ps}: all of TRAILING(${l}) belongs to TRAILING(${p.lhs})`);
          if (r.length > 1 && isT(r[r.length - 2])) add("trail", p.lhs, r[r.length - 2], `${ps}: terminal ${r[r.length - 2]} comes right before non-terminal ${l}`);
        }
      }
    } while (steps.length !== before);

    const cells = {};
    const put = (a, b, r, why) => {
      const k = a + "|" + b;
      if (!cells[k]) cells[k] = [];
      if (cells[k].includes(r)) return;
      cells[k].push(r);
      steps.push({ type: "rel", a, b, r, why, key: k });
    };
    for (const t of LEAD[start]) put("$", t, "<", `start: $ <· ${t}, because ${t} ∈ LEADING(${start})`);
    for (const t of TRAIL[start]) put(t, "$", ">", `start: ${t} ·> $, because ${t} ∈ TRAILING(${start})`);
    for (const p of prods) {
      const r = p.rhs, ps = prodStr(p);
      for (let i = 0; i < r.length; i++) {
        if (!isT(r[i])) continue;
        const a = r[i];
        if (i + 1 < r.length) {
          const x = r[i + 1];
          if (isT(x)) put(a, x, "=", `${ps}: terminals ${a} and ${x} are side by side`);
          else {
            for (const t of [...LEAD[x]]) put(a, t, "<", `${ps}: ${a} is followed by ${x}, and ${t} ∈ LEADING(${x})`);
            if (i + 2 < r.length && isT(r[i + 2])) put(a, r[i + 2], "=", `${ps}: ${a} ${x} ${r[i + 2]} (one non-terminal in between)`);
          }
        }
        if (i > 0 && !isT(r[i - 1])) {
          const B = r[i - 1];
          for (const t of [...TRAIL[B]]) put(t, a, ">", `${ps}: ${B} is followed by ${a}, and ${t} ∈ TRAILING(${B})`);
        }
      }
    }
    const conflicts = [];
    for (const k in cells) if (cells[k].length > 1) {
      const [a, b] = k.split("|");
      conflicts.push({ key: k, a, b, rels: cells[k] });
    }
    return { P, LEAD, TRAIL, steps, cells, conflicts, cols: [...T, "$"] };
  }

  function opParse(R, text) {
    const { P, cells } = R, { NT, T, prods } = P;
    const isNT = s => NT.includes(s);
    const toks = text.trim().split(/\s+/).filter(x => x).concat("$");
    const stack = ["$"], rows = [];
    let pos = 0;
    const topTerm = () => { for (let i = stack.length - 1; i >= 0; i--) if (!isNT(stack[i])) return stack[i]; };
    const relOf = (a, b) => cells[a + "|" + b];
    const fail = (row, why) => { row.action = "ERROR"; row.note = why + " → REJECT"; return { rows, accepted: false }; };

    for (let guard = 0; guard < 500; guard++) {
      const a = topTerm(), b = toks[pos];
      const row = { stack: stack.join(" "), input: toks.slice(pos).join(" "), rel: "" };
      rows.push(row);

      if (b !== "$" && !T.includes(b)) return fail(row, `'${b}' is not a terminal of this grammar`);
      if (a === "$" && b === "$") {
        if (stack.length === 2 && isNT(stack[1])) { row.action = "ACCEPT"; row.note = "Only $ and one non-terminal remain on the stack, and the input is finished"; return { rows, accepted: true }; }
        return fail(row, "Input finished but the stack does not reduce to a single non-terminal");
      }
      const rel = relOf(a, b);
      if (!rel) return fail(row, `No precedence relation between '${a}' and '${b}' (empty cell, failed here)`);
      if (rel.length > 1) return fail(row, `Cell [${a}, ${b}] holds a conflict { ${rel.map(x => SYM[x]).join(", ")} }`);
      row.rel = SYM[rel[0]];

      if (rel[0] === "<" || rel[0] === "=") {
        stack.push(b); pos++;
        row.action = "Shift " + b;
        row.note = `${a} ${SYM[rel[0]]} ${b}: push '${b}'`;
        continue;
      }
      const popped = [];
      if (isNT(stack[stack.length - 1])) popped.unshift(stack.pop());
      let ok = false;
      while (true) {
        const t = stack.pop();                   
        if (t === "$") return fail(row, "Could not find the start (<·) of a handle");
        popped.unshift(t);
        const p = topTerm();                         
        const r2 = relOf(p, t);
        if (!r2 || r2.length !== 1) return fail(row, `No single relation between '${p}' and '${t}' while searching for the start of the handle`);
        if (stack.length && isNT(stack[stack.length - 1])) popped.unshift(stack.pop());   
        if (r2[0] === "<") { ok = true; break; }
      }
      if (!ok) return fail(row, "Could not find the start (<·) of a handle");
      const pat = popped.map(s => isNT(s) ? "N" : s).join(" ");
      let m = prods.find(q => q.rhs.join(" ") === popped.join(" "));
      if (!m) m = prods.find(q => q.rhs.map(s => isNT(s) ? "N" : s).join(" ") === pat);
      if (!m) return fail(row, `Handle '${popped.join(" ")}' matches no production`);
      stack.push(m.lhs);
      row.action = `Reduce ${prodStr(m)}`;
      row.note = `${a} ·> ${b}: pop handle '${popped.join(" ")}' (back to the last <·), push ${m.lhs}. Non-terminals only act as placeholders.`;
    }
    return { rows, accepted: false };
  }

  if (typeof module !== "undefined") module.exports = { opPrepare, opBuild, opParse };
  if (typeof document === "undefined") return;

  const $o = id => document.getElementById(id);
  const OPRESETS = {
    "Expression grammar (no conflict)": "E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id",
    "Simple: S → ( S ) | a": "S -> ( S ) | a",
    "Ambiguous: E → E+E | E*E | id (conflicts)": "E -> E + E | E * E | id",
    "Not an operator grammar (S → A B)": "S -> A B\nA -> a\nB -> b"
  };
  let R = null, idx = -1, trace = null, pIdx = -1;

  function opBuildUI() {
    $o("opError").innerHTML = ""; $o("opCheck").innerHTML = "";
    R = null; idx = -1; trace = null; pIdx = -1;
    let P;
    try { P = opPrepare($o("opGrammar").value); }
    catch (e) { $o("opError").textContent = e.message; renderAll(); return; }
    if (P.problems.length) {
      $o("opError").innerHTML = "✘ Not an operator grammar:<br>" + P.problems.map(E_).join("<br>");
      renderAll(); return;
    }
    $o("opCheck").innerHTML = `<div class="okmsg">✔ Operator grammar check passed: no ε-productions and no two adjacent non-terminals.</div>`;
    R = opBuild(P);
    renderAll();
  }

  function renderAll() { renderSets(); renderTable(); renderTrace(); }

  function renderSets() {
    if (!R) { $o("opSets").innerHTML = ""; $o("opNote").textContent = "Press Build first."; $o("opNext").disabled = $o("opPrev").disabled = true; return; }
    const L = {}, Tr = {};
    R.P.NT.forEach(n => { L[n] = []; Tr[n] = []; });
    for (let k = 0; k <= idx; k++) {
      const s = R.steps[k];
      if (s.type === "lead") L[s.nt].push(s.t);
      if (s.type === "trail") Tr[s.nt].push(s.t);
    }
    let h = "<table><tr><th>Non-terminal</th><th>LEADING</th><th>TRAILING</th></tr>";
    for (const n of R.P.NT) h += `<tr><td>${E_(n)}</td><td>{ ${E_(L[n].join(", "))} }</td><td>{ ${E_(Tr[n].join(", "))} }</td></tr>`;
    $o("opSets").innerHTML = h + "</table>";
    const total = R.steps.length;
    if (idx < 0) $o("opNote").textContent = "Press Next Step: LEADING / TRAILING are built first, then the relation table, one entry per step.";
    else {
      const s = R.steps[idx];
      $o("opNote").textContent = `Step ${idx + 1}/${total}: ` +
        (s.type === "lead" ? `LEADING(${s.nt}) gets '${s.t}'`
         : s.type === "trail" ? `TRAILING(${s.nt}) gets '${s.t}'`
         : `[${s.a}, ${s.b}] = ${SYM[s.r]}`) + "   ←   " + s.why;
    }
    $o("opPrev").disabled = idx < 0;
    $o("opNext").disabled = idx >= total - 1;
  }

  function renderTable() {
    if (!R) { $o("opTable").innerHTML = ""; $o("opConflict").innerHTML = ""; return; }
    const shown = {};
    for (let k = 0; k <= idx; k++) {
      const s = R.steps[k];
      if (s.type === "rel") (shown[s.key] = shown[s.key] || []).push(s.r);
    }
    const last = idx >= 0 && R.steps[idx].type === "rel" ? R.steps[idx].key : null;
    let h = `<table class="lrtable"><tr><th>row \\ next</th>${R.cols.map(c => `<th>${E_(c)}</th>`).join("")}</tr>`;
    for (const a of R.cols) {
      h += `<tr><td><b>${E_(a)}</b></td>`;
      for (const b of R.cols) {
        const k = a + "|" + b, v = shown[k];
        const cls = v && v.length > 1 ? "conflict" : (k === last ? "newcell" : "");
        h += `<td class="${cls}">${v ? v.map(x => SYM[x]).join(" / ") + (v.length > 1 ? " ⚠" : "") : ""}</td>`;
      }
      h += "</tr>";
    }
    $o("opTable").innerHTML = h + "</table>";
    let msg = "";
    for (const c of R.conflicts) if (shown[c.key] && shown[c.key].length > 1)
      msg += `<div class="conflictmsg">⚠ <b>Conflict</b> in cell [${E_(c.a)}, ${E_(c.b)}]: both ${c.rels.map(x => SYM[x]).join(" and ")}. The grammar is <b>not an operator precedence grammar</b> (precedence has to be fixed, for example by writing the grammar in levels such as E → E + T | T).</div>`;
    if (idx === R.steps.length - 1 && !R.conflicts.length)
      msg += `<div class="okmsg">✔ No conflicts: the grammar is an operator precedence grammar.</div>`;
    $o("opConflict").innerHTML = msg;
  }

  function renderTrace() {
    if (!trace) { $o("opTrace").innerHTML = ""; $o("opPNext").disabled = true; return; }
    let h = "<table><tr><th>Stack</th><th>Input</th><th>Relation</th><th>Action</th><th>Explanation</th></tr>";
    for (let k = 0; k <= pIdx; k++) {
      const r = trace.rows[k];
      h += `<tr class="${k === pIdx ? "newcell" : ""}"><td>${E_(r.stack)}</td><td>${E_(r.input)}</td><td>${E_(r.rel || "")}</td><td>${E_(r.action || "")}</td><td>${E_(r.note || "")}</td></tr>`;
    }
    h += "</table>";
    if (pIdx === trace.rows.length - 1)
      h += trace.accepted ? `<div class="okmsg">✔ ACCEPT</div>` : `<div class="conflictmsg">✘ REJECT</div>`;
    $o("opTrace").innerHTML = h;
    $o("opPNext").disabled = pIdx >= trace.rows.length - 1;
  }

  for (const name of Object.keys(OPRESETS)) $o("opPreset").add(new Option(name));
  $o("opPreset").onchange = () => { $o("opGrammar").value = OPRESETS[$o("opPreset").value]; opBuildUI(); };
  $o("opBuildBtn").onclick = opBuildUI;
  $o("opNext").onclick = () => { if (R && idx < R.steps.length - 1) { idx++; renderAll(); } };
  $o("opPrev").onclick = () => { if (R && idx >= 0) { idx--; renderAll(); } };
  $o("opAll").onclick = () => { if (R) { idx = R.steps.length - 1; renderAll(); } };
  $o("opReset").onclick = () => { if (R) { idx = -1; renderAll(); } };
  $o("opParseBtn").onclick = () => {
    if (!R) { $o("opTrace").textContent = "Build a valid operator grammar first."; return; }
    trace = opParse(R, $o("opInput").value); pIdx = 0; renderTrace();
  };
  $o("opPNext").onclick = () => { if (trace && pIdx < trace.rows.length - 1) { pIdx++; renderTrace(); } };
  $o("opPAll").onclick = () => { if (trace) { pIdx = trace.rows.length - 1; renderTrace(); } };

  $o("opGrammar").value = OPRESETS["Expression grammar (no conflict)"];
  opBuildUI();
})();