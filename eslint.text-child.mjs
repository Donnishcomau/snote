import path from 'node:path';
import { scopeBlocks } from './eslint.scope.mjs';
import { FS_WRITE_EXTENSIONS } from './eslint.fs-write.mjs';

// #419 (security): every JSX expression child of an Ink <Text> anywhere under src/ is a literal, a
// constant, a call of the imported sanitiser or a listed source. A new raw child (a title, a lock message, an error) fails lint.
//
// Why a rule of our own: the R4 guard (eslint.terminal-sink.mjs) bans raw console and stream writes but does not look at what
// Ink renders. This is a plugin rule under scopeBlocks, so it adds to the other guards and no inline directive switches it off.
//
// IN SCOPE (each has a test in test/structure/text-child-lint.test.ts):
//  - every expression child of a <Text> element or of any element or fragment lexically inside one, also inside the branches of
//    ?:, && (right side), || and ?? (C1)
//  - `children=` on a <Text>, a spread of an object literal that carries `children` (or a computed key or a nested spread) (C2)
//  - a default or namespace import of 'ink', a re-export from 'ink', `const X = Text`, `X = Text` (C2)
// RESIDUAL (out of scope; code review and the security audit cover them): a wrapper component that takes a prop and prints it
// (`<MdRowText text=.../>`), createElement(Text, ...), `const O = { Text }`, Text passed as a value, a spread of a non-literal
// object onto <Text>, third-party components that print a prop (an input's value), the inside of an allowlisted expression
// (a map callback holds JSX), and a same-named shadowing variable in the same file that inherits an allowlist entry
// (the allowlist matches file and exact source text, not the binding).

/**
 * Allowlist = DATA. One entry per (file, exact source text of the child). `source`: where the value is sanitised, or why it cannot
 * carry outside text. `proof`: `<test file> <it() number>` of the test that fails if that source stopped sanitising.
 * Rules (C4): data only; no entry for an expression holding `+`, a call, or a member whose argument is raw.
 * A proof for a sanitiser-backed entry must be a test that goes red when the sanitiser is removed (each is checked by
 * removing its sanitiser, and the check is repeated at each release audit); a test that only checks the entry exists proves nothing.
 */
