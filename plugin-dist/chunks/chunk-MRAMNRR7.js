#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  require_react,
  require_react_reconciler,
  require_scheduler
} from "./chunk-CT7MGM3M.js";
import {
  src_default
} from "./chunk-GGREWLKO.js";
import {
  __commonJS,
  __export,
  __require,
  __toESM
} from "./chunk-SRSFEH3H.js";

// node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "node_modules/signal-exit/signals.js"(exports, module) {
    module.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "node_modules/signal-exit/index.js"(exports, module) {
    var process14 = global.process;
    var processOk = function(process15) {
      return process15 && typeof process15 === "object" && typeof process15.removeListener === "function" && typeof process15.emit === "function" && typeof process15.reallyExit === "function" && typeof process15.listeners === "function" && typeof process15.kill === "function" && typeof process15.pid === "number" && typeof process15.on === "function";
    };
    if (!processOk(process14)) {
      module.exports = function() {
        return function() {
        };
      };
    } else {
      assert = __require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process14.platform);
      EE = __require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process14.__signal_exit_emitter__) {
        emitter = process14.__signal_exit_emitter__;
      } else {
        emitter = process14.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process14.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process14.emit = originalProcessEmit;
        process14.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process14.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process14.kill(process14.pid, sig);
          }
        };
      });
      module.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process14.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process14.emit = processEmit;
        process14.reallyExit = processReallyExit;
      };
      module.exports.load = load;
      originalProcessReallyExit = process14.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process14.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process14.exitCode, null);
        emit("afterexit", process14.exitCode, null);
        originalProcessReallyExit.call(process14, process14.exitCode);
      };
      originalProcessEmit = process14.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process14.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process14.exitCode, null);
          emit("afterexit", process14.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// node_modules/react-reconciler/cjs/react-reconciler-constants.production.js
var require_react_reconciler_constants_production = __commonJS({
  "node_modules/react-reconciler/cjs/react-reconciler-constants.production.js"(exports) {
    "use strict";
    exports.ConcurrentRoot = 1;
    exports.ContinuousEventPriority = 8;
    exports.DefaultEventPriority = 32;
    exports.DiscreteEventPriority = 2;
    exports.IdleEventPriority = 268435456;
    exports.LegacyRoot = 0;
    exports.NoEventPriority = 0;
  }
});

// node_modules/react-reconciler/constants.js
var require_constants = __commonJS({
  "node_modules/react-reconciler/constants.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_reconciler_constants_production();
    } else {
      module.exports = null;
    }
  }
});

// node_modules/mimic-fn/index.js
var require_mimic_fn = __commonJS({
  "node_modules/mimic-fn/index.js"(exports, module) {
    "use strict";
    var mimicFn = (to, from) => {
      for (const prop of Reflect.ownKeys(from)) {
        Object.defineProperty(to, prop, Object.getOwnPropertyDescriptor(from, prop));
      }
      return to;
    };
    module.exports = mimicFn;
    module.exports.default = mimicFn;
  }
});

// node_modules/onetime/index.js
var require_onetime = __commonJS({
  "node_modules/onetime/index.js"(exports, module) {
    "use strict";
    var mimicFn = require_mimic_fn();
    var calledFunctions = /* @__PURE__ */ new WeakMap();
    var onetime2 = (function_, options = {}) => {
      if (typeof function_ !== "function") {
        throw new TypeError("Expected a function");
      }
      let returnValue;
      let callCount = 0;
      const functionName = function_.displayName || function_.name || "<anonymous>";
      const onetime3 = function(...arguments_) {
        calledFunctions.set(onetime3, ++callCount);
        if (callCount === 1) {
          returnValue = function_.apply(this, arguments_);
          function_ = null;
        } else if (options.throw === true) {
          throw new Error(`Function \`${functionName}\` can only be called once`);
        }
        return returnValue;
      };
      mimicFn(onetime3, function_);
      calledFunctions.set(onetime3, callCount);
      return onetime3;
    };
    module.exports = onetime2;
    module.exports.default = onetime2;
    module.exports.callCount = (function_) => {
      if (!calledFunctions.has(function_)) {
        throw new Error(`The given function \`${function_.name}\` is not wrapped by the \`onetime\` package`);
      }
      return calledFunctions.get(function_);
    };
  }
});

// node_modules/stack-utils/node_modules/escape-string-regexp/index.js
var require_escape_string_regexp = __commonJS({
  "node_modules/stack-utils/node_modules/escape-string-regexp/index.js"(exports, module) {
    "use strict";
    var matchOperatorsRegex = /[|\\{}()[\]^$+*?.-]/g;
    module.exports = (string) => {
      if (typeof string !== "string") {
        throw new TypeError("Expected a string");
      }
      return string.replace(matchOperatorsRegex, "\\$&");
    };
  }
});

// node_modules/stack-utils/index.js
var require_stack_utils = __commonJS({
  "node_modules/stack-utils/index.js"(exports, module) {
    "use strict";
    var escapeStringRegexp = require_escape_string_regexp();
    var cwd2 = typeof process === "object" && process && typeof process.cwd === "function" ? process.cwd() : ".";
    var natives = [].concat(
      __require("module").builtinModules,
      "bootstrap_node",
      "node"
    ).map((n) => new RegExp(`(?:\\((?:node:)?${n}(?:\\.js)?:\\d+:\\d+\\)$|^\\s*at (?:node:)?${n}(?:\\.js)?:\\d+:\\d+$)`));
    natives.push(
      /\((?:node:)?internal\/[^:]+:\d+:\d+\)$/,
      /\s*at (?:node:)?internal\/[^:]+:\d+:\d+$/,
      /\/\.node-spawn-wrap-\w+-\w+\/node:\d+:\d+\)?$/
    );
    var StackUtils2 = class _StackUtils {
      constructor(opts) {
        opts = {
          ignoredPackages: [],
          ...opts
        };
        if ("internals" in opts === false) {
          opts.internals = _StackUtils.nodeInternals();
        }
        if ("cwd" in opts === false) {
          opts.cwd = cwd2;
        }
        this._cwd = opts.cwd.replace(/\\/g, "/");
        this._internals = [].concat(
          opts.internals,
          ignoredPackagesRegExp(opts.ignoredPackages)
        );
        this._wrapCallSite = opts.wrapCallSite || false;
      }
      static nodeInternals() {
        return [...natives];
      }
      clean(stack, indent = 0) {
        indent = " ".repeat(indent);
        if (!Array.isArray(stack)) {
          stack = stack.split("\n");
        }
        if (!/^\s*at /.test(stack[0]) && /^\s*at /.test(stack[1])) {
          stack = stack.slice(1);
        }
        let outdent = false;
        let lastNonAtLine = null;
        const result = [];
        stack.forEach((st) => {
          st = st.replace(/\\/g, "/");
          if (this._internals.some((internal) => internal.test(st))) {
            return;
          }
          const isAtLine = /^\s*at /.test(st);
          if (outdent) {
            st = st.trimEnd().replace(/^(\s+)at /, "$1");
          } else {
            st = st.trim();
            if (isAtLine) {
              st = st.slice(3);
            }
          }
          st = st.replace(`${this._cwd}/`, "");
          if (st) {
            if (isAtLine) {
              if (lastNonAtLine) {
                result.push(lastNonAtLine);
                lastNonAtLine = null;
              }
              result.push(st);
            } else {
              outdent = true;
              lastNonAtLine = st;
            }
          }
        });
        return result.map((line) => `${indent}${line}
`).join("");
      }
      captureString(limit, fn = this.captureString) {
        if (typeof limit === "function") {
          fn = limit;
          limit = Infinity;
        }
        const { stackTraceLimit } = Error;
        if (limit) {
          Error.stackTraceLimit = limit;
        }
        const obj = {};
        Error.captureStackTrace(obj, fn);
        const { stack } = obj;
        Error.stackTraceLimit = stackTraceLimit;
        return this.clean(stack);
      }
      capture(limit, fn = this.capture) {
        if (typeof limit === "function") {
          fn = limit;
          limit = Infinity;
        }
        const { prepareStackTrace, stackTraceLimit } = Error;
        Error.prepareStackTrace = (obj2, site) => {
          if (this._wrapCallSite) {
            return site.map(this._wrapCallSite);
          }
          return site;
        };
        if (limit) {
          Error.stackTraceLimit = limit;
        }
        const obj = {};
        Error.captureStackTrace(obj, fn);
        const { stack } = obj;
        Object.assign(Error, { prepareStackTrace, stackTraceLimit });
        return stack;
      }
      at(fn = this.at) {
        const [site] = this.capture(1, fn);
        if (!site) {
          return {};
        }
        const res = {
          line: site.getLineNumber(),
          column: site.getColumnNumber()
        };
        setFile(res, site.getFileName(), this._cwd);
        if (site.isConstructor()) {
          Object.defineProperty(res, "constructor", {
            value: true,
            configurable: true
          });
        }
        if (site.isEval()) {
          res.evalOrigin = site.getEvalOrigin();
        }
        if (site.isNative()) {
          res.native = true;
        }
        let typename;
        try {
          typename = site.getTypeName();
        } catch (_) {
        }
        if (typename && typename !== "Object" && typename !== "[object Object]") {
          res.type = typename;
        }
        const fname = site.getFunctionName();
        if (fname) {
          res.function = fname;
        }
        const meth = site.getMethodName();
        if (meth && fname !== meth) {
          res.method = meth;
        }
        return res;
      }
      parseLine(line) {
        const match = line && line.match(re);
        if (!match) {
          return null;
        }
        const ctor = match[1] === "new";
        let fname = match[2];
        const evalOrigin = match[3];
        const evalFile = match[4];
        const evalLine = Number(match[5]);
        const evalCol = Number(match[6]);
        let file = match[7];
        const lnum = match[8];
        const col = match[9];
        const native = match[10] === "native";
        const closeParen = match[11] === ")";
        let method;
        const res = {};
        if (lnum) {
          res.line = Number(lnum);
        }
        if (col) {
          res.column = Number(col);
        }
        if (closeParen && file) {
          let closes = 0;
          for (let i = file.length - 1; i > 0; i--) {
            if (file.charAt(i) === ")") {
              closes++;
            } else if (file.charAt(i) === "(" && file.charAt(i - 1) === " ") {
              closes--;
              if (closes === -1 && file.charAt(i - 1) === " ") {
                const before = file.slice(0, i - 1);
                const after = file.slice(i + 1);
                file = after;
                fname += ` (${before}`;
                break;
              }
            }
          }
        }
        if (fname) {
          const methodMatch = fname.match(methodRe);
          if (methodMatch) {
            fname = methodMatch[1];
            method = methodMatch[2];
          }
        }
        setFile(res, file, this._cwd);
        if (ctor) {
          Object.defineProperty(res, "constructor", {
            value: true,
            configurable: true
          });
        }
        if (evalOrigin) {
          res.evalOrigin = evalOrigin;
          res.evalLine = evalLine;
          res.evalColumn = evalCol;
          res.evalFile = evalFile && evalFile.replace(/\\/g, "/");
        }
        if (native) {
          res.native = true;
        }
        if (fname) {
          res.function = fname;
        }
        if (method && fname !== method) {
          res.method = method;
        }
        return res;
      }
    };
    function setFile(result, filename, cwd3) {
      if (filename) {
        filename = filename.replace(/\\/g, "/");
        if (filename.startsWith(`${cwd3}/`)) {
          filename = filename.slice(cwd3.length + 1);
        }
        result.file = filename;
      }
    }
    function ignoredPackagesRegExp(ignoredPackages) {
      if (ignoredPackages.length === 0) {
        return [];
      }
      const packages = ignoredPackages.map((mod) => escapeStringRegexp(mod));
      return new RegExp(`[/\\\\]node_modules[/\\\\](?:${packages.join("|")})[/\\\\][^:]+:\\d+:\\d+`);
    }
    var re = new RegExp(
      "^(?:\\s*at )?(?:(new) )?(?:(.*?) \\()?(?:eval at ([^ ]+) \\((.+?):(\\d+):(\\d+)\\), )?(?:(.+?):(\\d+):(\\d+)|(native))(\\)?)$"
    );
    var methodRe = /^(.*?) \[as (.*?)\]$/;
    module.exports = StackUtils2;
  }
});

// node_modules/ink/build/render.js
import { Stream } from "node:stream";
import process13 from "node:process";

// node_modules/ink/build/ink.js
var import_react16 = __toESM(require_react(), 1);
import process12 from "node:process";

// node_modules/es-toolkit/dist/function/debounce.mjs
function debounce(func, debounceMs, { signal, edges } = {}) {
  let pendingThis = void 0;
  let pendingArgs = null;
  const leading = edges != null && edges.includes("leading");
  const trailing = edges == null || edges.includes("trailing");
  const invoke = () => {
    if (pendingArgs !== null) {
      func.apply(pendingThis, pendingArgs);
      pendingThis = void 0;
      pendingArgs = null;
    }
  };
  const onTimerEnd = () => {
    if (trailing) invoke();
    cancel();
  };
  let timeoutId = null;
  const schedule = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      onTimerEnd();
    }, debounceMs);
  };
  const cancelTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  const cancel = () => {
    cancelTimer();
    pendingThis = void 0;
    pendingArgs = null;
  };
  const flush = () => {
    invoke();
  };
  const debounced = function(...args) {
    if (signal?.aborted) return;
    pendingThis = this;
    pendingArgs = args;
    const isFirstCall = timeoutId == null;
    schedule();
    if (leading && isFirstCall) invoke();
  };
  debounced.schedule = schedule;
  debounced.cancel = cancel;
  debounced.flush = flush;
  signal?.addEventListener("abort", cancel, { once: true });
  return debounced;
}

// node_modules/es-toolkit/dist/compat/function/debounce.mjs
function debounce2(func, debounceMs = 0, options = {}) {
  if (typeof options !== "object") options = {};
  const { leading = false, trailing = true, maxWait } = options;
  const edges = Array(2);
  if (leading) edges[0] = "leading";
  if (trailing) edges[1] = "trailing";
  let result = void 0;
  let pendingAt = null;
  const _debounced = debounce(function(...args) {
    result = func.apply(this, args);
    pendingAt = null;
  }, debounceMs, { edges });
  const debounced = function(...args) {
    if (maxWait != null) {
      if (pendingAt === null) pendingAt = Date.now();
      if (Date.now() - pendingAt >= maxWait) {
        if (leading || trailing) result = func.apply(this, args);
        pendingAt = Date.now();
        _debounced.cancel();
        _debounced.schedule();
        return result;
      }
    }
    _debounced.apply(this, args);
    return result;
  };
  const flush = () => {
    _debounced.flush();
    return result;
  };
  debounced.cancel = _debounced.cancel;
  debounced.flush = flush;
  return debounced;
}

// node_modules/es-toolkit/dist/compat/function/throttle.mjs
function throttle(func, throttleMs = 0, options = {}) {
  const { leading = true, trailing = true } = options;
  return debounce2(func, throttleMs, {
    leading,
    maxWait: throttleMs,
    trailing
  });
}

// node_modules/ansi-escapes/base.js
var base_exports = {};
__export(base_exports, {
  ConEmu: () => ConEmu,
  beep: () => beep,
  beginSynchronizedOutput: () => beginSynchronizedOutput,
  clearScreen: () => clearScreen,
  clearTerminal: () => clearTerminal,
  clearViewport: () => clearViewport,
  cursorBackward: () => cursorBackward,
  cursorDown: () => cursorDown,
  cursorForward: () => cursorForward,
  cursorGetPosition: () => cursorGetPosition,
  cursorHide: () => cursorHide,
  cursorLeft: () => cursorLeft,
  cursorMove: () => cursorMove,
  cursorNextLine: () => cursorNextLine,
  cursorPrevLine: () => cursorPrevLine,
  cursorRestorePosition: () => cursorRestorePosition,
  cursorSavePosition: () => cursorSavePosition,
  cursorShow: () => cursorShow,
  cursorTo: () => cursorTo,
  cursorUp: () => cursorUp,
  endSynchronizedOutput: () => endSynchronizedOutput,
  enterAlternativeScreen: () => enterAlternativeScreen,
  eraseDown: () => eraseDown,
  eraseEndLine: () => eraseEndLine,
  eraseLine: () => eraseLine,
  eraseLines: () => eraseLines,
  eraseScreen: () => eraseScreen,
  eraseStartLine: () => eraseStartLine,
  eraseUp: () => eraseUp,
  exitAlternativeScreen: () => exitAlternativeScreen,
  iTerm: () => iTerm,
  image: () => image,
  link: () => link,
  scrollDown: () => scrollDown,
  scrollUp: () => scrollUp,
  setCwd: () => setCwd,
  synchronizedOutput: () => synchronizedOutput
});
import process2 from "node:process";
import os from "node:os";

// node_modules/environment/index.js
var isBrowser = globalThis.window?.document !== void 0;
var isNode = globalThis.process?.versions?.node !== void 0;
var isBun = globalThis.process?.versions?.bun !== void 0;
var isDeno = globalThis.Deno?.version?.deno !== void 0;
var isElectron = globalThis.process?.versions?.electron !== void 0;
var isJsDom = globalThis.navigator?.userAgent?.includes("jsdom") === true;
var isWebWorker = typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope;
var isDedicatedWorker = typeof DedicatedWorkerGlobalScope !== "undefined" && globalThis instanceof DedicatedWorkerGlobalScope;
var isSharedWorker = typeof SharedWorkerGlobalScope !== "undefined" && globalThis instanceof SharedWorkerGlobalScope;
var isServiceWorker = typeof ServiceWorkerGlobalScope !== "undefined" && globalThis instanceof ServiceWorkerGlobalScope;
var platform = globalThis.navigator?.userAgentData?.platform;
var isMacOs = platform === "macOS" || globalThis.navigator?.platform === "MacIntel" || globalThis.navigator?.userAgent?.includes(" Mac ") === true || globalThis.process?.platform === "darwin";
var isWindows = platform === "Windows" || globalThis.navigator?.platform === "Win32" || globalThis.process?.platform === "win32";
var isLinux = platform === "Linux" || globalThis.navigator?.platform?.startsWith("Linux") === true || globalThis.navigator?.userAgent?.includes(" Linux ") === true || globalThis.process?.platform === "linux";
var isIos = platform === "iOS" || globalThis.navigator?.platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1 || /iPad|iPhone|iPod/.test(globalThis.navigator?.platform);
var isAndroid = platform === "Android" || globalThis.navigator?.platform === "Android" || globalThis.navigator?.userAgent?.includes(" Android ") === true || globalThis.process?.platform === "android";

// node_modules/ansi-escapes/base.js
var ESC = "\x1B[";
var OSC = "\x1B]";
var BEL = "\x07";
var SEP = ";";
var isTerminalApp = !isBrowser && process2.env.TERM_PROGRAM === "Apple_Terminal";
var isWindows2 = !isBrowser && process2.platform === "win32";
var isTmux = !isBrowser && (process2.env.TERM?.startsWith("screen") || process2.env.TERM?.startsWith("tmux") || process2.env.TMUX !== void 0);
var cwdFunction = isBrowser ? () => {
  throw new Error("`process.cwd()` only works in Node.js, not the browser.");
} : process2.cwd;
var wrapOsc = (sequence) => {
  if (isTmux) {
    return "\x1BPtmux;" + sequence.replaceAll("\x1B", "\x1B\x1B") + "\x1B\\";
  }
  return sequence;
};
var cursorTo = (x, y) => {
  if (typeof x !== "number") {
    throw new TypeError("The `x` argument is required");
  }
  if (typeof y !== "number") {
    return ESC + (x + 1) + "G";
  }
  return ESC + (y + 1) + SEP + (x + 1) + "H";
};
var cursorMove = (x, y) => {
  if (typeof x !== "number") {
    throw new TypeError("The `x` argument is required");
  }
  let returnValue = "";
  if (x < 0) {
    returnValue += ESC + -x + "D";
  } else if (x > 0) {
    returnValue += ESC + x + "C";
  }
  if (y < 0) {
    returnValue += ESC + -y + "A";
  } else if (y > 0) {
    returnValue += ESC + y + "B";
  }
  return returnValue;
};
var cursorUp = (count = 1) => ESC + count + "A";
var cursorDown = (count = 1) => ESC + count + "B";
var cursorForward = (count = 1) => ESC + count + "C";
var cursorBackward = (count = 1) => ESC + count + "D";
var cursorLeft = ESC + "G";
var cursorSavePosition = isTerminalApp ? "\x1B7" : ESC + "s";
var cursorRestorePosition = isTerminalApp ? "\x1B8" : ESC + "u";
var cursorGetPosition = ESC + "6n";
var cursorNextLine = ESC + "E";
var cursorPrevLine = ESC + "F";
var cursorHide = ESC + "?25l";
var cursorShow = ESC + "?25h";
var eraseLines = (count) => {
  let clear = "";
  for (let i = 0; i < count; i++) {
    clear += eraseLine + (i < count - 1 ? cursorUp() : "");
  }
  if (count) {
    clear += cursorLeft;
  }
  return clear;
};
var eraseEndLine = ESC + "K";
var eraseStartLine = ESC + "1K";
var eraseLine = ESC + "2K";
var eraseDown = ESC + "J";
var eraseUp = ESC + "1J";
var eraseScreen = ESC + "2J";
var scrollUp = ESC + "S";
var scrollDown = ESC + "T";
var clearScreen = "\x1Bc";
var clearViewport = `${eraseScreen}${ESC}H`;
var isOldWindows = () => {
  if (isBrowser || !isWindows2) {
    return false;
  }
  const parts = os.release().split(".");
  const major = Number(parts[0]);
  const build = Number(parts[2] ?? 0);
  if (major < 10) {
    return true;
  }
  if (major === 10 && build < 10586) {
    return true;
  }
  return false;
};
var clearTerminal = isOldWindows() ? `${eraseScreen}${ESC}0f` : `${eraseScreen}${ESC}3J${ESC}H`;
var enterAlternativeScreen = ESC + "?1049h";
var exitAlternativeScreen = ESC + "?1049l";
var beginSynchronizedOutput = ESC + "?2026h";
var endSynchronizedOutput = ESC + "?2026l";
var synchronizedOutput = (text) => beginSynchronizedOutput + text + endSynchronizedOutput;
var beep = BEL;
var link = (text, url) => {
  const openLink = wrapOsc(`${OSC}8${SEP}${SEP}${url}${BEL}`);
  const closeLink = wrapOsc(`${OSC}8${SEP}${SEP}${BEL}`);
  return openLink + text + closeLink;
};
var image = (data, options = {}) => {
  let returnValue = `${OSC}1337;File=inline=1`;
  if (options.width) {
    returnValue += `;width=${options.width}`;
  }
  if (options.height) {
    returnValue += `;height=${options.height}`;
  }
  if (options.preserveAspectRatio === false) {
    returnValue += ";preserveAspectRatio=0";
  }
  const imageBuffer = Buffer.from(data);
  return wrapOsc(returnValue + `;size=${imageBuffer.byteLength}:` + imageBuffer.toString("base64") + BEL);
};
var iTerm = {
  setCwd: (cwd2 = cwdFunction()) => wrapOsc(`${OSC}50;CurrentDir=${cwd2}${BEL}`),
  annotation(message, options = {}) {
    let returnValue = `${OSC}1337;`;
    const hasX = options.x !== void 0;
    const hasY = options.y !== void 0;
    if ((hasX || hasY) && !(hasX && hasY && options.length !== void 0)) {
      throw new Error("`x`, `y` and `length` must be defined when `x` or `y` is defined");
    }
    message = message.replaceAll("|", "");
    returnValue += options.isHidden ? "AddHiddenAnnotation=" : "AddAnnotation=";
    if (options.length > 0) {
      returnValue += (hasX ? [message, options.length, options.x, options.y] : [options.length, message]).join("|");
    } else {
      returnValue += message;
    }
    return wrapOsc(returnValue + BEL);
  }
};
var ConEmu = {
  setCwd: (cwd2 = cwdFunction()) => wrapOsc(`${OSC}9;9;${cwd2}${BEL}`)
};
var setCwd = (cwd2 = cwdFunction()) => iTerm.setCwd(cwd2) + ConEmu.setCwd(cwd2);

// node_modules/is-in-ci/index.js
import { env } from "node:process";
var check = (key) => key in env && env[key] !== "0" && env[key] !== "false";
var isInCi = check("CI") || check("CONTINUOUS_INTEGRATION");
var is_in_ci_default = isInCi;

// node_modules/auto-bind/index.js
var getAllProperties = (object) => {
  const properties = /* @__PURE__ */ new Set();
  do {
    for (const key of Reflect.ownKeys(object)) {
      properties.add([object, key]);
    }
  } while ((object = Reflect.getPrototypeOf(object)) && object !== Object.prototype);
  return properties;
};
function autoBind(self, { include, exclude } = {}) {
  const filter = (key) => {
    const match = (pattern) => typeof pattern === "string" ? key === pattern : pattern.test(key);
    if (include) {
      return include.some(match);
    }
    if (exclude) {
      return !exclude.some(match);
    }
    return true;
  };
  for (const [object, key] of getAllProperties(self.constructor.prototype)) {
    if (key === "constructor" || !filter(key)) {
      continue;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
    if (descriptor && typeof descriptor.value === "function") {
      self[key] = self[key].bind(self);
    }
  }
  return self;
}

// node_modules/ink/build/ink.js
var import_signal_exit2 = __toESM(require_signal_exit(), 1);

// node_modules/patch-console/dist/index.js
import { PassThrough } from "node:stream";
var consoleMethods = [
  "assert",
  "count",
  "countReset",
  "debug",
  "dir",
  "dirxml",
  "error",
  "group",
  "groupCollapsed",
  "groupEnd",
  "info",
  "log",
  "table",
  "time",
  "timeEnd",
  "timeLog",
  "trace",
  "warn"
];
var originalMethods = {};
var patchConsole = (callback) => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.write = (data) => {
    callback("stdout", data);
  };
  stderr.write = (data) => {
    callback("stderr", data);
  };
  const internalConsole = new console.Console(stdout, stderr);
  for (const method of consoleMethods) {
    originalMethods[method] = console[method];
    console[method] = internalConsole[method];
  }
  return () => {
    for (const method of consoleMethods) {
      console[method] = originalMethods[method];
    }
    originalMethods = {};
  };
};
var dist_default = patchConsole;

// node_modules/ink/build/ink.js
var import_constants2 = __toESM(require_constants(), 1);

// node_modules/ansi-regex/index.js
function ansiRegex({ onlyFirst = false } = {}) {
  const ST = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
  const osc = `(?:\\u001B\\][^\\u0007\\u001B\\u009C]*${ST})`;
  const csi = "[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  const pattern = `${osc}|${csi}`;
  return new RegExp(pattern, onlyFirst ? void 0 : "g");
}

// node_modules/strip-ansi/index.js
var regex = ansiRegex();
function stripAnsi(string) {
  if (typeof string !== "string") {
    throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
  }
  if (!string.includes("\x1B") && !string.includes("\x9B")) {
    return string;
  }
  return string.replace(regex, "");
}

// node_modules/get-east-asian-width/lookup-data.js
var ambiguousMinimalCodePoint = 161;
var ambiguousMaximumCodePoint = 1114109;
var ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
var fullwidthMinimalCodePoint = 12288;
var fullwidthMaximumCodePoint = 65510;
var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
var wideMinimalCodePoint = 4352;
var wideMaximumCodePoint = 262141;
var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101594, 101631, 101664, 101760, 101874, 101888, 102801, 102816, 102866, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110888, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110952, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127406, 127406, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128729, 128732, 128735, 128747, 128748, 128756, 128764, 128986, 128986, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129734, 129736, 129736, 129740, 129757, 129759, 129771, 129775, 129786, 131072, 196605, 196608, 262141];

// node_modules/get-east-asian-width/utilities.js
var isInRange = (ranges, codePoint) => {
  let low = 0;
  let high = Math.floor(ranges.length / 2) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const i = mid * 2;
    if (codePoint < ranges[i]) {
      high = mid - 1;
    } else if (codePoint > ranges[i + 1]) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

// node_modules/get-east-asian-width/lookup.js
var commonCjkCodePoint = 19968;
var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
  let fastPathStart = ranges[0];
  let fastPathEnd = ranges[1];
  for (let index = 0; index < ranges.length; index += 2) {
    const start = ranges[index];
    const end = ranges[index + 1];
    if (commonCjkCodePoint >= start && commonCjkCodePoint <= end) {
      return [start, end];
    }
    if (end - start > fastPathEnd - fastPathStart) {
      fastPathStart = start;
      fastPathEnd = end;
    }
  }
  return [fastPathStart, fastPathEnd];
}
var isAmbiguous = (codePoint) => {
  if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) {
    return false;
  }
  return isInRange(ambiguousRanges, codePoint);
};
var isFullwidth = (codePoint) => {
  if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
    return false;
  }
  return isInRange(fullwidthRanges, codePoint);
};
var isWide = (codePoint) => {
  if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
    return true;
  }
  if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
    return false;
  }
  return isInRange(wideRanges, codePoint);
};

// node_modules/get-east-asian-width/index.js
function validate(codePoint) {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
  validate(codePoint);
  if (isFullwidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
    return 2;
  }
  return 1;
}

