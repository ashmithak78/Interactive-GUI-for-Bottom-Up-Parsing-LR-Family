# Interactive GUI for Bottom-Up Parsing: The LR Family

A step-by-step visualizer for bottom-up parsing. Enter a grammar and watch the parser being built one step at a time, for LR(0), SLR(1), CLR(1), LALR(1) and Operator Precedence parsing.

**Live demo:** https://ashmithak78.github.io/Interactive-GUI-for-Bottom-Up-Parsing-LR-Family/

## Features

**LR Parsing tab** (choose LR(0), SLR(1), CLR(1) or LALR(1))
- Grammar parsing and augmentation (S' → S), with FIRST and FOLLOW sets
- Canonical collection of item sets, drawn as a state diagram that grows one step at a time
- Click any state to see how it was derived (kernel items and closure items)
- LALR(1): CLR(1) states are built first, then states with the same core are merged in visible MERGE steps
- ACTION / GOTO table filled one cell at a time, each entry linked to the item that produced it
- Shift-reduce and reduce-reduce conflicts marked in the cell (dashed border and a warning marker), with a message saying the grammar is not LR(0) / SLR(1) / CLR(1) / LALR(1)
- String parsing trace (Stack | Input | Action) ending in ACCEPT or REJECT

**Operator Precedence tab**
- Operator grammar check (no ε-productions, no adjacent non-terminals)
- LEADING and TRAILING sets, then the precedence relation table, built step by step
- Conflicts marked in the cell
- String parsing trace (Stack | Input | Relation | Action) ending in ACCEPT or REJECT

## How to run

Open `index.html` in Chrome. No installation or server is needed.
The state diagram uses the vis-network library, which loads from the internet, so an internet connection is needed the first time the page opens.

## Grammar format

- One production per line: `A -> X Y | Z`
- Separate symbols with spaces
- Empty production: `eps`
- The first line gives the start symbol
- Symbols that never appear on a left side are terminals

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and both tabs |
| `style.css` | Styling |
| `engine.js` | Grammar parsing, FIRST/FOLLOW, closure, goto, LR(0) item sets |
| `lr.js` | CLR(1) and LALR(1) item sets, ACTION/GOTO tables, conflict detection, string parsing |
| `op.js` | Operator Precedence parsing |
| `app.js` | Interface controller for the LR page, and tab switching |

## Test grammars

| Grammar | Expected result |
|---|---|
| `S -> C C`, `C -> c C \| d` | No conflicts. LR(0), SLR(1) and LALR(1) give 7 states, CLR(1) gives 10. |
| `S -> a B \| A c`, `B -> d`, `A -> r` | No conflicts, 8 states. |
| `E -> T + E \| T`, `T -> a` | Shift-reduce conflict in LR(0), resolved in SLR(1). |
| `S -> L = R \| R`, `L -> * R \| id`, `R -> L` | Shift-reduce conflict in SLR(1), resolved in CLR(1) and LALR(1). |
| `S -> a A d \| b B d \| a B e \| b A e`, `A -> c`, `B -> c` | Reduce-reduce conflict in LALR(1), resolved in CLR(1). |
| `E -> E + E \| E * E \| id` | Conflicts in every variant. In Operator Precedence it conflicts in the `+` and `*` cells. |
| `E -> E + T \| T`, `T -> T * F \| F`, `F -> ( E ) \| id` (Operator Precedence) | No conflicts. `id + id * id` is accepted and `id id` is rejected. |

The input to this tool is a user-typed grammar, so there is no dataset. The grammars above are the test inputs.

## Team

- Gajula Varsha (24BCE0417)
- Ashmitha Reddy Koduru (24BCI0224)
- Thipireddy Bhuvana Kruthi (24BCE2430)

Guide: Mukhtar Ahmed Sofi
Project: Compiler Design
