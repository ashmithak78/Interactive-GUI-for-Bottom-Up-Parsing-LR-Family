const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PRESETS = {
  "Textbook: S → C C":               "S -> C C\nC -> c C | d",
  "LR(0) conflict, SLR ok":          "E -> T + E | T\nT -> a",
  "SLR(1) conflict, CLR ok":         "S -> L = R | R\nL -> * R | id\nR -> L",
  "Ambiguous (fails all)":           "E -> E + E | E * E | id",
  "LALR reduce-reduce, CLR ok":      "S -> a A d | b B d | a B e | b A e\nA -> c\nB -> c",
  "Simple: S → ( S ) | a":           "S -> ( S ) | a"
};

let G = null, first = null, follow = null, result = null, stepIdx = -1, selected = null;
const nodes = new vis.DataSet(), edges = new vis.DataSet();


const network = new vis.Network($("graph"), { nodes, edges }, {
  layout: { hierarchical: { enabled: true, direction: "LR", sortMethod: "directed",
                            levelSeparation: 230, nodeSpacing: 120 } },
  physics: false,
  nodes: { shape: "box", margin: 10, font: { face: "monospace", align: "left", size: 13 } },
  edges: { arrows: "to", font: { size: 16, strokeWidth: 3 }, smooth: { enabled: true, type: "cubicBezier" } }
});
network.on("click", p => { if (p.nodes.length) selectState(p.nodes[0]); });


function itemStr(it) {
  const p = G.productions[it.prod];
  const r = p.rhs.slice();
  r.splice(it.dot, 0, "•");
  return p.lhs + " → " + r.join(" ") + (it.las ? "  ,  " + it.las.join("/") : "");
}
const sameItem = (a, b) => a.prod === b.prod && a.dot === b.dot;
const stateLabel = st => "I" + st.id + "\n" + st.items.map(itemStr).join("\n");


function build() {
  $("error").textContent = "";
  try {
    G = parseGrammar($("grammar").value);
  } catch (e) {
    $("error").textContent = e.message;
    return;
  }
  first = computeFirst(G);
  follow = computeFollow(G, first);
  result = buildCollection(G, first, $("variant").value);     
  stepIdx = -1;
  selected = null;

  $("augmented").innerHTML = "<table>" + G.productions.map(p =>
    `<tr><td>${p.id}</td><td>${esc(p.lhs)} → ${p.rhs.length ? esc(p.rhs.join(" ")) : EPS}</td></tr>`).join("") + "</table>";

  let ff = "<table><tr><th>Symbol</th><th>FIRST</th><th>FOLLOW</th></tr>";
  for (const n of G.nonTerminals)
    ff += `<tr><td>${esc(n)}</td><td>{ ${esc([...first[n]].join(", "))} }</td><td>{ ${esc([...follow[n]].join(", "))} }</td></tr>`;
  $("firstfollow").innerHTML = ff + "</table>";

  render();
  initTable();
}


let curStates = {};

function render() {
  nodes.clear(); edges.clear();
  const src = result.clrStates || result.states;
  const cur = {}, alias = {}, elist = [];
  let last = null;
  for (let k = 0; k <= stepIdx; k++) {
    const s = result.steps[k];
    if (s.type === "addState") { cur[s.stateId] = src[s.stateId]; alias[s.stateId] = s.stateId; last = s.stateId; }
    if (s.type === "merge") { s.members.forEach(m => { delete cur[m]; alias[m] = s.target; }); cur[s.target] = s.state; last = s.target; }
    if (s.edge) elist.push(s.edge);
  }
  curStates = cur;
  const a = id => alias[id] !== undefined ? alias[id] : id;
  const ids = Object.keys(cur).map(Number).sort((x, y) => x - y);

  for (const id of ids)
    nodes.add({ id, label: "I" + cur[id].name + "\n" + cur[id].items.map(itemStr).join("\n"),
                color: { background: id === last ? "#fff3b0" : "#e8f0fe", border: "#4a6fa5" } });
  const seen = new Set();
  for (const e of elist) {
    const f = a(e.from), t = a(e.to), key = f + "_" + e.label + "_" + t;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.add({ id: key, from: f, to: t, label: e.label });
  }

  if (stepIdx < 0) $("stepNote").textContent = "Press Next Step to start.";
  else {
    const total = result.steps.length;
    $("stepNote").textContent = `Step ${stepIdx + 1}/${total}: ` + result.steps[stepIdx].note +
      (stepIdx === total - 1 ? "   ✔ Collection complete (" + result.states.length + " states)" : "");
  }
  $("prevBtn").disabled = stepIdx < 0;
  $("nextBtn").disabled = stepIdx >= result.steps.length - 1;

  $("cards").innerHTML = ids.map(id => {
    const st = cur[id];
    const lines = st.items.map(it =>
      st.kernel.some(k => sameItem(k, it)) ? esc(itemStr(it))
        : `<span class="closure">${esc(itemStr(it))}</span>`).join("\n");
    return `<div class="card ${id === selected ? "selected" : ""}" data-id="${id}"><b>I${esc(st.name)}</b><pre>${lines}</pre></div>`;
  }).join("");

  if (selected !== null && cur[selected]) explain(selected);
  else $("explain").textContent = "Click a state (in graph or list) to see how it was derived.";
}