// node_modules/string-width/index.js
var __asciiSegments = (s) => ({ [Symbol.iterator]: function* () {
  for (let i = 0; i < s.length; i++) yield { segment: s[i], index: i, input: s };
}, containing: (i) => i >= 0 && i < s.length ? { segment: s[i], index: i, input: s } : void 0 });
var __isAscii = (s) => /^[\x00-\x7f]*$/.test(s) && !s.includes("\r\n");
var __real_segmenter;
var segmenter = { segment: (s) => __isAscii(s) ? __asciiSegments(s) : (__real_segmenter ??= new Intl.Segmenter()).segment(s) };
var zeroWidthClusterRegex = new RegExp("^(?:\\p{Default_Ignorable_Code_Point}|\\p{Control}|\\p{Format}|\\p{Nonspacing_Mark}|\\p{Enclosing_Mark}|\\p{Surrogate})+$", "v");
var leadingNonPrintingRegex = new RegExp("^[\\p{Default_Ignorable_Code_Point}\\p{Control}\\p{Format}\\p{Nonspacing_Mark}\\p{Enclosing_Mark}\\p{Surrogate}]+", "v");
var spacingMarkRegex = new RegExp("\\p{Spacing_Mark}", "v");
var __real_rgi;
var rgiEmojiRegex = { test: (s) => (__real_rgi ??= new RegExp("^\\p{RGI_Emoji}$", "v")).test(s) };
var unqualifiedKeycapRegex = /^[\d#*]\u20E3$/;
var extendedPictographicRegex = new RegExp("\\p{Extended_Pictographic}", "gu");
function isDoubleWidthNonRgiEmojiSequence(segment) {
  if (segment.length > 50) {
    return false;
  }
  if (unqualifiedKeycapRegex.test(segment)) {
    return true;
  }
  if (segment.includes("\u200D")) {
    const pictographics = segment.match(extendedPictographicRegex);
    return pictographics !== null && pictographics.length >= 2;
  }
  return false;
}
function baseVisible(segment) {
  return segment.replace(leadingNonPrintingRegex, "");
}
function isZeroWidthCluster(segment) {
  return zeroWidthClusterRegex.test(segment);
}
function isHangulLeadingJamo(codePoint) {
  return codePoint >= 4352 && codePoint <= 4447 || codePoint >= 43360 && codePoint <= 43388;
}
function isHangulVowelJamo(codePoint) {
  return codePoint >= 4448 && codePoint <= 4519 || codePoint >= 55216 && codePoint <= 55238;
}
function isHangulTrailingJamo(codePoint) {
  return codePoint >= 4520 && codePoint <= 4607 || codePoint >= 55243 && codePoint <= 55291;
}
function isHangulJamo(codePoint) {
  return isHangulLeadingJamo(codePoint) || isHangulVowelJamo(codePoint) || isHangulTrailingJamo(codePoint);
}
function hangulClusterWidth(visibleSegment, eastAsianWidthOptions) {
  const codePoints = [];
  for (const character of visibleSegment) {
    if (zeroWidthClusterRegex.test(character)) {
      continue;
    }
    codePoints.push(character.codePointAt(0));
  }
  if (codePoints.length === 0) {
    return void 0;
  }
  let width = 0;
  for (let index = 0; index < codePoints.length; index++) {
    const codePoint = codePoints[index];
    if (!isHangulJamo(codePoint)) {
      if (width === 0) {
        return void 0;
      }
      for (let remaining = index; remaining < codePoints.length; remaining++) {
        width += eastAsianWidth(codePoints[remaining], eastAsianWidthOptions);
      }
      return width;
    }
    if (isHangulLeadingJamo(codePoint) && isHangulVowelJamo(codePoints[index + 1])) {
      width += 2;
      index += isHangulTrailingJamo(codePoints[index + 2]) ? 2 : 1;
      continue;
    }
    width += eastAsianWidth(codePoint, eastAsianWidthOptions);
  }
  return width;
}
function trailingWidth(visibleSegment, eastAsianWidthOptions) {
  let extra = 0;
  let first = true;
  for (const character of visibleSegment) {
    if (first) {
      first = false;
      continue;
    }
    if (spacingMarkRegex.test(character) || character >= "\uFF00" && character <= "\uFFEF") {
      extra += eastAsianWidth(character.codePointAt(0), eastAsianWidthOptions);
    }
  }
  return extra;
}
function stringWidth(input, options = {}) {
  if (typeof input !== "string" || input.length === 0) {
    return 0;
  }
  const {
    ambiguousIsNarrow = true,
    countAnsiEscapeCodes = false
  } = options;
  let string = input;
  if (!countAnsiEscapeCodes && (string.includes("\x1B") || string.includes("\x9B"))) {
    string = stripAnsi(string);
  }
  if (string.length === 0) {
    return 0;
  }
  if (/^[\u0020-\u007E]*$/.test(string)) {
    return string.length;
  }
  let width = 0;
  const eastAsianWidthOptions = { ambiguousAsWide: !ambiguousIsNarrow };
  for (const { segment } of segmenter.segment(string)) {
    if (isZeroWidthCluster(segment)) {
      continue;
    }
    if (rgiEmojiRegex.test(segment) || isDoubleWidthNonRgiEmojiSequence(segment)) {
      width += 2;
      continue;
    }
    const visibleSegment = baseVisible(segment);
    const hangulWidth = hangulClusterWidth(visibleSegment, eastAsianWidthOptions);
    if (hangulWidth !== void 0) {
      width += hangulWidth;
      continue;
    }
    const codePoint = visibleSegment.codePointAt(0);
    width += eastAsianWidth(codePoint, eastAsianWidthOptions);
    width += trailingWidth(visibleSegment, eastAsianWidthOptions);
  }
  return width;
}

// node_modules/wrap-ansi/node_modules/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/wrap-ansi/index.js
var __asciiSegments2 = (s) => ({ [Symbol.iterator]: function* () {
  for (let i = 0; i < s.length; i++) yield { segment: s[i], index: i, input: s };
}, containing: (i) => i >= 0 && i < s.length ? { segment: s[i], index: i, input: s } : void 0 });
var __isAscii2 = (s) => /^[\x00-\x7f]*$/.test(s) && !s.includes("\r\n");
var ANSI_ESCAPE = "\x1B";
var ANSI_ESCAPE_BELL = "\x07";
var C1_CSI = "\x9B";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_SGR_RESET = 0;
var ANSI_SGR_RESET_FOREGROUND = 39;
var ANSI_SGR_RESET_BACKGROUND = 49;
var ANSI_SGR_RESET_UNDERLINE_COLOR = 59;
var ANSI_SGR_FOREGROUND_EXTENDED = 38;
var ANSI_SGR_BACKGROUND_EXTENDED = 48;
var ANSI_SGR_UNDERLINE_COLOR_EXTENDED = 58;
var ANSI_SGR_COLOR_MODE_RGB = 2;
var ANSI_SGR_COLOR_MODE_256 = 5;
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;`;
var ESCAPES = /* @__PURE__ */ new Set([
  ANSI_ESCAPE,
  C1_CSI
]);
var ESCAPE_CHARACTERS = [...ESCAPES].join("");
var CSI_INTRODUCER = `(?:${ANSI_ESCAPE}\\${ANSI_CSI}|${C1_CSI})`;
var CSI_PARAMETERS = "[0-?]*[ -/]*[@-~]";
var SGR_PARAMETERS = `(?<sgr>[0-9;:]*)${ANSI_SGR_TERMINATOR}`;
var OSC_STRING_TERMINATOR = `(?:${ANSI_ESCAPE_BELL}|${ANSI_ESCAPE}\\\\)`;
var OSC_STRING_PAYLOAD = String.raw`[^\u0000-\u001F\u007F-\u009F]*`;
var LINK_PARAMETERS = String.raw`8;(?<parameters>[^;\u0000-\u001F\u007F-\u009F]*);(?<uri>${OSC_STRING_PAYLOAD})${OSC_STRING_TERMINATOR}`;
var OSC_STRING = `${OSC_STRING_PAYLOAD}${OSC_STRING_TERMINATOR}`;
var ANSI_ESCAPE_REGEX = new RegExp(
  `${CSI_INTRODUCER}(?:${SGR_PARAMETERS}|${CSI_PARAMETERS})|${ANSI_ESCAPE}\\${ANSI_OSC}(?:${LINK_PARAMETERS}|${OSC_STRING})`,
  "y"
);
var ANSI_SGR_MODIFIER_CLOSE_CODES = new Set(ansi_styles_default.codes.values());
ANSI_SGR_MODIFIER_CLOSE_CODES.delete(ANSI_SGR_RESET);
var __real_segmenter2;
var segmenter2 = { segment: (s) => __isAscii2(s) ? __asciiSegments2(s) : (__real_segmenter2 ??= new Intl.Segmenter()).segment(s) };
var getStringWidth = (string) => stringWidth(string, { countAnsiEscapeCodes: true });
var TAB_SIZE = 8;
var ESCAPE_INTRODUCER_REGEX = new RegExp(`[${ESCAPE_CHARACTERS}]`, "g");
var ROW_BOUNDARY_REGEX = new RegExp(`[\\n${ESCAPE_CHARACTERS}]`, "g");
var ASCII_PRINTABLE_REGEX = /^[ -~]*$/;
var wrapAnsiCode = (code) => `${ANSI_ESCAPE}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url, parameters = "") => `${ANSI_ESCAPE}${ANSI_ESCAPE_LINK}${parameters};${url}${ANSI_ESCAPE_BELL}`;
var matchAnsiEscape = (string, index) => {
  if (!ESCAPES.has(string[index])) {
    return;
  }
  ANSI_ESCAPE_REGEX.lastIndex = index;
  return ANSI_ESCAPE_REGEX.exec(string) ?? void 0;
};
var forEachSegment = (string, onPlainText, onEscape = () => {
}) => {
  let plainStart = 0;
  let index = 0;
  while (index < string.length) {
    ESCAPE_INTRODUCER_REGEX.lastIndex = index;
    const introducer = ESCAPE_INTRODUCER_REGEX.exec(string);
    if (!introducer) {
      break;
    }
    const escape3 = matchAnsiEscape(string, introducer.index);
    if (!escape3) {
      index = introducer.index + 1;
      continue;
    }
    if (introducer.index > plainStart) {
      onPlainText(string.slice(plainStart, introducer.index));
    }
    onEscape(escape3[0]);
    index = introducer.index + escape3[0].length;
    plainStart = index;
  }
  if (plainStart < string.length) {
    onPlainText(string.slice(plainStart));
  }
};
var getWidth = (string) => {
  let plainText = "";
  forEachSegment(string, (part) => {
    plainText += part;
  });
  return getStringWidth(plainText);
};
var getTokens = (string) => {
  const tokens = [];
  forEachSegment(string, (plainText) => {
    if (ASCII_PRINTABLE_REGEX.test(plainText)) {
      for (const character of plainText) {
        tokens.push({ value: character, width: 1 });
      }
      return;
    }
    for (const { segment } of segmenter2.segment(plainText)) {
      tokens.push({ value: segment, width: getStringWidth(segment) });
    }
  }, (escape3) => {
    tokens.push({ value: escape3, width: 0 });
  });
  return tokens;
};
var splitWords = (string) => {
  let currentWord = { value: "", plainText: "" };
  const words = [currentWord];
  forEachSegment(string, (plainText) => {
    const parts = plainText.split(" ");
    currentWord.value += parts[0];
    currentWord.plainText += parts[0];
    for (let index = 1; index < parts.length; index++) {
      currentWord = { value: parts[index], plainText: parts[index] };
      words.push(currentWord);
    }
  }, (escape3) => {
    currentWord.value += escape3;
  });
  for (const word of words) {
    word.width = getStringWidth(word.plainText);
  }
  return words;
};
var getColonColorToken = (parameter) => {
  const parts = parameter.split(":");
  const code = Number.parseInt(parts[0], 10);
  const mode = Number.parseInt(parts[1], 10);
  if (![ANSI_SGR_FOREGROUND_EXTENDED, ANSI_SGR_BACKGROUND_EXTENDED, ANSI_SGR_UNDERLINE_COLOR_EXTENDED].includes(code)) {
    return;
  }
  if (mode === ANSI_SGR_COLOR_MODE_256 && parts.length === 3 && /^\d+$/.test(parts[2])) {
    return { code, open: parameter, hasArguments: true };
  }
  if (mode !== ANSI_SGR_COLOR_MODE_RGB) {
    return;
  }
  const components = parts.length === 6 ? parts.slice(3) : parts.slice(2);
  const colorSpace = parts.length === 6 ? parts[2] : void 0;
  if (components.length === 3 && components.every((component) => /^\d+$/.test(component)) && (colorSpace === void 0 || /^\d*$/.test(colorSpace))) {
    return { code, open: parameter, hasArguments: true };
  }
};
var getSgrTokens = (sgrParameters) => {
  const parameters = sgrParameters.split(";");
  const sgrTokens = [];
  for (let index = 0; index < parameters.length; index++) {
    const parameter = parameters[index];
    if (parameter.includes(":")) {
      const colonColorToken = getColonColorToken(parameter);
      if (colonColorToken) {
        sgrTokens.push(colonColorToken);
      }
      continue;
    }
    const code = parameter === "" ? ANSI_SGR_RESET : Number.parseInt(parameter, 10);
    if (!Number.isFinite(code)) {
      continue;
    }
    if (code === ANSI_SGR_FOREGROUND_EXTENDED || code === ANSI_SGR_BACKGROUND_EXTENDED || code === ANSI_SGR_UNDERLINE_COLOR_EXTENDED) {
      if (index + 1 >= parameters.length) {
        break;
      }
      const mode = Number.parseInt(parameters[index + 1], 10);
      const colorIndex = Number.parseInt(parameters[index + 2], 10);
      if (mode === ANSI_SGR_COLOR_MODE_256 && Number.isFinite(colorIndex)) {
        sgrTokens.push({ code, open: [code, mode, colorIndex].join(";"), hasArguments: true });
        index += 2;
        continue;
      }
      const red = Number.parseInt(parameters[index + 2], 10);
      const green = Number.parseInt(parameters[index + 3], 10);
      const blue = Number.parseInt(parameters[index + 4], 10);
      if (mode === ANSI_SGR_COLOR_MODE_RGB && Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue)) {
        sgrTokens.push({ code, open: [code, mode, red, green, blue].join(";"), hasArguments: true });
        index += 4;
        continue;
      }
      break;
    }
    sgrTokens.push({ code, open: String(code), hasArguments: false });
  }
  return sgrTokens;
};
var removeActiveStyle = (activeStyles, family) => {
  const activeStyleIndex = activeStyles.findIndex((activeStyle) => activeStyle.family === family);
  if (activeStyleIndex !== -1) {
    activeStyles.splice(activeStyleIndex, 1);
  }
};
var upsertActiveStyle = (activeStyles, nextActiveStyle) => {
  removeActiveStyle(activeStyles, nextActiveStyle.family);
  activeStyles.push(nextActiveStyle);
};
var removeModifierStylesByClose = (activeStyles, closeCode) => {
  for (let index = activeStyles.length - 1; index >= 0; index--) {
    const activeStyle = activeStyles[index];
    if (activeStyle.family.startsWith("modifier-") && activeStyle.close === closeCode) {
      activeStyles.splice(index, 1);
    }
  }
};
var getColorStyle = (sgrToken) => {
  const { code, open, hasArguments } = sgrToken;
  if (code >= 30 && code <= 37 || code >= 90 && code <= 97 || code === ANSI_SGR_FOREGROUND_EXTENDED && hasArguments) {
    return {
      family: "foreground",
      open,
      close: ANSI_SGR_RESET_FOREGROUND
    };
  }
  if (code >= 40 && code <= 47 || code >= 100 && code <= 107 || code === ANSI_SGR_BACKGROUND_EXTENDED && hasArguments) {
    return {
      family: "background",
      open,
      close: ANSI_SGR_RESET_BACKGROUND
    };
  }
  if (code === ANSI_SGR_UNDERLINE_COLOR_EXTENDED && hasArguments) {
    return {
      family: "underlineColor",
      open,
      close: ANSI_SGR_RESET_UNDERLINE_COLOR
    };
  }
};
var applySgrResetCode = (code, activeStyles) => {
  if (code === ANSI_SGR_RESET) {
    activeStyles.length = 0;
    return true;
  }
  if (code === ANSI_SGR_RESET_FOREGROUND) {
    removeActiveStyle(activeStyles, "foreground");
    return true;
  }
  if (code === ANSI_SGR_RESET_BACKGROUND) {
    removeActiveStyle(activeStyles, "background");
    return true;
  }
  if (code === ANSI_SGR_RESET_UNDERLINE_COLOR) {
    removeActiveStyle(activeStyles, "underlineColor");
    return true;
  }
  if (ANSI_SGR_MODIFIER_CLOSE_CODES.has(code)) {
    removeModifierStylesByClose(activeStyles, code);
    return true;
  }
  return false;
};
var applySgrToken = (sgrToken, activeStyles) => {
  const { code } = sgrToken;
  if (applySgrResetCode(code, activeStyles)) {
    return;
  }
  const colorStyle = getColorStyle(sgrToken);
  if (colorStyle) {
    upsertActiveStyle(activeStyles, colorStyle);
    return;
  }
  const close = ansi_styles_default.codes.get(code);
  if (close !== void 0 && close !== ANSI_SGR_RESET) {
    upsertActiveStyle(activeStyles, {
      family: `modifier-${code}`,
      open: sgrToken.open,
      close
    });
  }
};
var applySgrParameters = (sgrParameters, activeStyles) => {
  for (const sgrToken of getSgrTokens(sgrParameters)) {
    applySgrToken(sgrToken, activeStyles);
  }
};
var applySgrResets = (sgrParameters, activeStyles) => {
  for (const { code } of getSgrTokens(sgrParameters)) {
    applySgrResetCode(code, activeStyles);
  }
};
var applyLeadingSgrResets = (string, startIndex, activeStyles) => {
  let index = startIndex;
  while (index < string.length) {
    const match = matchAnsiEscape(string, index);
    if (!match) {
      break;
    }
    if (match.groups.sgr !== void 0) {
      applySgrResets(match.groups.sgr, activeStyles);
    }
    index += match[0].length;
  }
};
var getClosingSgrSequence = (activeStyles) => [...activeStyles].reverse().map((activeStyle) => wrapAnsiCode(activeStyle.close)).join("");
var getOpeningSgrSequence = (activeStyles) => activeStyles.map((activeStyle) => wrapAnsiCode(activeStyle.open)).join("");
var wrapWord = (rows, word, columns, rowWidth) => {
  const tokens = getTokens(word);
  let visible = rowWidth;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.width > 0 && visible > 0 && visible + token.width > columns) {
      rows.push("");
      visible = 0;
    }
    rows[rows.length - 1] += token.value;
    visible += token.width;
    if (visible === columns && index < tokens.length - 1) {
      rows.push("");
      visible = 0;
    }
  }
  if (!visible && rows.at(-1).length > 0 && rows.length > 1) {
    rows[rows.length - 2] += rows.pop();
  }
  return getWidth(rows.at(-1));
};
var stringVisibleTrimSpacesRight = (string) => {
  if (!string.includes(" ")) {
    return string;
  }
  const segments = [];
  forEachSegment(string, (plainText) => {
    segments.push({ value: plainText, isEscape: false });
  }, (escape3) => {
    segments.push({ value: escape3, isEscape: true });
  });
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    if (segment.isEscape) {
      continue;
    }
    let end = segment.value.length;
    while (end > 0 && segment.value[end - 1] === " ") {
      end--;
    }
    segment.value = segment.value.slice(0, end);
    if (getStringWidth(segment.value) > 0) {
      break;
    }
  }
  return segments.map((segment) => segment.value).join("");
};
var expandTabs = (line) => {
  if (!line.includes("	")) {
    return line;
  }
  let visible = 0;
  let expandedLine = "";
  let plainTextSinceTab = "";
  const expandPlainText = (plainText) => {
    const segments = plainText.split("	");
    for (const [index, segment] of segments.entries()) {
      expandedLine += segment;
      plainTextSinceTab += segment;
      if (index < segments.length - 1) {
        visible += getStringWidth(plainTextSinceTab);
        plainTextSinceTab = "";
        const spaces = TAB_SIZE - visible % TAB_SIZE;
        expandedLine += " ".repeat(spaces);
        visible += spaces;
      }
    }
  };
  forEachSegment(line, expandPlainText, (escape3) => {
    expandedLine += escape3;
  });
  return expandedLine;
};
var restoreStylesAcrossRows = (preString) => {
  let returnValue = "";
  let activeHyperlink;
  const activeStyles = [];
  let index = 0;
  let copiedIndex = 0;
  while (index < preString.length) {
    ROW_BOUNDARY_REGEX.lastIndex = index;
    const boundary = ROW_BOUNDARY_REGEX.exec(preString);
    if (!boundary) {
      break;
    }
    index = boundary.index;
    if (boundary[0] !== "\n") {
      const escape3 = matchAnsiEscape(preString, index);
      if (!escape3) {
        index++;
        continue;
      }
      const { groups } = escape3;
      if (groups.sgr !== void 0) {
        applySgrParameters(groups.sgr, activeStyles);
      } else if (groups.uri !== void 0) {
        activeHyperlink = groups.uri.length === 0 ? void 0 : { parameters: groups.parameters, uri: groups.uri };
      }
      index += escape3[0].length;
      continue;
    }
    returnValue += preString.slice(copiedIndex, index);
    if (index > copiedIndex) {
      if (activeHyperlink) {
        returnValue += wrapAnsiHyperlink("");
      }
      returnValue += getClosingSgrSequence(activeStyles);
    }
    returnValue += "\n";
    index++;
    copiedIndex = index;
    if (index < preString.length && preString[index] !== "\n") {
      const openingStyles = [...activeStyles];
      applyLeadingSgrResets(preString, index, openingStyles);
      returnValue += getOpeningSgrSequence(openingStyles);
      if (activeHyperlink) {
        returnValue += wrapAnsiHyperlink(activeHyperlink.uri, activeHyperlink.parameters);
      }
    }
  }
  return returnValue + preString.slice(copiedIndex);
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  const words = splitWords(string);
  let rows = [""];
  let rowLength = 0;
  let trimmedRowIndex = -1;
  let isFirstWord = true;
  for (const word of words) {
    const rowIndex = rows.length - 1;
    if (options.trim !== false && trimmedRowIndex !== rowIndex) {
      const row = rows[rowIndex];
      const trimmedRow = row.trimStart();
      if (trimmedRow.length !== row.length) {
        rows[rowIndex] = trimmedRow;
        rowLength = getWidth(trimmedRow);
      }
      if (trimmedRow.length > 0) {
        trimmedRowIndex = rowIndex;
      }
    }
    if (isFirstWord) {
      isFirstWord = false;
    } else {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength > 0 || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    if (options.hard && options.wordWrap !== false && word.width > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((word.width - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((word.width - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
        rowLength = 0;
      }
      rowLength = wrapWord(rows, word.value, columns, rowLength);
      continue;
    }
    if (rowLength + word.width > columns && rowLength > 0 && word.width > 0) {
      if (options.wordWrap === false && rowLength < columns) {
        rowLength = wrapWord(rows, word.value, columns, rowLength);
        continue;
      }
      rows.push("");
      rowLength = 0;
    }
    if (rowLength + word.width > columns && options.wordWrap === false) {
      rowLength = wrapWord(rows, word.value, columns, rowLength);
      continue;
    }
    rows[rows.length - 1] += word.value;
    rowLength += word.width;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  return restoreStylesAcrossRows(rows.join("\n"));
};
function wrapAnsi(string, columns, options) {
  return String(string).normalize().replaceAll("\r\n", "\n").split("\n").map((line) => exec(expandTabs(line), columns, options)).join("\n");
}

// node_modules/terminal-size/index.js
import process3 from "node:process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import tty from "node:tty";
var defaultColumns = 80;
var defaultRows = 24;
var exec2 = (command, arguments_, { shell, env: env3 } = {}) => execFileSync(command, arguments_, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
  timeout: 500,
  shell,
  env: env3
}).trim();
var create = (columns, rows) => ({
  columns: Number.parseInt(columns, 10),
  rows: Number.parseInt(rows, 10)
});
var createIfNotDefault = (maybeColumns, maybeRows) => {
  const { columns, rows } = create(maybeColumns, maybeRows);
  if (Number.isNaN(columns) || Number.isNaN(rows)) {
    return;
  }
  if (columns === defaultColumns && rows === defaultRows) {
    return;
  }
  return { columns, rows };
};
var isForegroundProcess = () => {
  if (process3.platform !== "linux") {
    return true;
  }
  try {
    const statContents = fs.readFileSync("/proc/self/stat", "utf8");
    const closingParenthesisIndex = statContents.lastIndexOf(") ");
    if (closingParenthesisIndex === -1) {
      return false;
    }
    const statFields = statContents.slice(closingParenthesisIndex + 2).trim().split(/\s+/);
    const processGroupId = Number.parseInt(statFields[2], 10);
    const foregroundProcessGroupId = Number.parseInt(statFields[5], 10);
    if (Number.isNaN(processGroupId) || Number.isNaN(foregroundProcessGroupId)) {
      return false;
    }
    if (foregroundProcessGroupId <= 0) {
      return false;
    }
    return processGroupId === foregroundProcessGroupId;
  } catch {
    return false;
  }
};
function terminalSize() {
  const { env: env3, stdout, stderr } = process3;
  if (stdout?.columns && stdout?.rows) {
    return create(stdout.columns, stdout.rows);
  }
  if (stderr?.columns && stderr?.rows) {
    return create(stderr.columns, stderr.rows);
  }
  if (env3.COLUMNS && env3.LINES) {
    return create(env3.COLUMNS, env3.LINES);
  }
  const fallback = {
    columns: defaultColumns,
    rows: defaultRows
  };
  if (process3.platform === "win32") {
    return tput() ?? fallback;
  }
  if (process3.platform === "darwin") {
    return devTty() ?? tput() ?? fallback;
  }
  return devTty() ?? tput() ?? resize() ?? fallback;
}
var devTty = () => {
  try {
    const flags = process3.platform === "darwin" ? fs.constants.O_EVTONLY | fs.constants.O_NONBLOCK : fs.constants.O_NONBLOCK;
    const { columns, rows } = tty.WriteStream(fs.openSync("/dev/tty", flags));
    return { columns, rows };
  } catch {
  }
};
var tput = () => {
  try {
    const columns = exec2("tput", ["cols"], { env: { TERM: "dumb", ...process3.env } });
    const rows = exec2("tput", ["lines"], { env: { TERM: "dumb", ...process3.env } });
    if (columns && rows) {
      return createIfNotDefault(columns, rows);
    }
  } catch {
  }
};
var resize = () => {
  try {
    if (!isForegroundProcess()) {
      return;
    }
    const size = exec2("resize", ["-u"]).match(/\d+/g);
    if (size.length === 2) {
      return createIfNotDefault(size[0], size[1]);
    }
  } catch {
  }
};

// node_modules/ink/build/utils.js
var getWindowSize = (stdout) => {
  const { columns, rows } = stdout;
  if (columns && rows) {
    return { columns, rows };
  }
  const fallbackSize = terminalSize();
  return {
    columns: columns || fallbackSize.columns || 80,
    rows: rows || fallbackSize.rows || 24
  };
};

// node_modules/ink/build/reconciler.js
var import_react_reconciler = __toESM(require_react_reconciler(), 1);
var import_constants = __toESM(require_constants(), 1);
var Scheduler = __toESM(require_scheduler(), 1);
import process4 from "node:process";
var import_react = __toESM(require_react(), 1);

// node_modules/widest-line/index.js
function widestLine(string) {
  let lineWidth = 0;
  for (const line of string.split("\n")) {
    lineWidth = Math.max(lineWidth, stringWidth(line));
  }
  return lineWidth;
}

// node_modules/ink/build/measure-text.js
var cache = /* @__PURE__ */ new Map();
var measureText = (text) => {
  if (text.length === 0) {
    return {
      width: 0,
      height: 0
    };
  }
  const cachedDimensions = cache.get(text);
  if (cachedDimensions) {
    return cachedDimensions;
  }
  const width = widestLine(text);
  const height = text.split("\n").length;
  const dimensions = { width, height };
  cache.set(text, dimensions);
  return dimensions;
};
var measure_text_default = measureText;

// node_modules/slice-ansi/node_modules/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET2 = 10;
var wrapAnsi162 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi2562 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m2 = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles2 = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames2 = Object.keys(styles2.modifier);
var foregroundColorNames2 = Object.keys(styles2.color);
var backgroundColorNames2 = Object.keys(styles2.bgColor);
var colorNames2 = [...foregroundColorNames2, ...backgroundColorNames2];
function assembleStyles2() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles2)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles2[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles2[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles2, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles2, "codes", {
    value: codes,
    enumerable: false
  });
  styles2.color.close = "\x1B[39m";
  styles2.bgColor.close = "\x1B[49m";
  styles2.color.ansi = wrapAnsi162();
  styles2.color.ansi256 = wrapAnsi2562();
  styles2.color.ansi16m = wrapAnsi16m2();
  styles2.bgColor.ansi = wrapAnsi162(ANSI_BACKGROUND_OFFSET2);
  styles2.bgColor.ansi256 = wrapAnsi2562(ANSI_BACKGROUND_OFFSET2);
  styles2.bgColor.ansi16m = wrapAnsi16m2(ANSI_BACKGROUND_OFFSET2);
  Object.defineProperties(styles2, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles2.rgbToAnsi256(...styles2.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles2.ansi256ToAnsi(styles2.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles2.ansi256ToAnsi(styles2.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles2;
}
var ansiStyles2 = assembleStyles2();
var ansi_styles_default2 = ansiStyles2;

// node_modules/is-fullwidth-code-point/index.js
function isFullwidthCodePoint(codePoint) {
  if (!Number.isInteger(codePoint)) {
    return false;
  }
  return isFullwidth(codePoint) || isWide(codePoint);
}

// node_modules/slice-ansi/tokenize-ansi.js
var __asciiSegments3 = (s) => ({ [Symbol.iterator]: function* () {
  for (let i = 0; i < s.length; i++) yield { segment: s[i], index: i, input: s };
}, containing: (i) => i >= 0 && i < s.length ? { segment: s[i], index: i, input: s } : void 0 });
var __isAscii3 = (s) => /^[\x00-\x7f]*$/.test(s) && !s.includes("\r\n");
var ESCAPE_CODE_POINT = 27;
var C1_DCS_CODE_POINT = 144;
var C1_SOS_CODE_POINT = 152;
var C1_CSI_CODE_POINT = 155;
var C1_ST_CODE_POINT = 156;
var C1_OSC_CODE_POINT = 157;
var C1_PM_CODE_POINT = 158;
var C1_APC_CODE_POINT = 159;
var ESCAPES2 = /* @__PURE__ */ new Set([
  ESCAPE_CODE_POINT,
  C1_DCS_CODE_POINT,
  C1_SOS_CODE_POINT,
  C1_CSI_CODE_POINT,
  C1_ST_CODE_POINT,
  C1_OSC_CODE_POINT,
  C1_PM_CODE_POINT,
  C1_APC_CODE_POINT
]);
var ESCAPE = "\x1B";
var ANSI_BELL = "\x07";
var ANSI_CSI2 = "[";
var ANSI_OSC2 = "]";
var ANSI_DCS = "P";
var ANSI_SOS = "X";
var ANSI_PM = "^";
var ANSI_APC = "_";
var ANSI_SGR_TERMINATOR2 = "m";
var ANSI_OSC_TERMINATOR = "\\";
var ANSI_STRING_TERMINATOR = `${ESCAPE}${ANSI_OSC_TERMINATOR}`;
var C1_OSC = "\x9D";
var C1_STRING_TERMINATOR = "\x9C";
var ANSI_HYPERLINK_ESC_PREFIX = `${ESCAPE}${ANSI_OSC2}8;`;
var ANSI_HYPERLINK_C1_PREFIX = `${C1_OSC}8;`;
var ANSI_HYPERLINK_ESC_CLOSE = `${ANSI_HYPERLINK_ESC_PREFIX};`;
var ANSI_HYPERLINK_C1_CLOSE = `${ANSI_HYPERLINK_C1_PREFIX};`;
var CODE_POINT_0 = "0".codePointAt(0);
var CODE_POINT_9 = "9".codePointAt(0);
var CODE_POINT_SEMICOLON = ";".codePointAt(0);
var CODE_POINT_COLON = ":".codePointAt(0);
var CODE_POINT_CSI_PARAMETER_START = "0".codePointAt(0);
var CODE_POINT_CSI_PARAMETER_END = "?".codePointAt(0);
var CODE_POINT_CSI_INTERMEDIATE_START = " ".codePointAt(0);
var CODE_POINT_CSI_INTERMEDIATE_END = "/".codePointAt(0);
var CODE_POINT_CSI_FINAL_START = "@".codePointAt(0);
var CODE_POINT_CSI_FINAL_END = "~".codePointAt(0);
var REGIONAL_INDICATOR_SYMBOL_LETTER_A = 127462;
var REGIONAL_INDICATOR_SYMBOL_LETTER_Z = 127487;
var SGR_RESET_CODE = 0;
var SGR_EXTENDED_FOREGROUND_CODE = 38;
var SGR_DEFAULT_FOREGROUND_CODE = 39;
var SGR_EXTENDED_BACKGROUND_CODE = 48;
var SGR_DEFAULT_BACKGROUND_CODE = 49;
var SGR_COLOR_TYPE_ANSI_256 = 5;
var SGR_COLOR_TYPE_TRUECOLOR = 2;
var SGR_ANSI_256_FRAGMENT_LENGTH = 3;
var SGR_TRUECOLOR_FRAGMENT_LENGTH = 5;
var SGR_ANSI_256_LAST_PARAMETER_OFFSET = 2;
var SGR_TRUECOLOR_LAST_PARAMETER_OFFSET = 4;
var VARIATION_SELECTOR_16_CODE_POINT = 65039;
var COMBINING_ENCLOSING_KEYCAP_CODE_POINT = 8419;
var EMOJI_PRESENTATION_GRAPHEME_REGEX = new RegExp("\\p{Emoji_Presentation}", "v");
var __real_GRAPHEME_SEGMENTER;
var GRAPHEME_SEGMENTER = { segment: (s) => __isAscii3(s) ? __asciiSegments3(s) : (__real_GRAPHEME_SEGMENTER ??= new Intl.Segmenter(void 0, { granularity: "grapheme" })).segment(s) };
var endCodeNumbers = /* @__PURE__ */ new Set();
for (const [, end] of ansi_styles_default2.codes) {
  endCodeNumbers.add(end);
}
function isSgrParameterCharacter(codePoint) {
  return codePoint >= CODE_POINT_0 && codePoint <= CODE_POINT_9 || codePoint === CODE_POINT_SEMICOLON || codePoint === CODE_POINT_COLON;
}
function isCsiParameterCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_PARAMETER_START && codePoint <= CODE_POINT_CSI_PARAMETER_END;
}
function isCsiIntermediateCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_INTERMEDIATE_START && codePoint <= CODE_POINT_CSI_INTERMEDIATE_END;
}
function isCsiFinalCharacter(codePoint) {
  return codePoint >= CODE_POINT_CSI_FINAL_START && codePoint <= CODE_POINT_CSI_FINAL_END;
}
function isRegionalIndicatorCodePoint(codePoint) {
  return codePoint >= REGIONAL_INDICATOR_SYMBOL_LETTER_A && codePoint <= REGIONAL_INDICATOR_SYMBOL_LETTER_Z;
}
function createControlParseResult(code, endIndex) {
  return {
    token: {
      type: "control",
      code
    },
    endIndex
  };
}
function isEmojiStyleGrapheme(grapheme) {
  if (EMOJI_PRESENTATION_GRAPHEME_REGEX.test(grapheme)) {
    return true;
  }
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0);
    if (codePoint === VARIATION_SELECTOR_16_CODE_POINT || codePoint === COMBINING_ENCLOSING_KEYCAP_CODE_POINT) {
      return true;
    }
  }
  return false;
}
function getGraphemeWidth(grapheme) {
  let regionalIndicatorCount = 0;
  for (const character of grapheme) {
    const codePoint = character.codePointAt(0);
    if (isFullwidthCodePoint(codePoint)) {
      return 2;
    }
    if (isRegionalIndicatorCodePoint(codePoint)) {
      regionalIndicatorCount++;
    }
  }
  if (regionalIndicatorCount >= 1) {
    return 2;
  }
  if (isEmojiStyleGrapheme(grapheme)) {
    return 2;
  }
  return 1;
}
function getSgrPrefix(code) {
  if (code.startsWith("\x9B")) {
    return "\x9B";
  }
  return `${ESCAPE}${ANSI_CSI2}`;
}
function createSgrCode(prefix, values) {
  return `${prefix}${values.join(";")}${ANSI_SGR_TERMINATOR2}`;
}
function getSgrFragments(code) {
  const fragments = [];
  const sgrPrefix = getSgrPrefix(code);
  let parameterString;
  if (code.startsWith(`${ESCAPE}${ANSI_CSI2}`)) {
    parameterString = code.slice(2, -1);
  } else if (code.startsWith("\x9B")) {
    parameterString = code.slice(1, -1);
  } else {
    return fragments;
  }
  const rawCodes = parameterString.length === 0 ? [String(SGR_RESET_CODE)] : parameterString.split(";");
  let index = 0;
  while (index < rawCodes.length) {
    const codeNumber = Number.parseInt(rawCodes[index], 10);
    if (Number.isNaN(codeNumber)) {
      index++;
      continue;
    }
    if (codeNumber === SGR_RESET_CODE) {
      fragments.push({ type: "reset" });
      index++;
      continue;
    }
    if (codeNumber === SGR_EXTENDED_FOREGROUND_CODE || codeNumber === SGR_EXTENDED_BACKGROUND_CODE) {
      const colorType = Number.parseInt(rawCodes[index + 1], 10);
      if (colorType === SGR_COLOR_TYPE_ANSI_256 && index + SGR_ANSI_256_LAST_PARAMETER_OFFSET < rawCodes.length) {
        const openCode3 = createSgrCode(sgrPrefix, rawCodes.slice(index, index + SGR_ANSI_256_FRAGMENT_LENGTH));
        fragments.push({
          type: "start",
          code: openCode3,
          endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
        });
        index += SGR_ANSI_256_FRAGMENT_LENGTH;
        continue;
      }
      if (colorType === SGR_COLOR_TYPE_TRUECOLOR && index + SGR_TRUECOLOR_LAST_PARAMETER_OFFSET < rawCodes.length) {
        const openCode3 = createSgrCode(sgrPrefix, rawCodes.slice(index, index + SGR_TRUECOLOR_FRAGMENT_LENGTH));
        fragments.push({
          type: "start",
          code: openCode3,
          endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
        });
        index += SGR_TRUECOLOR_FRAGMENT_LENGTH;
        continue;
      }
      const openCode2 = createSgrCode(sgrPrefix, [rawCodes[index]]);
      fragments.push({
        type: "start",
        code: openCode2,
        endCode: ansi_styles_default2.color.ansi(codeNumber === SGR_EXTENDED_FOREGROUND_CODE ? SGR_DEFAULT_FOREGROUND_CODE : SGR_DEFAULT_BACKGROUND_CODE)
      });
      index++;
      continue;
    }
    if (endCodeNumbers.has(codeNumber)) {
      fragments.push({
        type: "end",
        endCode: ansi_styles_default2.color.ansi(codeNumber)
      });
      index++;
      continue;
    }
    const mappedEndCode = ansi_styles_default2.codes.get(codeNumber);
    if (mappedEndCode !== void 0) {
      const openCode2 = createSgrCode(sgrPrefix, [rawCodes[index]]);
      fragments.push({
        type: "start",
        code: openCode2,
        endCode: ansi_styles_default2.color.ansi(mappedEndCode)
      });
      index++;
      continue;
    }
    const openCode = createSgrCode(sgrPrefix, [rawCodes[index]]);
    fragments.push({
      type: "start",
      code: openCode,
      endCode: ansi_styles_default2.reset.open
    });
    index++;
  }
  if (fragments.length === 0) {
    fragments.push({ type: "reset" });
  }
  return fragments;
}
function parseCsiCode(string, index) {
  const escapeCodePoint = string.codePointAt(index);
  let sequenceStartIndex;
  if (escapeCodePoint === ESCAPE_CODE_POINT) {
    if (string[index + 1] !== ANSI_CSI2) {
      return;
    }
    sequenceStartIndex = index + 2;
  } else if (escapeCodePoint === C1_CSI_CODE_POINT) {
    sequenceStartIndex = index + 1;
  } else {
    return;
  }
  let hasCanonicalSgrParameters = true;
  for (let sequenceIndex = sequenceStartIndex; sequenceIndex < string.length; sequenceIndex++) {
    const codePoint = string.codePointAt(sequenceIndex);
    if (isCsiFinalCharacter(codePoint)) {
      const code = string.slice(index, sequenceIndex + 1);
      if (string[sequenceIndex] !== ANSI_SGR_TERMINATOR2 || !hasCanonicalSgrParameters) {
        return createControlParseResult(code, sequenceIndex + 1);
      }
      return {
        token: {
          type: "sgr",
          code,
          fragments: getSgrFragments(code)
        },
        endIndex: sequenceIndex + 1
      };
    }
    if (isCsiParameterCharacter(codePoint)) {
      if (!isSgrParameterCharacter(codePoint)) {
        hasCanonicalSgrParameters = false;
      }
      continue;
    }
    if (isCsiIntermediateCharacter(codePoint)) {
      hasCanonicalSgrParameters = false;
      continue;
    }
    const endIndex = sequenceIndex;
    return createControlParseResult(string.slice(index, endIndex), endIndex);
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseHyperlinkCode(string, index) {
  let hyperlinkPrefix;
  let hyperlinkClose;
  const codePoint = string.codePointAt(index);
  if (codePoint === ESCAPE_CODE_POINT && string.startsWith(ANSI_HYPERLINK_ESC_PREFIX, index)) {
    hyperlinkPrefix = ANSI_HYPERLINK_ESC_PREFIX;
    hyperlinkClose = ANSI_HYPERLINK_ESC_CLOSE;
  } else if (codePoint === C1_OSC_CODE_POINT && string.startsWith(ANSI_HYPERLINK_C1_PREFIX, index)) {
    hyperlinkPrefix = ANSI_HYPERLINK_C1_PREFIX;
    hyperlinkClose = ANSI_HYPERLINK_C1_CLOSE;
  } else {
    return;
  }
  const uriStart = string.indexOf(";", index + hyperlinkPrefix.length);
  if (uriStart === -1) {
    return createControlParseResult(string.slice(index), string.length);
  }
  for (let sequenceIndex = uriStart + 1; sequenceIndex < string.length; sequenceIndex++) {
    const character = string[sequenceIndex];
    if (character === ANSI_BELL) {
      const code = string.slice(index, sequenceIndex + 1);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: ANSI_BELL
        },
        endIndex: sequenceIndex + 1
      };
    }
    if (character === ESCAPE && string[sequenceIndex + 1] === ANSI_OSC_TERMINATOR) {
      const code = string.slice(index, sequenceIndex + 2);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: ANSI_STRING_TERMINATOR
        },
        endIndex: sequenceIndex + 2
      };
    }
    if (character === C1_STRING_TERMINATOR) {
      const code = string.slice(index, sequenceIndex + 1);
      const action = sequenceIndex === uriStart + 1 ? "close" : "open";
      return {
        token: {
          type: "hyperlink",
          code,
          action,
          closePrefix: hyperlinkClose,
          terminator: C1_STRING_TERMINATOR
        },
        endIndex: sequenceIndex + 1
      };
    }
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseControlStringCode(string, index) {
  const codePoint = string.codePointAt(index);
  let sequenceStartIndex;
  let supportsBellTerminator = false;
  switch (codePoint) {
    case ESCAPE_CODE_POINT: {
      const command = string[index + 1];
      switch (command) {
        case ANSI_OSC2: {
          sequenceStartIndex = index + 2;
          supportsBellTerminator = true;
          break;
        }
        case ANSI_DCS:
        case ANSI_SOS:
        case ANSI_PM:
        case ANSI_APC: {
          sequenceStartIndex = index + 2;
          break;
        }
        case ANSI_OSC_TERMINATOR: {
          return createControlParseResult(ANSI_STRING_TERMINATOR, index + 2);
        }
        default: {
          return;
        }
      }
      break;
    }
    case C1_OSC_CODE_POINT: {
      sequenceStartIndex = index + 1;
      supportsBellTerminator = true;
      break;
    }
    case C1_DCS_CODE_POINT:
    case C1_SOS_CODE_POINT:
    case C1_PM_CODE_POINT:
    case C1_APC_CODE_POINT: {
      sequenceStartIndex = index + 1;
      break;
    }
    case C1_ST_CODE_POINT: {
      return createControlParseResult(C1_STRING_TERMINATOR, index + 1);
    }
    default: {
      return;
    }
  }
  for (let sequenceIndex = sequenceStartIndex; sequenceIndex < string.length; sequenceIndex++) {
    if (supportsBellTerminator && string[sequenceIndex] === ANSI_BELL) {
      return createControlParseResult(string.slice(index, sequenceIndex + 1), sequenceIndex + 1);
    }
    if (string[sequenceIndex] === ESCAPE && string[sequenceIndex + 1] === ANSI_OSC_TERMINATOR) {
      return createControlParseResult(string.slice(index, sequenceIndex + 2), sequenceIndex + 2);
    }
    if (string[sequenceIndex] === C1_STRING_TERMINATOR) {
      return createControlParseResult(string.slice(index, sequenceIndex + 1), sequenceIndex + 1);
    }
  }
  return createControlParseResult(string.slice(index), string.length);
}
function parseAnsiCode(string, index) {
  const codePoint = string.codePointAt(index);
  if (codePoint === ESCAPE_CODE_POINT || codePoint === C1_OSC_CODE_POINT) {
    const hyperlinkCode = parseHyperlinkCode(string, index);
    if (hyperlinkCode) {
      return hyperlinkCode;
    }
  }
  const controlStringCode = parseControlStringCode(string, index);
  if (controlStringCode) {
    return controlStringCode;
  }
  return parseCsiCode(string, index);
}
function appendTrailingAnsiTokens(string, index, tokens) {
  while (index < string.length) {
    const nextCodePoint = string.codePointAt(index);
    if (!ESCAPES2.has(nextCodePoint)) {
      break;
    }
    const escapeCode = parseAnsiCode(string, index);
    if (!escapeCode) {
      break;
    }
    tokens.push(escapeCode.token);
    index = escapeCode.endIndex;
  }
  return index;
}
function parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments) {
  const segment = graphemeSegments.containing(index);
  if (!segment || segment.index !== index) {
    return;
  }
  return {
    token: {
      type: "character",
      // Intentionally preserve UAX29 behavior (GB3): CRLF is one grapheme cluster.
      value: segment.segment,
      visibleWidth: getGraphemeWidth(segment.segment),
      isGraphemeContinuation: false
    },
    endIndex: index + segment.segment.length
  };
}
function collectVisibleCharacters(string) {
  const visibleCharacters = [];
  let index = 0;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES2.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        index = code.endIndex;
        continue;
      }
    }
    const value = String.fromCodePoint(codePoint);
    visibleCharacters.push({
      value,
      visibleWidth: 1,
      isGraphemeContinuation: false
    });
    index += value.length;
  }
  return visibleCharacters;
}
function applyGraphemeMetadata(visibleCharacters) {
  if (visibleCharacters.length === 0) {
    return;
  }
  const visibleString = visibleCharacters.map(({ value }) => value).join("");
  const scalarOffsets = [];
  let scalarOffset = 0;
  for (const visibleCharacter of visibleCharacters) {
    scalarOffsets.push(scalarOffset);
    scalarOffset += visibleCharacter.value.length;
  }
  let scalarIndex = 0;
  for (const segment of GRAPHEME_SEGMENTER.segment(visibleString)) {
    while (scalarIndex < visibleCharacters.length && scalarOffsets[scalarIndex] < segment.index) {
      scalarIndex++;
    }
    let graphemeIndex = scalarIndex;
    let isFirstInGrapheme = true;
    while (graphemeIndex < visibleCharacters.length && scalarOffsets[graphemeIndex] < segment.index + segment.segment.length) {
      visibleCharacters[graphemeIndex].visibleWidth = isFirstInGrapheme ? getGraphemeWidth(segment.segment) : 0;
      visibleCharacters[graphemeIndex].isGraphemeContinuation = !isFirstInGrapheme;
      isFirstInGrapheme = false;
      graphemeIndex++;
    }
    scalarIndex = graphemeIndex;
  }
}
function tokenizeAnsiWithVisibleSegmentation(string, { endCharacter = Number.POSITIVE_INFINITY } = {}) {
  const tokens = [];
  const visibleCharacters = collectVisibleCharacters(string);
  applyGraphemeMetadata(visibleCharacters);
  let index = 0;
  let visibleCharacterIndex = 0;
  let visibleCount = 0;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES2.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        tokens.push(code.token);
        index = code.endIndex;
        continue;
      }
    }
    const value = String.fromCodePoint(codePoint);
    const visibleCharacter = visibleCharacters[visibleCharacterIndex];
    let visibleWidth = isFullwidthCodePoint(codePoint) ? 2 : value.length;
    if (visibleCharacter) {
      visibleWidth = visibleCharacter.visibleWidth;
    }
    const token = {
      type: "character",
      value,
      visibleWidth,
      isGraphemeContinuation: visibleCharacter ? visibleCharacter.isGraphemeContinuation : false
    };
    tokens.push(token);
    index += value.length;
    visibleCharacterIndex++;
    visibleCount += token.visibleWidth;
    if (visibleCount >= endCharacter) {
      const nextVisibleCharacter = visibleCharacters[visibleCharacterIndex];
      if (!nextVisibleCharacter || !nextVisibleCharacter.isGraphemeContinuation) {
        index = appendTrailingAnsiTokens(string, index, tokens);
        break;
      }
    }
  }
  return tokens;
}
function areValuesInSameGrapheme(leftValue, rightValue) {
  const pair = `${leftValue}${rightValue}`;
  const splitIndex = leftValue.length;
  for (const segment of GRAPHEME_SEGMENTER.segment(pair)) {
    if (segment.index === splitIndex) {
      return false;
    }
    if (segment.index > splitIndex) {
      return true;
    }
  }
  return true;
}
function hasAnsiSplitContinuationAhead(string, startIndex, previousVisibleValue, graphemeSegments) {
  if (!previousVisibleValue) {
    return false;
  }
  let index = startIndex;
  let hasAnsiCode = false;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES2.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        hasAnsiCode = true;
        index = code.endIndex;
        continue;
      }
    }
    if (!hasAnsiCode) {
      return false;
    }
    const characterToken = parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments);
    if (!characterToken) {
      return true;
    }
    return areValuesInSameGrapheme(previousVisibleValue, characterToken.token.value);
  }
  return false;
}
function tokenizeAnsi(string, { endCharacter = Number.POSITIVE_INFINITY } = {}) {
  const tokens = [];
  const graphemeSegments = GRAPHEME_SEGMENTER.segment(string);
  let index = 0;
  let visibleCount = 0;
  let previousVisibleValue;
  let hasAnsiSinceLastVisible = false;
  while (index < string.length) {
    const codePoint = string.codePointAt(index);
    if (ESCAPES2.has(codePoint)) {
      const code = parseAnsiCode(string, index);
      if (code) {
        tokens.push(code.token);
        index = code.endIndex;
        hasAnsiSinceLastVisible = true;
        continue;
      }
    }
    const characterToken = parseCharacterTokenWithRawSegmentation(string, index, graphemeSegments);
    if (!characterToken) {
      return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
    }
    if (hasAnsiSinceLastVisible && previousVisibleValue && areValuesInSameGrapheme(previousVisibleValue, characterToken.token.value)) {
      return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
    }
    tokens.push(characterToken.token);
    index = characterToken.endIndex;
    visibleCount += characterToken.token.visibleWidth;
    hasAnsiSinceLastVisible = false;
    previousVisibleValue = characterToken.token.value;
    if (visibleCount >= endCharacter) {
      if (hasAnsiSplitContinuationAhead(string, index, previousVisibleValue, graphemeSegments)) {
        return tokenizeAnsiWithVisibleSegmentation(string, { endCharacter });
      }
      index = appendTrailingAnsiTokens(string, index, tokens);
      break;
    }
  }
  return tokens;
}