export const TEXT_CHILD_ALLOWLIST = [
 { file: "src/tui/BottomArea.tsx", expr: "'published: ' + (publishLink(selectedEntry.note) ?? 'waiting for link')", source: "publishLink returns 'https://simp.ly/p/' + the publishURL only when it matches PUBLISH_ID (a short id), else null; the constant 'published: ' and 'waiting for link' are literals; selectedEntry is the selected note entry, only its note goes through publishLink", proof: "test/tui/hostile-layer2.test.tsx 1" },
 { file: "src/tui/BottomArea.tsx", expr: "blogLine", source: "blogStatusLine (src/core/blog-status.ts) runs sanitizeForTerminal over the url and the sentAt it prints", proof: "test/tui/text-child-proofs.test.tsx 4" },
 { file: "src/tui/BottomArea.tsx", expr: "sl", source: "sharedLine (src/core/note-keys.ts) runs sanitizeForTerminal over each email tag it prints", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/Divider.tsx", expr: "Array.from({ length: Math.max(0, height) }, () => '│').join('\\n')", source: "only the box-drawing constant '│' repeated height times; height is a number prop and no text reaches it", proof: "test/tui/divider.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "cutLine(entry.description, narrowColWidth - 9)", source: "cutLine only slices the static keymap description of entry; narrowColWidth is a number computed from the window width; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-cut.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "editorHint", source: "editorFinishHint (src/core/editor-select.ts) returns one of three fixed sentences and never includes the editor name", proof: "test/core/editor-select.test.ts 6" },
 { file: "src/tui/Help.tsx", expr: "entry.key.padEnd(8)", source: "the key label of entry from the static keymap table; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-layout.test.tsx 2" },
 { file: "src/tui/Help.tsx", expr: "i === 0 ? withVersion(line) : line", source: "i is the line index; withVersion adds the build-time version string (setShownVersion(VERSION)) to the first line; line comes from layoutHelp, built from the static keymap table; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-layout.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "keyPart", source: "a slice of the static keymap key and description text; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-cut.test.tsx 3" },
 { file: "src/tui/Help.tsx", expr: "l.text.slice(0, l.keyLen)", source: "l is a line of helpListLines (src/core/help-list.ts), built from the static keymap table; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-cut.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "l.text.slice(l.keyLen)", source: "l is a line of helpListLines (src/core/help-list.ts), built from the static keymap table; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-cut.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "name", source: "the section name from the static SECTIONS table; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-layout.test.tsx 3" },
 { file: "src/tui/Help.tsx", expr: "restPart", source: "a slice of the static keymap key and description text; the static keymap table (src/core/help-sections and the keymap) text, no note or server data", proof: "test/tui/help-cut.test.tsx 3" },
 { file: "src/tui/Help.tsx", expr: "win.counter", source: "the scroll counter of helpListWindow, built from numbers only", proof: "test/tui/help-short-list.test.tsx 1" },
 { file: "src/tui/Help.tsx", expr: "withVersion('Help - Keyboard Shortcuts')", source: "withVersion adds the build-time version string (setShownVersion(VERSION)) to the constant title", proof: "test/tui/shown-version.test.tsx 1" },
 { file: "src/tui/History.tsx", expr: "truncated", source: "the row is revisionLabel(rev) (src/core/history.ts), which runs sanitizeForTerminal over the revision title; the rest is the version number and an ISO date", proof: "test/tui/hostile-layer2.test.tsx 11" },
 { file: "src/tui/KeyHints.tsx", expr: "h.key", source: "the hint table (hintsForContext in src/tui/KeyHints.tsx) is static key labels; no note or server data", proof: "test/tui/key-hints.test.tsx 1" },
 { file: "src/tui/KeyHints.tsx", expr: "h.label", source: "the hint table (hintsForContext in src/tui/KeyHints.tsx) is static labels; the pin label is the literal Pin or Unpin; no note or server data", proof: "test/tui/key-hints.test.tsx 1" },
 { file: "src/tui/Login.tsx", expr: "'*'.repeat(password.length)", source: "only the asterisk constant repeated password.length times; the typed password is never printed", proof: "test/tui/login-password.test.tsx 3" },
 { file: "src/tui/MainPanes.tsx", expr: "'tag: ' + sanitizeForTerminal(collection.tagName ?? '')", source: "the tag name collection.tagName goes through sanitizeForTerminal; 'tag: ' is a literal", proof: "test/tui/tag-real-name.test.tsx 2" },
 { file: "src/tui/MainPanes.tsx", expr: "shown", source: "shown is 'search: ' + sanitizeForTerminal(query), cut to the width with the slice of the same string (the typed search text; the sync status values are shown by the StatusBar entry, not here)", proof: "test/tui/typed-text-sanitised.test.tsx 1" },
 { file: "src/tui/NoteList.tsx", expr: "'─'.repeat(colWidth - 2)", source: "only the rule constant repeated colWidth - 2 times; colWidth is a number", proof: "test/tui/note-list-separator.test.tsx 1" },
 { file: "src/tui/NoteList.tsx", expr: "marker", source: "noteRow (src/core/note-row.ts) sets marker to the empty string constant", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/NoteList.tsx", expr: "previewLines[p]", source: "previewLines come from noteRow (src/core/note-row.ts), which runs sanitizeForTerminal over the preview before wrapping; p is the line index", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/NoteList.tsx", expr: "title", source: "noteRow (src/core/note-row.ts) runs sanitizeForTerminal over the title before it is cut", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/PaneHeading.tsx", expr: "label", source: "every caller passes a literal heading (Notes, Tags, History, Preview) or 'Preview: ' + a title that went through sanitizeForTerminal", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/PaneHeading.tsx", expr: "label.padEnd(width)", source: "label as above (literal or sanitised title); width is a number", proof: "test/tui/hostile-layer1.test.tsx 1" },
 { file: "src/tui/Preview.tsx", expr: "gutter", source: "gutterRows hold only the constant > marker, a space or null", proof: "test/tui/preview-cursor.test.tsx 1" },
 { file: "src/tui/Preview.tsx", expr: "shownTags.map((t) => '#' + t).join(' ')", source: "shownTags is the note tags mapped through sanitizeForTerminal two lines up (test/tui/preview-tag-sanitize.test.tsx 3 reads that line); t is each sanitised tag; '#' and ' ' are literals", proof: "test/tui/preview-tag-sanitize.test.tsx 1" },
 { file: "src/tui/Prompt.tsx", expr: "label", source: "every caller (BottomArea.tsx and blog-send-dialog.tsx) passes a literal, 'log out: ' + logoutWarning(...) (counts only) or 'empty trash (' + emptyAsk + ...) (a count); no sanitiser is involved and no note or server text reaches it", proof: "test/tui/hostile-layer2.test.tsx 21" },
 { file: "src/tui/Prompt.tsx", expr: "question", source: "every caller passes a literal or 'delete tag ' + sanitizeForTerminal(tagName) + '?'; no raw note or server text", proof: "test/tui/tag-real-name.test.tsx 4" },
 { file: "src/tui/Root.tsx", expr: "forced", source: "forced is the result of signOutByServer (src/core/token.ts): a fixed sentence with a count and the account folder name through sanitizeForTerminal, or null", proof: "test/tui/text-child-proofs.test.tsx 3" },
 { file: "src/tui/Root.tsx", expr: "l", source: "l is a line of smallLines, a slice of the constant TOO_SMALL message", proof: "test/tui/too-small.test.tsx 1" },
 { file: "src/tui/StatusBar.tsx", expr: "p.text", source: "the parts hold the connection word (a fixed vocabulary), counts (numbers), the pending count and the label: 'trash', a sort label (a fixed vocabulary) or the sync status 'synced HH:MM' / 'sync requested' (app-actions.ts, fixed text and a clock time); the version tag v<VERSION> (a build constant, via statusTag), the space padding and the ellipsis of the width cut; no note or server text", proof: "test/tui/status-bar-count-dim.test.tsx 1" },
 { file: "src/tui/TagEditor.tsx", expr: "display", source: "display is 'tags: ' plus the tags each through sanitizeForTerminal, plus fixed hint text", proof: "test/tui/hostile-layer1.test.tsx 4" },
 { file: "src/tui/TagEditor.tsx", expr: "restOfSuggestion", source: "restOfSuggestion is sanitizeForTerminal(suggestion.slice(text.length))", proof: "test/tui/text-child-proofs.test.tsx 2" },
 { file: "src/tui/TagPane.tsx", expr: "label.length > width - 2 ? label.slice(0, width - 3) + '…' : label", source: "label is sanitizeForTerminal(String(tag)) or a fixed '… N more' count line (the labels map), cut by width; width is a number; the ellipsis is a literal", proof: "test/tui/text-child-proofs.test.tsx 1" },
 { file: "src/tui/blog-send-dialog.tsx", expr: "(resend ? RESEND_QUESTION : SEND_QUESTION) + ' y/n'", source: "resend selects between the constants RESEND_QUESTION and SEND_QUESTION; ' y/n' is a literal; no external text", proof: "test/tui/blog-confirm.test.tsx 1" },
 { file: "src/tui/md-row.tsx", expr: "bodyPieces(text, spans, 0)", source: "bodyPieces slices text by the spans (numbers); text is a preview body row, cut from content that Preview.tsx already ran through sanitizeForTerminal", proof: "test/tui/hostile-layer1.test.tsx 2" },
 { file: "src/tui/md-row.tsx", expr: "bodyPieces(text, spans, glyph.end)", source: "bodyPieces slices text by the spans after the glyph end (numbers); text is a preview body row, cut from content that Preview.tsx already ran through sanitizeForTerminal; glyph is the checklist box character of glyphOf", proof: "test/tui/hostile-layer1.test.tsx 2" },
 { file: "src/tui/md-row.tsx", expr: "glyph.char", source: "glyph.char is one of the two checklist box characters from glyphOf", proof: "test/tui/preview-checklist-color.test.tsx 1" },
 { file: "src/tui/md-row.tsx", expr: "text.slice(span.start, span.end)", source: "a slice of text by the numbers of span; text is a preview body row, cut from content that Preview.tsx already ran through sanitizeForTerminal", proof: "test/tui/hostile-layer1.test.tsx 2" },
];

const SOURCES = { sanitizeForTerminal: 'src/core/sanitize', standInText: 'src/tui/standin' };
const MSG = '(#419): <Text> child not a sanitiser call, a constant or a listed source';

function findVar(scope, name) {
  for (let s = scope; s; s = s.upper) { const v = s.set.get(name); if (v) return v; }
  return null;
}
function importDef(scope, name) {
  const v = findVar(scope, name);
  return v && v.defs.length === 1 && v.defs[0].type === 'ImportBinding' && v.defs[0].parent && v.defs[0].parent.type === 'ImportDeclaration' ? v.defs[0] : null;
}
const isLit = (n) => !!n && ((n.type === 'Literal' && (typeof n.value === 'string' || typeof n.value === 'number' || n.value === null)) || (n.type === 'TemplateLiteral' && n.expressions.length === 0));
const stripTs = (n) => { let x = n; while (x && (x.type === 'TSAsExpression' || x.type === 'TSNonNullExpression' || x.type === 'TSSatisfiesExpression' || x.type === 'TSTypeAssertion')) x = x.expression; return x; };

export const textChildRule = {
  meta: { type: 'problem', schema: [{ type: 'object', properties: { allowlist: { type: 'array' } }, additionalProperties: false }] },
  create(context) {
    const allow = (context.options[0] && context.options[0].allowlist) || [];
    const abs = context.filename.replace(/\\/g, '/');
    const rel = path.relative(context.cwd, context.filename).replace(/\\/g, '/');
    const src = context.sourceCode;
    const report = (node, text) => context.report({ node, message: `snote-text/child ${MSG}: ${JSON.stringify(text)}` });

    const isInkText = (nameNode, scope) => {
      if (!nameNode || nameNode.type !== 'JSXIdentifier') return false;
      const d = importDef(scope, nameNode.name);
      return !!d && d.parent.source.value === 'ink' && d.node.type === 'ImportSpecifier' && (d.node.imported.name ?? d.node.imported.value) === 'Text';
    };
    const isTextIdent = (n, scope) => {
      const x = stripTs(n);
      if (!x || x.type !== 'Identifier') return false;
      const d = importDef(scope, x.name);
      return !!d && d.parent.source.value === 'ink' && d.node.type === 'ImportSpecifier' && (d.node.imported.name ?? d.node.imported.value) === 'Text';
    };
    const fromSource = (d, name) => {
      const s = d.parent.source.value;
      if (!s.startsWith('.')) return false;
      const target = path.relative(context.cwd, path.resolve(path.dirname(abs), s)).replace(/\\/g, '/').replace(/\.(ts|tsx|mts)$/, '');
      return target === SOURCES[name];
    };

    // a child that needs no entry. JSX counts as accepted here and is walked separately.
    const accepted = (n, scope) => {
      if (!n) return false;
      if (isLit(n)) return true;
      switch (n.type) {
        case 'ConditionalExpression': return accepted(n.consequent, scope) && accepted(n.alternate, scope);
        case 'LogicalExpression': return n.operator === '&&' ? accepted(n.right, scope) : accepted(n.left, scope) && accepted(n.right, scope);
        case 'JSXElement': case 'JSXFragment': return true;
        case 'CallExpression': {
          if (n.callee.type !== 'Identifier' || !Object.hasOwn(SOURCES, n.callee.name)) return false;
          const d = importDef(scope, n.callee.name);
          return !!d && d.node.type === 'ImportSpecifier' && (d.node.imported.name ?? d.node.imported.value) === n.callee.name && fromSource(d, n.callee.name);
        }
        case 'Identifier': {
          const v = findVar(scope, n.name);
          if (!v || v.defs.length !== 1) return false;
          const d = v.defs[0];
          return d.type === 'Variable' && d.parent.kind === 'const' && d.node.id.type === 'Identifier' && isLit(d.node.init) && d.node.init.value !== null;
        }
        default: return false;
      }
    };
    // the JSX nodes an accepted form lets through (branches of ?:, right of &&, both of || and ??)
    const jsxIn = (n, out = []) => {
      if (!n) return out;
      if (n.type === 'JSXElement' || n.type === 'JSXFragment') out.push(n);
      else if (n.type === 'ConditionalExpression') { jsxIn(n.consequent, out); jsxIn(n.alternate, out); }
      else if (n.type === 'LogicalExpression') { if (n.operator !== '&&') jsxIn(n.left, out); jsxIn(n.right, out); }
      return out;
    };
    const listed = (text) => allow.some((e) => e.file === rel && e.expr === text);

    const judgeExpr = (expr, scope) => {
      if (!expr || expr.type === 'JSXEmptyExpression') return;
      if (!accepted(expr, scope)) {
        const text = src.getText(expr);
        if (!listed(text)) report(expr, text);
      }
      for (const j of jsxIn(expr)) walkJsx(j, scope);
    };
    const spreadCarriesChildren = (arg) => {
      const o = stripTs(arg);
      if (!o || o.type !== 'ObjectExpression') return false;
      return o.properties.some((p) => p.type === 'SpreadElement' || p.computed || (p.key && (p.key.name ?? p.key.value) === 'children'));
    };
    const checkAttrs = (el, scope, isText) => {
      for (const a of el.openingElement.attributes) {
        if (a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'children') {
          if (isText) report(a, `children=${a.value ? src.getText(a.value) : ''}`);
          else if (a.value && a.value.type === 'JSXExpressionContainer') judgeExpr(a.value.expression, scope);
        } else if (a.type === 'JSXSpreadAttribute' && spreadCarriesChildren(a.argument)) {
          report(a, `{...${src.getText(a.argument)}}`);
        }
      }
    };
    const walkChildren = (children, scope) => {
      for (const c of children) {
        if (c.type === 'JSXExpressionContainer') judgeExpr(c.expression, scope);
        else if (c.type === 'JSXSpreadChild') { const t = src.getText(c.expression); if (!listed(t)) report(c, t); }
        else if (c.type === 'JSXElement' || c.type === 'JSXFragment') walkJsx(c, scope);
      }
    };
    // a node inside a Text. A nested Text is judged by its own visit, so it is skipped here.
    const walkJsx = (n, scope) => {
      if (n.type === 'JSXElement') {
        if (isInkText(n.openingElement.name, scope)) return;
        checkAttrs(n, scope, false);
      }
      walkChildren(n.children, scope);
    };

    return {
      JSXElement(node) {
        const scope = src.getScope(node);
        if (!isInkText(node.openingElement.name, scope)) return;
        checkAttrs(node, scope, true);
        walkChildren(node.children, scope);
      },
      ImportDeclaration(node) {
        if (node.source.value !== 'ink' || node.importKind === 'type') return;
        for (const s of node.specifiers) {
          if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') report(s, src.getText(node));
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source && node.source.value === 'ink' && node.exportKind !== 'type') report(node, src.getText(node));
        else if (!node.source && node.specifiers.some((s) => isTextIdent(s.local, src.getScope(node)))) report(node, src.getText(node));
      },
      ExportDefaultDeclaration(node) { if (isTextIdent(node.declaration, src.getScope(node))) report(node, src.getText(node)); },
      ExportAllDeclaration(node) { if (node.source && node.source.value === 'ink' && node.exportKind !== 'type') report(node, src.getText(node)); },
      ImportExpression(node) { if (node.source.value === 'ink') report(node, src.getText(node)); },
      TSImportEqualsDeclaration(node) { if (node.moduleReference.expression && node.moduleReference.expression.value === 'ink') report(node, src.getText(node)); },
      CallExpression(node) { if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0] && node.arguments[0].value === 'ink') report(node, src.getText(node)); },
      VariableDeclarator(node) { if (node.init && isTextIdent(node.init, src.getScope(node))) report(node, src.getText(node)); },
      AssignmentExpression(node) { if (isTextIdent(node.right, src.getScope(node))) report(node, src.getText(node)); },
    };
  },
};
export const TEXT_CHILD_PLUGIN = { rules: { child: textChildRule } };

const EXT = `{${FS_WRITE_EXTENSIONS.join(',')}}`;
export const TEXT_CHILD_FILES = [`src/**/*.${EXT}`];
export const textChildBlocks = [
  { name: 'text-child:plugin', files: TEXT_CHILD_FILES, plugins: { 'snote-text': TEXT_CHILD_PLUGIN } },
  ...scopeBlocks({ name: 'text-child', files: TEXT_CHILD_FILES, rules: { 'snote-text/child': ['error', { allowlist: TEXT_CHILD_ALLOWLIST }] } }),
];