function selectState(id) {
  selected = id;
  render();
  try { network.selectNodes([id]); } catch (e) {}
}

function explain(id) {
  const st = curStates[id];
  let h = `<b>I${esc(st.name)}</b><br>`;
  if (st.members && st.members.length > 1) {
    h += `Merged from CLR(1) states ${st.members.map(m => "I" + m).join(", ")}: they have the <b>same core</b> (same productions and dot positions), so they are combined and their lookaheads are united.<br>`;
  } else if (!st.from) {
    h += `Start state = closure of { ${esc(itemStr(st.kernel[0]))} }.<br>`;
  } else {
    const f = st.from, la = !!st.items[0].las;
    h += `I${esc(st.name)} = goto(I${f.state}, <b>${esc(f.symbol)}</b>)<ol>
      <li>In I${f.state}, pick items with • just before <b>${esc(f.symbol)}</b>.</li>
      <li>Move • one step to the right → these are the <b>kernel</b> items (lookaheads are carried along).</li>
      <li>Take closure: only if • is before a <b>non-terminal</b> B, add B's productions with • at the start${la ? "; for [A → α•Bβ, a] the new lookaheads are FIRST(βa)" : ""}.</li></ol>`;
  }
  h += "<b>Kernel:</b> " + st.kernel.map(k => esc(itemStr(k))).join(" ; ") + "<br>";
  const added = st.items.filter(it => !st.kernel.some(k => sameItem(k, it)));
  h += "<b>Added by closure:</b> " + (added.length ? added.map(x => esc(itemStr(x))).join(" ; ") : "none");
  $("explain").innerHTML = h;
}


$("buildBtn").onclick = build;
$("nextBtn").onclick = () => { if (result && stepIdx < result.steps.length - 1) { stepIdx++; render(); } };
$("prevBtn").onclick = () => { if (result && stepIdx >= 0) { stepIdx--; render(); } };
$("allBtn").onclick  = () => { if (result) { stepIdx = result.steps.length - 1; render(); } };
$("resetBtn").onclick = () => { if (result) { stepIdx = -1; selected = null; render(); } };
$("cards").onclick = e => {
  const c = e.target.closest(".card");
  if (c) selectState(+c.dataset.id);
};


for (const name of Object.keys(PRESETS)) $("preset").add(new Option(name));
$("preset").onchange = () => { $("grammar").value = PRESETS[$("preset").value]; build(); };

function variantNote() {
  const v = $("variant").value;
  $("variantNote").textContent =
    v === "LR(0)"   ? "LR(0): a complete item reduces on EVERY terminal column."
  : v === "SLR(1)"  ? "SLR(1): same item sets as LR(0); a complete item A → α• reduces only on FOLLOW(A)."
  : v === "CLR(1)"  ? "CLR(1): items carry lookaheads [A → α•β, a]; a complete item reduces only on its own lookahead."
  :                   "LALR(1): CLR(1) states with the same core are merged (watch for the MERGE steps at the end), then the table is built from lookaheads.";
}
$("variant").onchange = () => { variantNote(); build(); };
$("grammar").value = PRESETS["Textbook: S → C C"];
variantNote();
setupLR();
build();
document.querySelectorAll(".subtab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".subtab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  document.querySelectorAll(".page").forEach(p => p.style.display = "none");
  $(b.dataset.target).style.display = "block";
});