// node_modules/slice-ansi/index.js
function applySgrFragments(activeStyles, fragments) {
  for (const fragment of fragments) {
    switch (fragment.type) {
      case "reset": {
        activeStyles.clear();
        break;
      }
      case "end": {
        activeStyles.delete(fragment.endCode);
        break;
      }
      case "start": {
        activeStyles.delete(fragment.endCode);
        activeStyles.set(fragment.endCode, fragment.code);
        break;
      }
      default: {
        break;
      }
    }
  }
  return activeStyles;
}
function undoAnsiCodes(activeStyles) {
  return [...activeStyles.keys()].toReversed().join("");
}
function closeHyperlink(hyperlinkToken) {
  return `${hyperlinkToken.closePrefix}${hyperlinkToken.terminator}`;
}
function shouldIncludeSgrAfterEnd(token, activeStyles) {
  let hasStartFragment = false;
  let hasClosingEffect = false;
  for (const fragment of token.fragments) {
    if (fragment.type === "start") {
      hasStartFragment = true;
      continue;
    }
    if (fragment.type === "reset" && activeStyles.size > 0) {
      hasClosingEffect = true;
      continue;
    }
    if (fragment.type === "end" && activeStyles.has(fragment.endCode)) {
      hasClosingEffect = true;
    }
  }
  return hasClosingEffect && !hasStartFragment;
}
function hasSgrStartFragment(token) {
  return token.fragments.some((fragment) => fragment.type === "start");
}
function discardPendingHyperlink(parameters) {
  if (parameters.activeHyperlink && !parameters.activeHyperlinkHasVisibleText && parameters.activeHyperlinkOutputIndex !== void 0) {
    const openCodeLength = parameters.activeHyperlink.code.length;
    parameters.returnValue = parameters.returnValue.slice(0, parameters.activeHyperlinkOutputIndex) + parameters.returnValue.slice(parameters.activeHyperlinkOutputIndex + openCodeLength);
    if (parameters.pendingSgrOutputIndex !== void 0 && parameters.pendingSgrOutputIndex > parameters.activeHyperlinkOutputIndex) {
      parameters.pendingSgrOutputIndex -= openCodeLength;
    }
  }
  parameters.activeHyperlink = void 0;
  parameters.activeHyperlinkHasVisibleText = false;
  parameters.activeHyperlinkOutputIndex = void 0;
}
function applySgrToken2(parameters) {
  if (parameters.isPastEnd && !shouldIncludeSgrAfterEnd(parameters.token, parameters.activeStyles)) {
    return parameters;
  }
  if (parameters.include && hasSgrStartFragment(parameters.token) && parameters.pendingSgrOutputIndex === void 0) {
    parameters.pendingSgrOutputIndex = parameters.returnValue.length;
    parameters.pendingSgrActiveStyles = new Map(parameters.activeStyles);
  }
  parameters.activeStyles = applySgrFragments(parameters.activeStyles, parameters.token.fragments);
  if (parameters.include) {
    parameters.returnValue += parameters.token.code;
  }
  return parameters;
}
function applyHyperlinkToken(parameters) {
  if (parameters.isPastEnd && (parameters.token.action !== "close" || !parameters.activeHyperlink)) {
    return parameters;
  }
  if (parameters.token.action === "open") {
    parameters.activeHyperlink = parameters.token;
    parameters.activeHyperlinkHasVisibleText = false;
    parameters.activeHyperlinkOutputIndex = void 0;
    if (parameters.include) {
      parameters.activeHyperlinkOutputIndex = parameters.returnValue.length;
    }
  } else if (parameters.token.action === "close") {
    if (parameters.include && parameters.activeHyperlink && !parameters.activeHyperlinkHasVisibleText) {
      discardPendingHyperlink(parameters);
      return parameters;
    }
    parameters.activeHyperlink = void 0;
    parameters.activeHyperlinkHasVisibleText = false;
    parameters.activeHyperlinkOutputIndex = void 0;
  }
  if (parameters.include) {
    parameters.returnValue += parameters.token.code;
  }
  return parameters;
}
function applyControlToken(parameters) {
  if (!parameters.isPastEnd && parameters.include) {
    parameters.returnValue += parameters.token.code;
  }
  return parameters;
}
function applyCharacterToken(parameters) {
  if (!parameters.include && parameters.position >= parameters.start && !parameters.token.isGraphemeContinuation) {
    parameters.include = true;
    parameters.returnValue = [...parameters.activeStyles.values()].join("");
    if (parameters.activeHyperlink) {
      parameters.activeHyperlinkOutputIndex = parameters.returnValue.length;
      parameters.returnValue += parameters.activeHyperlink.code;
    }
  }
  if (parameters.include) {
    parameters.returnValue += parameters.token.value;
    parameters.pendingSgrOutputIndex = void 0;
    parameters.pendingSgrActiveStyles = void 0;
    if (parameters.activeHyperlink) {
      parameters.activeHyperlinkHasVisibleText = true;
    }
  }
  parameters.position += parameters.token.visibleWidth;
  return parameters;
}
var tokenHandlers = {
  sgr: applySgrToken2,
  hyperlink: applyHyperlinkToken,
  control: applyControlToken,
  character: applyCharacterToken
};
function applyToken(parameters) {
  const tokenHandler = tokenHandlers[parameters.token.type];
  if (!tokenHandler) {
    return parameters;
  }
  return tokenHandler(parameters);
}
function createHasContinuationAheadMap(tokens) {
  const hasContinuationAhead = Array.from({ length: tokens.length }, () => false);
  let nextCharacterIsContinuation = false;
  for (let tokenIndex = tokens.length - 1; tokenIndex >= 0; tokenIndex--) {
    const token = tokens[tokenIndex];
    hasContinuationAhead[tokenIndex] = nextCharacterIsContinuation;
    if (token.type === "character") {
      nextCharacterIsContinuation = Boolean(token.isGraphemeContinuation);
    }
  }
  return hasContinuationAhead;
}
function isPastEndBoundary(token, position, end) {
  if (end === void 0) {
    return false;
  }
  if (position >= end) {
    return true;
  }
  return token.type === "character" && !token.isGraphemeContinuation && position + token.visibleWidth > end;
}
function sliceAnsi(string, start, end) {
  const tokens = tokenizeAnsi(string, { endCharacter: end });
  const hasContinuationAhead = createHasContinuationAheadMap(tokens);
  let activeStyles = /* @__PURE__ */ new Map();
  let activeHyperlink;
  let activeHyperlinkHasVisibleText = false;
  let activeHyperlinkOutputIndex;
  let pendingSgrOutputIndex;
  let pendingSgrActiveStyles;
  let position = 0;
  let returnValue = "";
  let include = false;
  for (const [tokenIndex, token] of tokens.entries()) {
    let isPastEnd = isPastEndBoundary(token, position, end);
    if (isPastEnd && token.type !== "character" && hasContinuationAhead[tokenIndex]) {
      isPastEnd = false;
    }
    if (isPastEnd && token.type === "character" && !token.isGraphemeContinuation) {
      if (activeHyperlink && !activeHyperlinkHasVisibleText) {
        const hyperlinkState = {
          activeHyperlink,
          activeHyperlinkHasVisibleText,
          activeHyperlinkOutputIndex,
          pendingSgrOutputIndex,
          returnValue
        };
        discardPendingHyperlink(hyperlinkState);
        ({
          activeHyperlink,
          activeHyperlinkHasVisibleText,
          activeHyperlinkOutputIndex,
          pendingSgrOutputIndex,
          returnValue
        } = hyperlinkState);
      }
      if (pendingSgrOutputIndex !== void 0) {
        returnValue = returnValue.slice(0, pendingSgrOutputIndex);
        activeStyles = pendingSgrActiveStyles;
        pendingSgrOutputIndex = void 0;
        pendingSgrActiveStyles = void 0;
      }
      break;
    }
    ({ activeStyles, activeHyperlink, activeHyperlinkHasVisibleText, activeHyperlinkOutputIndex, pendingSgrOutputIndex, pendingSgrActiveStyles, position, returnValue, include } = applyToken({
      token,
      isPastEnd,
      start,
      activeStyles,
      activeHyperlink,
      activeHyperlinkHasVisibleText,
      activeHyperlinkOutputIndex,
      pendingSgrOutputIndex,
      pendingSgrActiveStyles,
      position,
      returnValue,
      include
    }));
  }
  if (!include) {
    return "";
  }
  if (activeHyperlink) {
    returnValue += closeHyperlink(activeHyperlink);
  }
  returnValue += undoAnsiCodes(activeStyles);
  return returnValue;
}

// node_modules/cli-truncate/index.js
var validPositions = /* @__PURE__ */ new Set(["start", "middle", "end"]);
function getIndexOfNearestSpace(string, wantedIndex, shouldSearchRight) {
  if (string.charAt(wantedIndex) === " ") {
    return wantedIndex;
  }
  const direction = shouldSearchRight ? 1 : -1;
  for (let index = 0; index <= 3; index++) {
    const finalIndex = wantedIndex + index * direction;
    if (string.charAt(finalIndex) === " ") {
      return finalIndex;
    }
  }
  return wantedIndex;
}
function validateInput(text, columns, position, truncationCharacter) {
  if (typeof text !== "string") {
    throw new TypeError(`Expected \`input\` to be a string, got ${typeof text}`);
  }
  if (typeof columns !== "number") {
    throw new TypeError(`Expected \`columns\` to be a number, got ${typeof columns}`);
  }
  if (!Number.isFinite(columns)) {
    throw new TypeError(`Expected \`columns\` to be a finite number, got ${columns}`);
  }
  if (!validPositions.has(position)) {
    throw new TypeError(`Expected \`options.position\` to be either \`start\`, \`middle\` or \`end\`, got ${position}`);
  }
  if (typeof truncationCharacter !== "string") {
    throw new TypeError(`Expected \`options.truncationCharacter\` to be a string, got ${typeof truncationCharacter}`);
  }
}
function cliTruncate(text, columns, options = {}) {
  const {
    position = "end",
    space = false,
    preferTruncationOnSpace = false
  } = options;
  let { truncationCharacter = "\u2026" } = options;
  validateInput(text, columns, position, truncationCharacter);
  if (columns < 1) {
    return "";
  }
  const length = stringWidth(text);
  if (length <= columns) {
    return text;
  }
  if (columns === 1) {
    return truncationCharacter;
  }
  const ANSI = {
    ESC: 27,
    LEFT_BRACKET: 91,
    LETTER_M: 109
  };
  const isSgrParameter = (code) => code >= 48 && code <= 57 || code === 59;
  function leadingSgrSpanEndIndex(string) {
    let index = 0;
    while (index + 2 < string.length && string.codePointAt(index) === ANSI.ESC && string.codePointAt(index + 1) === ANSI.LEFT_BRACKET) {
      let j = index + 2;
      while (j < string.length && isSgrParameter(string.codePointAt(j))) {
        j++;
      }
      if (j < string.length && string.codePointAt(j) === ANSI.LETTER_M) {
        index = j + 1;
        continue;
      }
      break;
    }
    return index;
  }
  function trailingSgrSpanStartIndex(string) {
    let start = string.length;
    while (start > 1 && string.codePointAt(start - 1) === ANSI.LETTER_M) {
      let j = start - 2;
      while (j >= 0 && isSgrParameter(string.codePointAt(j))) {
        j--;
      }
      if (j >= 1 && string.codePointAt(j - 1) === ANSI.ESC && string.codePointAt(j) === ANSI.LEFT_BRACKET) {
        start = j - 1;
        continue;
      }
      break;
    }
    return start;
  }
  function appendWithInheritedStyleFromEnd(visible, suffix) {
    const start = trailingSgrSpanStartIndex(visible);
    if (start === visible.length) {
      return visible + suffix;
    }
    return visible.slice(0, start) + suffix + visible.slice(start);
  }
  function prependWithInheritedStyleFromStart(prefix, visible) {
    const end = leadingSgrSpanEndIndex(visible);
    if (end === 0) {
      return prefix + visible;
    }
    return visible.slice(0, end) + prefix + visible.slice(end);
  }
  if (position === "start") {
    if (preferTruncationOnSpace) {
      const nearestSpace = getIndexOfNearestSpace(text, length - columns + stringWidth(truncationCharacter), true);
      const right2 = sliceAnsi(text, nearestSpace, length).trim();
      return prependWithInheritedStyleFromStart(truncationCharacter, right2);
    }
    if (space) {
      truncationCharacter += " ";
    }
    const right = sliceAnsi(text, length - columns + stringWidth(truncationCharacter), length);
    return prependWithInheritedStyleFromStart(truncationCharacter, right);
  }
  if (position === "middle") {
    if (space) {
      truncationCharacter = ` ${truncationCharacter} `;
      if (stringWidth(truncationCharacter) >= columns) {
        truncationCharacter = truncationCharacter.trim();
      }
    }
    const truncationWidth = stringWidth(truncationCharacter);
    const half = Math.min(Math.floor(columns / 2), Math.max(0, columns - truncationWidth));
    if (preferTruncationOnSpace) {
      const spaceNearFirstBreakPoint = getIndexOfNearestSpace(text, half);
      const spaceNearSecondBreakPoint = getIndexOfNearestSpace(text, length - (columns - half) + truncationWidth, true);
      return sliceAnsi(text, 0, spaceNearFirstBreakPoint) + truncationCharacter + sliceAnsi(text, spaceNearSecondBreakPoint, length).trim();
    }
    return sliceAnsi(text, 0, half) + truncationCharacter + sliceAnsi(text, length - (columns - half) + truncationWidth, length);
  }
  if (position === "end") {
    if (preferTruncationOnSpace) {
      const nearestSpace = getIndexOfNearestSpace(text, columns - stringWidth(truncationCharacter));
      const left2 = sliceAnsi(text, 0, nearestSpace);
      return appendWithInheritedStyleFromEnd(left2, truncationCharacter);
    }
    if (space) {
      truncationCharacter = ` ${truncationCharacter}`;
    }
    const left = sliceAnsi(text, 0, columns - stringWidth(truncationCharacter));
    return appendWithInheritedStyleFromEnd(left, truncationCharacter);
  }
}

// node_modules/ink/build/wrap-text.js
var cache2 = {};
var wrapText = (text, maxWidth, wrapType) => {
  const cacheKey = text + String(maxWidth) + String(wrapType);
  const cachedText = cache2[cacheKey];
  if (cachedText) {
    return cachedText;
  }
  let wrappedText = text;
  if (wrapType === "wrap") {
    wrappedText = wrapAnsi(text, maxWidth, {
      trim: false,
      hard: true
    });
  }
  if (wrapType === "hard") {
    wrappedText = wrapAnsi(text, maxWidth, {
      trim: false,
      hard: true,
      wordWrap: false
    });
  }
  if (wrapType.startsWith("truncate")) {
    let position = "end";
    if (wrapType === "truncate-middle") {
      position = "middle";
    }
    if (wrapType === "truncate-start") {
      position = "start";
    }
    wrappedText = cliTruncate(text, maxWidth, { position });
  }
  cache2[cacheKey] = wrappedText;
  return wrappedText;
};
var wrap_text_default = wrapText;

