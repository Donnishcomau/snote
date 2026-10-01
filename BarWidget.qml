import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui

// Bar widget for snote: a bar button that launches (or focuses) snote, a
// Simplenote client, in a terminal. There is no panel — a left click either
// runs the launcher (snote already on PATH, and up to date) or opens a
// visible setup terminal that builds (or rebuilds, after a plugin update)
// snote from this clone's own source, then launches it.
BarWidget {
  id: root
  moduleName: "io.github.donnishcomau.snote-simplenote"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // "unknown" until the PATH probe below finishes, then "available" or
  // "missing". Starting unknown keeps the tooltip from claiming snote is
  // missing before the check has actually run.
  property string snoteStatus: "unknown"
  readonly property bool snoteAvailable: snoteStatus === "available"

  // "unknown" until the version-compare probe below finishes, then
  // "current" or "stale". A plugin update (`omarchy plugin update`)
  // refreshes this clone's own package.json version but not the already
  // built install under ~/.local/share/omarchy-snote-plugin/app — this
  // probe is what notices that and routes the next click back through
  // setup instead of straight to launch, even though `which snote` still
  // succeeds (pointing at the old build).
  property string versionStatus: "unknown"
  readonly property bool snoteStale: versionStatus === "stale"

  readonly property string defaultTooltip: "snote — Simplenote in your terminal"
  readonly property string installTooltip: "snote — click to install and launch"
  readonly property string updateTooltip: "snote — update available, click to install and launch"
  readonly property string tooltipMessage: snoteStatus === "missing" ? root.installTooltip
    : root.snoteStale ? root.updateTooltip
    : root.defaultTooltip

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
    }
  }

  Process {
    id: checkSnoteProc
    command: ["which", "snote"]
    onExited: function(exitCode) {
      root.snoteStatus = exitCode === 0 ? "available" : "missing"
    }
  }

  // `packaging/omarchy/setup --check` does the same plain-text VERSION
  // compare setup itself uses for its idempotent fast path (this clone's
  // package.json "version" vs. the installed app's VERSION file, both read
  // without invoking node) and exits 0/1 accordingly — reusing that single
  // definition here instead of duplicating the comparison in QML.
  Process {
    id: checkVersionProc
    command: [root.setupScript, "--check"]
    onExited: function(exitCode) {
      root.versionStatus = exitCode === 0 ? "current" : "stale"
    }
  }

  Component.onCompleted: {
    checkSnoteProc.running = true
    checkVersionProc.running = true
  }

  Component {
    id: snoteIcon
    Image {
      anchors.fill: parent
      source: Qt.resolvedUrl("snote-icon.png")
      fillMode: Image.PreserveAspectFit
      smooth: true
      asynchronous: true
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    iconComponent: snoteIcon
    tooltipText: root.tooltipMessage

    onPressed: function(b) {
      if (b === Qt.RightButton) return
      root.launchOrHint()
    }
  }
}
