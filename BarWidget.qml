import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// Bar widget for snote: a bar button that launches (or focuses) snote, a
// Simplenote client, in a terminal. There is no panel — a left click either
// runs the launcher (snote already on PATH, and up to date) or opens a
// visible setup terminal that installs snote by copying this plugin clone's
// own pre-built files into place (or refreshes them, after a plugin
// update), then launches it. Nothing is compiled; the install is a copy.
// When the machine is missing a new-enough Node.js, this same terminal
// shows the one command that fixes it (setup checks for Node before it
// copies anything, and exits non-zero with that command before the
// launcher line can run).
BarWidget {
  id: root
  moduleName: "io.github.donnishcomau.snote-simplenote"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // "unknown" until the shim-file probe below finishes, then "available" or
  // "missing". Starting unknown keeps the tooltip from claiming snote is
  // missing before the check has actually run.
  property string snoteStatus: "unknown"
  readonly property bool snoteAvailable: snoteStatus === "available"

  // Where setup installs the launcher shim (setup puts it there directly),
  // so the probe checks that file instead of trusting the shell's PATH.
  readonly property string snoteShim: Quickshell.env("HOME") + "/.local/bin/snote"

  // "unknown" until the version-compare probe below finishes, then
  // "current" or "stale". A plugin update (`omarchy plugin update`)
  // refreshes this clone's own pre-built payload under plugin-dist/ but
  // not the already installed copy under
  // ~/.local/share/omarchy-snote-plugin/app — this probe is what notices
  // that and routes the next click back through setup, so the copy is
  // refreshed, even though the shim probe still succeeds (pointing at the
  // previously installed copy).
  property string versionStatus: "unknown"
  readonly property bool snoteStale: versionStatus === "stale"

  // Drives the glyph's colour below: true while snote is missing or out
  // of date (theme accent, Color.accent), false while it is installed and
  // current (the host bar's own text colour, Color.foreground when no bar
  // is bound). The bar button's foreground binding reads this and
  // re-evaluates whenever it flips.
  readonly property bool needsAttention: root.snoteStatus === "missing" || root.snoteStale

  // tooltip-format:begin
  function formatAgo(diffMs) {
    var sec = Math.floor(diffMs / 1000)
    if (sec < 60) return "just now"
    var min = Math.floor(sec / 60)
    if (min < 60) return min + "m ago"
    var hr = Math.floor(min / 60)
    if (hr < 24) return hr + "h ago"
    var day = Math.floor(hr / 24)
    return day + "d ago"
  }

  function formatTooltip(status, nowMs, baseText) {
    if (status === null) {
      return baseText + "\nClick: open · Middle-click: new note"
    }
    var lines = []
    var noun = status.count === 1 ? "note" : "notes"
    lines.push("snote — " + status.count + " " + noun)
    if (status.last !== null) lines.push("Last: " + status.last.title)
    if (status.synced === null) {
      lines.push("Not synced yet")
    } else {
      var ago = formatAgo(nowMs - Date.parse(status.synced))
      lines.push(ago === "just now" ? "Synced just now" : "Synced " + ago)
    }
    lines.push("Click: open · Middle-click: new note")
    return lines.join("\n")
  }
  // tooltip-format:end

  // Live status snapshot read from the status.json the app writes while
  // it runs (T358); null while the file is missing or unreadable, which
  // falls the tooltip back to defaultTooltip plus the click hint.
  property var statusData: null

  // When the tooltip was last hovered: the only moment the ages shown
  // there are recomputed (no ticking timer).
  property double nowMs: Date.now()

  // Where the app publishes status.json — the same location T358's
  // statusDir() computes: SNOTE_STATUS_DIR when non-empty, else the
  // plugin's data directory under XDG_DATA_HOME (or ~/.local/share).
  readonly property string statusPath: {
    var dir = Quickshell.env("SNOTE_STATUS_DIR")
    if (!dir) {
      var base = Quickshell.env("XDG_DATA_HOME") || (Quickshell.env("HOME") + "/.local/share")
      dir = base + "/omarchy-snote-plugin"
    }
    return dir + "/status.json"
  }

  // Parse a status.json payload; keep the object only when it actually
  // carries a note count, else fall back to null.
  function applyStatus(raw) {
    try {
      var s = JSON.parse(raw)
      root.statusData = (typeof s.count === "number") ? s : null
    } catch (e) {
      root.statusData = null
    }
  }

  // FileView cannot observe a file that does not exist yet (status.json
  // appears only after snote first runs), so reprobe() reloads it
  // explicitly on every hover and on the install countdown timer.
  // onFileChanged routes through reload() because text() is stale in
  // the change signal itself.
  FileView {
    id: statusFile
    path: root.statusPath
    watchChanges: true
    printErrors: false
    onLoaded: root.applyStatus(text())
    onLoadFailed: root.statusData = null
    onFileChanged: reload()
  }

  readonly property string defaultTooltip: "snote — Simplenote in your terminal"
  readonly property string installTooltip: "Click to install snote (copies the pre-built app, no build)"
  readonly property string updateTooltip: "snote — update available, click to install and launch"
  readonly property string tooltipMessage: snoteStatus === "missing" ? root.installTooltip
    : root.snoteStale ? root.updateTooltip
    : root.formatTooltip(root.statusData, root.nowMs, root.defaultTooltip)

  // Resolve a file shipped next to this .qml (the plugin's own clone
  // directory) to a plain filesystem path, the same pattern the camera
  // plugin uses for its probe script: Qt.resolvedUrl gives a file:// URL,
  // and Process.command wants a real path.
  function localPath(name) {
    var url = Qt.resolvedUrl(name).toString()
    if (url.indexOf("file://") === 0) return decodeURIComponent(url.substring(7))
    return url
  }

  readonly property string setupScript: root.localPath("packaging/omarchy/setup")

  // setupScript is a plain filesystem path built from this plugin clone's
  // own on-disk location (via Qt.resolvedUrl, not from any environment
  // variable), so in practice it never contains a single quote. Still,
  // launchOrHint() below embeds it inside a single-quoted shell string, so
  // escape defensively rather than assume: a literal single quote in the
  // path would otherwise close that quote early and let whatever follows
  // it run as a second, unintended shell command.
  function shellEscapeSingleQuoted(path) {
    return String(path).replace(/'/g, "'\\''")
  }

  // After a setup click, bar.run is fire-and-forget, so nothing reports the
  // install back here; reprobe() counts down on a timer until both probes
  // agree the install is done. settle() stops the countdown early once
  // snoteStatus === "available" and versionStatus === "current".
  property int reprobeLeft: 0

  function reprobe() {
    checkSnoteProc.running = true
    checkVersionProc.running = true
    statusFile.reload()
  }

  function settle() {
    if (root.snoteStatus === "available" && root.versionStatus === "current")
      root.reprobeLeft = 0
  }

  function launchOrHint() {
    if (root.snoteAvailable && !root.snoteStale) {
      if (root.bar) root.bar.run("omarchy-launch-or-focus-tui snote")
      return
    }
    if (root.bar) {
      root.bar.run(
        "omarchy-launch-floating-terminal-with-presentation '"
        + root.shellEscapeSingleQuoted(root.setupScript) + " && omarchy-launch-or-focus-tui snote'"
      )
      root.reprobeLeft = 15
    }
  }

  // Middle click: a new note. Only meaningful when snote is installed
  // and current; otherwise it does what a left click does (the install
  // path) rather than a broken `--new`. Note the launcher limitation
  // documented in the README: if snote is already running, it only
  // focuses the existing window and the `--new` argument is dropped.
  function newNote() {
    if (root.snoteAvailable && !root.snoteStale) {
      if (root.bar) root.bar.run("omarchy-launch-or-focus-tui snote --new")
      return
    }
    root.launchOrHint()
  }

  Process {
    id: checkSnoteProc
    command: ["test", "-x", root.snoteShim]
    onExited: function(exitCode) {
      root.snoteStatus = exitCode === 0 ? "available" : "missing"
      root.settle()
    }
  }

  // `packaging/omarchy/setup --check` does the same plain-text VERSION
  // compare setup itself uses for its idempotent fast path (this clone's
  // plugin-dist/VERSION vs. the installed app's VERSION file, both read
  // without invoking node) and exits 0/1 accordingly — reusing that single
  // definition here instead of duplicating the comparison in QML.
  Process {
    id: checkVersionProc
    command: [root.setupScript, "--check"]
    onExited: function(exitCode) {
      root.versionStatus = exitCode === 0 ? "current" : "stale"
      root.settle()
    }
  }

  Timer {
    id: reprobeTimer
    interval: 4000
    repeat: true
    running: root.reprobeLeft > 0
    onTriggered: {
      root.reprobeLeft = root.reprobeLeft - 1
      root.reprobe()
    }
  }

  Timer {
    id: ageTimer
    interval: 30000
    repeat: true
    running: button.tooltipHovered
    onTriggered: root.nowMs = Date.now()
  }

  Component.onCompleted: {
    root.reprobe()
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "\uf249"
    foreground: root.needsAttention ? Color.accent : (root.bar ? root.bar.barForeground : Color.foreground)
    tooltipText: root.tooltipMessage
    onTooltipHoveredChanged: if (tooltipHovered) { root.nowMs = Date.now(); root.reprobe() }

    onPressed: function(b) {
      if (b === Qt.RightButton) return
      if (b === Qt.MiddleButton) { root.newNote(); return }
      root.launchOrHint()
    }
  }
}