// node_modules/ink/build/ansi-tokenizer.js
var bellCharacter = "\x07";
var escapeCharacter = "\x1B";
var stringTerminatorCharacter = "\x9C";
var csiCharacter = "\x9B";
var oscCharacter = "\x9D";
var dcsCharacter = "\x90";
var pmCharacter = "\x9E";
var apcCharacter = "\x9F";
var sosCharacter = "\x98";
var isCsiParameterCharacter2 = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 48 && codePoint <= 63;
};
var isCsiIntermediateCharacter2 = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 32 && codePoint <= 47;
};
var isCsiFinalCharacter2 = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 64 && codePoint <= 126;
};
var isEscapeIntermediateCharacter = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 32 && codePoint <= 47;
};
var isEscapeFinalCharacter = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 48 && codePoint <= 126;
};
var isC1ControlCharacter = (character) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== void 0 && codePoint >= 128 && codePoint <= 159;
};
var readCsiSequence = (text, fromIndex) => {
  let index = fromIndex;
  while (index < text.length) {
    const character = text[index];
    if (!isCsiParameterCharacter2(character)) {
      break;
    }
    index++;
  }
  const parameterString = text.slice(fromIndex, index);
  const intermediateStartIndex = index;
  while (index < text.length) {
    const character = text[index];
    if (!isCsiIntermediateCharacter2(character)) {
      break;
    }
    index++;
  }
  const intermediateString = text.slice(intermediateStartIndex, index);
  const finalCharacter = text[index];
  if (finalCharacter === void 0 || !isCsiFinalCharacter2(finalCharacter)) {
    return void 0;
  }
  return {
    endIndex: index + 1,
    parameterString,
    intermediateString,
    finalCharacter
  };
};
var findControlStringTerminatorIndex = (text, fromIndex, allowBellTerminator) => {
  for (let index = fromIndex; index < text.length; index++) {
    const character = text[index];
    if (allowBellTerminator && character === bellCharacter) {
      return index + 1;
    }
    if (character === stringTerminatorCharacter) {
      return index + 1;
    }
    if (character === escapeCharacter) {
      const followingCharacter = text[index + 1];
      if (followingCharacter === escapeCharacter) {
        index++;
        continue;
      }
      if (followingCharacter === "\\") {
        return index + 2;
      }
    }
  }
  return void 0;
};
var readEscapeSequence = (text, fromIndex) => {
  let index = fromIndex;
  while (index < text.length) {
    const character = text[index];
    if (!isEscapeIntermediateCharacter(character)) {
      break;
    }
    index++;
  }
  const intermediateString = text.slice(fromIndex, index);
  const finalCharacter = text[index];
  if (finalCharacter === void 0 || !isEscapeFinalCharacter(finalCharacter)) {
    return void 0;
  }
  return {
    endIndex: index + 1,
    intermediateString,
    finalCharacter
  };
};
var getControlStringFromEscapeIntroducer = (character) => {
  switch (character) {
    case "]": {
      return { type: "osc", allowBellTerminator: true };
    }
    case "P": {
      return { type: "dcs", allowBellTerminator: false };
    }
    case "^": {
      return { type: "pm", allowBellTerminator: false };
    }
    case "_": {
      return { type: "apc", allowBellTerminator: false };
    }
    case "X": {
      return { type: "sos", allowBellTerminator: false };
    }
    default: {
      return void 0;
    }
  }
};
var getControlStringFromC1Introducer = (character) => {
  switch (character) {
    case oscCharacter: {
      return { type: "osc", allowBellTerminator: true };
    }
    case dcsCharacter: {
      return { type: "dcs", allowBellTerminator: false };
    }
    case pmCharacter: {
      return { type: "pm", allowBellTerminator: false };
    }
    case apcCharacter: {
      return { type: "apc", allowBellTerminator: false };
    }
    case sosCharacter: {
      return { type: "sos", allowBellTerminator: false };
    }
    default: {
      return void 0;
    }
  }
};
var hasAnsiControlCharacters = (text) => {
  if (text.includes(escapeCharacter)) {
    return true;
  }
  for (const character of text) {
    if (isC1ControlCharacter(character)) {
      return true;
    }
  }
  return false;
};
var malformedFromIndex = (tokens, text, textStartIndex, fromIndex) => {
  if (fromIndex > textStartIndex) {
    tokens.push({ type: "text", value: text.slice(textStartIndex, fromIndex) });
  }
  tokens.push({ type: "invalid", value: text.slice(fromIndex) });
  return tokens;
};
var tokenizeAnsi2 = (text) => {
  if (!hasAnsiControlCharacters(text)) {
    return [{ type: "text", value: text }];
  }
  const tokens = [];
  let textStartIndex = 0;
  for (let index = 0; index < text.length; ) {
    const character = text[index];
    if (character === void 0) {
      break;
    }
    if (character === escapeCharacter) {
      const followingCharacter = text[index + 1];
      if (followingCharacter === void 0) {
        return malformedFromIndex(tokens, text, textStartIndex, index);
      }
      if (followingCharacter === "[") {
        const csiSequence = readCsiSequence(text, index + 2);
        if (csiSequence === void 0) {
          return malformedFromIndex(tokens, text, textStartIndex, index);
        }
        if (index > textStartIndex) {
          tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
        }
        tokens.push({
          type: "csi",
          value: text.slice(index, csiSequence.endIndex),
          parameterString: csiSequence.parameterString,
          intermediateString: csiSequence.intermediateString,
          finalCharacter: csiSequence.finalCharacter
        });
        index = csiSequence.endIndex;
        textStartIndex = index;
        continue;
      }
      const escapeControlString = getControlStringFromEscapeIntroducer(followingCharacter);
      if (escapeControlString !== void 0) {
        const controlStringTerminatorIndex = findControlStringTerminatorIndex(text, index + 2, escapeControlString.allowBellTerminator);
        if (controlStringTerminatorIndex === void 0) {
          return malformedFromIndex(tokens, text, textStartIndex, index);
        }
        if (index > textStartIndex) {
          tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
        }
        tokens.push({
          type: escapeControlString.type,
          value: text.slice(index, controlStringTerminatorIndex)
        });
        index = controlStringTerminatorIndex;
        textStartIndex = index;
        continue;
      }
      const escapeSequence = readEscapeSequence(text, index + 1);
      if (escapeSequence === void 0) {
        if (isEscapeIntermediateCharacter(followingCharacter)) {
          return malformedFromIndex(tokens, text, textStartIndex, index);
        }
        if (index > textStartIndex) {
          tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
        }
        index++;
        textStartIndex = index;
        continue;
      }
      if (index > textStartIndex) {
        tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
      }
      tokens.push({
        type: "esc",
        value: text.slice(index, escapeSequence.endIndex),
        intermediateString: escapeSequence.intermediateString,
        finalCharacter: escapeSequence.finalCharacter
      });
      index = escapeSequence.endIndex;
      textStartIndex = index;
      continue;
    }
    if (character === csiCharacter) {
      const csiSequence = readCsiSequence(text, index + 1);
      if (csiSequence === void 0) {
        return malformedFromIndex(tokens, text, textStartIndex, index);
      }
      if (index > textStartIndex) {
        tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
      }
      tokens.push({
        type: "csi",
        value: text.slice(index, csiSequence.endIndex),
        parameterString: csiSequence.parameterString,
        intermediateString: csiSequence.intermediateString,
        finalCharacter: csiSequence.finalCharacter
      });
      index = csiSequence.endIndex;
      textStartIndex = index;
      continue;
    }
    const c1ControlString = getControlStringFromC1Introducer(character);
    if (c1ControlString !== void 0) {
      const controlStringTerminatorIndex = findControlStringTerminatorIndex(text, index + 1, c1ControlString.allowBellTerminator);
      if (controlStringTerminatorIndex === void 0) {
        return malformedFromIndex(tokens, text, textStartIndex, index);
      }
      if (index > textStartIndex) {
        tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
      }
      tokens.push({
        type: c1ControlString.type,
        value: text.slice(index, controlStringTerminatorIndex)
      });
      index = controlStringTerminatorIndex;
      textStartIndex = index;
      continue;
    }
    if (character === stringTerminatorCharacter) {
      if (index > textStartIndex) {
        tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
      }
      tokens.push({ type: "st", value: character });
      index++;
      textStartIndex = index;
      continue;
    }
    if (isC1ControlCharacter(character)) {
      if (index > textStartIndex) {
        tokens.push({ type: "text", value: text.slice(textStartIndex, index) });
      }
      tokens.push({ type: "c1", value: character });
      index++;
      textStartIndex = index;
      continue;
    }
    index++;
  }
  if (textStartIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(textStartIndex) });
  }
  return tokens;
};

// node_modules/ink/build/sanitize-ansi.js
var sgrParametersRegex = /^[\d:;]*$/;
var sanitizeAnsi = (text) => {
  if (!hasAnsiControlCharacters(text)) {
    return text;
  }
  let output = "";
  for (const token of tokenizeAnsi2(text)) {
    if (token.type === "text" || token.type === "osc") {
      output += token.value;
      continue;
    }
    if (token.type === "csi" && token.finalCharacter === "m" && token.intermediateString === "" && sgrParametersRegex.test(token.parameterString)) {
      output += token.value;
    }
  }
  return output;
};
var sanitize_ansi_default = sanitizeAnsi;

// node_modules/ink/build/squash-text-nodes.js
var squashTextNodes = (node) => {
  let text = "";
  for (let index = 0; index < node.childNodes.length; index++) {
    const childNode = node.childNodes[index];
    if (childNode === void 0) {
      continue;
    }
    let nodeText = "";
    if (childNode.nodeName === "#text") {
      nodeText = childNode.nodeValue;
    } else {
      if (childNode.nodeName === "ink-text" || childNode.nodeName === "ink-virtual-text") {
        nodeText = squashTextNodes(childNode);
      }
      if (nodeText.length > 0 && typeof childNode.internal_transform === "function") {
        nodeText = childNode.internal_transform(nodeText, index);
      }
    }
    text += nodeText;
  }
  return sanitize_ansi_default(text);
};
var squash_text_nodes_default = squashTextNodes;

// node_modules/ink/build/dom.js
var createNode = (nodeName) => {
  const node = {
    nodeName,
    style: {},
    attributes: {},
    childNodes: [],
    parentNode: void 0,
    yogaNode: nodeName === "ink-virtual-text" ? void 0 : src_default.Node.create(),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    internal_accessibility: {}
  };
  if (nodeName === "ink-text") {
    node.yogaNode?.setMeasureFunc(measureTextNode.bind(null, node));
  }
  return node;
};
var appendChildNode = (node, childNode) => {
  if (childNode.parentNode) {
    removeChildNode(childNode.parentNode, childNode);
  }
  childNode.parentNode = node;
  node.childNodes.push(childNode);
  if (childNode.yogaNode) {
    node.yogaNode?.insertChild(childNode.yogaNode, node.yogaNode.getChildCount());
  }
  if (node.nodeName === "ink-text" || node.nodeName === "ink-virtual-text") {
    markNodeAsDirty(node);
  }
};
var insertBeforeNode = (node, newChildNode, beforeChildNode) => {
  if (newChildNode.parentNode) {
    removeChildNode(newChildNode.parentNode, newChildNode);
  }
  newChildNode.parentNode = node;
  const index = node.childNodes.indexOf(beforeChildNode);
  if (index >= 0) {
    node.childNodes.splice(index, 0, newChildNode);
    if (newChildNode.yogaNode) {
      node.yogaNode?.insertChild(newChildNode.yogaNode, index);
    }
  } else {
    node.childNodes.push(newChildNode);
    if (newChildNode.yogaNode) {
      node.yogaNode?.insertChild(newChildNode.yogaNode, node.yogaNode.getChildCount());
    }
  }
  if (node.nodeName === "ink-text" || node.nodeName === "ink-virtual-text") {
    markNodeAsDirty(node);
  }
};
var removeChildNode = (node, removeNode) => {
  if (removeNode.yogaNode) {
    removeNode.parentNode?.yogaNode?.removeChild(removeNode.yogaNode);
  }
  removeNode.parentNode = void 0;
  const index = node.childNodes.indexOf(removeNode);
  if (index >= 0) {
    node.childNodes.splice(index, 1);
  }
  if (node.nodeName === "ink-text" || node.nodeName === "ink-virtual-text") {
    markNodeAsDirty(node);
  }
};
var setAttribute = (node, key, value) => {
  if (key === "internal_accessibility") {
    node.internal_accessibility = value;
    return;
  }
  node.attributes[key] = value;
};
var setStyle = (node, style) => {
  node.style = style ?? {};
};
var createTextNode = (text) => {
  const node = {
    nodeName: "#text",
    nodeValue: text,
    yogaNode: void 0,
    parentNode: void 0,
    style: {}
  };
  setTextNodeValue(node, text);
  return node;
};
var measureTextNode = function(node, width) {
  const text = node.nodeName === "#text" ? node.nodeValue : squash_text_nodes_default(node);
  const dimensions = measure_text_default(text);
  if (dimensions.width <= width) {
    return dimensions;
  }
  if (dimensions.width >= 1 && width > 0 && width < 1) {
    return dimensions;
  }
  const textWrap = node.style?.textWrap ?? "wrap";
  const wrappedText = wrap_text_default(text, width, textWrap);
  return measure_text_default(wrappedText);
};
var findClosestYogaNode = (node) => {
  if (!node?.parentNode) {
    return void 0;
  }
  return node.yogaNode ?? findClosestYogaNode(node.parentNode);
};
var markNodeAsDirty = (node) => {
  const yogaNode = findClosestYogaNode(node);
  yogaNode?.markDirty();
};
var setTextNodeValue = (node, text) => {
  if (typeof text !== "string") {
    text = String(text);
  }
  node.nodeValue = text;
  markNodeAsDirty(node);
};
var addLayoutListener = (rootNode, listener) => {
  if (rootNode.nodeName !== "ink-root") {
    return () => {
    };
  }
  rootNode.internal_layoutListeners ??= /* @__PURE__ */ new Set();
  rootNode.internal_layoutListeners.add(listener);
  return () => {
    rootNode.internal_layoutListeners?.delete(listener);
  };
};
var emitLayoutListeners = (rootNode) => {
  if (rootNode.nodeName !== "ink-root" || !rootNode.internal_layoutListeners) {
    return;
  }
  for (const listener of rootNode.internal_layoutListeners) {
    listener();
  }
};

// node_modules/ink/build/styles.js
var positionEdges = [
  ["top", src_default.EDGE_TOP],
  ["right", src_default.EDGE_RIGHT],
  ["bottom", src_default.EDGE_BOTTOM],
  ["left", src_default.EDGE_LEFT]
];
var applyPositionStyles = (node, style) => {
  if ("position" in style) {
    let positionType = src_default.POSITION_TYPE_RELATIVE;
    if (style.position === "absolute") {
      positionType = src_default.POSITION_TYPE_ABSOLUTE;
    } else if (style.position === "static") {
      positionType = src_default.POSITION_TYPE_STATIC;
    }
    node.setPositionType(positionType);
  }
  for (const [property, edge] of positionEdges) {
    if (!(property in style)) {
      continue;
    }
    const value = style[property];
    if (typeof value === "string") {
      node.setPositionPercent(edge, Number.parseFloat(value));
      continue;
    }
    node.setPosition(edge, value);
  }
};
var applyMarginStyles = (node, style) => {
  if ("margin" in style) {
    node.setMargin(src_default.EDGE_ALL, style.margin ?? 0);
  }
  if ("marginX" in style) {
    node.setMargin(src_default.EDGE_HORIZONTAL, style.marginX ?? 0);
  }
  if ("marginY" in style) {
    node.setMargin(src_default.EDGE_VERTICAL, style.marginY ?? 0);
  }
  if ("marginLeft" in style) {
    node.setMargin(src_default.EDGE_START, style.marginLeft ?? 0);
  }
  if ("marginRight" in style) {
    node.setMargin(src_default.EDGE_END, style.marginRight ?? 0);
  }
  if ("marginTop" in style) {
    node.setMargin(src_default.EDGE_TOP, style.marginTop ?? 0);
  }
  if ("marginBottom" in style) {
    node.setMargin(src_default.EDGE_BOTTOM, style.marginBottom ?? 0);
  }
};
var applyPaddingStyles = (node, style) => {
  if ("padding" in style) {
    node.setPadding(src_default.EDGE_ALL, style.padding ?? 0);
  }
  if ("paddingX" in style) {
    node.setPadding(src_default.EDGE_HORIZONTAL, style.paddingX ?? 0);
  }
  if ("paddingY" in style) {
    node.setPadding(src_default.EDGE_VERTICAL, style.paddingY ?? 0);
  }
  if ("paddingLeft" in style) {
    node.setPadding(src_default.EDGE_LEFT, style.paddingLeft ?? 0);
  }
  if ("paddingRight" in style) {
    node.setPadding(src_default.EDGE_RIGHT, style.paddingRight ?? 0);
  }
  if ("paddingTop" in style) {
    node.setPadding(src_default.EDGE_TOP, style.paddingTop ?? 0);
  }
  if ("paddingBottom" in style) {
    node.setPadding(src_default.EDGE_BOTTOM, style.paddingBottom ?? 0);
  }
};
var applyFlexStyles = (node, style) => {
  if ("flexGrow" in style) {
    node.setFlexGrow(style.flexGrow ?? 0);
  }
  if ("flexShrink" in style) {
    node.setFlexShrink(typeof style.flexShrink === "number" ? style.flexShrink : 1);
  }
  if ("flexWrap" in style) {
    if (style.flexWrap === "nowrap") {
      node.setFlexWrap(src_default.WRAP_NO_WRAP);
    }
    if (style.flexWrap === "wrap") {
      node.setFlexWrap(src_default.WRAP_WRAP);
    }
    if (style.flexWrap === "wrap-reverse") {
      node.setFlexWrap(src_default.WRAP_WRAP_REVERSE);
    }
  }
  if ("flexDirection" in style) {
    if (style.flexDirection === "row") {
      node.setFlexDirection(src_default.FLEX_DIRECTION_ROW);
    }
    if (style.flexDirection === "row-reverse") {
      node.setFlexDirection(src_default.FLEX_DIRECTION_ROW_REVERSE);
    }
    if (style.flexDirection === "column") {
      node.setFlexDirection(src_default.FLEX_DIRECTION_COLUMN);
    }
    if (style.flexDirection === "column-reverse") {
      node.setFlexDirection(src_default.FLEX_DIRECTION_COLUMN_REVERSE);
    }
  }
  if ("flexBasis" in style) {
    if (typeof style.flexBasis === "number") {
      node.setFlexBasis(style.flexBasis);
    } else if (typeof style.flexBasis === "string") {
      node.setFlexBasisPercent(Number.parseInt(style.flexBasis, 10));
    } else {
      node.setFlexBasisAuto();
    }
  }
  if ("alignItems" in style) {
    if (style.alignItems === "stretch" || !style.alignItems) {
      node.setAlignItems(src_default.ALIGN_STRETCH);
    }
    if (style.alignItems === "flex-start") {
      node.setAlignItems(src_default.ALIGN_FLEX_START);
    }
    if (style.alignItems === "center") {
      node.setAlignItems(src_default.ALIGN_CENTER);
    }
    if (style.alignItems === "flex-end") {
      node.setAlignItems(src_default.ALIGN_FLEX_END);
    }
    if (style.alignItems === "baseline") {
      node.setAlignItems(src_default.ALIGN_BASELINE);
    }
  }
  if ("alignSelf" in style) {
    if (style.alignSelf === "auto" || !style.alignSelf) {
      node.setAlignSelf(src_default.ALIGN_AUTO);
    }
    if (style.alignSelf === "flex-start") {
      node.setAlignSelf(src_default.ALIGN_FLEX_START);
    }
    if (style.alignSelf === "center") {
      node.setAlignSelf(src_default.ALIGN_CENTER);
    }
    if (style.alignSelf === "flex-end") {
      node.setAlignSelf(src_default.ALIGN_FLEX_END);
    }
    if (style.alignSelf === "stretch") {
      node.setAlignSelf(src_default.ALIGN_STRETCH);
    }
    if (style.alignSelf === "baseline") {
      node.setAlignSelf(src_default.ALIGN_BASELINE);
    }
  }
  if ("alignContent" in style) {
    if (style.alignContent === "flex-start" || !style.alignContent) {
      node.setAlignContent(src_default.ALIGN_FLEX_START);
    }
    if (style.alignContent === "center") {
      node.setAlignContent(src_default.ALIGN_CENTER);
    }
    if (style.alignContent === "flex-end") {
      node.setAlignContent(src_default.ALIGN_FLEX_END);
    }
    if (style.alignContent === "space-between") {
      node.setAlignContent(src_default.ALIGN_SPACE_BETWEEN);
    }
    if (style.alignContent === "space-around") {
      node.setAlignContent(src_default.ALIGN_SPACE_AROUND);
    }
    if (style.alignContent === "space-evenly") {
      node.setAlignContent(src_default.ALIGN_SPACE_EVENLY);
    }
    if (style.alignContent === "stretch") {
      node.setAlignContent(src_default.ALIGN_STRETCH);
    }
  }
  if ("justifyContent" in style) {
    if (style.justifyContent === "flex-start" || !style.justifyContent) {
      node.setJustifyContent(src_default.JUSTIFY_FLEX_START);
    }
    if (style.justifyContent === "center") {
      node.setJustifyContent(src_default.JUSTIFY_CENTER);
    }
    if (style.justifyContent === "flex-end") {
      node.setJustifyContent(src_default.JUSTIFY_FLEX_END);
    }
    if (style.justifyContent === "space-between") {
      node.setJustifyContent(src_default.JUSTIFY_SPACE_BETWEEN);
    }
    if (style.justifyContent === "space-around") {
      node.setJustifyContent(src_default.JUSTIFY_SPACE_AROUND);
    }
    if (style.justifyContent === "space-evenly") {
      node.setJustifyContent(src_default.JUSTIFY_SPACE_EVENLY);
    }
  }
};
var applyDimensionStyles = (node, style) => {
  if ("width" in style) {
    if (typeof style.width === "number") {
      node.setWidth(style.width);
    } else if (typeof style.width === "string") {
      node.setWidthPercent(Number.parseInt(style.width, 10));
    } else {
      node.setWidthAuto();
    }
  }
  if ("height" in style) {
    if (typeof style.height === "number") {
      node.setHeight(style.height);
    } else if (typeof style.height === "string") {
      node.setHeightPercent(Number.parseInt(style.height, 10));
    } else {
      node.setHeightAuto();
    }
  }
  if ("minWidth" in style) {
    if (typeof style.minWidth === "string") {
      node.setMinWidthPercent(Number.parseInt(style.minWidth, 10));
    } else {
      node.setMinWidth(style.minWidth ?? 0);
    }
  }
  if ("minHeight" in style) {
    if (typeof style.minHeight === "string") {
      node.setMinHeightPercent(Number.parseInt(style.minHeight, 10));
    } else {
      node.setMinHeight(style.minHeight ?? 0);
    }
  }
  if ("maxWidth" in style) {
    if (typeof style.maxWidth === "string") {
      node.setMaxWidthPercent(Number.parseInt(style.maxWidth, 10));
    } else {
      node.setMaxWidth(style.maxWidth);
    }
  }
  if ("maxHeight" in style) {
    if (typeof style.maxHeight === "string") {
      node.setMaxHeightPercent(Number.parseInt(style.maxHeight, 10));
    } else {
      node.setMaxHeight(style.maxHeight);
    }
  }
  if ("aspectRatio" in style) {
    node.setAspectRatio(style.aspectRatio);
  }
};
var applyDisplayStyles = (node, style) => {
  if ("display" in style) {
    node.setDisplay(style.display === "flex" ? src_default.DISPLAY_FLEX : src_default.DISPLAY_NONE);
  }
};
var applyBorderStyles = (node, style, currentStyle) => {
  const hasBorderChanges = "borderStyle" in style || "borderTop" in style || "borderBottom" in style || "borderLeft" in style || "borderRight" in style;
  if (!hasBorderChanges) {
    return;
  }
  const borderWidth = currentStyle.borderStyle ? 1 : 0;
  node.setBorder(src_default.EDGE_TOP, currentStyle.borderTop === false ? 0 : borderWidth);
  node.setBorder(src_default.EDGE_BOTTOM, currentStyle.borderBottom === false ? 0 : borderWidth);
  node.setBorder(src_default.EDGE_LEFT, currentStyle.borderLeft === false ? 0 : borderWidth);
  node.setBorder(src_default.EDGE_RIGHT, currentStyle.borderRight === false ? 0 : borderWidth);
};
var applyGapStyles = (node, style) => {
  if ("gap" in style) {
    node.setGap(src_default.GUTTER_ALL, style.gap ?? 0);
  }
  if ("columnGap" in style) {
    node.setGap(src_default.GUTTER_COLUMN, style.columnGap ?? 0);
  }
  if ("rowGap" in style) {
    node.setGap(src_default.GUTTER_ROW, style.rowGap ?? 0);
  }
};
var styles3 = (node, style = {}, currentStyle = style) => {
  applyPositionStyles(node, style);
  applyMarginStyles(node, style);
  applyPaddingStyles(node, style);
  applyFlexStyles(node, style);
  applyDimensionStyles(node, style);
  applyDisplayStyles(node, style);
  applyBorderStyles(node, style, currentStyle);
  applyGapStyles(node, style);
};
var styles_default = styles3;

// node_modules/ink/build/reconciler.js
if (process4.env["DEV"] === "true") {
  let isDevtoolsInstalled = false;
  try {
    import.meta.resolve("react-devtools-core");
    isDevtoolsInstalled = true;
  } catch {
  }
  if (isDevtoolsInstalled) {
    await import("./devtools-B33CYQZB.js");
  }
}
var diff = (before, after) => {
  if (before === after) {
    return;
  }
  if (!before) {
    return after;
  }
  const changed = {};
  let isChanged = false;
  for (const key of Object.keys(before)) {
    const isDeleted = after ? !Object.hasOwn(after, key) : true;
    if (isDeleted) {
      changed[key] = void 0;
      isChanged = true;
    }
  }
  if (after) {
    for (const key of Object.keys(after)) {
      if (after[key] !== before[key]) {
        changed[key] = after[key];
        isChanged = true;
      }
    }
  }
  return isChanged ? changed : void 0;
};
var cleanupYogaNode = (node) => {
  node?.unsetMeasureFunc();
  node?.freeRecursive();
};
var currentUpdatePriority = import_constants.NoEventPriority;
var currentRootNode;
async function loadPackageJson() {
  const fs3 = await import("node:fs");
  const content = fs3.readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const parsedContent = JSON.parse(content);
  return {
    name: parsedContent?.name,
    version: parsedContent?.version
  };
}
var packageInfo = {
  name: "ink",
  version: import_react.version
};
if (process4.env["DEV"] === "true") {
  try {
    const loaded = await loadPackageJson();
    packageInfo = {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      name: loaded.name || packageInfo.name,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      version: loaded.version || packageInfo.version
    };
  } catch (error) {
    console.warn("Failed to load package.json in development mode. Falling back to default renderer metadata.", error);
  }
}
var reconciler_default = (0, import_react_reconciler.default)({
  getRootHostContext: () => ({
    isInsideText: false
  }),
  prepareForCommit: () => null,
  preparePortalMount: () => null,
  clearContainer: () => false,
  resetAfterCommit(rootNode) {
    if (typeof rootNode.onComputeLayout === "function") {
      rootNode.onComputeLayout();
    }
    emitLayoutListeners(rootNode);
    if (rootNode.staticNode !== rootNode.previousStaticNode) {
      rootNode.previousStaticNode = rootNode.staticNode;
      if (typeof rootNode.onStaticChange === "function") {
        rootNode.onStaticChange();
      }
    }
    if (rootNode.isStaticDirty) {
      rootNode.isStaticDirty = false;
      if (typeof rootNode.onImmediateRender === "function") {
        rootNode.onImmediateRender();
      }
      return;
    }
    if (typeof rootNode.onRender === "function") {
      rootNode.onRender();
    }
  },
  getChildHostContext(parentHostContext, type) {
    const previousIsInsideText = parentHostContext.isInsideText;
    const isInsideText = type === "ink-text" || type === "ink-virtual-text";
    if (previousIsInsideText === isInsideText) {
      return parentHostContext;
    }
    return { isInsideText };
  },
  shouldSetTextContent: () => false,
  createInstance(originalType, newProps, rootNode, hostContext) {
    if (hostContext.isInsideText && originalType === "ink-box") {
      throw new Error(`<Box> can\u2019t be nested inside <Text> component`);
    }
    const type = originalType === "ink-text" && hostContext.isInsideText ? "ink-virtual-text" : originalType;
    const node = createNode(type);
    for (const [key, value] of Object.entries(newProps)) {
      if (key === "children") {
        continue;
      }
      if (key === "style") {
        setStyle(node, value);
        if (node.yogaNode) {
          styles_default(node.yogaNode, value);
        }
        continue;
      }
      if (key === "internal_transform") {
        node.internal_transform = value;
        continue;
      }
      if (key === "internal_static") {
        currentRootNode = rootNode;
        node.internal_static = true;
        rootNode.isStaticDirty = true;
        rootNode.staticNode = node;
        continue;
      }
      setAttribute(node, key, value);
    }
    return node;
  },
  createTextInstance(text, _root, hostContext) {
    if (!hostContext.isInsideText) {
      throw new Error(`Text string "${text}" must be rendered inside <Text> component`);
    }
    return createTextNode(text);
  },
  resetTextContent() {
  },
  hideTextInstance(node) {
    setTextNodeValue(node, "");
  },
  unhideTextInstance(node, text) {
    setTextNodeValue(node, text);
  },
  getPublicInstance: (instance) => instance,
  hideInstance(node) {
    node.yogaNode?.setDisplay(src_default.DISPLAY_NONE);
  },
  unhideInstance(node) {
    node.yogaNode?.setDisplay(src_default.DISPLAY_FLEX);
  },
  appendInitialChild: appendChildNode,
  appendChild: appendChildNode,
  insertBefore: insertBeforeNode,
  finalizeInitialChildren() {
    return false;
  },
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  // Scheduler integration for concurrent mode
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  // @ts-expect-error @types/react-reconciler is outdated and doesn't include scheduleCallback
  scheduleCallback: Scheduler.unstable_scheduleCallback,
  cancelCallback: Scheduler.unstable_cancelCallback,
  shouldYield: Scheduler.unstable_shouldYield,
  now: Scheduler.unstable_now,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  beforeActiveInstanceBlur() {
  },
  afterActiveInstanceBlur() {
  },
  detachDeletedInstance() {
  },
  getInstanceFromNode: () => null,
  prepareScopeUpdate() {
  },
  getInstanceFromScope: () => null,
  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode.yogaNode);
    if (removeNode.internal_static && currentRootNode?.staticNode === removeNode) {
      currentRootNode.staticNode = void 0;
    }
  },
  commitUpdate(node, _type, oldProps, newProps) {
    if (currentRootNode && node.internal_static) {
      currentRootNode.isStaticDirty = true;
    }
    const props = diff(oldProps, newProps);
    const style = diff(oldProps["style"], newProps["style"]);
    if (!props && !style) {
      return;
    }
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === "style") {
          setStyle(node, value);
          continue;
        }
        if (key === "internal_transform") {
          node.internal_transform = value;
          continue;
        }
        if (key === "internal_static") {
          node.internal_static = true;
          continue;
        }
        setAttribute(node, key, value);
      }
    }
    if (style && node.yogaNode) {
      styles_default(node.yogaNode, style, newProps["style"] ?? {});
    }
  },
  commitTextUpdate(node, _oldText, newText) {
    setTextNodeValue(node, newText);
  },
  removeChild(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode.yogaNode);
    if (removeNode.internal_static && currentRootNode?.staticNode === removeNode) {
      currentRootNode.staticNode = void 0;
    }
  },
  setCurrentUpdatePriority(newPriority) {
    currentUpdatePriority = newPriority;
  },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority() {
    if (currentUpdatePriority !== import_constants.NoEventPriority) {
      return currentUpdatePriority;
    }
    return import_constants.DefaultEventPriority;
  },
  maySuspendCommit() {
    return true;
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  NotPendingTransition: void 0,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  HostTransitionContext: (0, import_react.createContext)(null),
  resetFormInstance() {
  },
  requestPostPaintCallback() {
  },
  shouldAttemptEagerTransition() {
    return false;
  },
  trackSchedulerEvent() {
  },
  resolveEventType() {
    return null;
  },
  resolveEventTimeStamp() {
    return -1.1;
  },
  preloadInstance() {
    return true;
  },
  startSuspendingCommit() {
  },
  suspendInstance() {
  },
  waitForCommitToBeReady() {
    return null;
  },
  rendererPackageName: packageInfo.name,
  rendererVersion: packageInfo.version
});

// node_modules/indent-string/index.js
function indentString(string, count = 1, options = {}) {
  const {
    indent = " ",
    includeEmptyLines = false
  } = options;
  if (typeof string !== "string") {
    throw new TypeError(
      `Expected \`input\` to be a \`string\`, got \`${typeof string}\``
    );
  }
  if (typeof count !== "number") {
    throw new TypeError(
      `Expected \`count\` to be a \`number\`, got \`${typeof count}\``
    );
  }
  if (count < 0) {
    throw new RangeError(
      `Expected \`count\` to be at least 0, got \`${count}\``
    );
  }
  if (typeof indent !== "string") {
    throw new TypeError(
      `Expected \`options.indent\` to be a \`string\`, got \`${typeof indent}\``
    );
  }
  if (count === 0) {
    return string;
  }
  const regex2 = includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;
  return string.replace(regex2, indent.repeat(count));
}

// node_modules/ink/build/get-max-width.js
var getMaxWidth = (yogaNode) => {
  return yogaNode.getComputedWidth() - yogaNode.getComputedPadding(src_default.EDGE_LEFT) - yogaNode.getComputedPadding(src_default.EDGE_RIGHT) - yogaNode.getComputedBorder(src_default.EDGE_LEFT) - yogaNode.getComputedBorder(src_default.EDGE_RIGHT);
};
var get_max_width_default = getMaxWidth;

// node_modules/cli-boxes/boxes.json
var boxes_default = {
  single: {
    topLeft: "\u250C",
    top: "\u2500",
    topRight: "\u2510",
    right: "\u2502",
    bottomRight: "\u2518",
    bottom: "\u2500",
    bottomLeft: "\u2514",
    left: "\u2502"
  },
  double: {
    topLeft: "\u2554",
    top: "\u2550",
    topRight: "\u2557",
    right: "\u2551",
    bottomRight: "\u255D",
    bottom: "\u2550",
    bottomLeft: "\u255A",
    left: "\u2551"
  },
  round: {
    topLeft: "\u256D",
    top: "\u2500",
    topRight: "\u256E",
    right: "\u2502",
    bottomRight: "\u256F",
    bottom: "\u2500",
    bottomLeft: "\u2570",
    left: "\u2502"
  },
  bold: {
    topLeft: "\u250F",
    top: "\u2501",
    topRight: "\u2513",
    right: "\u2503",
    bottomRight: "\u251B",
    bottom: "\u2501",
    bottomLeft: "\u2517",
    left: "\u2503"
  },
  singleDouble: {
    topLeft: "\u2553",
    top: "\u2500",
    topRight: "\u2556",
    right: "\u2551",
    bottomRight: "\u255C",
    bottom: "\u2500",
    bottomLeft: "\u2559",
    left: "\u2551"
  },
  doubleSingle: {
    topLeft: "\u2552",
    top: "\u2550",
    topRight: "\u2555",
    right: "\u2502",
    bottomRight: "\u255B",
    bottom: "\u2550",
    bottomLeft: "\u2558",
    left: "\u2502"
  },
  classic: {
    topLeft: "+",
    top: "-",
    topRight: "+",
    right: "|",
    bottomRight: "+",
    bottom: "-",
    bottomLeft: "+",
    left: "|"
  },
  arrow: {
    topLeft: "\u2198",
    top: "\u2193",
    topRight: "\u2199",
    right: "\u2190",
    bottomRight: "\u2196",
    bottom: "\u2191",
    bottomLeft: "\u2197",
    left: "\u2192"
  }
};

// node_modules/cli-boxes/index.js
var cli_boxes_default = boxes_default;

// node_modules/ink/node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET3 = 10;
var wrapAnsi163 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi2563 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m3 = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles4 = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames3 = Object.keys(styles4.modifier);
var foregroundColorNames3 = Object.keys(styles4.color);
var backgroundColorNames3 = Object.keys(styles4.bgColor);
var colorNames3 = [...foregroundColorNames3, ...backgroundColorNames3];
function assembleStyles3() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles4)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles4[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles4[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles4, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles4, "codes", {
    value: codes,
    enumerable: false
  });
  styles4.color.close = "\x1B[39m";
  styles4.bgColor.close = "\x1B[49m";
  styles4.color.ansi = wrapAnsi163();
  styles4.color.ansi256 = wrapAnsi2563();
  styles4.color.ansi16m = wrapAnsi16m3();
  styles4.bgColor.ansi = wrapAnsi163(ANSI_BACKGROUND_OFFSET3);
  styles4.bgColor.ansi256 = wrapAnsi2563(ANSI_BACKGROUND_OFFSET3);
  styles4.bgColor.ansi16m = wrapAnsi16m3(ANSI_BACKGROUND_OFFSET3);
  Object.defineProperties(styles4, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles4.rgbToAnsi256(...styles4.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles4.ansi256ToAnsi(styles4.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles4.ansi256ToAnsi(styles4.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles4;
}
var ansiStyles3 = assembleStyles3();
var ansi_styles_default3 = ansiStyles3;

// node_modules/ink/node_modules/chalk/source/vendor/supports-color/index.js
import process5 from "node:process";
import os2 from "node:os";
import tty2 from "node:tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process5.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env: env2 } = process5;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env2) {
    if (env2.FORCE_COLOR === "true") {
      return 1;
    }
    if (env2.FORCE_COLOR === "false") {
      return 0;
    }
    return env2.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env2.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env2 && "AGENT_NAME" in env2) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env2.TERM === "dumb") {
    return min;
  }
  if (process5.platform === "win32") {
    const osRelease = os2.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env2) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env2)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env2) || env2.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env2) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env2.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env2.COLORTERM === "truecolor") {
    return 3;
  }
  if (env2.TERM === "xterm-kitty") {
    return 3;
  }
  if (env2.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env2.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env2) {
    const version = Number.parseInt((env2.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env2.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env2.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env2.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env2) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty2.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty2.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/ink/node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/ink/node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles5 = /* @__PURE__ */ Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default3)) {
  styles5[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles5.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default3[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default3[type].ansi256(ansi_styles_default3.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default3[type].ansi(ansi_styles_default3.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default3.hexToRgb(...arguments_));
  }
  return ansi_styles_default3[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles5[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default3.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles5[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default3.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {
}, {
  ...styles5,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles5);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// node_modules/ink/build/colorize.js
var rgbRegex = /^rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)$/;
var ansiRegex2 = /^ansi256\(\s?(\d+)\s?\)$/;
var isNamedColor = (color) => {
  return color in source_default;
};
var colorize = (str, color, type) => {
  if (!color) {
    return str;
  }
  if (isNamedColor(color)) {
    if (type === "foreground") {
      return source_default[color](str);
    }
    const methodName = `bg${color[0].toUpperCase() + color.slice(1)}`;
    return source_default[methodName](str);
  }
  if (color.startsWith("#")) {
    return type === "foreground" ? source_default.hex(color)(str) : source_default.bgHex(color)(str);
  }
  if (color.startsWith("ansi256")) {
    const matches = ansiRegex2.exec(color);
    if (!matches) {
      return str;
    }
    const value = Number(matches[1]);
    return type === "foreground" ? source_default.ansi256(value)(str) : source_default.bgAnsi256(value)(str);
  }
  if (color.startsWith("rgb")) {
    const matches = rgbRegex.exec(color);
    if (!matches) {
      return str;
    }
    const firstValue = Number(matches[1]);
    const secondValue = Number(matches[2]);
    const thirdValue = Number(matches[3]);
    return type === "foreground" ? source_default.rgb(firstValue, secondValue, thirdValue)(str) : source_default.bgRgb(firstValue, secondValue, thirdValue)(str);
  }
  return str;
};
var colorize_default = colorize;

// node_modules/ink/build/render-border.js
var stylePiece = (segment, fg, bg, dim) => {
  let styled = colorize_default(segment, fg, "foreground");
  styled = colorize_default(styled, bg, "background");
  if (dim) {
    styled = source_default.dim(styled);
  }
  return styled;
};
var renderBorder = (x, y, node, output) => {
  if (node.style.borderStyle) {
    const width = node.yogaNode.getComputedWidth();
    const height = node.yogaNode.getComputedHeight();
    const box = typeof node.style.borderStyle === "string" ? cli_boxes_default[node.style.borderStyle] : node.style.borderStyle;
    const topBorderColor = node.style.borderTopColor ?? node.style.borderColor;
    const bottomBorderColor = node.style.borderBottomColor ?? node.style.borderColor;
    const leftBorderColor = node.style.borderLeftColor ?? node.style.borderColor;
    const rightBorderColor = node.style.borderRightColor ?? node.style.borderColor;
    const topBorderBackgroundColor = node.style.borderTopBackgroundColor ?? node.style.borderBackgroundColor;
    const bottomBorderBackgroundColor = node.style.borderBottomBackgroundColor ?? node.style.borderBackgroundColor;
    const leftBorderBackgroundColor = node.style.borderLeftBackgroundColor ?? node.style.borderBackgroundColor;
    const rightBorderBackgroundColor = node.style.borderRightBackgroundColor ?? node.style.borderBackgroundColor;
    const dimTopBorderColor = node.style.borderTopDimColor ?? node.style.borderDimColor;
    const dimBottomBorderColor = node.style.borderBottomDimColor ?? node.style.borderDimColor;
    const dimLeftBorderColor = node.style.borderLeftDimColor ?? node.style.borderDimColor;
    const dimRightBorderColor = node.style.borderRightDimColor ?? node.style.borderDimColor;
    const showTopBorder = node.style.borderTop !== false;
    const showBottomBorder = node.style.borderBottom !== false;
    const showLeftBorder = node.style.borderLeft !== false;
    const showRightBorder = node.style.borderRight !== false;
    const contentWidth = width - (showLeftBorder ? 1 : 0) - (showRightBorder ? 1 : 0);
    let topBorder = showTopBorder ? (showLeftBorder ? box.topLeft : "") + box.top.repeat(contentWidth) + (showRightBorder ? box.topRight : "") : void 0;
    topBorder &&= stylePiece(topBorder, topBorderColor, topBorderBackgroundColor, dimTopBorderColor);
    let verticalBorderHeight = height;
    if (showTopBorder) {
      verticalBorderHeight -= 1;
    }
    if (showBottomBorder) {
      verticalBorderHeight -= 1;
    }
    let leftBorder = "";
    if (showLeftBorder) {
      const one = stylePiece(box.left, leftBorderColor, leftBorderBackgroundColor, dimLeftBorderColor);
      leftBorder = (one + "\n").repeat(verticalBorderHeight);
    }
    let rightBorder = "";
    if (showRightBorder) {
      const one = stylePiece(box.right, rightBorderColor, rightBorderBackgroundColor, dimRightBorderColor);
      rightBorder = (one + "\n").repeat(verticalBorderHeight);
    }
    let bottomBorder = showBottomBorder ? (showLeftBorder ? box.bottomLeft : "") + box.bottom.repeat(contentWidth) + (showRightBorder ? box.bottomRight : "") : void 0;
    bottomBorder &&= stylePiece(bottomBorder, bottomBorderColor, bottomBorderBackgroundColor, dimBottomBorderColor);
    const offsetY = showTopBorder ? 1 : 0;
    if (topBorder) {
      output.write(x, y, topBorder, { transformers: [] });
    }
    if (leftBorder) {
      output.write(x, y + offsetY, leftBorder, { transformers: [] });
    }
    if (rightBorder) {
      output.write(x + width - 1, y + offsetY, rightBorder, {
        transformers: []
      });
    }
    if (bottomBorder) {
      output.write(x, y + height - 1, bottomBorder, { transformers: [] });
    }
  }
};
var render_border_default = renderBorder;

// node_modules/ink/build/render-background.js
var renderBackground = (x, y, node, output) => {
  if (!node.style.backgroundColor) {
    return;
  }
  const width = node.yogaNode.getComputedWidth();
  const height = node.yogaNode.getComputedHeight();
  const leftBorderWidth = node.style.borderStyle && node.style.borderLeft !== false ? 1 : 0;
  const rightBorderWidth = node.style.borderStyle && node.style.borderRight !== false ? 1 : 0;
  const topBorderHeight = node.style.borderStyle && node.style.borderTop !== false ? 1 : 0;
  const bottomBorderHeight = node.style.borderStyle && node.style.borderBottom !== false ? 1 : 0;
  const contentWidth = width - leftBorderWidth - rightBorderWidth;
  const contentHeight = height - topBorderHeight - bottomBorderHeight;
  if (!(contentWidth > 0 && contentHeight > 0)) {
    return;
  }
  const backgroundLine = colorize_default(" ".repeat(contentWidth), node.style.backgroundColor, "background");
  for (let row = 0; row < contentHeight; row++) {
    output.write(x + leftBorderWidth, y + topBorderHeight + row, backgroundLine, { transformers: [] });
  }
};
var render_background_default = renderBackground;

// node_modules/ink/build/render-node-to-output.js
var applyPaddingToText = (node, text) => {
  const yogaNode = node.childNodes[0]?.yogaNode;
  if (yogaNode) {
    const offsetX = yogaNode.getComputedLeft();
    const offsetY = yogaNode.getComputedTop();
    text = "\n".repeat(offsetY) + indentString(text, offsetX);
  }
  return text;
};
var renderNodeToScreenReaderOutput = (node, options = {}) => {
  if (options.skipStaticElements && node.internal_static) {
    return "";
  }
  if (node.yogaNode?.getDisplay() === src_default.DISPLAY_NONE) {
    return "";
  }
  let output = "";
  if (node.nodeName === "ink-text") {
    output = squash_text_nodes_default(node);
  } else if (node.nodeName === "ink-box" || node.nodeName === "ink-root") {
    const separator = node.style.flexDirection === "row" || node.style.flexDirection === "row-reverse" ? " " : "\n";
    const childNodes = node.style.flexDirection === "row-reverse" || node.style.flexDirection === "column-reverse" ? [...node.childNodes].reverse() : [...node.childNodes];
    output = childNodes.map((childNode) => {
      const screenReaderOutput = renderNodeToScreenReaderOutput(childNode, {
        parentRole: node.internal_accessibility?.role,
        skipStaticElements: options.skipStaticElements
      });
      return screenReaderOutput;
    }).filter(Boolean).join(separator);
  }
  if (node.internal_accessibility) {
    const { role, state } = node.internal_accessibility;
    if (state) {
      const stateKeys = Object.keys(state);
      const stateDescription = stateKeys.filter((key) => state[key]).join(", ");
      if (stateDescription) {
        output = `(${stateDescription}) ${output}`;
      }
    }
    if (role && role !== options.parentRole) {
      output = `${role}: ${output}`;
    }
  }
  return output;
};
var renderNodeToOutput = (node, output, options) => {
  const { offsetX = 0, offsetY = 0, transformers = [], skipStaticElements } = options;
  if (skipStaticElements && node.internal_static) {
    return;
  }
  const { yogaNode } = node;
  if (yogaNode) {
    if (yogaNode.getDisplay() === src_default.DISPLAY_NONE) {
      return;
    }
    const x = offsetX + yogaNode.getComputedLeft();
    const y = offsetY + yogaNode.getComputedTop();
    let newTransformers = transformers;
    if (typeof node.internal_transform === "function") {
      newTransformers = [node.internal_transform, ...transformers];
    }
    if (node.nodeName === "ink-text") {
      let text = squash_text_nodes_default(node);
      if (text.length > 0) {
        const currentWidth = widestLine(text);
        const maxWidth = get_max_width_default(yogaNode);
        if (currentWidth > maxWidth) {
          const textWrap = node.style.textWrap ?? "wrap";
          text = wrap_text_default(text, maxWidth, textWrap);
        }
        text = applyPaddingToText(node, text);
        output.write(x, y, text, { transformers: newTransformers });
      }
      return;
    }
    let clipped = false;
    if (node.nodeName === "ink-box") {
      render_background_default(x, y, node, output);
      render_border_default(x, y, node, output);
      const clipHorizontally = node.style.overflowX === "hidden" || node.style.overflow === "hidden";
      const clipVertically = node.style.overflowY === "hidden" || node.style.overflow === "hidden";
      if (clipHorizontally || clipVertically) {
        const x1 = clipHorizontally ? x + yogaNode.getComputedBorder(src_default.EDGE_LEFT) : void 0;
        const x2 = clipHorizontally ? x + yogaNode.getComputedWidth() - yogaNode.getComputedBorder(src_default.EDGE_RIGHT) : void 0;
        const y1 = clipVertically ? y + yogaNode.getComputedBorder(src_default.EDGE_TOP) : void 0;
        const y2 = clipVertically ? y + yogaNode.getComputedHeight() - yogaNode.getComputedBorder(src_default.EDGE_BOTTOM) : void 0;
        output.clip({ x1, x2, y1, y2 });
        clipped = true;
      }
    }
    if (node.nodeName === "ink-root" || node.nodeName === "ink-box") {
      for (const childNode of node.childNodes) {
        renderNodeToOutput(childNode, output, {
          offsetX: x,
          offsetY: y,
          transformers: newTransformers,
          skipStaticElements
        });
      }
      if (clipped) {
        output.unclip();
      }
    }
  }
};
var render_node_to_output_default = renderNodeToOutput;

// node_modules/@alcalzone/ansi-tokenize/node_modules/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET4 = 10;
var wrapAnsi164 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi2564 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m4 = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles6 = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames4 = Object.keys(styles6.modifier);
var foregroundColorNames4 = Object.keys(styles6.color);
var backgroundColorNames4 = Object.keys(styles6.bgColor);
var colorNames4 = [...foregroundColorNames4, ...backgroundColorNames4];
function assembleStyles4() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles6)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles6[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles6[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles6, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles6, "codes", {
    value: codes,
    enumerable: false
  });
  styles6.color.close = "\x1B[39m";
  styles6.bgColor.close = "\x1B[49m";
  styles6.color.ansi = wrapAnsi164();
  styles6.color.ansi256 = wrapAnsi2564();
  styles6.color.ansi16m = wrapAnsi16m4();
  styles6.bgColor.ansi = wrapAnsi164(ANSI_BACKGROUND_OFFSET4);
  styles6.bgColor.ansi256 = wrapAnsi2564(ANSI_BACKGROUND_OFFSET4);
  styles6.bgColor.ansi16m = wrapAnsi16m4(ANSI_BACKGROUND_OFFSET4);
  Object.defineProperties(styles6, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles6.rgbToAnsi256(...styles6.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles6.ansi256ToAnsi(styles6.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles6.ansi256ToAnsi(styles6.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles6;
}
var ansiStyles4 = assembleStyles4();
var ansi_styles_default4 = ansiStyles4;

// node_modules/@alcalzone/ansi-tokenize/build/consts.js
var BEL2 = "\x07";
var ESC2 = "\x1B";
var BACKSLASH = "\\";
var CSI = "[";
var OSC2 = "]";
var C1_ST = "\x9C";
var CC_BEL = BEL2.charCodeAt(0);
var CC_ESC = ESC2.charCodeAt(0);
var CC_BACKSLASH = BACKSLASH.charCodeAt(0);
var CC_CSI = CSI.charCodeAt(0);
var CC_OSC = OSC2.charCodeAt(0);
var CC_C1_ST = C1_ST.charCodeAt(0);
var CC_0 = "0".charCodeAt(0);
var CC_9 = "9".charCodeAt(0);
var CC_SEMI = ";".charCodeAt(0);
var CC_M = "m".charCodeAt(0);
var ESCAPES3 = /* @__PURE__ */ new Set([CC_ESC, 155]);
var linkCodePrefix = `${ESC2}${OSC2}8;`;
var linkCodePrefixCharCodes = linkCodePrefix.split("").map((char) => char.charCodeAt(0));
var linkEndCode = `${ESC2}${OSC2}8;;${BEL2}`;
var linkEndCodeST = `${ESC2}${OSC2}8;;${ESC2}${BACKSLASH}`;
var linkEndCodeC1ST = `${ESC2}${OSC2}8;;${C1_ST}`;

// node_modules/@alcalzone/ansi-tokenize/build/ansiCodes.js
var endCodesSet = /* @__PURE__ */ new Set();
var endCodesMap = /* @__PURE__ */ new Map();
for (const [start, end] of ansi_styles_default4.codes) {
  endCodesSet.add(ansi_styles_default4.color.ansi(end));
  endCodesMap.set(ansi_styles_default4.color.ansi(start), ansi_styles_default4.color.ansi(end));
}
endCodesSet.add(linkEndCode);
endCodesSet.add(linkEndCodeST);
endCodesSet.add(linkEndCodeC1ST);
function getEndCode(code) {
  if (endCodesSet.has(code))
    return code;
  if (endCodesMap.has(code))
    return endCodesMap.get(code);
  if (code.startsWith(linkCodePrefix)) {
    if (code.endsWith("\x1B\\"))
      return linkEndCodeST;
    if (code.endsWith("\x9C"))
      return linkEndCodeC1ST;
    return linkEndCode;
  }
  code = code.slice(2);
  if (code.startsWith("38")) {
    return ansi_styles_default4.color.close;
  } else if (code.startsWith("48")) {
    return ansi_styles_default4.bgColor.close;
  }
  const ret = ansi_styles_default4.codes.get(parseInt(code, 10));
  if (ret) {
    return ansi_styles_default4.color.ansi(ret);
  } else {
    return ansi_styles_default4.reset.open;
  }
}
function ansiCodesToString(codes) {
  const deduplicated = new Set(codes.map((code) => code.code));
  return [...deduplicated].join("");
}
function isIntensityCode(code) {
  return code.code === ansi_styles_default4.bold.open || code.code === ansi_styles_default4.dim.open;
}

// node_modules/@alcalzone/ansi-tokenize/build/reduce.js
function reduceAnsiCodes(codes) {
  return reduceAnsiCodesIncremental([], codes);
}
function reduceAnsiCodesIncremental(codes, newCodes) {
  let ret = [...codes];
  for (const code of newCodes) {
    if (code.code === ansi_styles_default4.reset.open) {
      ret = [];
    } else if (endCodesSet.has(code.code)) {
      ret = ret.filter((retCode) => retCode.endCode !== code.code);
    } else {
      if (isIntensityCode(code)) {
        if (!ret.find((retCode) => retCode.code === code.code && retCode.endCode === code.endCode)) {
          ret.push(code);
        }
      } else {
        ret = ret.filter((retCode) => retCode.endCode !== code.endCode);
        ret.push(code);
      }
    }
  }
  return ret;
}

// node_modules/@alcalzone/ansi-tokenize/build/undo.js
function undoAnsiCodes2(codes) {
  return reduceAnsiCodes(codes).reverse().map((code) => ({
    ...code,
    code: code.endCode
  }));
}

// node_modules/@alcalzone/ansi-tokenize/build/diff.js
function diffAnsiCodes(from, to) {
  const endCodesInTo = new Set(to.map((code) => code.endCode));
  const startCodesInTo = new Set(to.map((code) => code.code));
  const startCodesInFrom = new Set(from.map((code) => code.code));
  return [
    // Ignore all styles in `from` that are not overwritten or removed by `to`
    // Disable all styles in `from` that are removed in `to`
    ...undoAnsiCodes2(from.filter((code) => {
      if (isIntensityCode(code)) {
        return !startCodesInTo.has(code.code);
      }
      return !endCodesInTo.has(code.endCode);
    })),
    // Add all styles in `to` that don't exist in `from`
    ...to.filter((code) => !startCodesInFrom.has(code.code))
  ];
}

// node_modules/@alcalzone/ansi-tokenize/build/styledChars.js
function styledCharsFromTokens(tokens) {
  let codes = [];
  const ret = [];
  for (const token of tokens) {
    if (token.type === "ansi") {
      codes = reduceAnsiCodesIncremental(codes, [token]);
    } else if (token.type === "char") {
      ret.push({
        ...token,
        styles: [...codes]
      });
    }
  }
  return ret;
}
function styledCharsToString(chars) {
  let ret = "";
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (i === 0) {
      ret += ansiCodesToString(char.styles);
    } else {
      ret += ansiCodesToString(diffAnsiCodes(chars[i - 1].styles, char.styles));
    }
    ret += char.value;
    if (i === chars.length - 1) {
      ret += ansiCodesToString(diffAnsiCodes(char.styles, []));
    }
  }
  return ret;
}

// node_modules/@alcalzone/ansi-tokenize/build/tokenize.js
var __asciiSegments4 = (s) => ({ [Symbol.iterator]: function* () {
  for (let i = 0; i < s.length; i++) yield { segment: s[i], index: i, input: s };
}, containing: (i) => i >= 0 && i < s.length ? { segment: s[i], index: i, input: s } : void 0 });
var __isAscii4 = (s) => /^[\x00-\x7f]*$/.test(s) && !s.includes("\r\n");
var __real_segmenter3;
var segmenter3 = { segment: (s) => __isAscii4(s) ? __asciiSegments4(s) : (__real_segmenter3 ??= new Intl.Segmenter(void 0, { granularity: "grapheme" })).segment(s) };
function isFullwidthGrapheme(grapheme, baseCodePoint) {
  if (isFullwidthCodePoint(baseCodePoint))
    return true;
  if (grapheme.includes("\uFE0F"))
    return true;
  if (baseCodePoint >= 127462 && baseCodePoint <= 127487)
    return true;
  return false;
}
function parseLinkCode(string, offset) {
  string = string.slice(offset);
  for (let index = 1; index < linkCodePrefixCharCodes.length; index++) {
    if (string.charCodeAt(index) !== linkCodePrefixCharCodes[index]) {
      return void 0;
    }
  }
  const paramsEndIndex = string.indexOf(";", linkCodePrefix.length);
  if (paramsEndIndex === -1)
    return void 0;
  const endIndex = findOSCTerminatorIndex(string, paramsEndIndex + 1);
  if (endIndex === -1)
    return void 0;
  return string.slice(0, endIndex + 1);
}
function parseOSCSequence(string, offset) {
  string = string.slice(offset);
  const endIndex = findOSCTerminatorIndex(string, 2);
  if (endIndex === -1)
    return void 0;
  return string.slice(0, endIndex + 1);
}
function findOSCTerminatorIndex(string, startIndex) {
  for (let i = startIndex; i < string.length; i++) {
    const ch = string.charCodeAt(i);
    if (ch === CC_BEL)
      return i;
    if (ch === CC_C1_ST)
      return i;
    if (ch === CC_ESC && i + 1 < string.length && string.charCodeAt(i + 1) === CC_BACKSLASH) {
      return i + 1;
    }
  }
  return -1;
}
function findSGRSequenceEndIndex(str) {
  for (let index = 2; index < str.length; index++) {
    const charCode = str.charCodeAt(index);
    if (charCode === CC_M)
      return index;
    if (charCode === CC_SEMI)
      continue;
    if (charCode >= CC_0 && charCode <= CC_9)
      continue;
    break;
  }
  return -1;
}
function parseSGRSequence(string, offset) {
  string = string.slice(offset);
  const endIndex = findSGRSequenceEndIndex(string);
  if (endIndex === -1)
    return;
  return string.slice(0, endIndex + 1);
}
function splitCompoundSGRSequences(code) {
  if (!code.includes(";")) {
    return [code];
  }
  const codeParts = code.slice(2, -1).split(";");
  const ret = [];
  for (let i = 0; i < codeParts.length; i++) {
    const rawCode = codeParts[i];
    if (rawCode === "38" || rawCode === "48") {
      if (i + 2 < codeParts.length && codeParts[i + 1] === "5") {
        ret.push(codeParts.slice(i, i + 3).join(";"));
        i += 2;
        continue;
      } else if (i + 4 < codeParts.length && codeParts[i + 1] === "2") {
        ret.push(codeParts.slice(i, i + 5).join(";"));
        i += 4;
        continue;
      }
    }
    ret.push(rawCode);
  }
  return ret.map((part) => `\x1B[${part}m`);
}
function tokenize(str, endChar = Number.POSITIVE_INFINITY) {
  const ret = [];
  let visible = 0;
  let codeEndIndex = 0;
  for (const { segment, index } of segmenter3.segment(str)) {
    if (index < codeEndIndex)
      continue;
    const codePoint = segment.codePointAt(0);
    if (ESCAPES3.has(codePoint)) {
      let code;
      const nextCodePoint = str.codePointAt(index + 1);
      if (nextCodePoint === CC_OSC) {
        code = parseLinkCode(str, index);
        if (code) {
          ret.push({
            type: "ansi",
            code,
            endCode: getEndCode(code)
          });
        } else {
          code = parseOSCSequence(str, index);
          if (code) {
            ret.push({
              type: "control",
              code
            });
          }
        }
      } else if (nextCodePoint === CC_CSI) {
        code = parseSGRSequence(str, index);
        if (code) {
          const codes = splitCompoundSGRSequences(code);
          for (const individualCode of codes) {
            ret.push({
              type: "ansi",
              code: individualCode,
              endCode: getEndCode(individualCode)
            });
          }
        }
      }
      if (code) {
        codeEndIndex = index + code.length;
        continue;
      }
    }
    const fullWidth = isFullwidthGrapheme(segment, codePoint);
    ret.push({
      type: "char",
      value: segment,
      fullWidth
    });
    visible += fullWidth ? 2 : 1;
    if (visible >= endChar) {
      break;
    }
  }
  return ret;
}

// node_modules/ink/build/output.js
var OutputCaches = class {
  widths = /* @__PURE__ */ new Map();
  blockWidths = /* @__PURE__ */ new Map();
  styledChars = /* @__PURE__ */ new Map();
  getStyledChars(line) {
    let cached = this.styledChars.get(line);
    if (cached === void 0) {
      cached = styledCharsFromTokens(tokenize(line));
      this.styledChars.set(line, cached);
    }
    return cached;
  }
  getStringWidth(text) {
    let cached = this.widths.get(text);
    if (cached === void 0) {
      cached = stringWidth(text);
      this.widths.set(text, cached);
    }
    return cached;
  }
  getWidestLine(text) {
    let cached = this.blockWidths.get(text);
    if (cached === void 0) {
      let lineWidth = 0;
      for (const line of text.split("\n")) {
        lineWidth = Math.max(lineWidth, this.getStringWidth(line));
      }
      cached = lineWidth;
      this.blockWidths.set(text, cached);
    }
    return cached;
  }
};
var Output = class {
  width;
  height;
  operations = [];
  caches = new OutputCaches();
  constructor(options) {
    const { width, height } = options;
    this.width = width;
    this.height = height;
  }
  write(x, y, text, options) {
    const { transformers } = options;
    if (!text) {
      return;
    }
    this.operations.push({
      type: "write",
      x,
      y,
      text,
      transformers
    });
  }
  clip(clip) {
    this.operations.push({
      type: "clip",
      clip
    });
  }
  unclip() {
    this.operations.push({
      type: "unclip"
    });
  }
  get() {
    const output = [];
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        row.push({
          type: "char",
          value: " ",
          fullWidth: false,
          styles: []
        });
      }
      output.push(row);
    }
    const clips = [];
    for (const operation of this.operations) {
      if (operation.type === "clip") {
        clips.push(operation.clip);
      }
      if (operation.type === "unclip") {
        clips.pop();
      }
      if (operation.type === "write") {
        const { text, transformers } = operation;
        let { x, y } = operation;
        let lines = text.split("\n");
        const clip = clips.at(-1);
        if (clip) {
          const clipHorizontally = typeof clip?.x1 === "number" && typeof clip?.x2 === "number";
          const clipVertically = typeof clip?.y1 === "number" && typeof clip?.y2 === "number";
          if (clipHorizontally) {
            const width = this.caches.getWidestLine(text);
            if (x + width < clip.x1 || x > clip.x2) {
              continue;
            }
          }
          if (clipVertically) {
            const height = lines.length;
            if (y + height < clip.y1 || y > clip.y2) {
              continue;
            }
          }
          if (clipHorizontally) {
            lines = lines.map((line) => {
              const from = x < clip.x1 ? clip.x1 - x : 0;
              const width = this.caches.getStringWidth(line);
              const to = x + width > clip.x2 ? clip.x2 - x : width;
              return sliceAnsi(line, from, to);
            });
            if (x < clip.x1) {
              x = clip.x1;
            }
          }
          if (clipVertically) {
            const from = y < clip.y1 ? clip.y1 - y : 0;
            const height = lines.length;
            const to = y + height > clip.y2 ? clip.y2 - y : height;
            lines = lines.slice(from, to);
            if (y < clip.y1) {
              y = clip.y1;
            }
          }
        }
        let offsetY = 0;
        for (let [index, line] of lines.entries()) {
          const currentLine = output[y + offsetY];
          if (!currentLine) {
            continue;
          }
          for (const transformer of transformers) {
            line = transformer(line, index);
          }
          const characters = this.caches.getStyledChars(line);
          let offsetX = x;
          if (characters.length === 0) {
            offsetY++;
            continue;
          }
          const spaceCell = {
            type: "char",
            value: " ",
            fullWidth: false,
            styles: []
          };
          if (currentLine[offsetX]?.value === "" && offsetX > 0 && this.caches.getStringWidth(currentLine[offsetX - 1]?.value ?? "") > 1) {
            currentLine[offsetX - 1] = spaceCell;
          }
          for (const character of characters) {
            currentLine[offsetX] = character;
            const characterWidth = Math.max(1, this.caches.getStringWidth(character.value));
            if (characterWidth > 1) {
              for (let index2 = 1; index2 < characterWidth; index2++) {
                currentLine[offsetX + index2] = {
                  type: "char",
                  value: "",
                  fullWidth: false,
                  styles: character.styles
                };
              }
            }
            offsetX += characterWidth;
          }
          if (currentLine[offsetX]?.value === "") {
            currentLine[offsetX] = spaceCell;
          }
          offsetY++;
        }
      }
    }
    const generatedOutput = output.map((line) => {
      const lineWithoutEmptyItems = line.filter((item) => item !== void 0);
      return styledCharsToString(lineWithoutEmptyItems).trimEnd();
    }).join("\n");
    return {
      output: generatedOutput,
      height: output.length
    };
  }
};

// node_modules/ink/build/renderer.js
var renderer = (node, isScreenReaderEnabled) => {
  if (node.yogaNode) {
    if (isScreenReaderEnabled) {
      const output2 = renderNodeToScreenReaderOutput(node, {
        skipStaticElements: true
      });
      const outputHeight2 = output2 === "" ? 0 : output2.split("\n").length;
      let staticOutput2 = "";
      if (node.staticNode) {
        staticOutput2 = renderNodeToScreenReaderOutput(node.staticNode, {
          skipStaticElements: false
        });
      }
      return {
        output: output2,
        outputHeight: outputHeight2,
        staticOutput: staticOutput2 ? `${staticOutput2}
` : ""
      };
    }
    const output = new Output({
      width: node.yogaNode.getComputedWidth(),
      height: node.yogaNode.getComputedHeight()
    });
    render_node_to_output_default(node, output, {
      skipStaticElements: true
    });
    let staticOutput;
    if (node.staticNode?.yogaNode) {
      staticOutput = new Output({
        width: node.staticNode.yogaNode.getComputedWidth(),
        height: node.staticNode.yogaNode.getComputedHeight()
      });
      render_node_to_output_default(node.staticNode, staticOutput, {
        skipStaticElements: false
      });
    }
    const { output: generatedOutput, height: outputHeight } = output.get();
    return {
      output: generatedOutput,
      outputHeight,
      // Newline at the end is needed, because static output doesn't have one, so
      // interactive output will override last line of static output
      staticOutput: staticOutput ? `${staticOutput.get().output}
` : ""
    };
  }
  return {
    output: "",
    outputHeight: 0,
    staticOutput: ""
  };
};
var renderer_default = renderer;

// node_modules/ink/build/cursor-helpers.js
var showCursorEscape = "\x1B[?25h";
var hideCursorEscape = "\x1B[?25l";
var cursorPositionChanged = (a, b) => a?.x !== b?.x || a?.y !== b?.y;
var buildCursorSuffix = (visibleLineCount2, cursorPosition) => {
  if (!cursorPosition) {
    return "";
  }
  const moveUp = visibleLineCount2 - cursorPosition.y;
  return (moveUp > 0 ? base_exports.cursorUp(moveUp) : "") + base_exports.cursorTo(cursorPosition.x) + showCursorEscape;
};
var buildReturnToBottom = (previousLineCount, previousCursorPosition) => {
  if (!previousCursorPosition) {
    return "";
  }
  const down = previousLineCount - 1 - previousCursorPosition.y;
  return (down > 0 ? base_exports.cursorDown(down) : "") + base_exports.cursorTo(0);
};
var buildCursorOnlySequence = (input) => {
  const hidePrefix = input.cursorWasShown ? hideCursorEscape : "";
  const returnToBottom = buildReturnToBottom(input.previousLineCount, input.previousCursorPosition);
  const cursorSuffix = buildCursorSuffix(input.visibleLineCount, input.cursorPosition);
  return hidePrefix + returnToBottom + cursorSuffix;
};
var buildReturnToBottomPrefix = (cursorWasShown, previousLineCount, previousCursorPosition) => {
  if (!cursorWasShown) {
    return "";
  }
  return hideCursorEscape + buildReturnToBottom(previousLineCount, previousCursorPosition);
};

// node_modules/cli-cursor/index.js
import process7 from "node:process";

// node_modules/restore-cursor/index.js
var import_onetime = __toESM(require_onetime(), 1);
var import_signal_exit = __toESM(require_signal_exit(), 1);
import process6 from "node:process";
var restoreCursor = (0, import_onetime.default)(() => {
  (0, import_signal_exit.default)(() => {
    process6.stderr.write("\x1B[?25h");
  }, { alwaysLast: true });
});
var restore_cursor_default = restoreCursor;

// node_modules/cli-cursor/index.js
var isHidden = false;
var cliCursor = {};
cliCursor.show = (writableStream = process7.stderr) => {
  if (!writableStream.isTTY) {
    return;
  }
  isHidden = false;
  writableStream.write("\x1B[?25h");
};
cliCursor.hide = (writableStream = process7.stderr) => {
  if (!writableStream.isTTY) {
    return;
  }
  restore_cursor_default();
  isHidden = true;
  writableStream.write("\x1B[?25l");
};
cliCursor.toggle = (force, writableStream) => {
  if (force !== void 0) {
    isHidden = force;
  }
  if (isHidden) {
    cliCursor.show(writableStream);
  } else {
    cliCursor.hide(writableStream);
  }
};
var cli_cursor_default = cliCursor;

// node_modules/ink/build/log-update.js
var visibleLineCount = (lines, str) => str.endsWith("\n") ? lines.length - 1 : lines.length;
var createStandard = (stream, { showCursor = false } = {}) => {
  let previousLineCount = 0;
  let previousOutput = "";
  let hasHiddenCursor = false;
  let cursorPosition;
  let cursorDirty = false;
  let previousCursorPosition;
  let cursorWasShown = false;
  const getActiveCursor = () => cursorDirty ? cursorPosition : void 0;
  const hasChanges = (str, activeCursor) => {
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    return str !== previousOutput || cursorChanged;
  };
  const render2 = (str) => {
    if (!showCursor && !hasHiddenCursor) {
      cli_cursor_default.hide(stream);
      hasHiddenCursor = true;
    }
    const activeCursor = getActiveCursor();
    cursorDirty = false;
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    if (!hasChanges(str, activeCursor)) {
      return false;
    }
    const lines = str.split("\n");
    const visibleCount = visibleLineCount(lines, str);
    const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
    if (str === previousOutput && cursorChanged) {
      stream.write(buildCursorOnlySequence({
        cursorWasShown,
        previousLineCount,
        previousCursorPosition,
        visibleLineCount: visibleCount,
        cursorPosition: activeCursor
      }));
    } else {
      previousOutput = str;
      const returnPrefix = buildReturnToBottomPrefix(cursorWasShown, previousLineCount, previousCursorPosition);
      stream.write(returnPrefix + base_exports.eraseLines(previousLineCount) + str + cursorSuffix);
      previousLineCount = lines.length;
    }
    previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
    cursorWasShown = activeCursor !== void 0;
    return true;
  };
  render2.clear = () => {
    const prefix = buildReturnToBottomPrefix(cursorWasShown, previousLineCount, previousCursorPosition);
    stream.write(prefix + base_exports.eraseLines(previousLineCount));
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = void 0;
    cursorWasShown = false;
  };
  render2.done = () => {
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = void 0;
    cursorWasShown = false;
    if (!showCursor) {
      cli_cursor_default.show(stream);
      hasHiddenCursor = false;
    }
  };
  render2.reset = () => {
    previousOutput = "";
    previousLineCount = 0;
    previousCursorPosition = void 0;
    cursorWasShown = false;
  };
  render2.sync = (str) => {
    const activeCursor = cursorDirty ? cursorPosition : void 0;
    cursorDirty = false;
    const lines = str.split("\n");
    previousOutput = str;
    previousLineCount = lines.length;
    if (!activeCursor && cursorWasShown) {
      stream.write(hideCursorEscape);
    }
    if (activeCursor) {
      stream.write(buildCursorSuffix(visibleLineCount(lines, str), activeCursor));
    }
    previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
    cursorWasShown = activeCursor !== void 0;
  };
  render2.setCursorPosition = (position) => {
    cursorPosition = position;
    cursorDirty = true;
  };
  render2.isCursorDirty = () => cursorDirty;
  render2.willRender = (str) => hasChanges(str, getActiveCursor());
  return render2;
};
var createIncremental = (stream, { showCursor = false } = {}) => {
  let previousLines = [];
  let previousOutput = "";
  let hasHiddenCursor = false;
  let cursorPosition;
  let cursorDirty = false;
  let previousCursorPosition;
  let cursorWasShown = false;
  const getActiveCursor = () => cursorDirty ? cursorPosition : void 0;
  const hasChanges = (str, activeCursor) => {
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    return str !== previousOutput || cursorChanged;
  };
  const render2 = (str) => {
    if (!showCursor && !hasHiddenCursor) {
      cli_cursor_default.hide(stream);
      hasHiddenCursor = true;
    }
    const activeCursor = getActiveCursor();
    cursorDirty = false;
    const cursorChanged = cursorPositionChanged(activeCursor, previousCursorPosition);
    if (!hasChanges(str, activeCursor)) {
      return false;
    }
    const nextLines = str.split("\n");
    const visibleCount = visibleLineCount(nextLines, str);
    const previousVisible = visibleLineCount(previousLines, previousOutput);
    if (str === previousOutput && cursorChanged) {
      stream.write(buildCursorOnlySequence({
        cursorWasShown,
        previousLineCount: previousLines.length,
        previousCursorPosition,
        visibleLineCount: visibleCount,
        cursorPosition: activeCursor
      }));
      previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
      cursorWasShown = activeCursor !== void 0;
      return true;
    }
    const returnPrefix = buildReturnToBottomPrefix(cursorWasShown, previousLines.length, previousCursorPosition);
    if (str === "\n" || previousOutput.length === 0) {
      const cursorSuffix2 = buildCursorSuffix(visibleCount, activeCursor);
      stream.write(returnPrefix + base_exports.eraseLines(previousLines.length) + str + cursorSuffix2);
      cursorWasShown = activeCursor !== void 0;
      previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
      previousOutput = str;
      previousLines = nextLines;
      return true;
    }
    const hasTrailingNewline = str.endsWith("\n");
    const buffer = [];
    buffer.push(returnPrefix);
    if (visibleCount < previousVisible) {
      const previousHadTrailingNewline = previousOutput.endsWith("\n");
      const extraSlot = previousHadTrailingNewline ? 1 : 0;
      buffer.push(base_exports.eraseLines(previousVisible - visibleCount + extraSlot), base_exports.cursorUp(visibleCount));
    } else {
      buffer.push(base_exports.cursorUp(previousLines.length - 1));
    }
    for (let i = 0; i < visibleCount; i++) {
      const isLastLine = i === visibleCount - 1;
      if (nextLines[i] === previousLines[i]) {
        if (!isLastLine || hasTrailingNewline) {
          buffer.push(base_exports.cursorNextLine);
        }
        continue;
      }
      buffer.push(base_exports.cursorTo(0) + nextLines[i] + base_exports.eraseEndLine + // Don't append newline after the last line when the input
      // has no trailing newline (fullscreen mode).
      (isLastLine && !hasTrailingNewline ? "" : "\n"));
    }
    const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
    buffer.push(cursorSuffix);
    stream.write(buffer.join(""));
    cursorWasShown = activeCursor !== void 0;
    previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
    previousOutput = str;
    previousLines = nextLines;
    return true;
  };
  render2.clear = () => {
    const prefix = buildReturnToBottomPrefix(cursorWasShown, previousLines.length, previousCursorPosition);
    stream.write(prefix + base_exports.eraseLines(previousLines.length));
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = void 0;
    cursorWasShown = false;
  };
  render2.done = () => {
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = void 0;
    cursorWasShown = false;
    if (!showCursor) {
      cli_cursor_default.show(stream);
      hasHiddenCursor = false;
    }
  };
  render2.reset = () => {
    previousOutput = "";
    previousLines = [];
    previousCursorPosition = void 0;
    cursorWasShown = false;
  };
  render2.sync = (str) => {
    const activeCursor = cursorDirty ? cursorPosition : void 0;
    cursorDirty = false;
    const lines = str.split("\n");
    previousOutput = str;
    previousLines = lines;
    if (!activeCursor && cursorWasShown) {
      stream.write(hideCursorEscape);
    }
    if (activeCursor) {
      stream.write(buildCursorSuffix(visibleLineCount(lines, str), activeCursor));
    }
    previousCursorPosition = activeCursor ? { ...activeCursor } : void 0;
    cursorWasShown = activeCursor !== void 0;
  };
  render2.setCursorPosition = (position) => {
    cursorPosition = position;
    cursorDirty = true;
  };
  render2.isCursorDirty = () => cursorDirty;
  render2.willRender = (str) => hasChanges(str, getActiveCursor());
  return render2;
};
var create2 = (stream, { showCursor = false, incremental = false } = {}) => {
  if (incremental) {
    return createIncremental(stream, { showCursor });
  }
  return createStandard(stream, { showCursor });
};
var logUpdate = { create: create2 };
var log_update_default = logUpdate;

// node_modules/ink/build/write-synchronized.js
var bsu = "\x1B[?2026h";
var esu = "\x1B[?2026l";
function shouldSynchronize(stream, interactive) {
  return "isTTY" in stream && stream.isTTY && (interactive ?? !is_in_ci_default);
}

// node_modules/ink/build/instances.js
var instances = /* @__PURE__ */ new WeakMap();
var instances_default = instances;

// node_modules/ink/build/components/App.js
var import_react15 = __toESM(require_react(), 1);
import { EventEmitter as EventEmitter2 } from "node:events";
import process11 from "node:process";

// node_modules/ink/build/input-parser.js
var escape = "\x1B";
var pasteStart = "\x1B[200~";
var pasteEnd = "\x1B[201~";
var isCsiParameterByte = (byte) => {
  return byte >= 48 && byte <= 63;
};
var isCsiIntermediateByte = (byte) => {
  return byte >= 32 && byte <= 47;
};
var isCsiFinalByte = (byte) => {
  return byte >= 64 && byte <= 126;
};
var parseCsiSequence = (input, startIndex, prefixLength) => {
  const csiPayloadStart = startIndex + prefixLength + 1;
  let index = csiPayloadStart;
  for (; index < input.length; index++) {
    const byte = input.codePointAt(index);
    if (byte === void 0) {
      return "pending";
    }
    if (isCsiParameterByte(byte) || isCsiIntermediateByte(byte)) {
      continue;
    }
    if (byte === 91 && index === csiPayloadStart) {
      continue;
    }
    if (isCsiFinalByte(byte)) {
      return {
        sequence: input.slice(startIndex, index + 1),
        nextIndex: index + 1
      };
    }
    return void 0;
  }
  return "pending";
};
var parseSs3Sequence = (input, startIndex, prefixLength) => {
  const nextIndex = startIndex + prefixLength + 2;
  if (nextIndex > input.length) {
    return "pending";
  }
  const finalByte = input.codePointAt(nextIndex - 1);
  if (finalByte === void 0 || !isCsiFinalByte(finalByte)) {
    return void 0;
  }
  return {
    sequence: input.slice(startIndex, nextIndex),
    nextIndex
  };
};
var parseControlSequence = (input, startIndex, prefixLength) => {
  const sequenceType = input[startIndex + prefixLength];
  if (sequenceType === void 0) {
    return "pending";
  }
  if (sequenceType === "[") {
    return parseCsiSequence(input, startIndex, prefixLength);
  }
  if (sequenceType === "O") {
    return parseSs3Sequence(input, startIndex, prefixLength);
  }
  return void 0;
};
var parseEscapedCodePoint = (input, escapeIndex) => {
  const nextCodePoint = input.codePointAt(escapeIndex + 1);
  const nextCodePointLength = nextCodePoint !== void 0 && nextCodePoint > 65535 ? 2 : 1;
  const nextIndex = escapeIndex + 1 + nextCodePointLength;
  return {
    sequence: input.slice(escapeIndex, nextIndex),
    nextIndex
  };
};
var parseEscapeSequence = (input, escapeIndex) => {
  if (escapeIndex === input.length - 1) {
    return "pending";
  }
  const next = input[escapeIndex + 1];
  if (next === escape) {
    if (escapeIndex + 2 >= input.length) {
      return "pending";
    }
    const doubleEscapeSequence = parseControlSequence(input, escapeIndex, 2);
    if (doubleEscapeSequence === "pending") {
      return "pending";
    }
    if (doubleEscapeSequence) {
      return doubleEscapeSequence;
    }
    return {
      sequence: input.slice(escapeIndex, escapeIndex + 2),
      nextIndex: escapeIndex + 2
    };
  }
  const controlSequence = parseControlSequence(input, escapeIndex, 1);
  if (controlSequence === "pending") {
    return "pending";
  }
  if (controlSequence) {
    return controlSequence;
  }
  return parseEscapedCodePoint(input, escapeIndex);
};
var splitBackspaceBytes = (text, events) => {
  let textSegmentStart = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "\x7F" || character === "\b") {
      if (index > textSegmentStart) {
        events.push(text.slice(textSegmentStart, index));
      }
      events.push(character);
      textSegmentStart = index + 1;
    }
  }
  if (textSegmentStart < text.length) {
    events.push(text.slice(textSegmentStart));
  }
};
var parseKeypresses = (input) => {
  const events = [];
  let index = 0;
  const pendingFrom = (pendingStartIndex) => ({
    events,
    pending: input.slice(pendingStartIndex)
  });
  while (index < input.length) {
    const escapeIndex = input.indexOf(escape, index);
    if (escapeIndex === -1) {
      splitBackspaceBytes(input.slice(index), events);
      return {
        events,
        pending: ""
      };
    }
    if (escapeIndex > index) {
      splitBackspaceBytes(input.slice(index, escapeIndex), events);
    }
    const parsedEscapeSequence = parseEscapeSequence(input, escapeIndex);
    if (parsedEscapeSequence === "pending") {
      return pendingFrom(escapeIndex);
    }
    if (parsedEscapeSequence.sequence === pasteStart) {
      const afterStart = parsedEscapeSequence.nextIndex;
      const endIndex = input.indexOf(pasteEnd, afterStart);
      if (endIndex === -1) {
        return pendingFrom(escapeIndex);
      }
      events.push({ paste: input.slice(afterStart, endIndex) });
      index = endIndex + pasteEnd.length;
      continue;
    }
    events.push(parsedEscapeSequence.sequence);
    index = parsedEscapeSequence.nextIndex;
  }
  return {
    events,
    pending: ""
  };
};
var createInputParser = () => {
  let pending = "";
  return {
    push(chunk) {
      const parsedInput = parseKeypresses(pending + chunk);
      pending = parsedInput.pending;
      return parsedInput.events;
    },
    hasPendingEscape() {
      return pending.startsWith(escape) && !pending.startsWith(pasteStart) && pending !== "\x1B[200";
    },
    flushPendingEscape() {
      if (!pending.startsWith(escape)) {
        return void 0;
      }
      const pendingEscape = pending;
      pending = "";
      return pendingEscape;
    },
    reset() {
      pending = "";
    }
  };
};

// node_modules/ink/build/components/AppContext.js
var import_react2 = __toESM(require_react(), 1);
var noopSuspension = {
  async resume() {
  },
  async [Symbol.asyncDispose]() {
  }
};
var defaultValue = {
  exit(_errorOrResult) {
  },
  async waitUntilRenderFlush() {
  },
  suspendTerminal: (async (callback) => {
    if (callback) {
      await callback();
      return void 0;
    }
    return noopSuspension;
  })
};
var AppContext = (0, import_react2.createContext)(defaultValue);
AppContext.displayName = "InternalAppContext";
var AppContext_default = AppContext;

// node_modules/ink/build/components/StdinContext.js
var import_react3 = __toESM(require_react(), 1);
import { EventEmitter } from "node:events";
import process8 from "node:process";
var StdinContext = (0, import_react3.createContext)({
  stdin: process8.stdin,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  internal_eventEmitter: new EventEmitter(),
  setRawMode() {
  },
  setBracketedPasteMode() {
  },
  isRawModeSupported: false,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  internal_exitOnCtrlC: true
});
StdinContext.displayName = "InternalStdinContext";
var StdinContext_default = StdinContext;

// node_modules/ink/build/components/StdoutContext.js
var import_react4 = __toESM(require_react(), 1);
import process9 from "node:process";
var StdoutContext = (0, import_react4.createContext)({
  stdout: process9.stdout,
  write() {
  }
});
StdoutContext.displayName = "InternalStdoutContext";
var StdoutContext_default = StdoutContext;

// node_modules/ink/build/components/StderrContext.js
var import_react5 = __toESM(require_react(), 1);
import process10 from "node:process";
var StderrContext = (0, import_react5.createContext)({
  stderr: process10.stderr,
  write() {
  }
});
StderrContext.displayName = "InternalStderrContext";
var StderrContext_default = StderrContext;

// node_modules/ink/build/components/FocusContext.js
var import_react6 = __toESM(require_react(), 1);
var FocusContext = (0, import_react6.createContext)({
  activeId: void 0,
  add() {
  },
  remove() {
  },
  activate() {
  },
  deactivate() {
  },
  enableFocus() {
  },
  disableFocus() {
  },
  focusNext() {
  },
  focusPrevious() {
  },
  focus() {
  }
});
FocusContext.displayName = "InternalFocusContext";
var FocusContext_default = FocusContext;

// node_modules/ink/build/components/AnimationContext.js
var import_react7 = __toESM(require_react(), 1);
var animationContext = (0, import_react7.createContext)({
  renderThrottleMs: 0,
  subscribe() {
    return {
      startTime: 0,
      unsubscribe() {
      }
    };
  }
});
animationContext.displayName = "InternalAnimationContext";
var AnimationContext_default = animationContext;

// node_modules/ink/build/components/CursorContext.js
var import_react8 = __toESM(require_react(), 1);
var CursorContext = (0, import_react8.createContext)({
  setCursorPosition() {
  }
});
CursorContext.displayName = "InternalCursorContext";
var CursorContext_default = CursorContext;

// node_modules/ink/build/components/ErrorBoundary.js
var import_react14 = __toESM(require_react(), 1);

// node_modules/ink/build/components/ErrorOverview.js
var import_react13 = __toESM(require_react(), 1);
var import_stack_utils = __toESM(require_stack_utils(), 1);
import * as fs2 from "node:fs";
import { cwd } from "node:process";

// node_modules/convert-to-spaces/dist/index.js
var convertToSpaces = (input, spaces = 2) => {
  return input.replace(/^\t+/gm, ($1) => " ".repeat($1.length * spaces));
};
var dist_default2 = convertToSpaces;

// node_modules/code-excerpt/dist/index.js
var generateLineNumbers = (line, around) => {
  const lineNumbers = [];
  const min = line - around;
  const max = line + around;
  for (let lineNumber = min; lineNumber <= max; lineNumber++) {
    lineNumbers.push(lineNumber);
  }
  return lineNumbers;
};
var codeExcerpt = (source, line, options = {}) => {
  var _a;
  if (typeof source !== "string") {
    throw new TypeError("Source code is missing.");
  }
  if (!line || line < 1) {
    throw new TypeError("Line number must start from `1`.");
  }
  const lines = dist_default2(source).split(/\r?\n/);
  if (line > lines.length) {
    return;
  }
  return generateLineNumbers(line, (_a = options.around) !== null && _a !== void 0 ? _a : 3).filter((line2) => lines[line2 - 1] !== void 0).map((line2) => ({ line: line2, value: lines[line2 - 1] }));
};
var dist_default3 = codeExcerpt;

// node_modules/ink/build/components/Box.js
var import_react11 = __toESM(require_react(), 1);

// node_modules/ink/build/components/AccessibilityContext.js
var import_react9 = __toESM(require_react(), 1);
var accessibilityContext = (0, import_react9.createContext)({
  isScreenReaderEnabled: false
});

// node_modules/ink/build/components/BackgroundContext.js
var import_react10 = __toESM(require_react(), 1);
var backgroundContext = (0, import_react10.createContext)(void 0);

// node_modules/ink/build/components/Box.js
var Box = (0, import_react11.forwardRef)(({ children, backgroundColor, "aria-label": ariaLabel, "aria-hidden": ariaHidden, "aria-role": role, "aria-state": ariaState, ...style }, ref) => {
  const { isScreenReaderEnabled } = (0, import_react11.useContext)(accessibilityContext);
  const label = ariaLabel ? import_react11.default.createElement("ink-text", null, ariaLabel) : void 0;
  if (isScreenReaderEnabled && ariaHidden) {
    return null;
  }
  const boxElement = import_react11.default.createElement("ink-box", { ref, style: {
    flexWrap: "nowrap",
    flexDirection: "row",
    flexGrow: 0,
    flexShrink: 1,
    ...style,
    backgroundColor,
    overflowX: style.overflowX ?? style.overflow ?? "visible",
    overflowY: style.overflowY ?? style.overflow ?? "visible"
  }, internal_accessibility: {
    role,
    state: ariaState
  } }, isScreenReaderEnabled && label ? label : children);
  if (backgroundColor) {
    return import_react11.default.createElement(backgroundContext.Provider, { value: backgroundColor }, boxElement);
  }
  return boxElement;
});
Box.displayName = "Box";
var Box_default = Box;

// node_modules/ink/build/components/Text.js
var import_react12 = __toESM(require_react(), 1);
function Text({ color, backgroundColor, dimColor = false, bold = false, italic = false, underline = false, strikethrough = false, inverse = false, wrap = "wrap", children, "aria-label": ariaLabel, "aria-hidden": ariaHidden = false }) {
  const { isScreenReaderEnabled } = (0, import_react12.useContext)(accessibilityContext);
  const inheritedBackgroundColor = (0, import_react12.useContext)(backgroundContext);
  const childrenOrAriaLabel = isScreenReaderEnabled && ariaLabel ? ariaLabel : children;
  if (childrenOrAriaLabel === void 0 || childrenOrAriaLabel === null) {
    return null;
  }
  const transform = (children2) => {
    if (dimColor) {
      children2 = source_default.dim(children2);
    }
    if (color) {
      children2 = colorize_default(children2, color, "foreground");
    }
    const effectiveBackgroundColor = backgroundColor ?? inheritedBackgroundColor;
    if (effectiveBackgroundColor) {
      children2 = colorize_default(children2, effectiveBackgroundColor, "background");
    }
    if (bold) {
      children2 = source_default.bold(children2);
    }
    if (italic) {
      children2 = source_default.italic(children2);
    }
    if (underline) {
      children2 = source_default.underline(children2);
    }
    if (strikethrough) {
      children2 = source_default.strikethrough(children2);
    }
    if (inverse) {
      children2 = source_default.inverse(children2);
    }
    return children2;
  };
  if (isScreenReaderEnabled && ariaHidden) {
    return null;
  }
  return import_react12.default.createElement("ink-text", { style: { flexGrow: 0, flexShrink: 1, flexDirection: "row", textWrap: wrap }, internal_transform: transform }, childrenOrAriaLabel);
}

// node_modules/ink/build/components/ErrorOverview.js
var cleanupPath = (path) => {
  return path?.replace(`file://${cwd()}/`, "");
};
var stackUtils = new import_stack_utils.default({
  cwd: cwd(),
  internals: import_stack_utils.default.nodeInternals()
});
function ErrorOverview({ error }) {
  const stack = error.stack ? error.stack.split("\n").slice(1) : void 0;
  const origin = stack ? stackUtils.parseLine(stack[0]) : void 0;
  const filePath = cleanupPath(origin?.file);
  let excerpt;
  let lineWidth = 0;
  const stackLineCounts = /* @__PURE__ */ new Map();
  if (filePath && origin?.line && fs2.existsSync(filePath)) {
    const sourceCode = fs2.readFileSync(filePath, "utf8");
    excerpt = dist_default3(sourceCode, origin.line);
    if (excerpt) {
      for (const { line } of excerpt) {
        lineWidth = Math.max(lineWidth, String(line).length);
      }
    }
  }
  return import_react13.default.createElement(
    Box_default,
    { flexDirection: "column", padding: 1 },
    import_react13.default.createElement(
      Box_default,
      null,
      import_react13.default.createElement(
        Text,
        { backgroundColor: "red", color: "white" },
        " ",
        "ERROR",
        " "
      ),
      import_react13.default.createElement(
        Text,
        null,
        " ",
        error.message
      )
    ),
    origin && filePath ? import_react13.default.createElement(
      Box_default,
      { marginTop: 1 },
      import_react13.default.createElement(
        Text,
        { dimColor: true },
        filePath,
        ":",
        origin.line,
        ":",
        origin.column
      )
    ) : null,
    origin && excerpt ? import_react13.default.createElement(Box_default, { marginTop: 1, flexDirection: "column" }, excerpt.map(({ line, value }) => import_react13.default.createElement(
      Box_default,
      { key: line },
      import_react13.default.createElement(
        Box_default,
        { width: lineWidth + 1 },
        import_react13.default.createElement(
          Text,
          { dimColor: line !== origin.line, backgroundColor: line === origin.line ? "red" : void 0, color: line === origin.line ? "white" : void 0, "aria-label": line === origin.line ? `Line ${line}, error` : `Line ${line}` },
          String(line).padStart(lineWidth, " "),
          ":"
        )
      ),
      import_react13.default.createElement(Text, { key: line, backgroundColor: line === origin.line ? "red" : void 0, color: line === origin.line ? "white" : void 0 }, " " + value)
    ))) : null,
    error.stack ? import_react13.default.createElement(Box_default, { marginTop: 1, flexDirection: "column" }, error.stack.split("\n").slice(1).map((line) => {
      const parsedLine = stackUtils.parseLine(line);
      const lineCount = stackLineCounts.get(line) ?? 0;
      stackLineCounts.set(line, lineCount + 1);
      const key = `${line}-${lineCount}`;
      if (!parsedLine?.file || !parsedLine.line || !parsedLine.column) {
        return import_react13.default.createElement(
          Box_default,
          { key },
          import_react13.default.createElement(Text, { dimColor: true }, "- "),
          import_react13.default.createElement(
            Text,
            { dimColor: true, bold: true },
            line,
            "\\t",
            " "
          )
        );
      }
      return import_react13.default.createElement(
        Box_default,
        { key },
        import_react13.default.createElement(Text, { dimColor: true }, "- "),
        import_react13.default.createElement(Text, { dimColor: true, bold: true }, parsedLine.function),
        import_react13.default.createElement(
          Text,
          { dimColor: true, color: "gray", "aria-label": `at ${cleanupPath(parsedLine.file) ?? ""} line ${parsedLine.line} column ${parsedLine.column}` },
          " ",
          "(",
          cleanupPath(parsedLine.file) ?? "",
          ":",
          parsedLine.line,
          ":",
          parsedLine.column,
          ")"
        )
      );
    })) : null
  );
}

// node_modules/ink/build/components/ErrorBoundary.js
var ErrorBoundary = class extends import_react14.PureComponent {
  static displayName = "InternalErrorBoundary";
  static getDerivedStateFromError(error) {
    return { error };
  }
  state = {
    error: void 0
  };
  componentDidCatch(error) {
    this.props.onError(error);
  }
  render() {
    if (this.state.error) {
      return import_react14.default.createElement(ErrorOverview, { error: this.state.error });
    }
    return this.props.children;
  }
};

// node_modules/ink/build/components/App.js
var tab = "	";
var shiftTab = "\x1B[Z";
var escape2 = "\x1B";
function App({ children, stdin, stdout, stderr, writeToStdout, writeToStderr, exitOnCtrlC, onExit, onWaitUntilRenderFlush, onSuspendTerminal, onRegisterInputControl, setCursorPosition, interactive, renderThrottleMs }) {
  const [isFocusEnabled, setIsFocusEnabled] = (0, import_react15.useState)(true);
  const [activeFocusId, setActiveFocusId] = (0, import_react15.useState)(void 0);
  const [, setFocusables] = (0, import_react15.useState)([]);
  const focusablesCountRef = (0, import_react15.useRef)(0);
  const animationSubscribersRef = (0, import_react15.useRef)(/* @__PURE__ */ new Map());
  const animationTimerRef = (0, import_react15.useRef)(void 0);
  const rawModeEnabledCount = (0, import_react15.useRef)(0);
  const pendingDisableRawModeRef = (0, import_react15.useRef)(false);
  const bracketedPasteModeEnabledCount = (0, import_react15.useRef)(0);
  const internal_eventEmitter = (0, import_react15.useRef)(new EventEmitter2());
  internal_eventEmitter.current.setMaxListeners(Infinity);
  const readableListenerRef = (0, import_react15.useRef)(void 0);
  const inputParserRef = (0, import_react15.useRef)(createInputParser());
  const pendingInputFlushRef = (0, import_react15.useRef)(void 0);
  const pendingInputFlushDelayMilliseconds = 20;
  const clearPendingInputFlush = (0, import_react15.useCallback)(() => {
    if (!pendingInputFlushRef.current) {
      return;
    }
    clearTimeout(pendingInputFlushRef.current);
    pendingInputFlushRef.current = void 0;
  }, []);
  const clearAnimationTimer = (0, import_react15.useCallback)(() => {
    if (!animationTimerRef.current) {
      return;
    }
    clearTimeout(animationTimerRef.current);
    animationTimerRef.current = void 0;
  }, []);
  const scheduleAnimationTick = (0, import_react15.useCallback)(() => {
    clearAnimationTimer();
    if (animationSubscribersRef.current.size === 0) {
      return;
    }
    let nextDueTime = Number.POSITIVE_INFINITY;
    for (const subscriber of animationSubscribersRef.current.values()) {
      nextDueTime = Math.min(nextDueTime, subscriber.nextDueTime);
    }
    const delay = Math.max(0, nextDueTime - performance.now());
    animationTimerRef.current = setTimeout(() => {
      animationTimerRef.current = void 0;
      const currentTime = performance.now();
      for (const subscriber of animationSubscribersRef.current.values()) {
        if (currentTime < subscriber.nextDueTime) {
          continue;
        }
        subscriber.callback(currentTime);
        const elapsedTime = currentTime - subscriber.startTime;
        const elapsedFrames = Math.floor(elapsedTime / subscriber.interval) + 1;
        subscriber.nextDueTime = subscriber.startTime + elapsedFrames * subscriber.interval;
      }
      scheduleAnimationTick();
    }, delay);
  }, [clearAnimationTimer]);
  const animationSubscribe = (0, import_react15.useCallback)((callback, interval) => {
    const startTime = performance.now();
    animationSubscribersRef.current.set(callback, {
      callback,
      interval,
      startTime,
      nextDueTime: startTime + interval
    });
    scheduleAnimationTick();
    return {
      startTime,
      unsubscribe() {
        animationSubscribersRef.current.delete(callback);
        if (animationSubscribersRef.current.size === 0) {
          clearAnimationTimer();
          return;
        }
        scheduleAnimationTick();
      }
    };
  }, [clearAnimationTimer, scheduleAnimationTick]);
  (0, import_react15.useEffect)(() => {
    return () => {
      clearAnimationTimer();
    };
  }, [clearAnimationTimer]);
  const isRawModeSupported = stdin.isTTY;
  const detachReadableListener = (0, import_react15.useCallback)(() => {
    if (!readableListenerRef.current) {
      return;
    }
    stdin.removeListener("readable", readableListenerRef.current);
    readableListenerRef.current = void 0;
  }, [stdin]);
  const clearInputState = (0, import_react15.useCallback)(() => {
    inputParserRef.current.reset();
    clearPendingInputFlush();
    detachReadableListener();
  }, [clearPendingInputFlush, detachReadableListener]);
  const disableRawMode = (0, import_react15.useCallback)(() => {
    pendingDisableRawModeRef.current = false;
    stdin.setRawMode(false);
    stdin.unref();
    rawModeEnabledCount.current = 0;
    clearInputState();
  }, [stdin, clearInputState]);
  const handleExit = (0, import_react15.useCallback)((errorOrResult) => {
    if (isRawModeSupported && (rawModeEnabledCount.current > 0 || pendingDisableRawModeRef.current)) {
      disableRawMode();
    }
    onExit(errorOrResult);
  }, [isRawModeSupported, disableRawMode, onExit]);
  const handleInput = (0, import_react15.useCallback)((input) => {
    if (input === "" && exitOnCtrlC) {
      handleExit();
      return;
    }
    if (input === escape2 && isFocusEnabled) {
      setActiveFocusId(void 0);
    }
  }, [exitOnCtrlC, handleExit, isFocusEnabled]);
  const emitInput = (0, import_react15.useCallback)((input) => {
    handleInput(input);
    internal_eventEmitter.current.emit("input", input);
  }, [handleInput]);
  const schedulePendingInputFlush = (0, import_react15.useCallback)(() => {
    clearPendingInputFlush();
    pendingInputFlushRef.current = setTimeout(() => {
      pendingInputFlushRef.current = void 0;
      const pendingEscape = inputParserRef.current.flushPendingEscape();
      if (!pendingEscape) {
        return;
      }
      emitInput(pendingEscape);
    }, pendingInputFlushDelayMilliseconds);
  }, [clearPendingInputFlush, emitInput]);
  const handleReadable = (0, import_react15.useCallback)(() => {
    clearPendingInputFlush();
    let chunk;
    while ((chunk = stdin.read()) !== null) {
      const inputEvents = inputParserRef.current.push(chunk);
      for (const event of inputEvents) {
        if (typeof event === "string") {
          emitInput(event);
        } else {
          if (internal_eventEmitter.current.listenerCount("paste") === 0) {
            emitInput(event.paste);
            continue;
          }
          internal_eventEmitter.current.emit("paste", event.paste);
        }
      }
    }
    if (inputParserRef.current.hasPendingEscape()) {
      schedulePendingInputFlush();
    }
  }, [stdin, emitInput, clearPendingInputFlush, schedulePendingInputFlush]);
  const attachReadableListener = (0, import_react15.useCallback)(() => {
    if (readableListenerRef.current) {
      return;
    }
    readableListenerRef.current = handleReadable;
    stdin.addListener("readable", handleReadable);
  }, [stdin, handleReadable]);
  const handleSetRawMode = (0, import_react15.useCallback)((isEnabled) => {
    if (!isRawModeSupported) {
      if (stdin === process11.stdin) {
        throw new Error("Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported");
      } else {
        throw new Error("Raw mode is not supported on the stdin provided to Ink.\nRead about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported");
      }
    }
    stdin.setEncoding("utf8");
    if (isEnabled) {
      if (rawModeEnabledCount.current === 0) {
        const isRawModeAlreadyEnabled = pendingDisableRawModeRef.current;
        pendingDisableRawModeRef.current = false;
        if (!isRawModeAlreadyEnabled) {
          stdin.ref();
          stdin.setRawMode(true);
        }
        attachReadableListener();
      }
      rawModeEnabledCount.current++;
      return;
    }
    if (rawModeEnabledCount.current === 0) {
      return;
    }
    if (--rawModeEnabledCount.current === 0) {
      clearInputState();
      pendingDisableRawModeRef.current = true;
      queueMicrotask(() => {
        if (!pendingDisableRawModeRef.current) {
          return;
        }
        disableRawMode();
      });
    }
  }, [
    isRawModeSupported,
    stdin,
    attachReadableListener,
    clearInputState,
    disableRawMode
  ]);
  const handleSetBracketedPasteMode = (0, import_react15.useCallback)((isEnabled) => {
    if (!stdout.isTTY) {
      return;
    }
    if (isEnabled) {
      if (bracketedPasteModeEnabledCount.current === 0) {
        stdout.write("\x1B[?2004h");
      }
      bracketedPasteModeEnabledCount.current++;
      return;
    }
    if (bracketedPasteModeEnabledCount.current === 0) {
      return;
    }
    if (--bracketedPasteModeEnabledCount.current === 0) {
      stdout.write("\x1B[?2004l");
    }
  }, [stdout]);
  const suspendedInputStateRef = (0, import_react15.useRef)({
    rawMode: false,
    bracketedPaste: false
  });
  const pauseInput = (0, import_react15.useCallback)(() => {
    const wasRawMode = isRawModeSupported && rawModeEnabledCount.current > 0;
    const wasBracketedPaste = bracketedPasteModeEnabledCount.current > 0;
    suspendedInputStateRef.current = {
      rawMode: wasRawMode,
      bracketedPaste: wasBracketedPaste
    };
    if (wasBracketedPaste && stdout.isTTY) {
      try {
        stdout.write("\x1B[?2004l");
      } catch {
      }
    }
    if (wasRawMode) {
      stdin.setRawMode(false);
      stdin.unref();
      clearInputState();
    }
  }, [isRawModeSupported, stdin, stdout, clearInputState]);
  const resumeInput = (0, import_react15.useCallback)(() => {
    const { rawMode, bracketedPaste } = suspendedInputStateRef.current;
    if (rawMode) {
      stdin.setEncoding("utf8");
      stdin.ref();
      stdin.setRawMode(true);
      attachReadableListener();
    }
    if (bracketedPaste && stdout.isTTY) {
      try {
        stdout.write("\x1B[?2004h");
      } catch {
      }
    }
  }, [stdin, stdout, attachReadableListener]);
  (0, import_react15.useInsertionEffect)(() => {
    onRegisterInputControl(pauseInput, resumeInput);
  }, [onRegisterInputControl, pauseInput, resumeInput]);
  const findNextFocusable = (0, import_react15.useCallback)((currentFocusables, currentActiveFocusId) => {
    const activeIndex = currentFocusables.findIndex((focusable) => {
      return focusable.id === currentActiveFocusId;
    });
    for (let index = activeIndex + 1; index < currentFocusables.length; index++) {
      const focusable = currentFocusables[index];
      if (focusable?.isActive) {
        return focusable.id;
      }
    }
    return void 0;
  }, []);
  const findPreviousFocusable = (0, import_react15.useCallback)((currentFocusables, currentActiveFocusId) => {
    const activeIndex = currentFocusables.findIndex((focusable) => {
      return focusable.id === currentActiveFocusId;
    });
    for (let index = activeIndex - 1; index >= 0; index--) {
      const focusable = currentFocusables[index];
      if (focusable?.isActive) {
        return focusable.id;
      }
    }
    return void 0;
  }, []);
  const focusNext = (0, import_react15.useCallback)(() => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const firstFocusableId = currentFocusables.find((focusable) => focusable.isActive)?.id;
        const nextFocusableId = findNextFocusable(currentFocusables, currentActiveFocusId);
        return nextFocusableId ?? firstFocusableId;
      });
      return currentFocusables;
    });
  }, [findNextFocusable]);
  const focusPrevious = (0, import_react15.useCallback)(() => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const lastFocusableId = currentFocusables.findLast((focusable) => focusable.isActive)?.id;
        const previousFocusableId = findPreviousFocusable(currentFocusables, currentActiveFocusId);
        return previousFocusableId ?? lastFocusableId;
      });
      return currentFocusables;
    });
  }, [findPreviousFocusable]);
  (0, import_react15.useEffect)(() => {
    const handleTabNavigation = (input) => {
      if (!isFocusEnabled || focusablesCountRef.current === 0)
        return;
      if (input === tab) {
        focusNext();
      }
      if (input === shiftTab) {
        focusPrevious();
      }
    };
    internal_eventEmitter.current.on("input", handleTabNavigation);
    const emitter = internal_eventEmitter.current;
    return () => {
      emitter.off("input", handleTabNavigation);
    };
  }, [isFocusEnabled, focusNext, focusPrevious]);
  const enableFocus = (0, import_react15.useCallback)(() => {
    setIsFocusEnabled(true);
  }, []);
  const disableFocus = (0, import_react15.useCallback)(() => {
    setIsFocusEnabled(false);
  }, []);
  const focus = (0, import_react15.useCallback)((id) => {
    setFocusables((currentFocusables) => {
      const hasFocusableId = currentFocusables.some((focusable) => focusable?.id === id);
      if (hasFocusableId) {
        setActiveFocusId(id);
      }
      return currentFocusables;
    });
  }, []);
  const addFocusable = (0, import_react15.useCallback)((id, { autoFocus }) => {
    setFocusables((currentFocusables) => {
      focusablesCountRef.current = currentFocusables.length + 1;
      return [
        ...currentFocusables,
        {
          id,
          isActive: true
        }
      ];
    });
    if (autoFocus) {
      setActiveFocusId((currentActiveFocusId) => {
        if (!currentActiveFocusId) {
          return id;
        }
        return currentActiveFocusId;
      });
    }
  }, []);
  const removeFocusable = (0, import_react15.useCallback)((id) => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) {
        return void 0;
      }
      return currentActiveFocusId;
    });
    setFocusables((currentFocusables) => {
      const filtered = currentFocusables.filter((focusable) => {
        return focusable.id !== id;
      });
      focusablesCountRef.current = filtered.length;
      return filtered;
    });
  }, []);
  const activateFocusable = (0, import_react15.useCallback)((id) => {
    setFocusables((currentFocusables) => currentFocusables.map((focusable) => {
      if (focusable.id !== id) {
        return focusable;
      }
      return {
        id,
        isActive: true
      };
    }));
  }, []);
  const deactivateFocusable = (0, import_react15.useCallback)((id) => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) {
        return void 0;
      }
      return currentActiveFocusId;
    });
    setFocusables((currentFocusables) => currentFocusables.map((focusable) => {
      if (focusable.id !== id) {
        return focusable;
      }
      return {
        id,
        isActive: false
      };
    }));
  }, []);
  (0, import_react15.useEffect)(() => {
    return () => {
      const canWriteToStdout = !stdout.destroyed && !stdout.writableEnded;
      if (interactive && canWriteToStdout) {
        cli_cursor_default.show(stdout);
      }
      if (isRawModeSupported && (rawModeEnabledCount.current > 0 || pendingDisableRawModeRef.current)) {
        disableRawMode();
      }
      if (bracketedPasteModeEnabledCount.current > 0) {
        if (stdout.isTTY && canWriteToStdout) {
          stdout.write("\x1B[?2004l");
        }
        bracketedPasteModeEnabledCount.current = 0;
      }
    };
  }, [stdout, isRawModeSupported, disableRawMode, interactive]);
  const appContextValue = (0, import_react15.useMemo)(() => ({
    exit: handleExit,
    waitUntilRenderFlush: onWaitUntilRenderFlush,
    suspendTerminal: onSuspendTerminal
  }), [handleExit, onWaitUntilRenderFlush, onSuspendTerminal]);
  const stdinContextValue = (0, import_react15.useMemo)(() => ({
    stdin,
    setRawMode: handleSetRawMode,
    setBracketedPasteMode: handleSetBracketedPasteMode,
    isRawModeSupported,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    internal_exitOnCtrlC: exitOnCtrlC,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    internal_eventEmitter: internal_eventEmitter.current
  }), [
    stdin,
    handleSetRawMode,
    handleSetBracketedPasteMode,
    isRawModeSupported,
    exitOnCtrlC
  ]);
  const stdoutContextValue = (0, import_react15.useMemo)(() => ({
    stdout,
    write: writeToStdout
  }), [stdout, writeToStdout]);
  const stderrContextValue = (0, import_react15.useMemo)(() => ({
    stderr,
    write: writeToStderr
  }), [stderr, writeToStderr]);
  const cursorContextValue = (0, import_react15.useMemo)(() => ({
    setCursorPosition
  }), [setCursorPosition]);
  const focusContextValue = (0, import_react15.useMemo)(() => ({
    activeId: activeFocusId,
    add: addFocusable,
    remove: removeFocusable,
    activate: activateFocusable,
    deactivate: deactivateFocusable,
    enableFocus,
    disableFocus,
    focusNext,
    focusPrevious,
    focus
  }), [
    activeFocusId,
    addFocusable,
    removeFocusable,
    activateFocusable,
    deactivateFocusable,
    enableFocus,
    disableFocus,
    focusNext,
    focusPrevious,
    focus
  ]);
  const animationContextValue = (0, import_react15.useMemo)(() => ({
    renderThrottleMs,
    subscribe: animationSubscribe
  }), [animationSubscribe, renderThrottleMs]);
  return import_react15.default.createElement(
    AppContext_default.Provider,
    { value: appContextValue },
    import_react15.default.createElement(
      StdinContext_default.Provider,
      { value: stdinContextValue },
      import_react15.default.createElement(
        StdoutContext_default.Provider,
        { value: stdoutContextValue },
        import_react15.default.createElement(
          StderrContext_default.Provider,
          { value: stderrContextValue },
          import_react15.default.createElement(
            FocusContext_default.Provider,
            { value: focusContextValue },
            import_react15.default.createElement(
              AnimationContext_default.Provider,
              { value: animationContextValue },
              import_react15.default.createElement(
                CursorContext_default.Provider,
                { value: cursorContextValue },
                import_react15.default.createElement(ErrorBoundary, { onError: handleExit }, children)
              )
            )
          )
        )
      )
    )
  );
}
App.displayName = "InternalApp";
var App_default = App;

// node_modules/ink/build/kitty-keyboard.js
var kittyFlags = {
  disambiguateEscapeCodes: 1,
  reportEventTypes: 2,
  reportAlternateKeys: 4,
  reportAllKeysAsEscapeCodes: 8,
  reportAssociatedText: 16
};
function resolveFlags(flags) {
  let result = 0;
  for (const flag of flags) {
    result |= kittyFlags[flag];
  }
  return result;
}
var kittyModifiers = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
  hyper: 16,
  meta: 32,
  capsLock: 64,
  numLock: 128
};

// node_modules/ink/build/ink.js
var noop = () => {
};
var textEncoder = new TextEncoder();
var yieldImmediate = async () => new Promise((resolve) => {
  setImmediate(resolve);
});
var kittyQueryEscapeByte = 27;
var kittyQueryOpenBracketByte = 91;
var kittyQueryQuestionMarkByte = 63;
var kittyQueryLetterByte = 117;
var zeroByte = 48;
var nineByte = 57;
var isDigitByte = (byte) => byte >= zeroByte && byte <= nineByte;
var matchKittyQueryResponse = (buffer, startIndex) => {
  if (buffer[startIndex] !== kittyQueryEscapeByte || buffer[startIndex + 1] !== kittyQueryOpenBracketByte || buffer[startIndex + 2] !== kittyQueryQuestionMarkByte) {
    return void 0;
  }
  let index = startIndex + 3;
  const digitsStartIndex = index;
  while (index < buffer.length && isDigitByte(buffer[index])) {
    index++;
  }
  if (index === digitsStartIndex) {
    return void 0;
  }
  if (index === buffer.length) {
    return { state: "partial" };
  }
  if (buffer[index] === kittyQueryLetterByte) {
    return { state: "complete", endIndex: index };
  }
  return void 0;
};
var hasCompleteKittyQueryResponse = (buffer) => {
  for (let index = 0; index < buffer.length; index++) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      return true;
    }
  }
  return false;
};
var stripKittyQueryResponsesAndTrailingPartial = (buffer) => {
  const keptBytes = [];
  let index = 0;
  while (index < buffer.length) {
    const match = matchKittyQueryResponse(buffer, index);
    if (match?.state === "complete") {
      index = match.endIndex + 1;
      continue;
    }
    if (match?.state === "partial") {
      break;
    }
    keptBytes.push(buffer[index]);
    index++;
  }
  return keptBytes;
};
var isWindowsConsole = process12.platform === "win32";
var shouldClearTerminalForFrame = ({ isTty, viewportRows, previousOutputHeight, nextOutputHeight, isUnmounting }) => {
  if (!isTty) {
    return false;
  }
  const hadPreviousFrame = previousOutputHeight > 0;
  const wasFullscreen = previousOutputHeight >= viewportRows;
  const wasOverflowing = previousOutputHeight > viewportRows;
  const isOverflowing = nextOutputHeight > viewportRows;
  const isFullscreen = nextOutputHeight >= viewportRows;
  const isLeavingFullscreen = wasFullscreen && nextOutputHeight < viewportRows;
  const shouldClearOnUnmount = isUnmounting && wasFullscreen;
  if (isWindowsConsole && (wasFullscreen || isFullscreen)) {
    return true;
  }
  return (
    // Overflowing frames still need full clear fallback.
    wasOverflowing || isOverflowing && hadPreviousFrame || // Clear when shrinking from fullscreen to non-fullscreen output.
    isLeavingFullscreen || // Preserve legacy unmount behavior for fullscreen frames: final teardown
    // render should clear once to avoid leaving a scrolled viewport state.
    shouldClearOnUnmount
  );
};
var isErrorInput = (value) => {
  return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]";
};
var getWritableStreamState = (stdout) => {
  const canWriteToStdout = !stdout.destroyed && !stdout.writableEnded && (stdout.writable ?? true);
  const hasWritableState = stdout._writableState !== void 0 || stdout.writableLength !== void 0;
  return {
    canWriteToStdout,
    hasWritableState
  };
};
var settleThrottle = (throttled, canWriteToStdout) => {
  if (!throttled || typeof throttled.flush !== "function") {
    return;
  }
  const throttledValue = throttled;
  if (canWriteToStdout) {
    throttledValue.flush();
  } else if (typeof throttledValue.cancel === "function") {
    throttledValue.cancel();
  }
};
var Ink = class {
  /**
  Whether this instance is using concurrent rendering mode.
  */
  isConcurrent;
  options;
  log;
  cursorPosition;
  throttledLog;
  isScreenReaderEnabled;
  interactive;
  renderThrottleMs;
  alternateScreen;
  // Ignore last render after unmounting a tree to prevent empty output before exit
  isUnmounted;
  isUnmounting;
  lastOutput;
  lastOutputToRender;
  lastOutputHeight;
  lastTerminalWidth;
  container;
  rootNode;
  // This variable is used only in debug mode to store full static output
  // so that it's rerendered every time, not just new static parts, like in non-debug mode
  fullStaticOutput;
  exitPromise;
  exitResult;
  beforeExitHandler;
  restoreConsole;
  unsubscribeResize;
  throttledOnRender;
  hasPendingThrottledRender = false;
  kittyProtocolEnabled = false;
  kittyFlags;
  cancelKittyDetection;
  nextRenderCommit;
  // Set while suspendTerminal() has handed the terminal to a child process.
  isSuspended = false;
  // Input pause/resume hooks registered by the App component, which owns raw
  // mode and bracketed paste state.
  pauseInput;
  resumeInput;
  constructor(options) {
    autoBind(this);
    this.options = options;
    this.rootNode = createNode("ink-root");
    this.rootNode.onComputeLayout = this.calculateLayout;
    this.isScreenReaderEnabled = options.isScreenReaderEnabled ?? process12.env["INK_SCREEN_READER"] === "true";
    this.interactive = this.resolveInteractiveOption(options.interactive);
    this.alternateScreen = false;
    const unthrottled = options.debug || this.isScreenReaderEnabled;
    const maxFps = options.maxFps ?? 30;
    const renderThrottleMs = maxFps > 0 ? Math.max(1, Math.ceil(1e3 / maxFps)) : 0;
    this.renderThrottleMs = unthrottled ? 0 : renderThrottleMs;
    if (unthrottled) {
      this.rootNode.onRender = this.onRender;
      this.throttledOnRender = void 0;
    } else {
      const throttled = throttle(this.onRender, renderThrottleMs, {
        leading: true,
        trailing: true
      });
      this.rootNode.onRender = () => {
        this.hasPendingThrottledRender = true;
        throttled();
      };
      this.throttledOnRender = throttled;
    }
    this.rootNode.onImmediateRender = this.onRender;
    this.rootNode.onStaticChange = this.handleStaticChange;
    this.log = log_update_default.create(options.stdout, {
      incremental: options.incrementalRendering
    });
    this.cursorPosition = void 0;
    this.throttledLog = unthrottled ? this.log : throttle((output) => {
      const shouldWrite = this.log.willRender(output);
      const sync = this.shouldSync();
      if (sync && shouldWrite) {
        this.options.stdout.write(bsu);
      }
      this.log(output);
      if (sync && shouldWrite) {
        this.options.stdout.write(esu);
      }
    }, void 0, {
      leading: true,
      trailing: true
    });
    this.isUnmounted = false;
    this.isUnmounting = false;
    this.isConcurrent = options.concurrent ?? false;
    this.lastOutput = "";
    this.lastOutputToRender = "";
    this.lastOutputHeight = 0;
    this.lastTerminalWidth = getWindowSize(this.options.stdout).columns;
    this.fullStaticOutput = "";
    const rootTag = options.concurrent ? import_constants2.ConcurrentRoot : import_constants2.LegacyRoot;
    this.container = reconciler_default.createContainer(this.rootNode, rootTag, null, false, null, "id", () => {
    }, () => {
    }, () => {
    }, () => {
    });
    this.unsubscribeExit = (0, import_signal_exit2.default)(this.unmount, { alwaysLast: false });
    this.setAlternateScreen(Boolean(options.alternateScreen));
    if (process12.env["DEV"] === "true") {
      reconciler_default.injectIntoDevTools();
    }
    if (options.patchConsole) {
      this.patchConsole();
    }
    if (this.interactive) {
      options.stdout.on("resize", this.resized);
      this.unsubscribeResize = () => {
        options.stdout.off("resize", this.resized);
      };
    }
    this.initKittyKeyboard();
    this.exitPromise = new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });
    void this.exitPromise.catch(noop);
  }
  resized = () => {
    const currentWidth = getWindowSize(this.options.stdout).columns;
    if (currentWidth < this.lastTerminalWidth) {
      this.log.clear();
      this.lastOutput = "";
      this.lastOutputToRender = "";
    }
    this.calculateLayout();
    emitLayoutListeners(this.rootNode);
    this.onRender();
    this.lastTerminalWidth = currentWidth;
  };
  resolveExitPromise = () => {
  };
  rejectExitPromise = () => {
  };
  unsubscribeExit = () => {
  };
  handleAppExit = (errorOrResult) => {
    if (this.isUnmounted || this.isUnmounting) {
      return;
    }
    if (isErrorInput(errorOrResult)) {
      this.unmount(errorOrResult);
      return;
    }
    this.exitResult = errorOrResult;
    this.unmount();
  };
  setCursorPosition = (position) => {
    this.cursorPosition = position;
    this.log.setCursorPosition(position);
  };
  restoreLastOutput = () => {
    if (!this.interactive) {
      return;
    }
    this.log.setCursorPosition(this.cursorPosition);
    this.log(this.lastOutputToRender || this.lastOutput + "\n");
  };
  calculateLayout = () => {
    const terminalWidth = getWindowSize(this.options.stdout).columns;
    this.rootNode.yogaNode.setWidth(terminalWidth);
    this.rootNode.yogaNode.calculateLayout(void 0, void 0, src_default.DIRECTION_LTR);
  };
  // Resets `fullStaticOutput` when the <Static> identity changes so stale items from a previous instance are not replayed on future rewrites.
  handleStaticChange = () => {
    this.fullStaticOutput = "";
  };
  onRender = () => {
    this.hasPendingThrottledRender = false;
    if (this.isUnmounted) {
      return;
    }
    if (this.isSuspended) {
      if (this.nextRenderCommit) {
        this.nextRenderCommit.resolve();
        this.nextRenderCommit = void 0;
      }
      return;
    }
    if (this.nextRenderCommit) {
      this.nextRenderCommit.resolve();
      this.nextRenderCommit = void 0;
    }
    const startTime = performance.now();
    const { output, outputHeight, staticOutput } = renderer_default(this.rootNode, this.isScreenReaderEnabled);
    this.options.onRender?.({ renderTime: performance.now() - startTime });
    const hasStaticOutput = staticOutput && staticOutput !== "\n";
    if (this.options.debug) {
      if (hasStaticOutput) {
        this.fullStaticOutput += staticOutput;
      }
      this.lastOutput = output;
      this.lastOutputToRender = output;
      this.lastOutputHeight = outputHeight;
      this.options.stdout.write(this.fullStaticOutput + output);
      return;
    }
    if (!this.interactive) {
      if (hasStaticOutput) {
        this.options.stdout.write(staticOutput);
      }
      this.lastOutput = output;
      this.lastOutputToRender = output + "\n";
      this.lastOutputHeight = outputHeight;
      return;
    }
    if (this.isScreenReaderEnabled) {
      const sync = this.shouldSync();
      if (sync) {
        this.options.stdout.write(bsu);
      }
      if (hasStaticOutput) {
        const erase = this.lastOutputHeight > 0 ? base_exports.eraseLines(this.lastOutputHeight) : "";
        this.options.stdout.write(erase + staticOutput);
        this.lastOutputHeight = 0;
      }
      if (output === this.lastOutput && !hasStaticOutput) {
        if (sync) {
          this.options.stdout.write(esu);
        }
        return;
      }
      const terminalWidth = getWindowSize(this.options.stdout).columns;
      const wrappedOutput = wrapAnsi(output, terminalWidth, {
        trim: false,
        hard: true
      });
      if (hasStaticOutput) {
        this.options.stdout.write(wrappedOutput);
      } else {
        const erase = this.lastOutputHeight > 0 ? base_exports.eraseLines(this.lastOutputHeight) : "";
        this.options.stdout.write(erase + wrappedOutput);
      }
      this.lastOutput = output;
      this.lastOutputToRender = wrappedOutput;
      this.lastOutputHeight = wrappedOutput === "" ? 0 : wrappedOutput.split("\n").length;
      if (sync) {
        this.options.stdout.write(esu);
      }
      return;
    }
    if (hasStaticOutput) {
      this.fullStaticOutput += staticOutput;
    }
    this.renderInteractiveFrame(output, outputHeight, hasStaticOutput ? staticOutput : "");
  };
  render(node) {
    const tree = import_react16.default.createElement(
      accessibilityContext.Provider,
      { value: { isScreenReaderEnabled: this.isScreenReaderEnabled } },
      import_react16.default.createElement(App_default, { stdin: this.options.stdin, stdout: this.options.stdout, stderr: this.options.stderr, exitOnCtrlC: this.options.exitOnCtrlC, interactive: this.interactive, renderThrottleMs: this.renderThrottleMs, writeToStdout: this.writeToStdout, writeToStderr: this.writeToStderr, setCursorPosition: this.setCursorPosition, onExit: this.handleAppExit, onWaitUntilRenderFlush: this.waitUntilRenderFlush, onSuspendTerminal: this.suspendTerminal, onRegisterInputControl: this.registerInputControl }, node)
    );
    if (this.options.concurrent) {
      reconciler_default.updateContainer(tree, this.container, null, noop);
    } else {
      reconciler_default.updateContainerSync(tree, this.container, null, noop);
      reconciler_default.flushSyncWork();
    }
  }
  writeToStdout(data) {
    if (this.isUnmounted) {
      return;
    }
    if (this.isSuspended) {
      return;
    }
    if (this.options.debug) {
      this.options.stdout.write(data + this.fullStaticOutput + this.lastOutput);
      return;
    }
    if (!this.interactive) {
      this.options.stdout.write(data);
      return;
    }
    const sync = this.shouldSync();
    if (sync) {
      this.options.stdout.write(bsu);
    }
    this.log.clear();
    this.options.stdout.write(data);
    this.restoreLastOutput();
    if (sync) {
      this.options.stdout.write(esu);
    }
  }
  writeToStderr(data) {
    if (this.isUnmounted) {
      return;
    }
    if (this.isSuspended) {
      return;
    }
    if (this.options.debug) {
      this.options.stderr.write(data);
      this.options.stdout.write(this.fullStaticOutput + this.lastOutput);
      return;
    }
    if (!this.interactive) {
      this.options.stderr.write(data);
      return;
    }
    const sync = this.shouldSync();
    if (sync) {
      this.options.stdout.write(bsu);
    }
    this.log.clear();
    this.options.stderr.write(data);
    this.restoreLastOutput();
    if (sync) {
      this.options.stdout.write(esu);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  unmount(error) {
    if (this.isUnmounted || this.isUnmounting) {
      return;
    }
    this.isUnmounting = true;
    if (this.beforeExitHandler) {
      process12.off("beforeExit", this.beforeExitHandler);
      this.beforeExitHandler = void 0;
    }
    const stdout = this.options.stdout;
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stdout);
    settleThrottle(this.throttledOnRender, canWriteToStdout);
    if (canWriteToStdout) {
      const shouldRenderFinalFrame = !this.throttledOnRender || !this.hasPendingThrottledRender && this.fullStaticOutput === "";
      if (shouldRenderFinalFrame) {
        this.calculateLayout();
        this.onRender();
      }
    }
    this.isUnmounted = true;
    this.unsubscribeExit();
    settleThrottle(this.throttledLog, canWriteToStdout);
    if (typeof this.restoreConsole === "function") {
      this.restoreConsole();
    }
    const finishUnmount = () => {
      if (typeof this.unsubscribeResize === "function") {
        this.unsubscribeResize();
      }
      if (this.cancelKittyDetection) {
        this.cancelKittyDetection();
      }
      if (canWriteToStdout) {
        if (this.kittyProtocolEnabled) {
          this.writeBestEffort(this.options.stdout, "\x1B[<u");
        }
        if (this.alternateScreen) {
          this.writeBestEffort(this.options.stdout, base_exports.exitAlternativeScreen);
          this.writeBestEffort(this.options.stdout, showCursorEscape);
          this.alternateScreen = false;
        }
        if (!this.interactive) {
          this.options.stdout.write(this.options.debug ? "\n" : this.lastOutput + "\n");
        } else if (!this.options.debug) {
          this.log.done();
        }
      }
      this.kittyProtocolEnabled = false;
      instances_default.delete(this.options.stdout);
      const { exitResult } = this;
      const resolveOrReject = () => {
        if (isErrorInput(error)) {
          this.rejectExitPromise(error);
        } else {
          this.resolveExitPromise(exitResult);
        }
      };
      const isProcessExiting = error !== void 0 && !isErrorInput(error);
      if (isProcessExiting) {
        resolveOrReject();
      } else if (canWriteToStdout && hasWritableState) {
        this.options.stdout.write("", resolveOrReject);
      } else {
        setImmediate(resolveOrReject);
      }
    };
    const concurrentReconciler = reconciler_default;
    if (this.options.concurrent) {
      reconciler_default.updateContainerSync(null, this.container, null, noop);
      reconciler_default.flushSyncWork();
      concurrentReconciler.flushPassiveEffects?.();
      finishUnmount();
    } else {
      reconciler_default.updateContainerSync(null, this.container, null, noop);
      reconciler_default.flushSyncWork();
      finishUnmount();
    }
  }
  async waitUntilExit() {
    if (!this.beforeExitHandler) {
      this.beforeExitHandler = () => {
        this.unmount();
      };
      process12.once("beforeExit", this.beforeExitHandler);
    }
    return this.exitPromise;
  }
  async waitUntilRenderFlush() {
    if (this.isUnmounted || this.isUnmounting) {
      await this.awaitExit();
      return;
    }
    await yieldImmediate();
    if (this.isUnmounted || this.isUnmounting) {
      await this.awaitExit();
      return;
    }
    if (this.isConcurrent && this.hasPendingConcurrentWork()) {
      await Promise.race([this.awaitNextRender(), this.awaitExit()]);
      if (this.isUnmounted || this.isUnmounting) {
        this.nextRenderCommit = void 0;
        await this.awaitExit();
        return;
      }
    }
    reconciler_default.flushSyncWork();
    const stdout = this.options.stdout;
    const { canWriteToStdout, hasWritableState } = getWritableStreamState(stdout);
    settleThrottle(this.throttledOnRender, canWriteToStdout);
    settleThrottle(this.throttledLog, canWriteToStdout);
    if (canWriteToStdout && hasWritableState) {
      await new Promise((resolve) => {
        this.options.stdout.write("", () => {
          resolve();
        });
      });
      return;
    }
    await yieldImmediate();
  }
  clear() {
    if (this.interactive && !this.options.debug) {
      this.log.clear();
      this.log.sync(this.lastOutputToRender || this.lastOutput + "\n");
    }
  }
  patchConsole() {
    if (this.options.debug) {
      return;
    }
    this.restoreConsole = dist_default((stream, data) => {
      if (stream === "stdout") {
        this.writeToStdout(data);
      }
      if (stream === "stderr") {
        const isReactMessage = data.startsWith("The above error occurred");
        if (!isReactMessage) {
          this.writeToStderr(data);
        }
      }
    });
  }
  registerInputControl(pauseInput, resumeInput) {
    this.pauseInput = pauseInput;
    this.resumeInput = resumeInput;
  }
  async suspendTerminal(callback) {
    this.beginSuspend();
    if (callback) {
      try {
        await callback();
      } finally {
        await this.endSuspend();
      }
      return void 0;
    }
    const resume = async () => {
      await this.endSuspend();
    };
    return { resume, [Symbol.asyncDispose]: resume };
  }
  setAlternateScreen(enabled) {
    this.alternateScreen = this.resolveAlternateScreenOption(enabled, this.interactive);
    if (this.alternateScreen) {
      this.writeBestEffort(this.options.stdout, base_exports.enterAlternativeScreen);
      this.writeBestEffort(this.options.stdout, hideCursorEscape);
    }
  }
  resolveInteractiveOption(interactive) {
    return interactive ?? (!is_in_ci_default && Boolean(this.options.stdout.isTTY));
  }
  resolveAlternateScreenOption(alternateScreen, interactive) {
    return Boolean(alternateScreen) && interactive && Boolean(this.options.stdout.isTTY);
  }
  shouldSync() {
    return shouldSynchronize(this.options.stdout, this.interactive);
  }
  // Best-effort write: streams may already be destroyed during shutdown.
  writeBestEffort(stream, data) {
    try {
      stream.write(data);
    } catch {
    }
  }
  // Waits for the exit promise to settle, suppressing any rejection.
  // Errors are surfaced via waitUntilExit() instead.
  async awaitExit() {
    try {
      await this.exitPromise;
    } catch {
    }
  }
  hasPendingConcurrentWork() {
    const concurrentContainer = this.container;
    return (concurrentContainer.pendingLanes ?? 0) !== 0 && concurrentContainer.callbackNode !== void 0 && concurrentContainer.callbackNode !== null;
  }
  async awaitNextRender() {
    if (!this.nextRenderCommit) {
      let resolveRender;
      const promise = new Promise((resolve) => {
        resolveRender = resolve;
      });
      this.nextRenderCommit = { promise, resolve: resolveRender };
    }
    return this.nextRenderCommit.promise;
  }
  renderInteractiveFrame(output, outputHeight, staticOutput) {
    const hasStaticOutput = staticOutput !== "";
    const isTty = this.options.stdout.isTTY;
    const viewportRows = isTty ? getWindowSize(this.options.stdout).rows : 24;
    const isFullscreen = isTty && outputHeight >= viewportRows;
    const outputToRender = isFullscreen ? output : output + "\n";
    const shouldClearTerminal = shouldClearTerminalForFrame({
      isTty,
      viewportRows,
      previousOutputHeight: this.lastOutputHeight,
      nextOutputHeight: outputHeight,
      isUnmounting: this.isUnmounting
    });
    if (shouldClearTerminal) {
      const sync = this.shouldSync();
      if (sync) {
        this.options.stdout.write(bsu);
      }
      this.options.stdout.write(base_exports.clearTerminal + this.fullStaticOutput + outputToRender);
      this.lastOutput = output;
      this.lastOutputToRender = outputToRender;
      this.lastOutputHeight = outputHeight;
      this.log.sync(outputToRender);
      if (sync) {
        this.options.stdout.write(esu);
      }
      return;
    }
    if (hasStaticOutput) {
      const sync = this.shouldSync();
      if (sync) {
        this.options.stdout.write(bsu);
      }
      this.log.clear();
      this.options.stdout.write(staticOutput);
      this.log(outputToRender);
      if (sync) {
        this.options.stdout.write(esu);
      }
    } else if (output !== this.lastOutput || this.log.isCursorDirty()) {
      this.throttledLog(outputToRender);
    }
    this.lastOutput = output;
    this.lastOutputToRender = outputToRender;
    this.lastOutputHeight = outputHeight;
  }
  initKittyKeyboard() {
    if (!this.options.kittyKeyboard) {
      return;
    }
    const opts = this.options.kittyKeyboard;
    const mode = opts.mode ?? "auto";
    if (mode === "disabled") {
      return;
    }
    const flags = opts.flags ?? ["disambiguateEscapeCodes"];
    if (mode === "enabled") {
      if (this.options.stdin.isTTY && this.options.stdout.isTTY) {
        this.enableKittyProtocol(flags);
      }
      return;
    }
    if (!this.interactive || !this.options.stdin.isTTY || !this.options.stdout.isTTY) {
      return;
    }
    this.confirmKittySupport(flags);
  }
  confirmKittySupport(flags) {
    const { stdin, stdout } = this.options;
    let responseBuffer = [];
    const cleanup = () => {
      this.cancelKittyDetection = void 0;
      clearTimeout(timer);
      stdin.removeListener("data", onData);
      const remaining = stripKittyQueryResponsesAndTrailingPartial(responseBuffer);
      responseBuffer = [];
      if (remaining.length > 0) {
        stdin.unshift(Uint8Array.from(remaining));
      }
    };
    const onData = (data) => {
      const chunk = typeof data === "string" ? textEncoder.encode(data) : data;
      for (const byte of chunk) {
        responseBuffer.push(byte);
      }
      if (hasCompleteKittyQueryResponse(responseBuffer)) {
        cleanup();
        if (!this.isUnmounted) {
          this.enableKittyProtocol(flags);
        }
      }
    };
    stdin.on("data", onData);
    const timer = setTimeout(cleanup, 200);
    this.cancelKittyDetection = cleanup;
    stdout.write("\x1B[?u");
  }
  enableKittyProtocol(flags) {
    this.options.stdout.write(`\x1B[>${resolveFlags(flags)}u`);
    this.kittyProtocolEnabled = true;
    this.kittyFlags = flags;
  }
  beginSuspend() {
    if (this.isSuspended) {
      throw new Error("The terminal is already suspended. Resume the current suspension before suspending again.");
    }
    this.isSuspended = true;
    if (!this.interactive || this.isUnmounted || this.isUnmounting) {
      return;
    }
    try {
      const stdout = this.options.stdout;
      const { canWriteToStdout } = getWritableStreamState(stdout);
      settleThrottle(this.throttledOnRender, canWriteToStdout);
      settleThrottle(this.throttledLog, canWriteToStdout);
      if (canWriteToStdout) {
        this.log.clear();
        this.log.done();
        if (this.kittyProtocolEnabled) {
          this.writeBestEffort(this.options.stdout, "\x1B[<u");
        }
        if (this.alternateScreen) {
          this.writeBestEffort(this.options.stdout, base_exports.exitAlternativeScreen);
        }
      }
      this.pauseInput?.();
    } catch (error) {
      this.isSuspended = false;
      try {
        this.resumeInput?.();
      } catch {
      }
      throw error;
    }
  }
  async endSuspend() {
    if (!this.isSuspended) {
      return;
    }
    this.isSuspended = false;
    this.resumeInput?.();
    if (!this.interactive || this.isUnmounted || this.isUnmounting) {
      return;
    }
    const stdout = this.options.stdout;
    const { canWriteToStdout } = getWritableStreamState(stdout);
    if (canWriteToStdout) {
      if (this.alternateScreen) {
        this.writeBestEffort(this.options.stdout, base_exports.enterAlternativeScreen);
      }
      if (this.kittyProtocolEnabled && this.kittyFlags) {
        this.writeBestEffort(this.options.stdout, `\x1B[>${resolveFlags(this.kittyFlags)}u`);
      }
    }
    this.lastOutput = "";
    this.lastOutputToRender = "";
    this.lastOutputHeight = 0;
    this.log.reset();
    try {
      this.calculateLayout();
      this.onRender();
      await this.waitUntilRenderFlush();
    } catch {
    }
  }
};

// node_modules/ink/build/render.js
var render = (node, options) => {
  const inkOptions = {
    stdout: process13.stdout,
    stdin: process13.stdin,
    stderr: process13.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    maxFps: 30,
    incrementalRendering: false,
    concurrent: false,
    alternateScreen: false,
    ...getOptions(options)
  };
  const instance = getInstance(inkOptions.stdout, () => new Ink(inkOptions));
  instance.render(node);
  return {
    rerender: instance.render,
    unmount() {
      instance.unmount();
    },
    waitUntilExit: instance.waitUntilExit,
    waitUntilRenderFlush: instance.waitUntilRenderFlush,
    cleanup() {
      instance.unmount();
    },
    clear: instance.clear
  };
};
var render_default = render;
var getOptions = (stdout = {}) => {
  if (stdout instanceof Stream) {
    return {
      stdout,
      stdin: process13.stdin
    };
  }
  return stdout;
};
var getInstance = (stdout, createInstance) => {
  const instance = instances_default.get(stdout);
  if (instance === void 0) {
    const newInstance = createInstance();
    instances_default.set(stdout, newInstance);
    return newInstance;
  }
  process13.stderr.write("Warning: render() was called again for the same stdout before the previous Ink instance was unmounted. Reusing stdout across multiple render() calls is unsupported. Call unmount() first.\n");
  return instance;
};

// node_modules/ink/build/render-to-string.js
var import_constants3 = __toESM(require_constants(), 1);
var renderToString = (node, options) => {
  const columns = options?.columns ?? 80;
  const rootNode = createNode("ink-root");
  let capturedStaticOutput = "";
  rootNode.onComputeLayout = () => {
    rootNode.yogaNode.setWidth(columns);
    rootNode.yogaNode.calculateLayout(void 0, void 0, src_default.DIRECTION_LTR);
  };
  rootNode.onImmediateRender = () => {
    const { staticOutput } = renderer_default(rootNode, false);
    if (staticOutput && staticOutput !== "\n") {
      capturedStaticOutput += staticOutput;
    }
  };
  let uncaughtError;
  const container = reconciler_default.createContainer(rootNode, import_constants3.LegacyRoot, null, false, null, "render-to-string", (error) => {
    uncaughtError ??= error;
  }, () => {
  }, () => {
  }, () => {
  });
  let teardownSucceeded = false;
  try {
    reconciler_default.updateContainerSync(node, container, null, () => {
    });
    reconciler_default.flushSyncWork();
    const { output } = renderer_default(rootNode, false);
    reconciler_default.updateContainerSync(null, container, null, () => {
    });
    reconciler_default.flushSyncWork();
    teardownSucceeded = true;
    rootNode.yogaNode.free();
    if (uncaughtError !== void 0) {
      throw uncaughtError instanceof Error ? uncaughtError : (
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        new Error(String(uncaughtError))
      );
    }
    const normalizedStaticOutput = capturedStaticOutput.endsWith("\n") ? capturedStaticOutput.slice(0, -1) : capturedStaticOutput;
    if (normalizedStaticOutput && output) {
      return normalizedStaticOutput + "\n" + output;
    }
    return normalizedStaticOutput || output;
  } finally {
    if (!teardownSucceeded && rootNode.yogaNode) {
      try {
        rootNode.yogaNode.freeRecursive();
      } catch {
      }
    }
  }
};
var render_to_string_default = renderToString;

// node_modules/ink/build/components/Static.js
var import_react17 = __toESM(require_react(), 1);
function Static(props) {
  const { items, children: render2, style: customStyle } = props;
  const [index, setIndex] = (0, import_react17.useState)(0);
  const itemsToRender = (0, import_react17.useMemo)(() => {
    return items.slice(index);
  }, [items, index]);
  (0, import_react17.useLayoutEffect)(() => {
    setIndex(items.length);
  }, [items.length]);
  const children = itemsToRender.map((item, itemIndex) => {
    return render2(item, index + itemIndex);
  });
  const style = (0, import_react17.useMemo)(() => ({
    position: "absolute",
    flexDirection: "column",
    ...customStyle
  }), [customStyle]);
  return import_react17.default.createElement("ink-box", { internal_static: true, style }, children);
}

// node_modules/ink/build/components/Transform.js
var import_react18 = __toESM(require_react(), 1);
function Transform({ children, transform, accessibilityLabel }) {
  const { isScreenReaderEnabled } = (0, import_react18.useContext)(accessibilityContext);
  if (children === void 0 || children === null) {
    return null;
  }
  return import_react18.default.createElement("ink-text", { style: { flexGrow: 0, flexShrink: 1, flexDirection: "row" }, internal_transform: transform }, isScreenReaderEnabled && accessibilityLabel ? accessibilityLabel : children);
}

// node_modules/ink/build/components/Newline.js
var import_react19 = __toESM(require_react(), 1);
function Newline({ count = 1 }) {
  return import_react19.default.createElement("ink-text", null, "\n".repeat(count));
}

// node_modules/ink/build/components/Spacer.js
var import_react20 = __toESM(require_react(), 1);
function Spacer() {
  return import_react20.default.createElement(Box_default, { flexGrow: 1 });
}

// node_modules/ink/build/hooks/use-input.js
var import_react22 = __toESM(require_react(), 1);

// node_modules/ink/build/parse-keypress.js
var textDecoder = new TextDecoder();
var metaKeyCodeRe = /^(?:\x1b)([a-zA-Z0-9])$/;
var fnKeyRe = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;
var keyName = {
  /* xterm/gnome ESC O letter */
  OP: "f1",
  OQ: "f2",
  OR: "f3",
  OS: "f4",
  /* vt220-style ESC [ letter (e.g. Ctrl+F1 sends ESC [ 1 ; 5 P) */
  "[P": "f1",
  "[Q": "f2",
  "[R": "f3",
  "[S": "f4",
  /* xterm/rxvt ESC [ number ~ */
  "[11~": "f1",
  "[12~": "f2",
  "[13~": "f3",
  "[14~": "f4",
  /* from Cygwin and used in libuv */
  "[[A": "f1",
  "[[B": "f2",
  "[[C": "f3",
  "[[D": "f4",
  "[[E": "f5",
  /* common */
  "[15~": "f5",
  "[17~": "f6",
  "[18~": "f7",
  "[19~": "f8",
  "[20~": "f9",
  "[21~": "f10",
  "[23~": "f11",
  "[24~": "f12",
  /* xterm ESC [ letter */
  "[A": "up",
  "[B": "down",
  "[C": "right",
  "[D": "left",
  "[E": "clear",
  "[F": "end",
  "[H": "home",
  /* xterm/gnome ESC O letter */
  OA: "up",
  OB: "down",
  OC: "right",
  OD: "left",
  OE: "clear",
  OF: "end",
  OH: "home",
  /* xterm/rxvt ESC [ number ~ */
  "[1~": "home",
  "[2~": "insert",
  "[3~": "delete",
  "[4~": "end",
  "[5~": "pageup",
  "[6~": "pagedown",
  /* putty */
  "[[5~": "pageup",
  "[[6~": "pagedown",
  /* rxvt */
  "[7~": "home",
  "[8~": "end",
  /* rxvt keys with modifiers */
  "[a": "up",
  "[b": "down",
  "[c": "right",
  "[d": "left",
  "[e": "clear",
  "[2$": "insert",
  "[3$": "delete",
  "[5$": "pageup",
  "[6$": "pagedown",
  "[7$": "home",
  "[8$": "end",
  Oa: "up",
  Ob: "down",
  Oc: "right",
  Od: "left",
  Oe: "clear",
  "[2^": "insert",
  "[3^": "delete",
  "[5^": "pageup",
  "[6^": "pagedown",
  "[7^": "home",
  "[8^": "end",
  /* misc. */
  "[Z": "tab"
};
var nonAlphanumericKeys = [...Object.values(keyName), "backspace"];
var isShiftKey = (code) => {
  return [
    "[a",
    "[b",
    "[c",
    "[d",
    "[e",
    "[2$",
    "[3$",
    "[5$",
    "[6$",
    "[7$",
    "[8$",
    "[Z"
  ].includes(code);
};
var isCtrlKey = (code) => {
  return [
    "Oa",
    "Ob",
    "Oc",
    "Od",
    "Oe",
    "[2^",
    "[3^",
    "[5^",
    "[6^",
    "[7^",
    "[8^"
  ].includes(code);
};
var kittyKeyRe = /^\x1b\[(\d+)(?:;(\d+)(?::(\d+))?(?:;([\d:]+))?)?u$/;
var kittySpecialKeyRe = /^\x1b\[(\d+);(\d+):(\d+)([A-Za-z~])$/;
var kittySpecialLetterKeys = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  E: "clear",
  F: "end",
  H: "home",
  P: "f1",
  Q: "f2",
  R: "f3",
  S: "f4"
};
var kittySpecialNumberKeys = {
  2: "insert",
  3: "delete",
  5: "pageup",
  6: "pagedown",
  7: "home",
  8: "end",
  11: "f1",
  12: "f2",
  13: "f3",
  14: "f4",
  15: "f5",
  17: "f6",
  18: "f7",
  19: "f8",
  20: "f9",
  21: "f10",
  23: "f11",
  24: "f12"
};
var kittyCodepointNames = {
  27: "escape",
  // 13 (return) and 32 (space) are handled before this lookup
  // in parseKittyKeypress so they can be marked as printable.
  9: "tab",
  127: "backspace",
  8: "backspace",
  57358: "capslock",
  57359: "scrolllock",
  57360: "numlock",
  57361: "printscreen",
  57362: "pause",
  57363: "menu",
  57376: "f13",
  57377: "f14",
  57378: "f15",
  57379: "f16",
  57380: "f17",
  57381: "f18",
  57382: "f19",
  57383: "f20",
  57384: "f21",
  57385: "f22",
  57386: "f23",
  57387: "f24",
  57388: "f25",
  57389: "f26",
  57390: "f27",
  57391: "f28",
  57392: "f29",
  57393: "f30",
  57394: "f31",
  57395: "f32",
  57396: "f33",
  57397: "f34",
  57398: "f35",
  57399: "kp0",
  57400: "kp1",
  57401: "kp2",
  57402: "kp3",
  57403: "kp4",
  57404: "kp5",
  57405: "kp6",
  57406: "kp7",
  57407: "kp8",
  57408: "kp9",
  57409: "kpdecimal",
  57410: "kpdivide",
  57411: "kpmultiply",
  57412: "kpsubtract",
  57413: "kpadd",
  57414: "kpenter",
  57415: "kpequal",
  57416: "kpseparator",
  57417: "kpleft",
  57418: "kpright",
  57419: "kpup",
  57420: "kpdown",
  57421: "kppageup",
  57422: "kppagedown",
  57423: "kphome",
  57424: "kpend",
  57425: "kpinsert",
  57426: "kpdelete",
  57427: "kpbegin",
  57428: "mediaplay",
  57429: "mediapause",
  57430: "mediaplaypause",
  57431: "mediareverse",
  57432: "mediastop",
  57433: "mediafastforward",
  57434: "mediarewind",
  57435: "mediatracknext",
  57436: "mediatrackprevious",
  57437: "mediarecord",
  57438: "lowervolume",
  57439: "raisevolume",
  57440: "mutevolume",
  57441: "leftshift",
  57442: "leftcontrol",
  57443: "leftalt",
  57444: "leftsuper",
  57445: "lefthyper",
  57446: "leftmeta",
  57447: "rightshift",
  57448: "rightcontrol",
  57449: "rightalt",
  57450: "rightsuper",
  57451: "righthyper",
  57452: "rightmeta",
  57453: "isoLevel3Shift",
  57454: "isoLevel5Shift"
};
var isValidCodepoint = (cp) => cp >= 0 && cp <= 1114111 && !(cp >= 55296 && cp <= 57343);
var safeFromCodePoint = (cp) => isValidCodepoint(cp) ? String.fromCodePoint(cp) : "?";
function resolveEventType(value) {
  if (value === 3)
    return "release";
  if (value === 2)
    return "repeat";
  return "press";
}
function parseKittyModifiers(modifiers) {
  return {
    ctrl: !!(modifiers & kittyModifiers.ctrl),
    shift: !!(modifiers & kittyModifiers.shift),
    meta: !!(modifiers & (kittyModifiers.meta | kittyModifiers.alt)),
    super: !!(modifiers & kittyModifiers.super),
    hyper: !!(modifiers & kittyModifiers.hyper),
    capsLock: !!(modifiers & kittyModifiers.capsLock),
    numLock: !!(modifiers & kittyModifiers.numLock)
  };
}
var parseKittyKeypress = (s) => {
  const match = kittyKeyRe.exec(s);
  if (!match)
    return null;
  const codepoint = parseInt(match[1], 10);
  const modifiers = match[2] ? Math.max(0, parseInt(match[2], 10) - 1) : 0;
  const eventType = match[3] ? parseInt(match[3], 10) : 1;
  const textField = match[4];
  if (!isValidCodepoint(codepoint)) {
    return null;
  }
  let text;
  if (textField) {
    text = textField.split(":").map((cp) => safeFromCodePoint(parseInt(cp, 10))).join("");
  }
  let name;
  let isPrintable;
  if (codepoint === 32) {
    name = "space";
    isPrintable = true;
  } else if (codepoint === 13) {
    name = "return";
    isPrintable = true;
  } else if (kittyCodepointNames[codepoint]) {
    name = kittyCodepointNames[codepoint];
    isPrintable = false;
  } else if (codepoint >= 1 && codepoint <= 26) {
    name = String.fromCodePoint(codepoint + 96);
    isPrintable = false;
  } else {
    name = safeFromCodePoint(codepoint).toLowerCase();
    isPrintable = true;
  }
  if (isPrintable && !text) {
    text = safeFromCodePoint(codepoint);
  }
  return {
    name,
    ...parseKittyModifiers(modifiers),
    eventType: resolveEventType(eventType),
    sequence: s,
    raw: s,
    isKittyProtocol: true,
    isPrintable,
    text
  };
};
var parseKittySpecialKey = (s) => {
  const match = kittySpecialKeyRe.exec(s);
  if (!match)
    return null;
  const number = parseInt(match[1], 10);
  const modifiers = Math.max(0, parseInt(match[2], 10) - 1);
  const eventType = parseInt(match[3], 10);
  const terminator = match[4];
  const name = terminator === "~" ? kittySpecialNumberKeys[number] : kittySpecialLetterKeys[terminator];
  if (!name)
    return null;
  return {
    name,
    ...parseKittyModifiers(modifiers),
    eventType: resolveEventType(eventType),
    sequence: s,
    raw: s,
    isKittyProtocol: true,
    isPrintable: false
  };
};
var parseKeypress = (s = "") => {
  let parts;
  if (s instanceof Uint8Array) {
    if (s[0] > 127 && s[1] === void 0) {
      s[0] -= 128;
      s = "\x1B" + textDecoder.decode(s);
    } else {
      s = textDecoder.decode(s);
    }
  } else if (s !== void 0 && typeof s !== "string") {
    s = String(s);
  } else if (!s) {
    s = "";
  }
  const kittyResult = parseKittyKeypress(s);
  if (kittyResult)
    return kittyResult;
  const kittySpecialResult = parseKittySpecialKey(s);
  if (kittySpecialResult)
    return kittySpecialResult;
  if (kittyKeyRe.test(s)) {
    return {
      name: "",
      ctrl: false,
      meta: false,
      shift: false,
      sequence: s,
      raw: s,
      isKittyProtocol: true,
      isPrintable: false
    };
  }
  const key = {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    sequence: s,
    raw: s
  };
  key.sequence = key.sequence || s || key.name;
  if (s === "\r" || s === "\x1B\r") {
    key.raw = void 0;
    key.name = "return";
    key.meta = s.length === 2;
  } else if (s === "\n") {
    key.name = "enter";
  } else if (s === "	") {
    key.name = "tab";
  } else if (s === "\b" || s === "\x1B\b") {
    key.name = "backspace";
    key.meta = s.charAt(0) === "\x1B";
  } else if (s === "\x7F" || s === "\x1B\x7F") {
    key.name = "backspace";
    key.meta = s.charAt(0) === "\x1B";
  } else if (s === "\x1B" || s === "\x1B\x1B") {
    key.name = "escape";
    key.meta = s.length === 2;
  } else if (s === " " || s === "\x1B ") {
    key.name = "space";
    key.meta = s.length === 2;
  } else if (s.length === 1 && s <= "") {
    key.name = String.fromCharCode(s.charCodeAt(0) + "a".charCodeAt(0) - 1);
    key.ctrl = true;
  } else if (s.length === 1 && s >= "0" && s <= "9") {
    key.name = "number";
  } else if (s.length === 1 && s >= "a" && s <= "z") {
    key.name = s;
  } else if (s.length === 1 && s >= "A" && s <= "Z") {
    key.name = s.toLowerCase();
    key.shift = true;
  } else if (parts = metaKeyCodeRe.exec(s)) {
    key.name = parts[1].toLowerCase();
    key.meta = true;
    key.shift = /^[A-Z]$/.test(parts[1]);
  } else if (parts = fnKeyRe.exec(s)) {
    const segs = [...s];
    if (segs[0] === "\x1B" && segs[1] === "\x1B") {
      key.meta = true;
    }
    const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
    const modifier = (parts[3] || parts[5] || 1) - 1;
    key.ctrl = !!(modifier & 4);
    key.meta = key.meta || !!(modifier & 10);
    key.shift = !!(modifier & 1);
    key.code = code;
    key.name = keyName[code] ?? "";
    key.shift = isShiftKey(code) || key.shift;
    key.ctrl = isCtrlKey(code) || key.ctrl;
  }
  return key;
};
var parse_keypress_default = parseKeypress;

// node_modules/ink/build/hooks/use-stdin.js
var import_react21 = __toESM(require_react(), 1);
var useStdin = () => (0, import_react21.useContext)(StdinContext_default);
var useStdinContext = () => (0, import_react21.useContext)(StdinContext_default);
var use_stdin_default = useStdin;

// node_modules/ink/build/hooks/use-input.js
var useInput = (inputHandler, options = {}) => {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdinContext();
  (0, import_react22.useEffect)(() => {
    if (options.isActive === false) {
      return;
    }
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [options.isActive, setRawMode]);
  const handleData = (0, import_react22.useEffectEvent)((data) => {
    const keypress = parse_keypress_default(data);
    const key = {
      upArrow: keypress.name === "up",
      downArrow: keypress.name === "down",
      leftArrow: keypress.name === "left",
      rightArrow: keypress.name === "right",
      pageDown: keypress.name === "pagedown",
      pageUp: keypress.name === "pageup",
      home: keypress.name === "home",
      end: keypress.name === "end",
      return: keypress.name === "return",
      escape: keypress.name === "escape",
      ctrl: keypress.ctrl,
      shift: keypress.shift,
      tab: keypress.name === "tab",
      backspace: keypress.name === "backspace",
      delete: keypress.name === "delete",
      meta: keypress.meta,
      // Kitty keyboard protocol modifiers
      super: keypress.super ?? false,
      hyper: keypress.hyper ?? false,
      capsLock: keypress.capsLock ?? false,
      numLock: keypress.numLock ?? false,
      eventType: keypress.eventType
    };
    let input;
    if (keypress.isKittyProtocol) {
      if (keypress.isPrintable) {
        input = keypress.text ?? keypress.name;
      } else if (keypress.ctrl && keypress.name.length === 1) {
        input = keypress.name;
      } else {
        input = "";
      }
    } else if (keypress.ctrl) {
      input = keypress.name ?? "";
    } else {
      input = keypress.sequence;
    }
    if (!keypress.isKittyProtocol && nonAlphanumericKeys.includes(keypress.name)) {
      input = "";
    }
    if (input.startsWith("\x1B")) {
      input = input.slice(1);
    }
    if (input.length === 1 && /[A-Z]/.test(input)) {
      key.shift = true;
    }
    if (input === "c" && key.ctrl && internal_exitOnCtrlC) {
      return;
    }
    reconciler_default.discreteUpdates(() => {
      inputHandler(input, key);
    });
  });
  (0, import_react22.useEffect)(() => {
    if (options.isActive === false) {
      return;
    }
    internal_eventEmitter.on("input", handleData);
    return () => {
      internal_eventEmitter.removeListener("input", handleData);
    };
  }, [options.isActive, internal_eventEmitter]);
};
var use_input_default = useInput;

// node_modules/ink/build/hooks/use-paste.js
var import_react23 = __toESM(require_react(), 1);
var usePaste = (handler, options = {}) => {
  const { setRawMode, setBracketedPasteMode, internal_eventEmitter } = useStdinContext();
  (0, import_react23.useEffect)(() => {
    if (options.isActive === false) {
      return;
    }
    setRawMode(true);
    setBracketedPasteMode(true);
    return () => {
      setRawMode(false);
      setBracketedPasteMode(false);
    };
  }, [options.isActive, setRawMode, setBracketedPasteMode]);
  const handlePaste = (0, import_react23.useEffectEvent)((text) => {
    reconciler_default.discreteUpdates(() => {
      handler(text);
    });
  });
  (0, import_react23.useEffect)(() => {
    if (options.isActive === false) {
      return;
    }
    internal_eventEmitter.on("paste", handlePaste);
    return () => {
      internal_eventEmitter.removeListener("paste", handlePaste);
    };
  }, [options.isActive, internal_eventEmitter]);
};
var use_paste_default = usePaste;

// node_modules/ink/build/hooks/use-app.js
var import_react24 = __toESM(require_react(), 1);
var useApp = () => (0, import_react24.useContext)(AppContext_default);
var use_app_default = useApp;

// node_modules/ink/build/hooks/use-stdout.js
var import_react25 = __toESM(require_react(), 1);
var useStdout = () => (0, import_react25.useContext)(StdoutContext_default);
var use_stdout_default = useStdout;

// node_modules/ink/build/hooks/use-stderr.js
var import_react26 = __toESM(require_react(), 1);
var useStderr = () => (0, import_react26.useContext)(StderrContext_default);
var use_stderr_default = useStderr;

// node_modules/ink/build/hooks/use-focus.js
var import_react27 = __toESM(require_react(), 1);
var useFocus = ({ isActive = true, autoFocus = false, id: customId } = {}) => {
  const { isRawModeSupported, setRawMode } = use_stdin_default();
  const { activeId, add, remove, activate, deactivate, focus } = (0, import_react27.useContext)(FocusContext_default);
  const id = (0, import_react27.useMemo)(() => {
    return customId ?? Math.random().toString().slice(2, 7);
  }, [customId]);
  (0, import_react27.useEffect)(() => {
    add(id, { autoFocus });
    return () => {
      remove(id);
    };
  }, [id, autoFocus, add, remove]);
  (0, import_react27.useEffect)(() => {
    if (isActive) {
      activate(id);
    } else {
      deactivate(id);
    }
  }, [isActive, id, activate, deactivate]);
  (0, import_react27.useEffect)(() => {
    if (!isRawModeSupported || !isActive) {
      return;
    }
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [isActive, isRawModeSupported, setRawMode]);
  return {
    isFocused: Boolean(id) && activeId === id,
    focus
  };
};
var use_focus_default = useFocus;

// node_modules/ink/build/hooks/use-focus-manager.js
var import_react28 = __toESM(require_react(), 1);
var useFocusManager = () => {
  const focusContext = (0, import_react28.useContext)(FocusContext_default);
  return {
    enableFocus: focusContext.enableFocus,
    disableFocus: focusContext.disableFocus,
    focusNext: focusContext.focusNext,
    focusPrevious: focusContext.focusPrevious,
    focus: focusContext.focus,
    activeId: focusContext.activeId
  };
};
var use_focus_manager_default = useFocusManager;

// node_modules/ink/build/hooks/use-is-screen-reader-enabled.js
var import_react29 = __toESM(require_react(), 1);
var useIsScreenReaderEnabled = () => {
  const { isScreenReaderEnabled } = (0, import_react29.useContext)(accessibilityContext);
  return isScreenReaderEnabled;
};
var use_is_screen_reader_enabled_default = useIsScreenReaderEnabled;

// node_modules/ink/build/hooks/use-cursor.js
var import_react30 = __toESM(require_react(), 1);
var useCursor = () => {
  const context = (0, import_react30.useContext)(CursorContext_default);
  const positionRef = (0, import_react30.useRef)(void 0);
  const setCursorPosition = (0, import_react30.useCallback)((position) => {
    positionRef.current = position;
  }, []);
  (0, import_react30.useInsertionEffect)(() => {
    context.setCursorPosition(positionRef.current);
    return () => {
      context.setCursorPosition(void 0);
    };
  });
  return { setCursorPosition };
};
var use_cursor_default = useCursor;

// node_modules/ink/build/hooks/use-animation.js
var import_react31 = __toESM(require_react(), 1);
var defaultAnimationInterval = 100;
var maximumTimerInterval = 2147483647;
var zeroAnimState = { frame: 0, time: 0, delta: 0 };
function useAnimation(options) {
  const { interval = defaultAnimationInterval, isActive = true } = options ?? {};
  const safeInterval = normalizeAnimationInterval(interval);
  const { subscribe, renderThrottleMs } = (0, import_react31.useContext)(AnimationContext_default);
  const [resetKey, setResetKey] = (0, import_react31.useState)(0);
  const [animState, setAnimState] = (0, import_react31.useState)(zeroAnimState);
  const nextRenderTimeRef = (0, import_react31.useRef)(0);
  const lastRenderTimeRef = (0, import_react31.useRef)(0);
  const previousOptionsRef = (0, import_react31.useRef)({ isActive, safeInterval, resetKey });
  const previousOptions = previousOptionsRef.current;
  const shouldReset = isActive && (safeInterval !== previousOptions.safeInterval || !previousOptions.isActive || resetKey !== previousOptions.resetKey);
  const reset = (0, import_react31.useCallback)(() => {
    setResetKey((k) => k + 1);
  }, []);
  (0, import_react31.useLayoutEffect)(() => {
    if (!isActive) {
      return;
    }
    setAnimState(zeroAnimState);
    let startTime = 0;
    const { startTime: subscriberStartTime, unsubscribe } = subscribe((currentTime) => {
      const isThrottled = renderThrottleMs > 0 && currentTime < nextRenderTimeRef.current;
      if (isThrottled) {
        return;
      }
      const elapsed = currentTime - startTime;
      const nextDelta = currentTime - lastRenderTimeRef.current;
      lastRenderTimeRef.current = currentTime;
      nextRenderTimeRef.current = currentTime + renderThrottleMs;
      setAnimState({
        frame: Math.floor(elapsed / safeInterval),
        time: elapsed,
        delta: nextDelta
      });
    }, safeInterval);
    startTime = subscriberStartTime;
    lastRenderTimeRef.current = subscriberStartTime;
    nextRenderTimeRef.current = startTime + renderThrottleMs;
    return unsubscribe;
  }, [safeInterval, isActive, subscribe, renderThrottleMs, resetKey]);
  (0, import_react31.useLayoutEffect)(() => {
    previousOptionsRef.current = { isActive, safeInterval, resetKey };
  }, [isActive, safeInterval, resetKey]);
  if (shouldReset) {
    return { ...zeroAnimState, reset };
  }
  return { ...animState, reset };
}
function normalizeAnimationInterval(interval) {
  if (!Number.isFinite(interval)) {
    return defaultAnimationInterval;
  }
  return Math.min(maximumTimerInterval, Math.max(1, interval));
}

// node_modules/ink/build/hooks/use-window-size.js
var import_react32 = __toESM(require_react(), 1);
var useWindowSize = () => {
  const { stdout } = use_stdout_default();
  const [size, setSize] = (0, import_react32.useState)(() => getWindowSize(stdout));
  (0, import_react32.useEffect)(() => {
    const onResize = () => {
      setSize(getWindowSize(stdout));
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
};
var use_window_size_default = useWindowSize;

// node_modules/ink/build/hooks/use-box-metrics.js
var import_react33 = __toESM(require_react(), 1);
var emptyMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0
};
var findRootNode = (node) => {
  if (!node) {
    return void 0;
  }
  if (!node.parentNode) {
    return node.nodeName === "ink-root" ? node : void 0;
  }
  return findRootNode(node.parentNode);
};
var useBoxMetrics = (ref) => {
  const [metrics, setMetrics] = (0, import_react33.useState)(emptyMetrics);
  const [hasMeasured, setHasMeasured] = (0, import_react33.useState)(false);
  const updateMetrics = (0, import_react33.useCallback)(() => {
    const layout = ref.current?.yogaNode?.getComputedLayout() ?? emptyMetrics;
    setMetrics((previousMetrics) => {
      const hasChanged = previousMetrics.width !== layout.width || previousMetrics.height !== layout.height || previousMetrics.left !== layout.left || previousMetrics.top !== layout.top;
      return hasChanged ? layout : previousMetrics;
    });
    setHasMeasured(Boolean(ref.current));
  }, [ref]);
  (0, import_react33.useEffect)(updateMetrics);
  (0, import_react33.useEffect)(() => {
    const rootNode = findRootNode(ref.current);
    if (!rootNode) {
      return;
    }
    return addLayoutListener(rootNode, updateMetrics);
  });
  return (0, import_react33.useMemo)(() => ({
    ...metrics,
    hasMeasured
  }), [metrics, hasMeasured]);
};
var use_box_metrics_default = useBoxMetrics;

// node_modules/ink/build/measure-element.js
var measureElement = (node) => {
  const { yogaNode } = node;
  if (!yogaNode) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let x = yogaNode.getComputedLeft();
  let y = yogaNode.getComputedTop();
  let current = node.parentNode;
  while (current) {
    if (current.yogaNode) {
      x += current.yogaNode.getComputedLeft();
      y += current.yogaNode.getComputedTop();
    }
    current = current.parentNode;
  }
  return {
    x,
    y,
    width: yogaNode.getComputedWidth(),
    height: yogaNode.getComputedHeight()
  };
};
var measure_element_default = measureElement;

export {
  stringWidth,
  Box_default,
  Text,
  kittyFlags,
  kittyModifiers,
  render_default,
  render_to_string_default,
  Static,
  Transform,
  Newline,
  Spacer,
  use_stdin_default,
  use_input_default,
  use_paste_default,
  use_app_default,
  use_stdout_default,
  use_stderr_default,
  use_focus_default,
  use_focus_manager_default,
  use_is_screen_reader_enabled_default,
  use_cursor_default,
  useAnimation,
  use_window_size_default,
  use_box_metrics_default,
  measure_element_default
};
/*! Bundled license information:

react-reconciler/cjs/react-reconciler-constants.production.js:
  (**
   * @license React
   * react-reconciler-constants.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
