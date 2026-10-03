#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  require_websocket
} from "./chunk-J73DZ7ZA.js";
import {
  __commonJS,
  __require
} from "./chunk-SRSFEH3H.js";

// node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "node_modules/inherits/inherits_browser.js"(exports, module) {
    if (typeof Object.create === "function") {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "node_modules/inherits/inherits.js"(exports, module) {
    try {
      util = __require("util");
      if (typeof util.inherits !== "function") throw "";
      module.exports = util.inherits;
    } catch (e) {
      module.exports = require_inherits_browser();
    }
    var util;
  }
});

// node_modules/uuid/lib/rng.js
var require_rng = __commonJS({
  "node_modules/uuid/lib/rng.js"(exports, module) {
    var crypto = __require("crypto");
    module.exports = function nodeRNG() {
      return crypto.randomBytes(16);
    };
  }
});

// node_modules/uuid/lib/bytesToUuid.js
var require_bytesToUuid = __commonJS({
  "node_modules/uuid/lib/bytesToUuid.js"(exports, module) {
    var byteToHex = [];
    for (i = 0; i < 256; ++i) {
      byteToHex[i] = (i + 256).toString(16).substr(1);
    }
    var i;
    function bytesToUuid(buf, offset) {
      var i2 = offset || 0;
      var bth = byteToHex;
      return [
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]],
        "-",
        bth[buf[i2++]],
        bth[buf[i2++]],
        "-",
        bth[buf[i2++]],
        bth[buf[i2++]],
        "-",
        bth[buf[i2++]],
        bth[buf[i2++]],
        "-",
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]],
        bth[buf[i2++]]
      ].join("");
    }
    module.exports = bytesToUuid;
  }
});

// node_modules/uuid/v1.js
var require_v1 = __commonJS({
  "node_modules/uuid/v1.js"(exports, module) {
    var rng = require_rng();
    var bytesToUuid = require_bytesToUuid();
    var _nodeId;
    var _clockseq;
    var _lastMSecs = 0;
    var _lastNSecs = 0;
    function v1(options, buf, offset) {
      var i = buf && offset || 0;
      var b = buf || [];
      options = options || {};
      var node = options.node || _nodeId;
      var clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
      if (node == null || clockseq == null) {
        var seedBytes = rng();
        if (node == null) {
          node = _nodeId = [
            seedBytes[0] | 1,
            seedBytes[1],
            seedBytes[2],
            seedBytes[3],
            seedBytes[4],
            seedBytes[5]
          ];
        }
        if (clockseq == null) {
          clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
        }
      }
      var msecs = options.msecs !== void 0 ? options.msecs : (/* @__PURE__ */ new Date()).getTime();
      var nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
      var dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
      if (dt < 0 && options.clockseq === void 0) {
        clockseq = clockseq + 1 & 16383;
      }
      if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) {
        nsecs = 0;
      }
      if (nsecs >= 1e4) {
        throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
      }
      _lastMSecs = msecs;
      _lastNSecs = nsecs;
      _clockseq = clockseq;
      msecs += 122192928e5;
      var tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
      b[i++] = tl >>> 24 & 255;
      b[i++] = tl >>> 16 & 255;
      b[i++] = tl >>> 8 & 255;
      b[i++] = tl & 255;
      var tmh = msecs / 4294967296 * 1e4 & 268435455;
      b[i++] = tmh >>> 8 & 255;
      b[i++] = tmh & 255;
      b[i++] = tmh >>> 24 & 15 | 16;
      b[i++] = tmh >>> 16 & 255;
      b[i++] = clockseq >>> 8 | 128;
      b[i++] = clockseq & 255;
      for (var n = 0; n < 6; ++n) {
        b[i + n] = node[n];
      }
      return buf ? buf : bytesToUuid(b);
    }
    module.exports = v1;
  }
});

// node_modules/uuid/v4.js
var require_v4 = __commonJS({
  "node_modules/uuid/v4.js"(exports, module) {
    var rng = require_rng();
    var bytesToUuid = require_bytesToUuid();
    function v4(options, buf, offset) {
      var i = buf && offset || 0;
      if (typeof options == "string") {
        buf = options === "binary" ? new Array(16) : null;
        options = null;
      }
      options = options || {};
      var rnds = options.random || (options.rng || rng)();
      rnds[6] = rnds[6] & 15 | 64;
      rnds[8] = rnds[8] & 63 | 128;
      if (buf) {
        for (var ii = 0; ii < 16; ++ii) {
          buf[i + ii] = rnds[ii];
        }
      }
      return buf || bytesToUuid(rnds);
    }
    module.exports = v4;
  }
});

// node_modules/uuid/index.js
var require_uuid = __commonJS({
  "node_modules/uuid/index.js"(exports, module) {
    var v1 = require_v1();
    var v4 = require_v4();
    var uuid = v4;
    uuid.v1 = v1;
    uuid.v4 = v4;
    module.exports = uuid;
  }
});

// node_modules/simperium/lib/simperium/bucket.js
var require_bucket = __commonJS({
  "node_modules/simperium/lib/simperium/bucket.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = Bucket;
    var _events = __require("events");
    var _inherits = _interopRequireDefault(require_inherits());
    var _uuid = require_uuid();
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var callbackAsPromise = function callbackAsPromise2(task) {
      return new Promise(function(resolve, reject) {
        task(function(error, result) {
          return error ? reject(error) : resolve(result);
        });
      });
    };
    var deprecateCallback = function deprecateCallback2(callback, promise) {
      if (typeof callback === "function") {
        return promise.then(function(result) {
          callback(null, result);
          return result;
        }, function(error) {
          callback(error);
          return error;
        });
      }
      return promise;
    };
    var promiseAPI = function promiseAPI2(store) {
      return {
        get: function get(id) {
          return callbackAsPromise(store.get.bind(store, id));
        },
        update: function update(id, object, isIndexing) {
          return callbackAsPromise(store.update.bind(store, id, object, isIndexing));
        },
        remove: function remove(id) {
          return callbackAsPromise(store.remove.bind(store, id));
        },
        find: function find(query) {
          return callbackAsPromise(store.find.bind(store, query));
        }
      };
    };
    function Bucket(name, storeProvider, channel) {
      var _this = this;
      _events.EventEmitter.call(this);
      this.name = name;
      this.store = storeProvider(this);
      this.storeAPI = promiseAPI(this.store);
      this.isIndexing = false;
      this.onChannelIndex = this.emit.bind(this, "index");
      this.onChannelError = this.emit.bind(this, "error");
      this.onChannelUpdate = function(id, data, original, patch, isIndexing) {
        _this.update(id, data, {
          original,
          patch,
          isIndexing
        }, {
          sync: false
        });
      };
      this.onChannelIndexingStateChange = function(isIndexing) {
        _this.isIndexing = isIndexing;
        if (isIndexing) {
          _this.emit("indexing");
        }
      };
      this.onChannelRemove = function(id) {
        return _this.remove(id);
      };
      if (channel) {
        this.setChannel(channel);
      }
    }
    (0, _inherits.default)(Bucket, _events.EventEmitter);
    Bucket.prototype.setChannel = function(channel) {
      var _this2 = this;
      if (this.channel) {
        this.channel.removeListener("index", this.onChannelIndex).removeListener("error", this.onChannelError).removeListener("update", this.onChannelUpdate).removeListener("indexingStateChange", this.onChannelIndexingStateChange).removeListener("remove", this.onChannelRemove);
      }
      this.channel = channel;
      channel.on("index", this.onChannelIndex).on("error", this.onChannelError).on("update", this.onChannelUpdate).on("indexingStateChange", this.onChannelIndexingStateChange).on("remove", this.onChannelRemove);
      var localStateForKey = function localStateForKey2(id) {
        return _this2.get(id).then(function(object) {
          if (object) {
            return object.data;
          }
        });
      };
      channel.beforeNetworkChange(function(id) {
        for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }
        var changeResolver = _this2.changeResolver ? Promise.resolve(_this2.changeResolver.apply(_this2, [id].concat(args))) : Promise.resolve(null);
        return changeResolver.then(function(localState) {
          if (localState) {
            return localState;
          }
          return localStateForKey(id);
        });
      });
    };
    Bucket.prototype.beforeNetworkChange = function(changeResolver) {
      this.changeResolver = changeResolver;
    };
    Bucket.prototype.reload = function() {
      this.channel.reload();
    };
    Bucket.prototype.add = function(data, callback) {
      var id = (0, _uuid.v4)();
      return this.update(id, data, callback);
    };
    Bucket.prototype.get = function(id, callback) {
      return deprecateCallback(callback, this.storeAPI.get(id));
    };
    Bucket.prototype.update = function(id, data, remoteUpdateInfo, options, callback) {
      var _this3 = this;
      if (typeof remoteUpdateInfo === "function") {
        callback = remoteUpdateInfo;
        options = {
          sync: true
        };
      } else if (typeof options === "function") {
        callback = options;
        options = {
          sync: true
        };
      }
      if (!!options === false) {
        options = {
          sync: true
        };
      }
      var task = this.storeAPI.update(id, data, this.isIndexing).then(function(bucketObject) {
        return _this3.channel.update(bucketObject, options.sync);
      }).then(function(bucketObject) {
        _this3.emit("update", id, bucketObject.data, remoteUpdateInfo);
        return bucketObject;
      });
      return deprecateCallback(callback, task);
    };
    Bucket.prototype.hasLocalChanges = function(callback) {
      return deprecateCallback(callback, this.channel.hasLocalChanges());
    };
    Bucket.prototype.getVersion = function(id, callback) {
      return deprecateCallback(callback, this.channel.getVersion(id));
    };
    Bucket.prototype.touch = function(id, callback) {
      var _this4 = this;
      var task = this.storeAPI.get(id).then(function(object) {
        if (object) {
          return _this4.update(object.id, object.data);
        }
      });
      return deprecateCallback(callback, task);
    };
    Bucket.prototype.remove = function(id, callback) {
      var _this5 = this;
      var task = this.storeAPI.remove(id).then(function(result) {
        _this5.emit("remove", id);
        _this5.channel.remove(id);
        return result;
      });
      return deprecateCallback(callback, task);
    };
    Bucket.prototype.find = function(query, callback) {
      return deprecateCallback(callback, this.storeAPI.find(query));
    };
    Bucket.prototype.getRevisions = function(id, callback) {
      return deprecateCallback(callback, this.channel.getRevisions(id));
    };
  }
});

// node_modules/simperium/lib/simperium/jsondiff/diff_match_patch.js
var require_diff_match_patch = __commonJS({
  "node_modules/simperium/lib/simperium/jsondiff/diff_match_patch.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = diff_match_patch;
    exports.DIFF_EQUAL = exports.DIFF_INSERT = exports.DIFF_DELETE = void 0;
    function _typeof(obj) {
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    function diff_match_patch() {
      this.Diff_Timeout = 1;
      this.Diff_EditCost = 4;
      this.Match_Threshold = 0.5;
      this.Match_Distance = 1e3;
      this.Patch_DeleteThreshold = 0.5;
      this.Patch_Margin = 4;
      this.Match_MaxBits = 32;
    }
    var DIFF_DELETE = -1;
    exports.DIFF_DELETE = DIFF_DELETE;
    var DIFF_INSERT = 1;
    exports.DIFF_INSERT = DIFF_INSERT;
    var DIFF_EQUAL = 0;
    exports.DIFF_EQUAL = DIFF_EQUAL;
    diff_match_patch.Diff = function(op, text) {
      this[0] = op;
      this[1] = text;
    };
    diff_match_patch.Diff.prototype.length = 2;
    diff_match_patch.Diff.prototype.toString = function() {
      return this[0] + "," + this[1];
    };
    diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines, opt_deadline) {
      if (typeof opt_deadline == "undefined") {
        if (this.Diff_Timeout <= 0) {
          opt_deadline = Number.MAX_VALUE;
        } else {
          opt_deadline = (/* @__PURE__ */ new Date()).getTime() + this.Diff_Timeout * 1e3;
        }
      }
      var deadline = opt_deadline;
      if (text1 == null || text2 == null) {
        throw new Error("Null input. (diff_main)");
      }
      if (text1 == text2) {
        if (text1) {
          return [new diff_match_patch.Diff(DIFF_EQUAL, text1)];
        }
        return [];
      }
      if (typeof opt_checklines == "undefined") {
        opt_checklines = true;
      }
      var checklines = opt_checklines;
      var commonlength = this.diff_commonPrefix(text1, text2);
      var commonprefix = text1.substring(0, commonlength);
      text1 = text1.substring(commonlength);
      text2 = text2.substring(commonlength);
      commonlength = this.diff_commonSuffix(text1, text2);
      var commonsuffix = text1.substring(text1.length - commonlength);
      text1 = text1.substring(0, text1.length - commonlength);
      text2 = text2.substring(0, text2.length - commonlength);
      var diffs = this.diff_compute_(text1, text2, checklines, deadline);
      if (commonprefix) {
        diffs.unshift(new diff_match_patch.Diff(DIFF_EQUAL, commonprefix));
      }
      if (commonsuffix) {
        diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, commonsuffix));
      }
      this.diff_cleanupMerge(diffs);
      return diffs;
    };
    diff_match_patch.prototype.diff_compute_ = function(text1, text2, checklines, deadline) {
      var diffs;
      if (!text1) {
        return [new diff_match_patch.Diff(DIFF_INSERT, text2)];
      }
      if (!text2) {
        return [new diff_match_patch.Diff(DIFF_DELETE, text1)];
      }
      var longtext = text1.length > text2.length ? text1 : text2;
      var shorttext = text1.length > text2.length ? text2 : text1;
      var i = longtext.indexOf(shorttext);
      if (i != -1) {
        diffs = [new diff_match_patch.Diff(DIFF_INSERT, longtext.substring(0, i)), new diff_match_patch.Diff(DIFF_EQUAL, shorttext), new diff_match_patch.Diff(DIFF_INSERT, longtext.substring(i + shorttext.length))];
        if (text1.length > text2.length) {
          diffs[0][0] = diffs[2][0] = DIFF_DELETE;
        }
        return diffs;
      }
      if (shorttext.length == 1) {
        return [new diff_match_patch.Diff(DIFF_DELETE, text1), new diff_match_patch.Diff(DIFF_INSERT, text2)];
      }
      var hm = this.diff_halfMatch_(text1, text2);
      if (hm) {
        var text1_a = hm[0];
        var text1_b = hm[1];
        var text2_a = hm[2];
        var text2_b = hm[3];
        var mid_common = hm[4];
        var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
        var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
        return diffs_a.concat([new diff_match_patch.Diff(DIFF_EQUAL, mid_common)], diffs_b);
      }
      if (checklines && text1.length > 100 && text2.length > 100) {
        return this.diff_lineMode_(text1, text2, deadline);
      }
      return this.diff_bisect_(text1, text2, deadline);
    };
    diff_match_patch.prototype.diff_lineMode_ = function(text1, text2, deadline) {
      var a = this.diff_linesToChars_(text1, text2);
      text1 = a.chars1;
      text2 = a.chars2;
      var linearray = a.lineArray;
      var diffs = this.diff_main(text1, text2, false, deadline);
      this.diff_charsToLines_(diffs, linearray);
      this.diff_cleanupSemantic(diffs);
      diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, ""));
      var pointer = 0;
      var count_delete = 0;
      var count_insert = 0;
      var text_delete = "";
      var text_insert = "";
      while (pointer < diffs.length) {
        switch (diffs[pointer][0]) {
          case DIFF_INSERT:
            count_insert++;
            text_insert += diffs[pointer][1];
            break;
          case DIFF_DELETE:
            count_delete++;
            text_delete += diffs[pointer][1];
            break;
          case DIFF_EQUAL:
            if (count_delete >= 1 && count_insert >= 1) {
              diffs.splice(pointer - count_delete - count_insert, count_delete + count_insert);
              pointer = pointer - count_delete - count_insert;
              var subDiff = this.diff_main(text_delete, text_insert, false, deadline);
              for (var j = subDiff.length - 1; j >= 0; j--) {
                diffs.splice(pointer, 0, subDiff[j]);
              }
              pointer = pointer + subDiff.length;
            }
            count_insert = 0;
            count_delete = 0;
            text_delete = "";
            text_insert = "";
            break;
        }
        pointer++;
      }
      diffs.pop();
      return diffs;
    };
    diff_match_patch.prototype.diff_bisect_ = function(text1, text2, deadline) {
      var text1_length = text1.length;
      var text2_length = text2.length;
      var max_d = Math.ceil((text1_length + text2_length) / 2);
      var v_offset = max_d;
      var v_length = 2 * max_d;
      var v1 = new Array(v_length);
      var v2 = new Array(v_length);
      for (var x = 0; x < v_length; x++) {
        v1[x] = -1;
        v2[x] = -1;
      }
      v1[v_offset + 1] = 0;
      v2[v_offset + 1] = 0;
      var delta = text1_length - text2_length;
      var front = delta % 2 != 0;
      var k1start = 0;
      var k1end = 0;
      var k2start = 0;
      var k2end = 0;
      for (var d = 0; d < max_d; d++) {
        if ((/* @__PURE__ */ new Date()).getTime() > deadline) {
          break;
        }
        for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
          var k1_offset = v_offset + k1;
          var x1;
          if (k1 == -d || k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1]) {
            x1 = v1[k1_offset + 1];
          } else {
            x1 = v1[k1_offset - 1] + 1;
          }
          var y1 = x1 - k1;
          while (x1 < text1_length && y1 < text2_length && text1.charAt(x1) == text2.charAt(y1)) {
            x1++;
            y1++;
          }
          v1[k1_offset] = x1;
          if (x1 > text1_length) {
            k1end += 2;
          } else if (y1 > text2_length) {
            k1start += 2;
          } else if (front) {
            var k2_offset = v_offset + delta - k1;
            if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
              var x2 = text1_length - v2[k2_offset];
              if (x1 >= x2) {
                return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
              }
            }
          }
        }
        for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
          var k2_offset = v_offset + k2;
          var x2;
          if (k2 == -d || k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1]) {
            x2 = v2[k2_offset + 1];
          } else {
            x2 = v2[k2_offset - 1] + 1;
          }
          var y2 = x2 - k2;
          while (x2 < text1_length && y2 < text2_length && text1.charAt(text1_length - x2 - 1) == text2.charAt(text2_length - y2 - 1)) {
            x2++;
            y2++;
          }
          v2[k2_offset] = x2;
          if (x2 > text1_length) {
            k2end += 2;
          } else if (y2 > text2_length) {
            k2start += 2;
          } else if (!front) {
            var k1_offset = v_offset + delta - k2;
            if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
              var x1 = v1[k1_offset];
              var y1 = v_offset + x1 - k1_offset;
              x2 = text1_length - x2;
              if (x1 >= x2) {
                return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
              }
            }
          }
        }
      }
      return [new diff_match_patch.Diff(DIFF_DELETE, text1), new diff_match_patch.Diff(DIFF_INSERT, text2)];
    };
    diff_match_patch.prototype.diff_bisectSplit_ = function(text1, text2, x, y, deadline) {
      var text1a = text1.substring(0, x);
      var text2a = text2.substring(0, y);
      var text1b = text1.substring(x);
      var text2b = text2.substring(y);
      var diffs = this.diff_main(text1a, text2a, false, deadline);
      var diffsb = this.diff_main(text1b, text2b, false, deadline);
      return diffs.concat(diffsb);
    };
    diff_match_patch.prototype.diff_linesToChars_ = function(text1, text2) {
      var lineArray = [];
      var lineHash = {};
      lineArray[0] = "";
      function diff_linesToCharsMunge_(text) {
        var chars = "";
        var lineStart = 0;
        var lineEnd = -1;
        var lineArrayLength = lineArray.length;
        while (lineEnd < text.length - 1) {
          lineEnd = text.indexOf("\n", lineStart);
          if (lineEnd == -1) {
            lineEnd = text.length - 1;
          }
          var line = text.substring(lineStart, lineEnd + 1);
          if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) : lineHash[line] !== void 0) {
            chars += String.fromCharCode(lineHash[line]);
          } else {
            if (lineArrayLength == maxLines) {
              line = text.substring(lineStart);
              lineEnd = text.length;
            }
            chars += String.fromCharCode(lineArrayLength);
            lineHash[line] = lineArrayLength;
            lineArray[lineArrayLength++] = line;
          }
          lineStart = lineEnd + 1;
        }
        return chars;
      }
      var maxLines = 4e4;
      var chars1 = diff_linesToCharsMunge_(text1);
      maxLines = 65535;
      var chars2 = diff_linesToCharsMunge_(text2);
      return {
        chars1,
        chars2,
        lineArray
      };
    };
    diff_match_patch.prototype.diff_charsToLines_ = function(diffs, lineArray) {
      for (var i = 0; i < diffs.length; i++) {
        var chars = diffs[i][1];
        var text = [];
        for (var j = 0; j < chars.length; j++) {
          text[j] = lineArray[chars.charCodeAt(j)];
        }
        diffs[i][1] = text.join("");
      }
    };
    diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {
      if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
        return 0;
      }
      var pointermin = 0;
      var pointermax = Math.min(text1.length, text2.length);
      var pointermid = pointermax;
      var pointerstart = 0;
      while (pointermin < pointermid) {
        if (text1.substring(pointerstart, pointermid) == text2.substring(pointerstart, pointermid)) {
          pointermin = pointermid;
          pointerstart = pointermin;
        } else {
          pointermax = pointermid;
        }
        pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
      }
      return pointermid;
    };
    diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {
      if (!text1 || !text2 || text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
        return 0;
      }
      var pointermin = 0;
      var pointermax = Math.min(text1.length, text2.length);
      var pointermid = pointermax;
      var pointerend = 0;
      while (pointermin < pointermid) {
        if (text1.substring(text1.length - pointermid, text1.length - pointerend) == text2.substring(text2.length - pointermid, text2.length - pointerend)) {
          pointermin = pointermid;
          pointerend = pointermin;
        } else {
          pointermax = pointermid;
        }
        pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
      }
      return pointermid;
    };
    diff_match_patch.prototype.diff_commonOverlap_ = function(text1, text2) {
      var text1_length = text1.length;
      var text2_length = text2.length;
      if (text1_length == 0 || text2_length == 0) {
        return 0;
      }
      if (text1_length > text2_length) {
        text1 = text1.substring(text1_length - text2_length);
      } else if (text1_length < text2_length) {
        text2 = text2.substring(0, text1_length);
      }
      var text_length = Math.min(text1_length, text2_length);
      if (text1 == text2) {
        return text_length;
      }
      var best = 0;
      var length = 1;
      while (true) {
        var pattern = text1.substring(text_length - length);
        var found = text2.indexOf(pattern);
        if (found == -1) {
          return best;
        }
        length += found;
        if (found == 0 || text1.substring(text_length - length) == text2.substring(0, length)) {
          best = length;
          length++;
        }
      }
    };
    diff_match_patch.prototype.diff_halfMatch_ = function(text1, text2) {
      if (this.Diff_Timeout <= 0) {
        return null;
      }
      var longtext = text1.length > text2.length ? text1 : text2;
      var shorttext = text1.length > text2.length ? text2 : text1;
      if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
        return null;
      }
      var dmp = this;
      function diff_halfMatchI_(longtext2, shorttext2, i) {
        var seed = longtext2.substring(i, i + Math.floor(longtext2.length / 4));
        var j = -1;
        var best_common = "";
        var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
        while ((j = shorttext2.indexOf(seed, j + 1)) != -1) {
          var prefixLength = dmp.diff_commonPrefix(longtext2.substring(i), shorttext2.substring(j));
          var suffixLength = dmp.diff_commonSuffix(longtext2.substring(0, i), shorttext2.substring(0, j));
          if (best_common.length < suffixLength + prefixLength) {
            best_common = shorttext2.substring(j - suffixLength, j) + shorttext2.substring(j, j + prefixLength);
            best_longtext_a = longtext2.substring(0, i - suffixLength);
            best_longtext_b = longtext2.substring(i + prefixLength);
            best_shorttext_a = shorttext2.substring(0, j - suffixLength);
            best_shorttext_b = shorttext2.substring(j + prefixLength);
          }
        }
        if (best_common.length * 2 >= longtext2.length) {
          return [best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b, best_common];
        } else {
          return null;
        }
      }
      var hm1 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 4));
      var hm2 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 2));
      var hm;
      if (!hm1 && !hm2) {
        return null;
      } else if (!hm2) {
        hm = hm1;
      } else if (!hm1) {
        hm = hm2;
      } else {
        hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
      }
      var text1_a, text1_b, text2_a, text2_b;
      if (text1.length > text2.length) {
        text1_a = hm[0];
        text1_b = hm[1];
        text2_a = hm[2];
        text2_b = hm[3];
      } else {
        text2_a = hm[0];
        text2_b = hm[1];
        text1_a = hm[2];
        text1_b = hm[3];
      }
      var mid_common = hm[4];
      return [text1_a, text1_b, text2_a, text2_b, mid_common];
    };
    diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {
      var changes = false;
      var equalities = [];
      var equalitiesLength = 0;
      var lastEquality = null;
      var pointer = 0;
      var length_insertions1 = 0;
      var length_deletions1 = 0;
      var length_insertions2 = 0;
      var length_deletions2 = 0;
      while (pointer < diffs.length) {
        if (diffs[pointer][0] == DIFF_EQUAL) {
          equalities[equalitiesLength++] = pointer;
          length_insertions1 = length_insertions2;
          length_deletions1 = length_deletions2;
          length_insertions2 = 0;
          length_deletions2 = 0;
          lastEquality = diffs[pointer][1];
        } else {
          if (diffs[pointer][0] == DIFF_INSERT) {
            length_insertions2 += diffs[pointer][1].length;
          } else {
            length_deletions2 += diffs[pointer][1].length;
          }
          if (lastEquality && lastEquality.length <= Math.max(length_insertions1, length_deletions1) && lastEquality.length <= Math.max(length_insertions2, length_deletions2)) {
            diffs.splice(equalities[equalitiesLength - 1], 0, new diff_match_patch.Diff(DIFF_DELETE, lastEquality));
            diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
            equalitiesLength--;
            equalitiesLength--;
            pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
            length_insertions1 = 0;
            length_deletions1 = 0;
            length_insertions2 = 0;
            length_deletions2 = 0;
            lastEquality = null;
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
      this.diff_cleanupSemanticLossless(diffs);
      pointer = 1;
      while (pointer < diffs.length) {
        if (diffs[pointer - 1][0] == DIFF_DELETE && diffs[pointer][0] == DIFF_INSERT) {
          var deletion = diffs[pointer - 1][1];
          var insertion = diffs[pointer][1];
          var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
          var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
          if (overlap_length1 >= overlap_length2) {
            if (overlap_length1 >= deletion.length / 2 || overlap_length1 >= insertion.length / 2) {
              diffs.splice(pointer, 0, new diff_match_patch.Diff(DIFF_EQUAL, insertion.substring(0, overlap_length1)));
              diffs[pointer - 1][1] = deletion.substring(0, deletion.length - overlap_length1);
              diffs[pointer + 1][1] = insertion.substring(overlap_length1);
              pointer++;
            }
          } else {
            if (overlap_length2 >= deletion.length / 2 || overlap_length2 >= insertion.length / 2) {
              diffs.splice(pointer, 0, new diff_match_patch.Diff(DIFF_EQUAL, deletion.substring(0, overlap_length2)));
              diffs[pointer - 1][0] = DIFF_INSERT;
              diffs[pointer - 1][1] = insertion.substring(0, insertion.length - overlap_length2);
              diffs[pointer + 1][0] = DIFF_DELETE;
              diffs[pointer + 1][1] = deletion.substring(overlap_length2);
              pointer++;
            }
          }
          pointer++;
        }
        pointer++;
      }
    };
    diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {
      function diff_cleanupSemanticScore_(one, two) {
        if (!one || !two) {
          return 6;
        }
        var char1 = one.charAt(one.length - 1);
        var char2 = two.charAt(0);
        var nonAlphaNumeric1 = char1.match(diff_match_patch.nonAlphaNumericRegex_);
        var nonAlphaNumeric2 = char2.match(diff_match_patch.nonAlphaNumericRegex_);
        var whitespace1 = nonAlphaNumeric1 && char1.match(diff_match_patch.whitespaceRegex_);
        var whitespace2 = nonAlphaNumeric2 && char2.match(diff_match_patch.whitespaceRegex_);
        var lineBreak1 = whitespace1 && char1.match(diff_match_patch.linebreakRegex_);
        var lineBreak2 = whitespace2 && char2.match(diff_match_patch.linebreakRegex_);
        var blankLine1 = lineBreak1 && one.match(diff_match_patch.blanklineEndRegex_);
        var blankLine2 = lineBreak2 && two.match(diff_match_patch.blanklineStartRegex_);
        if (blankLine1 || blankLine2) {
          return 5;
        } else if (lineBreak1 || lineBreak2) {
          return 4;
        } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
          return 3;
        } else if (whitespace1 || whitespace2) {
          return 2;
        } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
          return 1;
        }
        return 0;
      }
      var pointer = 1;
      while (pointer < diffs.length - 1) {
        if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
          var equality1 = diffs[pointer - 1][1];
          var edit = diffs[pointer][1];
          var equality2 = diffs[pointer + 1][1];
          var commonOffset = this.diff_commonSuffix(equality1, edit);
          if (commonOffset) {
            var commonString = edit.substring(edit.length - commonOffset);
            equality1 = equality1.substring(0, equality1.length - commonOffset);
            edit = commonString + edit.substring(0, edit.length - commonOffset);
            equality2 = commonString + equality2;
          }
          var bestEquality1 = equality1;
          var bestEdit = edit;
          var bestEquality2 = equality2;
          var bestScore = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
          while (edit.charAt(0) === equality2.charAt(0)) {
            equality1 += edit.charAt(0);
            edit = edit.substring(1) + equality2.charAt(0);
            equality2 = equality2.substring(1);
            var score = diff_cleanupSemanticScore_(equality1, edit) + diff_cleanupSemanticScore_(edit, equality2);
            if (score >= bestScore) {
              bestScore = score;
              bestEquality1 = equality1;
              bestEdit = edit;
              bestEquality2 = equality2;
            }
          }
          if (diffs[pointer - 1][1] != bestEquality1) {
            if (bestEquality1) {
              diffs[pointer - 1][1] = bestEquality1;
            } else {
              diffs.splice(pointer - 1, 1);
              pointer--;
            }
            diffs[pointer][1] = bestEdit;
            if (bestEquality2) {
              diffs[pointer + 1][1] = bestEquality2;
            } else {
              diffs.splice(pointer + 1, 1);
              pointer--;
            }
          }
        }
        pointer++;
      }
    };
    diff_match_patch.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
    diff_match_patch.whitespaceRegex_ = /\s/;
    diff_match_patch.linebreakRegex_ = /[\r\n]/;
    diff_match_patch.blanklineEndRegex_ = /\n\r?\n$/;
    diff_match_patch.blanklineStartRegex_ = /^\r?\n\r?\n/;
    diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {
      var changes = false;
      var equalities = [];
      var equalitiesLength = 0;
      var lastEquality = null;
      var pointer = 0;
      var pre_ins = false;
      var pre_del = false;
      var post_ins = false;
      var post_del = false;
      while (pointer < diffs.length) {
        if (diffs[pointer][0] == DIFF_EQUAL) {
          if (diffs[pointer][1].length < this.Diff_EditCost && (post_ins || post_del)) {
            equalities[equalitiesLength++] = pointer;
            pre_ins = post_ins;
            pre_del = post_del;
            lastEquality = diffs[pointer][1];
          } else {
            equalitiesLength = 0;
            lastEquality = null;
          }
          post_ins = post_del = false;
        } else {
          if (diffs[pointer][0] == DIFF_DELETE) {
            post_del = true;
          } else {
            post_ins = true;
          }
          if (lastEquality && (pre_ins && pre_del && post_ins && post_del || lastEquality.length < this.Diff_EditCost / 2 && pre_ins + pre_del + post_ins + post_del == 3)) {
            diffs.splice(equalities[equalitiesLength - 1], 0, new diff_match_patch.Diff(DIFF_DELETE, lastEquality));
            diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
            equalitiesLength--;
            lastEquality = null;
            if (pre_ins && pre_del) {
              post_ins = post_del = true;
              equalitiesLength = 0;
            } else {
              equalitiesLength--;
              pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
              post_ins = post_del = false;
            }
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
    };
    diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {
      diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, ""));
      var pointer = 0;
      var count_delete = 0;
      var count_insert = 0;
      var text_delete = "";
      var text_insert = "";
      var commonlength;
      while (pointer < diffs.length) {
        switch (diffs[pointer][0]) {
          case DIFF_INSERT:
            count_insert++;
            text_insert += diffs[pointer][1];
            pointer++;
            break;
          case DIFF_DELETE:
            count_delete++;
            text_delete += diffs[pointer][1];
            pointer++;
            break;
          case DIFF_EQUAL:
            if (count_delete + count_insert > 1) {
              if (count_delete !== 0 && count_insert !== 0) {
                commonlength = this.diff_commonPrefix(text_insert, text_delete);
                if (commonlength !== 0) {
                  if (pointer - count_delete - count_insert > 0 && diffs[pointer - count_delete - count_insert - 1][0] == DIFF_EQUAL) {
                    diffs[pointer - count_delete - count_insert - 1][1] += text_insert.substring(0, commonlength);
                  } else {
                    diffs.splice(0, 0, new diff_match_patch.Diff(DIFF_EQUAL, text_insert.substring(0, commonlength)));
                    pointer++;
                  }
                  text_insert = text_insert.substring(commonlength);
                  text_delete = text_delete.substring(commonlength);
                }
                commonlength = this.diff_commonSuffix(text_insert, text_delete);
                if (commonlength !== 0) {
                  diffs[pointer][1] = text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];
                  text_insert = text_insert.substring(0, text_insert.length - commonlength);
                  text_delete = text_delete.substring(0, text_delete.length - commonlength);
                }
              }
              pointer -= count_delete + count_insert;
              diffs.splice(pointer, count_delete + count_insert);
              if (text_delete.length) {
                diffs.splice(pointer, 0, new diff_match_patch.Diff(DIFF_DELETE, text_delete));
                pointer++;
              }
              if (text_insert.length) {
                diffs.splice(pointer, 0, new diff_match_patch.Diff(DIFF_INSERT, text_insert));
                pointer++;
              }
              pointer++;
            } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
              diffs[pointer - 1][1] += diffs[pointer][1];
              diffs.splice(pointer, 1);
            } else {
              pointer++;
            }
            count_insert = 0;
            count_delete = 0;
            text_delete = "";
            text_insert = "";
            break;
        }
      }
      if (diffs[diffs.length - 1][1] === "") {
        diffs.pop();
      }
      var changes = false;
      pointer = 1;
      while (pointer < diffs.length - 1) {
        if (diffs[pointer - 1][0] == DIFF_EQUAL && diffs[pointer + 1][0] == DIFF_EQUAL) {
          if (diffs[pointer][1].substring(diffs[pointer][1].length - diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
            diffs[pointer][1] = diffs[pointer - 1][1] + diffs[pointer][1].substring(0, diffs[pointer][1].length - diffs[pointer - 1][1].length);
            diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
            diffs.splice(pointer - 1, 1);
            changes = true;
          } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) == diffs[pointer + 1][1]) {
            diffs[pointer - 1][1] += diffs[pointer + 1][1];
            diffs[pointer][1] = diffs[pointer][1].substring(diffs[pointer + 1][1].length) + diffs[pointer + 1][1];
            diffs.splice(pointer + 1, 1);
            changes = true;
          }
        }
        pointer++;
      }
      if (changes) {
        this.diff_cleanupMerge(diffs);
      }
    };
    diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {
      var chars1 = 0;
      var chars2 = 0;
      var last_chars1 = 0;
      var last_chars2 = 0;
      var x;
      for (x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_INSERT) {
          chars1 += diffs[x][1].length;
        }
        if (diffs[x][0] !== DIFF_DELETE) {
          chars2 += diffs[x][1].length;
        }
        if (chars1 > loc) {
          break;
        }
        last_chars1 = chars1;
        last_chars2 = chars2;
      }
      if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
        return last_chars2;
      }
      return last_chars2 + (loc - last_chars1);
    };
    diff_match_patch.prototype.diff_prettyHtml = function(diffs) {
      var html = [];
      var pattern_amp = /&/g;
      var pattern_lt = /</g;
      var pattern_gt = />/g;
      var pattern_para = /\n/g;
      for (var x = 0; x < diffs.length; x++) {
        var op = diffs[x][0];
        var data = diffs[x][1];
        var text = data.replace(pattern_amp, "&amp;").replace(pattern_lt, "&lt;").replace(pattern_gt, "&gt;").replace(pattern_para, "&para;<br>");
        switch (op) {
          case DIFF_INSERT:
            html[x] = '<ins style="background:#e6ffe6;">' + text + "</ins>";
            break;
          case DIFF_DELETE:
            html[x] = '<del style="background:#ffe6e6;">' + text + "</del>";
            break;
          case DIFF_EQUAL:
            html[x] = "<span>" + text + "</span>";
            break;
        }
      }
      return html.join("");
    };
    diff_match_patch.prototype.diff_text1 = function(diffs) {
      var text = [];
      for (var x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_INSERT) {
          text[x] = diffs[x][1];
        }
      }
      return text.join("");
    };
    diff_match_patch.prototype.diff_text2 = function(diffs) {
      var text = [];
      for (var x = 0; x < diffs.length; x++) {
        if (diffs[x][0] !== DIFF_DELETE) {
          text[x] = diffs[x][1];
        }
      }
      return text.join("");
    };
    diff_match_patch.prototype.diff_levenshtein = function(diffs) {
      var levenshtein = 0;
      var insertions = 0;
      var deletions = 0;
      for (var x = 0; x < diffs.length; x++) {
        var op = diffs[x][0];
        var data = diffs[x][1];
        switch (op) {
          case DIFF_INSERT:
            insertions += data.length;
            break;
          case DIFF_DELETE:
            deletions += data.length;
            break;
          case DIFF_EQUAL:
            levenshtein += Math.max(insertions, deletions);
            insertions = 0;
            deletions = 0;
            break;
        }
      }
      levenshtein += Math.max(insertions, deletions);
      return levenshtein;
    };
    diff_match_patch.prototype.isHighSurrogate = function(c) {
      var v = c.charCodeAt(0);
      return v >= 55296 && v <= 56319;
    };
    diff_match_patch.prototype.isLowSurrogate = function(c) {
      var v = c.charCodeAt(0);
      return v >= 56320 && v <= 57343;
    };
    diff_match_patch.prototype.diff_toDelta = function(diffs) {
      var text = [];
      var lastEnd;
      for (var x = 0; x < diffs.length; x++) {
        var thisDiff = diffs[x];
        var thisTop = thisDiff[1][0];
        var thisEnd = thisDiff[1][thisDiff[1].length - 1];
        if (0 === thisDiff[1].length) {
          continue;
        }
        if (thisEnd && this.isHighSurrogate(thisEnd)) {
          lastEnd = thisEnd;
          thisDiff[1] = thisDiff[1].slice(0, -1);
        }
        if (lastEnd && thisTop && this.isHighSurrogate(lastEnd) && this.isLowSurrogate(thisTop)) {
          thisDiff[1] = lastEnd + thisDiff[1];
        }
        if (0 === thisDiff[1].length) {
          continue;
        }
        switch (thisDiff[0]) {
          case DIFF_INSERT:
            text.push("+" + encodeURI(thisDiff[1]));
            break;
          case DIFF_DELETE:
            text.push("-" + thisDiff[1].length);
            break;
          case DIFF_EQUAL:
            text.push("=" + thisDiff[1].length);
            break;
        }
      }
      return text.join("	").replace(/%20/g, " ");
    };
    diff_match_patch.prototype.digit16 = function(c) {
      switch (c) {
        case "0":
          return 0;
        case "1":
          return 1;
        case "2":
          return 2;
        case "3":
          return 3;
        case "4":
          return 4;
        case "5":
          return 5;
        case "6":
          return 6;
        case "7":
          return 7;
        case "8":
          return 8;
        case "9":
          return 9;
        case "A":
        case "a":
          return 10;
        case "B":
        case "b":
          return 11;
        case "C":
        case "c":
          return 12;
        case "D":
        case "d":
          return 13;
        case "E":
        case "e":
          return 14;
        case "F":
        case "f":
          return 15;
        default:
          throw new Error("Invalid hex-code");
      }
    };
    diff_match_patch.prototype.decodeURI = function(text) {
      try {
        return decodeURI(text);
      } catch (e) {
        var i = 0;
        var decoded = "";
        while (i < text.length) {
          if (text[i] !== "%") {
            decoded += text[i++];
            continue;
          }
          var byte1 = (this.digit16(text[i + 1]) << 4) + this.digit16(text[i + 2]);
          if ((byte1 & 128) === 0) {
            decoded += String.fromCharCode(byte1);
            i += 3;
            continue;
          }
          if ("%" !== text[i + 3]) {
            throw new URIError("URI malformed");
          }
          var byte2 = (this.digit16(text[i + 4]) << 4) + this.digit16(text[i + 5]);
          if ((byte2 & 192) !== 128) {
            throw new URIError("URI malformed");
          }
          byte2 = byte2 & 63;
          if ((byte1 & 224) === 192) {
            decoded += String.fromCharCode((byte1 & 31) << 6 | byte2);
            i += 6;
            continue;
          }
          if ("%" !== text[i + 6]) {
            throw new URIError("URI malformed");
          }
          var byte3 = (this.digit16(text[i + 7]) << 4) + this.digit16(text[i + 8]);
          if ((byte3 & 192) !== 128) {
            throw new URIError("URI malformed");
          }
          byte3 = byte3 & 63;
          if ((byte1 & 240) === 224) {
            decoded += String.fromCharCode((byte1 & 15) << 12 | byte2 << 6 | byte3);
            i += 9;
            continue;
          }
          if ("%" !== text[i + 9]) {
            throw new URIError("URI malformed");
          }
          var byte4 = (this.digit16(text[i + 10]) << 4) + this.digit16(text[i + 11]);
          if ((byte4 & 192) !== 128) {
            throw new URIError("URI malformed");
          }
          byte4 = byte4 & 63;
          if ((byte1 & 248) === 240) {
            var codePoint = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
            if (codePoint >= 65536 && codePoint <= 1114111) {
              decoded += String.fromCharCode((codePoint & 65535) >>> 10 & 1023 | 55296);
              decoded += String.fromCharCode(56320 | codePoint & 65535 & 1023);
              i += 12;
              continue;
            }
          }
          throw new URIError("URI malformed");
        }
        return decoded;
      }
    };
    diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {
      var diffs = [];
      var diffsLength = 0;
      var pointer = 0;
      var tokens = delta.split(/\t/g);
      for (var x = 0; x < tokens.length; x++) {
        var param = tokens[x].substring(1);
        switch (tokens[x].charAt(0)) {
          case "+":
            try {
              diffs[diffsLength++] = new diff_match_patch.Diff(DIFF_INSERT, this.decodeURI(param));
            } catch (ex) {
              throw new Error("Illegal escape in diff_fromDelta: " + param);
            }
            break;
          case "-":
          // Fall through.
          case "=":
            var n = parseInt(param, 10);
            if (isNaN(n) || n < 0) {
              throw new Error("Invalid number in diff_fromDelta: " + param);
            }
            var text = text1.substring(pointer, pointer += n);
            if (tokens[x].charAt(0) == "=") {
              diffs[diffsLength++] = new diff_match_patch.Diff(DIFF_EQUAL, text);
            } else {
              diffs[diffsLength++] = new diff_match_patch.Diff(DIFF_DELETE, text);
            }
            break;
          default:
            if (tokens[x]) {
              throw new Error("Invalid diff operation in diff_fromDelta: " + tokens[x]);
            }
        }
      }
      if (pointer != text1.length) {
        throw new Error("Delta length (" + pointer + ") does not equal source text length (" + text1.length + ").");
      }
      return diffs;
    };
    diff_match_patch.prototype.match_main = function(text, pattern, loc) {
      if (text == null || pattern == null || loc == null) {
        throw new Error("Null input. (match_main)");
      }
      loc = Math.max(0, Math.min(loc, text.length));
      if (text == pattern) {
        return 0;
      } else if (!text.length) {
        return -1;
      } else if (text.substring(loc, loc + pattern.length) == pattern) {
        return loc;
      } else {
        return this.match_bitap_(text, pattern, loc);
      }
    };
    diff_match_patch.prototype.match_bitap_ = function(text, pattern, loc) {
      if (pattern.length > this.Match_MaxBits) {
        throw new Error("Pattern too long for this browser.");
      }
      var s = this.match_alphabet_(pattern);
      var dmp = this;
      function match_bitapScore_(e, x) {
        var accuracy = e / pattern.length;
        var proximity = Math.abs(loc - x);
        if (!dmp.Match_Distance) {
          return proximity ? 1 : accuracy;
        }
        return accuracy + proximity / dmp.Match_Distance;
      }
      var score_threshold = this.Match_Threshold;
      var best_loc = text.indexOf(pattern, loc);
      if (best_loc != -1) {
        score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
        best_loc = text.lastIndexOf(pattern, loc + pattern.length);
        if (best_loc != -1) {
          score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);
        }
      }
      var matchmask = 1 << pattern.length - 1;
      best_loc = -1;
      var bin_min, bin_mid;
      var bin_max = pattern.length + text.length;
      var last_rd;
      for (var d = 0; d < pattern.length; d++) {
        bin_min = 0;
        bin_mid = bin_max;
        while (bin_min < bin_mid) {
          if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {
            bin_min = bin_mid;
          } else {
            bin_max = bin_mid;
          }
          bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
        }
        bin_max = bin_mid;
        var start = Math.max(1, loc - bin_mid + 1);
        var finish = Math.min(loc + bin_mid, text.length) + pattern.length;
        var rd = Array(finish + 2);
        rd[finish + 1] = (1 << d) - 1;
        for (var j = finish; j >= start; j--) {
          var charMatch = s[text.charAt(j - 1)];
          if (d === 0) {
            rd[j] = (rd[j + 1] << 1 | 1) & charMatch;
          } else {
            rd[j] = (rd[j + 1] << 1 | 1) & charMatch | ((last_rd[j + 1] | last_rd[j]) << 1 | 1) | last_rd[j + 1];
          }
          if (rd[j] & matchmask) {
            var score = match_bitapScore_(d, j - 1);
            if (score <= score_threshold) {
              score_threshold = score;
              best_loc = j - 1;
              if (best_loc > loc) {
                start = Math.max(1, 2 * loc - best_loc);
              } else {
                break;
              }
            }
          }
        }
        if (match_bitapScore_(d + 1, loc) > score_threshold) {
          break;
        }
        last_rd = rd;
      }
      return best_loc;
    };
    diff_match_patch.prototype.match_alphabet_ = function(pattern) {
      var s = {};
      for (var i = 0; i < pattern.length; i++) {
        s[pattern.charAt(i)] = 0;
      }
      for (var i = 0; i < pattern.length; i++) {
        s[pattern.charAt(i)] |= 1 << pattern.length - i - 1;
      }
      return s;
    };
    diff_match_patch.prototype.patch_addContext_ = function(patch, text) {
      if (text.length == 0) {
        return;
      }
      if (patch.start2 === null) {
        throw Error("patch not initialized");
      }
      var pattern = text.substring(patch.start2, patch.start2 + patch.length1);
      var padding = 0;
      while (text.indexOf(pattern) != text.lastIndexOf(pattern) && pattern.length < this.Match_MaxBits - this.Patch_Margin - this.Patch_Margin) {
        padding += this.Patch_Margin;
        pattern = text.substring(patch.start2 - padding, patch.start2 + patch.length1 + padding);
      }
      padding += this.Patch_Margin;
      var prefix = text.substring(patch.start2 - padding, patch.start2);
      if (prefix) {
        patch.diffs.unshift(new diff_match_patch.Diff(DIFF_EQUAL, prefix));
      }
      var suffix = text.substring(patch.start2 + patch.length1, patch.start2 + patch.length1 + padding);
      if (suffix) {
        patch.diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, suffix));
      }
      patch.start1 -= prefix.length;
      patch.start2 -= prefix.length;
      patch.length1 += prefix.length + suffix.length;
      patch.length2 += prefix.length + suffix.length;
    };
    diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {
      var text1, diffs;
      if (typeof a == "string" && typeof opt_b == "string" && typeof opt_c == "undefined") {
        text1 = /** @type {string} */
        a;
        diffs = this.diff_main(
          text1,
          /** @type {string} */
          opt_b,
          true
        );
        if (diffs.length > 2) {
          this.diff_cleanupSemantic(diffs);
          this.diff_cleanupEfficiency(diffs);
        }
      } else if (a && _typeof(a) == "object" && typeof opt_b == "undefined" && typeof opt_c == "undefined") {
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        a;
        text1 = this.diff_text1(diffs);
      } else if (typeof a == "string" && opt_b && _typeof(opt_b) == "object" && typeof opt_c == "undefined") {
        text1 = /** @type {string} */
        a;
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        opt_b;
      } else if (typeof a == "string" && typeof opt_b == "string" && opt_c && _typeof(opt_c) == "object") {
        text1 = /** @type {string} */
        a;
        diffs = /** @type {!Array.<!diff_match_patch.Diff>} */
        opt_c;
      } else {
        throw new Error("Unknown call format to patch_make.");
      }
      if (diffs.length === 0) {
        return [];
      }
      var patches = [];
      var patch = new diff_match_patch.patch_obj();
      var patchDiffLength = 0;
      var char_count1 = 0;
      var char_count2 = 0;
      var prepatch_text = text1;
      var postpatch_text = text1;
      for (var x = 0; x < diffs.length; x++) {
        var diff_type = diffs[x][0];
        var diff_text = diffs[x][1];
        if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
          patch.start1 = char_count1;
          patch.start2 = char_count2;
        }
        switch (diff_type) {
          case DIFF_INSERT:
            patch.diffs[patchDiffLength++] = diffs[x];
            patch.length2 += diff_text.length;
            postpatch_text = postpatch_text.substring(0, char_count2) + diff_text + postpatch_text.substring(char_count2);
            break;
          case DIFF_DELETE:
            patch.length1 += diff_text.length;
            patch.diffs[patchDiffLength++] = diffs[x];
            postpatch_text = postpatch_text.substring(0, char_count2) + postpatch_text.substring(char_count2 + diff_text.length);
            break;
          case DIFF_EQUAL:
            if (diff_text.length <= 2 * this.Patch_Margin && patchDiffLength && diffs.length != x + 1) {
              patch.diffs[patchDiffLength++] = diffs[x];
              patch.length1 += diff_text.length;
              patch.length2 += diff_text.length;
            } else if (diff_text.length >= 2 * this.Patch_Margin) {
              if (patchDiffLength) {
                this.patch_addContext_(patch, prepatch_text);
                patches.push(patch);
                patch = new diff_match_patch.patch_obj();
                patchDiffLength = 0;
                prepatch_text = postpatch_text;
                char_count1 = char_count2;
              }
            }
            break;
        }
        if (diff_type !== DIFF_INSERT) {
          char_count1 += diff_text.length;
        }
        if (diff_type !== DIFF_DELETE) {
          char_count2 += diff_text.length;
        }
      }
      if (patchDiffLength) {
        this.patch_addContext_(patch, prepatch_text);
        patches.push(patch);
      }
      return patches;
    };
    diff_match_patch.prototype.patch_deepCopy = function(patches) {
      var patchesCopy = [];
      for (var x = 0; x < patches.length; x++) {
        var patch = patches[x];
        var patchCopy = new diff_match_patch.patch_obj();
        patchCopy.diffs = [];
        for (var y = 0; y < patch.diffs.length; y++) {
          patchCopy.diffs[y] = new diff_match_patch.Diff(patch.diffs[y][0], patch.diffs[y][1]);
        }
        patchCopy.start1 = patch.start1;
        patchCopy.start2 = patch.start2;
        patchCopy.length1 = patch.length1;
        patchCopy.length2 = patch.length2;
        patchesCopy[x] = patchCopy;
      }
      return patchesCopy;
    };
    diff_match_patch.prototype.patch_apply = function(patches, text) {
      if (patches.length == 0) {
        return [text, []];
      }
      patches = this.patch_deepCopy(patches);
      var nullPadding = this.patch_addPadding(patches);
      text = nullPadding + text + nullPadding;
      this.patch_splitMax(patches);
      var delta = 0;
      var results = [];
      for (var x = 0; x < patches.length; x++) {
        var expected_loc = patches[x].start2 + delta;
        var text1 = this.diff_text1(patches[x].diffs);
        var start_loc;
        var end_loc = -1;
        if (text1.length > this.Match_MaxBits) {
          start_loc = this.match_main(text, text1.substring(0, this.Match_MaxBits), expected_loc);
          if (start_loc != -1) {
            end_loc = this.match_main(text, text1.substring(text1.length - this.Match_MaxBits), expected_loc + text1.length - this.Match_MaxBits);
            if (end_loc == -1 || start_loc >= end_loc) {
              start_loc = -1;
            }
          }
        } else {
          start_loc = this.match_main(text, text1, expected_loc);
        }
        if (start_loc == -1) {
          results[x] = false;
          delta -= patches[x].length2 - patches[x].length1;
        } else {
          results[x] = true;
          delta = start_loc - expected_loc;
          var text2;
          if (end_loc == -1) {
            text2 = text.substring(start_loc, start_loc + text1.length);
          } else {
            text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);
          }
          if (text1 == text2) {
            text = text.substring(0, start_loc) + this.diff_text2(patches[x].diffs) + text.substring(start_loc + text1.length);
          } else {
            var diffs = this.diff_main(text1, text2, false);
            if (text1.length > this.Match_MaxBits && this.diff_levenshtein(diffs) / text1.length > this.Patch_DeleteThreshold) {
              results[x] = false;
            } else {
              this.diff_cleanupSemanticLossless(diffs);
              var index1 = 0;
              var index2;
              for (var y = 0; y < patches[x].diffs.length; y++) {
                var mod = patches[x].diffs[y];
                if (mod[0] !== DIFF_EQUAL) {
                  index2 = this.diff_xIndex(diffs, index1);
                }
                if (mod[0] === DIFF_INSERT) {
                  text = text.substring(0, start_loc + index2) + mod[1] + text.substring(start_loc + index2);
                } else if (mod[0] === DIFF_DELETE) {
                  text = text.substring(0, start_loc + index2) + text.substring(start_loc + this.diff_xIndex(diffs, index1 + mod[1].length));
                }
                if (mod[0] !== DIFF_DELETE) {
                  index1 += mod[1].length;
                }
              }
            }
          }
        }
      }
      text = text.substring(nullPadding.length, text.length - nullPadding.length);
      return [text, results];
    };
    diff_match_patch.prototype.patch_addPadding = function(patches) {
      var paddingLength = this.Patch_Margin;
      var nullPadding = "";
      for (var x = 1; x <= paddingLength; x++) {
        nullPadding += String.fromCharCode(x);
      }
      for (var x = 0; x < patches.length; x++) {
        patches[x].start1 += paddingLength;
        patches[x].start2 += paddingLength;
      }
      var patch = patches[0];
      var diffs = patch.diffs;
      if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
        diffs.unshift(new diff_match_patch.Diff(DIFF_EQUAL, nullPadding));
        patch.start1 -= paddingLength;
        patch.start2 -= paddingLength;
        patch.length1 += paddingLength;
        patch.length2 += paddingLength;
      } else if (paddingLength > diffs[0][1].length) {
        var extraLength = paddingLength - diffs[0][1].length;
        diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
        patch.start1 -= extraLength;
        patch.start2 -= extraLength;
        patch.length1 += extraLength;
        patch.length2 += extraLength;
      }
      patch = patches[patches.length - 1];
      diffs = patch.diffs;
      if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
        diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, nullPadding));
        patch.length1 += paddingLength;
        patch.length2 += paddingLength;
      } else if (paddingLength > diffs[diffs.length - 1][1].length) {
        var extraLength = paddingLength - diffs[diffs.length - 1][1].length;
        diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
        patch.length1 += extraLength;
        patch.length2 += extraLength;
      }
      return nullPadding;
    };
    diff_match_patch.prototype.patch_splitMax = function(patches) {
      var patch_size = this.Match_MaxBits;
      for (var x = 0; x < patches.length; x++) {
        if (patches[x].length1 <= patch_size) {
          continue;
        }
        var bigpatch = patches[x];
        patches.splice(x--, 1);
        var start1 = bigpatch.start1;
        var start2 = bigpatch.start2;
        var precontext = "";
        while (bigpatch.diffs.length !== 0) {
          var patch = new diff_match_patch.patch_obj();
          var empty = true;
          patch.start1 = start1 - precontext.length;
          patch.start2 = start2 - precontext.length;
          if (precontext !== "") {
            patch.length1 = patch.length2 = precontext.length;
            patch.diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, precontext));
          }
          while (bigpatch.diffs.length !== 0 && patch.length1 < patch_size - this.Patch_Margin) {
            var diff_type = bigpatch.diffs[0][0];
            var diff_text = bigpatch.diffs[0][1];
            if (diff_type === DIFF_INSERT) {
              patch.length2 += diff_text.length;
              start2 += diff_text.length;
              patch.diffs.push(bigpatch.diffs.shift());
              empty = false;
            } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 && patch.diffs[0][0] == DIFF_EQUAL && diff_text.length > 2 * patch_size) {
              patch.length1 += diff_text.length;
              start1 += diff_text.length;
              empty = false;
              patch.diffs.push(new diff_match_patch.Diff(diff_type, diff_text));
              bigpatch.diffs.shift();
            } else {
              diff_text = diff_text.substring(0, patch_size - patch.length1 - this.Patch_Margin);
              patch.length1 += diff_text.length;
              start1 += diff_text.length;
              if (diff_type === DIFF_EQUAL) {
                patch.length2 += diff_text.length;
                start2 += diff_text.length;
              } else {
                empty = false;
              }
              patch.diffs.push(new diff_match_patch.Diff(diff_type, diff_text));
              if (diff_text == bigpatch.diffs[0][1]) {
                bigpatch.diffs.shift();
              } else {
                bigpatch.diffs[0][1] = bigpatch.diffs[0][1].substring(diff_text.length);
              }
            }
          }
          precontext = this.diff_text2(patch.diffs);
          precontext = precontext.substring(precontext.length - this.Patch_Margin);
          var postcontext = this.diff_text1(bigpatch.diffs).substring(0, this.Patch_Margin);
          if (postcontext !== "") {
            patch.length1 += postcontext.length;
            patch.length2 += postcontext.length;
            if (patch.diffs.length !== 0 && patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {
              patch.diffs[patch.diffs.length - 1][1] += postcontext;
            } else {
              patch.diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, postcontext));
            }
          }
          if (!empty) {
            patches.splice(++x, 0, patch);
          }
        }
      }
    };
    diff_match_patch.prototype.patch_toText = function(patches) {
      var text = [];
      for (var x = 0; x < patches.length; x++) {
        text[x] = patches[x];
      }
      return text.join("");
    };
    diff_match_patch.prototype.patch_fromText = function(textline) {
      var patches = [];
      if (!textline) {
        return patches;
      }
      var text = textline.split("\n");
      var textPointer = 0;
      var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
      while (textPointer < text.length) {
        var m2 = text[textPointer].match(patchHeader);
        if (!m2) {
          throw new Error("Invalid patch string: " + text[textPointer]);
        }
        var patch = new diff_match_patch.patch_obj();
        patches.push(patch);
        patch.start1 = parseInt(m2[1], 10);
        if (m2[2] === "") {
          patch.start1--;
          patch.length1 = 1;
        } else if (m2[2] == "0") {
          patch.length1 = 0;
        } else {
          patch.start1--;
          patch.length1 = parseInt(m2[2], 10);
        }
        patch.start2 = parseInt(m2[3], 10);
        if (m2[4] === "") {
          patch.start2--;
          patch.length2 = 1;
        } else if (m2[4] == "0") {
          patch.length2 = 0;
        } else {
          patch.start2--;
          patch.length2 = parseInt(m2[4], 10);
        }
        textPointer++;
        while (textPointer < text.length) {
          var sign = text[textPointer].charAt(0);
          try {
            var line = decodeURI(text[textPointer].substring(1));
          } catch (ex) {
            throw new Error("Illegal escape in patch_fromText: " + line);
          }
          if (sign == "-") {
            patch.diffs.push(new diff_match_patch.Diff(DIFF_DELETE, line));
          } else if (sign == "+") {
            patch.diffs.push(new diff_match_patch.Diff(DIFF_INSERT, line));
          } else if (sign == " ") {
            patch.diffs.push(new diff_match_patch.Diff(DIFF_EQUAL, line));
          } else if (sign == "@") {
            break;
          } else if (sign === "") {
          } else {
            throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
          }
          textPointer++;
        }
      }
      return patches;
    };
    diff_match_patch.patch_obj = function() {
      this.diffs = [];
      this.start1 = null;
      this.start2 = null;
      this.length1 = 0;
      this.length2 = 0;
    };
    diff_match_patch.patch_obj.prototype.toString = function() {
      var coords1, coords2;
      if (this.length1 === 0) {
        coords1 = this.start1 + ",0";
      } else if (this.length1 == 1) {
        coords1 = this.start1 + 1;
      } else {
        coords1 = this.start1 + 1 + "," + this.length1;
      }
      if (this.length2 === 0) {
        coords2 = this.start2 + ",0";
      } else if (this.length2 == 1) {
        coords2 = this.start2 + 1;
      } else {
        coords2 = this.start2 + 1 + "," + this.length2;
      }
      var text = ["@@ -" + coords1 + " +" + coords2 + " @@\n"];
      var op;
      for (var x = 0; x < this.diffs.length; x++) {
        switch (this.diffs[x][0]) {
          case DIFF_INSERT:
            op = "+";
            break;
          case DIFF_DELETE:
            op = "-";
            break;
          case DIFF_EQUAL:
            op = " ";
            break;
        }
        text[x + 1] = op + encodeURI(this.diffs[x][1]) + "\n";
      }
      return text.join("").replace(/%20/g, " ");
    };
  }
});

// node_modules/simperium/lib/simperium/jsondiff/jsondiff.js
var require_jsondiff = __commonJS({
  "node_modules/simperium/lib/simperium/jsondiff/jsondiff.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.JSONDiff = jsondiff;
    var _diff_match_patch = _interopRequireWildcard(require_diff_match_patch());
    function _getRequireWildcardCache() {
      if (typeof WeakMap !== "function") return null;
      var cache = /* @__PURE__ */ new WeakMap();
      _getRequireWildcardCache = function _getRequireWildcardCache2() {
        return cache;
      };
      return cache;
    }
    function _interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") {
        return { default: obj };
      }
      var cache = _getRequireWildcardCache();
      if (cache && cache.has(obj)) {
        return cache.get(obj);
      }
      var newObj = {};
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key, desc);
          } else {
            newObj[key] = obj[key];
          }
        }
      }
      newObj.default = obj;
      if (cache) {
        cache.set(obj, newObj);
      }
      return newObj;
    }
    function _typeof(obj) {
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    var __hasProp = Object.prototype.hasOwnProperty;
    var __bind = function __bind2(fn, me) {
      return function() {
        return fn.apply(me, arguments);
      };
    };
    function jsondiff(options) {
      this.options = options || {
        list_diff: true
      };
      this.patch_apply_with_offsets = __bind(this.patch_apply_with_offsets, this);
      this.transform_object_diff = __bind(this.transform_object_diff, this);
      this.transform_list_diff = __bind(this.transform_list_diff, this);
      this.apply_object_diff_with_offsets = __bind(this.apply_object_diff_with_offsets, this);
      this.apply_object_diff = __bind(this.apply_object_diff, this);
      this.apply_list_diff = __bind(this.apply_list_diff, this);
      this.diff = __bind(this.diff, this);
      this.object_diff = __bind(this.object_diff, this);
      this.list_diff = __bind(this.list_diff, this);
      this._common_suffix = __bind(this._common_suffix, this);
      this._common_prefix = __bind(this._common_prefix, this);
      this.object_equals = __bind(this.object_equals, this);
      this.list_equals = __bind(this.list_equals, this);
      this.equals = __bind(this.equals, this);
      this.deepCopy = __bind(this.deepCopy, this);
      this.typeOf = __bind(this.typeOf, this);
      this.entries = __bind(this.entries, this);
    }
    jsondiff.dmp = new _diff_match_patch.default();
    jsondiff.prototype.entries = function(obj) {
      var key, n, value;
      n = 0;
      for (key in obj) {
        if (!__hasProp.call(obj, key)) continue;
        value = obj[key];
        n++;
      }
      return n;
    };
    jsondiff.prototype.typeOf = function(value) {
      var s;
      s = _typeof(value);
      if (s === "object") {
        if (value) {
          if (typeof value.length === "number" && typeof value.splice === "function" && !value.propertyIsEnumerable("length")) {
            s = "array";
          }
        } else {
          s = "null";
        }
      }
      return s;
    };
    jsondiff.prototype.deepCopy = function(obj) {
      var i, out, _ref;
      if (Object.prototype.toString.call(obj) === "[object Array]") {
        out = [];
        for (i = 0, _ref = obj.length; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
          out[i] = jsondiff.prototype.deepCopy(obj[i]);
        }
        return out;
      }
      if (_typeof(obj) === "object") {
        out = {};
        for (i in obj) {
          out[i] = jsondiff.prototype.deepCopy(obj[i]);
        }
        return out;
      }
      return obj;
    };
    jsondiff.prototype.equals = function(a, b) {
      var typea, typeb;
      typea = this.typeOf(a);
      typeb = this.typeOf(b);
      if (typea === "boolean" && typeb === "number") return Number(a) === b;
      if (typea === "number" && typea === "boolean") return Number(b) === a;
      if (typea !== typeb) return false;
      if (typea === "array") {
        return this.list_equals(a, b);
      } else if (typea === "object") {
        return this.object_equals(a, b);
      } else {
        return a === b;
      }
    };
    jsondiff.prototype.list_equals = function(a, b) {
      var alength, i;
      alength = a.length;
      if (alength !== b.length) return false;
      for (i = 0; 0 <= alength ? i < alength : i > alength; 0 <= alength ? i++ : i--) {
        if (!this.equals(a[i], b[i])) return false;
      }
      return true;
    };
    jsondiff.prototype.object_equals = function(a, b) {
      var key;
      for (key in a) {
        if (!__hasProp.call(a, key)) continue;
        if (!(key in b)) return false;
        if (!this.equals(a[key], b[key])) return false;
      }
      for (key in b) {
        if (!__hasProp.call(b, key)) continue;
        if (!(key in a)) return false;
      }
      return true;
    };
    jsondiff.prototype._common_prefix = function(a, b) {
      var i, minlen;
      minlen = Math.min(a.length, b.length);
      for (i = 0; 0 <= minlen ? i < minlen : i > minlen; 0 <= minlen ? i++ : i--) {
        if (!this.equals(a[i], b[i])) return i;
      }
      return minlen;
    };
    jsondiff.prototype._common_suffix = function(a, b) {
      var i, lena, lenb, minlen;
      lena = a.length;
      lenb = b.length;
      minlen = Math.min(a.length, b.length);
      if (minlen === 0) return 0;
      for (i = 0; 0 <= minlen ? i < minlen : i > minlen; 0 <= minlen ? i++ : i--) {
        if (!this.equals(a[lena - i - 1], b[lenb - i - 1])) return i;
      }
      return minlen;
    };
    jsondiff.prototype.list_diff = function(a, b) {
      var diffs, i, lena, lenb, maxlen, prefix_len, suffix_len;
      diffs = {};
      lena = a.length;
      lenb = b.length;
      prefix_len = this._common_prefix(a, b);
      suffix_len = this._common_suffix(a, b);
      a = a.slice(prefix_len, lena - suffix_len);
      b = b.slice(prefix_len, lenb - suffix_len);
      lena = a.length;
      lenb = b.length;
      maxlen = Math.max(lena, lenb);
      for (i = 0; 0 <= maxlen ? i <= maxlen : i >= maxlen; 0 <= maxlen ? i++ : i--) {
        if (i < lena && i < lenb) {
          if (!this.equals(a[i], b[i])) {
            diffs[i + prefix_len] = this.diff(a[i], b[i]);
          }
        } else if (i < lena) {
          diffs[i + prefix_len] = {
            "o": "-"
          };
        } else if (i < lenb) {
          diffs[i + prefix_len] = {
            "o": "+",
            "v": b[i]
          };
        }
      }
      return diffs;
    };
    jsondiff.prototype.object_diff = function(a, b) {
      var diffs, key;
      diffs = {};
      if (!(a != null) || !(b != null)) return {};
      for (key in a) {
        if (!__hasProp.call(a, key)) continue;
        if (key in b) {
          if (!this.equals(a[key], b[key])) diffs[key] = this.diff(a[key], b[key]);
        } else {
          diffs[key] = {
            "o": "-"
          };
        }
      }
      for (key in b) {
        if (!__hasProp.call(b, key)) continue;
        if (!(key in a)) {
          diffs[key] = {
            "o": "+",
            "v": b[key]
          };
        }
      }
      return diffs;
    };
    jsondiff.prototype.diff = function(a, b) {
      var diffs, typea;
      if (this.equals(a, b)) return {};
      typea = this.typeOf(a);
      if (typea !== this.typeOf(b)) {
        return {
          "o": "r",
          "v": b
        };
      }
      switch (typea) {
        case "boolean":
          return {
            "o": "r",
            "v": b
          };
        case "number":
          return {
            "o": "r",
            "v": b
          };
        case "array":
          if (this.options.list_diff) {
            return {
              "o": "L",
              "v": this.list_diff(a, b)
            };
          } else {
            return {
              "o": "r",
              "v": b
            };
          }
        case "object":
          return {
            "o": "O",
            "v": this.object_diff(a, b)
          };
        case "string":
          diffs = jsondiff.dmp.diff_main(a, b);
          if (diffs.length > 2) jsondiff.dmp.diff_cleanupEfficiency(diffs);
          if (diffs.length > 0) {
            return {
              "o": "d",
              "v": jsondiff.dmp.diff_toDelta(diffs)
            };
          }
      }
      return {};
    };
    jsondiff.prototype.apply_list_diff = function(s, diffs) {
      var deleted, dmp_diffs, dmp_patches, dmp_result, index, indexes, key, op, patched, s_index, shift, x, _i, _len, _ref, _ref2;
      patched = this.deepCopy(s);
      indexes = [];
      deleted = [];
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        indexes.push(key);
        indexes.sort();
      }
      for (_i = 0, _len = indexes.length; _i < _len; _i++) {
        index = indexes[_i];
        op = diffs[index];
        shift = (function() {
          var _j, _len2, _results;
          _results = [];
          for (_j = 0, _len2 = deleted.length; _j < _len2; _j++) {
            x = deleted[_j];
            if (x <= index) _results.push(x);
          }
          return _results;
        })().length;
        s_index = index - shift;
        switch (op["o"]) {
          case "+":
            [].splice.apply(patched, [s_index, s_index - s_index + 1].concat(_ref = op["v"])), _ref;
            break;
          case "-":
            [].splice.apply(patched, [s_index, s_index - s_index + 1].concat(_ref2 = [])), _ref2;
            deleted[deleted.length] = s_index;
            break;
          case "r":
            patched[s_index] = op["v"];
            break;
          case "I":
            patched[s_index] += op["v"];
            break;
          case "L":
            patched[s_index] = this.apply_list_diff(patched[s_index], op["v"]);
            break;
          case "O":
            patched[s_index] = this.apply_object_diff(patched[s_index], op["v"]);
            break;
          case "d":
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[s_index], op["v"]);
            dmp_patches = jsondiff.dmp.patch_make(patched[s_index], dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[s_index]);
            patched[s_index] = dmp_result[0];
        }
      }
      return patched;
    };
    jsondiff.prototype.apply_object_diff = function(s, diffs) {
      var dmp_diffs, dmp_patches, dmp_result, key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        op = diffs[key];
        switch (op["o"]) {
          case "+":
            patched[key] = op["v"];
            break;
          case "-":
            delete patched[key];
            break;
          case "r":
            patched[key] = op["v"];
            break;
          case "I":
            patched[key] += op["v"];
            break;
          case "L":
            patched[key] = this.apply_list_diff(patched[key], op["v"]);
            break;
          case "O":
            patched[key] = this.apply_object_diff(patched[key], op["v"]);
            break;
          case "d":
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[key], op["v"]);
            dmp_patches = jsondiff.dmp.patch_make(patched[key], dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[key]);
            patched[key] = dmp_result[0];
        }
      }
      return patched;
    };
    jsondiff.prototype.apply_object_diff_with_offsets = function(s, diffs, field, offsets) {
      var dmp_diffs, dmp_patches, dmp_result, key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        op = diffs[key];
        switch (op["o"]) {
          case "+":
            patched[key] = op["v"];
            break;
          case "-":
            delete patched[key];
            break;
          case "r":
            patched[key] = op["v"];
            break;
          case "I":
            patched[key] += op["v"];
            break;
          case "L":
            patched[key] = this.apply_list_diff(patched[key], op["v"]);
            break;
          case "O":
            patched[key] = this.apply_object_diff(patched[key], op["v"]);
            break;
          case "d":
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[key], op["v"]);
            dmp_patches = jsondiff.dmp.patch_make(patched[key], dmp_diffs);
            if (key === field) {
              patched[key] = this.patch_apply_with_offsets(dmp_patches, patched[key], offsets);
            } else {
              dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[key]);
              patched[key] = dmp_result[0];
            }
        }
      }
      return patched;
    };
    jsondiff.prototype.transform_list_diff = function(ad, bd, s) {
      var ad_new, b_deletes, b_inserts, diff, index, op, shift_l, shift_r, sindex, x;
      ad_new = {};
      b_inserts = [];
      b_deletes = [];
      for (index in bd) {
        if (!__hasProp.call(bd, index)) continue;
        op = bd[index];
        if (op["o"] === "+") b_inserts.push(index);
        if (op["o"] === "-") b_deletes.push(index);
      }
      for (index in ad) {
        if (!__hasProp.call(ad, index)) continue;
        op = ad[index];
        shift_r = [(function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = b_inserts.length; _i < _len; _i++) {
            x = b_inserts[_i];
            if (x <= index) _results.push(x);
          }
          return _results;
        })()].length;
        shift_l = [(function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = b_deletes.length; _i < _len; _i++) {
            x = b_deletes[_i];
            if (x <= index) _results.push(x);
          }
          return _results;
        })()].length;
        index = index + shift_r - shift_l;
        sindex = String(index);
        ad_new[sindex] = op;
        if (index in bd) {
          if (op["o"] === "+" && bd.index["o"] === "+") {
            continue;
          } else if (op["o"] === "-" && bd.index["o"] === "-") {
            delete ad_new[sindex];
          } else {
            diff = this.transform_object_diff({
              sindex: op
            }, {
              sindex: bd.index
            }, s);
            ad_new[sindex] = diff[sindex];
          }
        }
      }
      return ad_new;
    };
    jsondiff.prototype.transform_object_diff = function(ad, bd, s) {
      var a_patches, ab_text, ad_new, aop, b_patches, b_text, bop, dmp_diffs, dmp_patches, dmp_result, key, sk, _ref;
      ad_new = this.deepCopy(ad);
      for (key in ad) {
        if (!__hasProp.call(ad, key)) continue;
        aop = ad[key];
        if (!(key in bd)) continue;
        sk = s[key];
        bop = bd[key];
        if (aop["o"] === "+" && bop["o"] === "+") {
          if (this.equals(aop["v"], bop["v"])) {
            delete ad_new[key];
          } else {
            ad_new[key] = this.diff(bop["v"], aop["v"]);
          }
        } else if (aop["o"] === "-" && bop["o"] === "-") {
          delete ad_new[key];
        } else if (bop["o"] === "-" && ((_ref = aop["o"]) === "O" || _ref === "L" || _ref === "I" || _ref === "d")) {
          ad_new[key] = {
            "o": "+"
          };
          if (aop["o"] === "O") {
            ad_new[key]["v"] = this.apply_object_diff(sk, aop["v"]);
          } else if (aop["o"] === "L") {
            ad_new[key]["v"] = this.apply_list_diff(sk, aop["v"]);
          } else if (aop["o"] === "I") {
            ad_new[key]["v"] = sk + aop["v"];
          } else if (aop["o"] === "d") {
            dmp_diffs = jsondiff.dmp.diff_fromDelta(sk, aop["v"]);
            dmp_patches = jsondiff.dmp.patch_make(sk, dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, sk);
            ad_new[key]["v"] = dmp_result[0];
          }
        } else if (aop["o"] === "O" && bop["o"] === "O") {
          ad_new[key] = {
            "o": "O",
            "v": this.transform_object_diff(aop["v"], bop["v"], sk)
          };
        } else if (aop["o"] === "L" && bop["o"] === "L") {
          ad_new[key] = {
            "o": "O",
            "v": this.transform_list_diff(aop["v"], bop["v"], sk)
          };
        } else if (aop["o"] === "d" && bop["o"] === "d") {
          delete ad_new[key];
          a_patches = jsondiff.dmp.patch_make(sk, jsondiff.dmp.diff_fromDelta(sk, aop["v"]));
          b_patches = jsondiff.dmp.patch_make(sk, jsondiff.dmp.diff_fromDelta(sk, bop["v"]));
          b_text = jsondiff.dmp.patch_apply(b_patches, sk)[0];
          ab_text = jsondiff.dmp.patch_apply(a_patches, b_text)[0];
          if (ab_text !== b_text) {
            dmp_diffs = jsondiff.dmp.diff_main(b_text, ab_text);
            if (dmp_diffs.length > 2) {
              jsondiff.dmp.diff_cleanupEfficiency(dmp_diffs);
            }
            if (dmp_diffs.length > 0) {
              ad_new[key] = {
                "o": "d",
                "v": jsondiff.dmp.diff_toDelta(dmp_diffs)
              };
            }
          }
        }
        return ad_new;
      }
    };
    jsondiff.prototype.patch_apply_with_offsets = function(patches, text, offsets) {
    };
    jsondiff.prototype.patch_apply_with_offsets = function(patches, text, offsets) {
      if (patches.length == 0) {
        return text;
      }
      patches = jsondiff.dmp.patch_deepCopy(patches);
      var nullPadding = jsondiff.dmp.patch_addPadding(patches);
      text = nullPadding + text + nullPadding;
      jsondiff.dmp.patch_splitMax(patches);
      var delta = 0;
      for (var x = 0; x < patches.length; x++) {
        var expected_loc = patches[x].start2 + delta;
        var text1 = jsondiff.dmp.diff_text1(patches[x].diffs);
        var start_loc;
        var end_loc = -1;
        if (text1.length > jsondiff.dmp.Match_MaxBits) {
          start_loc = jsondiff.dmp.match_main(text, text1.substring(0, jsondiff.dmp.Match_MaxBits), expected_loc);
          if (start_loc != -1) {
            end_loc = jsondiff.dmp.match_main(text, text1.substring(text1.length - jsondiff.dmp.Match_MaxBits), expected_loc + text1.length - jsondiff.dmp.Match_MaxBits);
            if (end_loc == -1 || start_loc >= end_loc) {
              start_loc = -1;
            }
          }
        } else {
          start_loc = jsondiff.dmp.match_main(text, text1, expected_loc);
        }
        if (start_loc == -1) {
          delta -= patches[x].length2 - patches[x].length1;
        } else {
          delta = start_loc - expected_loc;
          var text2;
          if (end_loc == -1) {
            text2 = text.substring(start_loc, start_loc + text1.length);
          } else {
            text2 = text.substring(start_loc, end_loc + jsondiff.dmp.Match_MaxBits);
          }
          var diffs = jsondiff.dmp.diff_main(text1, text2, false);
          if (text1.length > jsondiff.dmp.Match_MaxBits && jsondiff.dmp.diff_levenshtein(diffs) / text1.length > jsondiff.dmp.Patch_DeleteThreshold) {
          } else {
            var index1 = 0;
            var index2;
            for (var y = 0; y < patches[x].diffs.length; y++) {
              var mod = patches[x].diffs[y];
              if (mod[0] !== _diff_match_patch.DIFF_EQUAL) {
                index2 = jsondiff.dmp.diff_xIndex(diffs, index1);
              }
              if (mod[0] === _diff_match_patch.DIFF_INSERT) {
                text = text.substring(0, start_loc + index2) + mod[1] + text.substring(start_loc + index2);
                for (var i = 0; i < offsets.length; i++) {
                  if (offsets[i] + nullPadding.length > start_loc + index2) {
                    offsets[i] += mod[1].length;
                  }
                }
              } else if (mod[0] === _diff_match_patch.DIFF_DELETE) {
                var del_start = start_loc + index2;
                var del_end = start_loc + jsondiff.dmp.diff_xIndex(diffs, index1 + mod[1].length);
                text = text.substring(0, del_start) + text.substring(del_end);
                for (var i = 0; i < offsets.length; i++) {
                  if (offsets[i] + nullPadding.length > del_start) {
                    if (offsets[i] + nullPadding.length < del_end) {
                      offsets[i] = del_start - nullPadding.length;
                    } else {
                      offsets[i] -= del_end - del_start;
                    }
                  }
                }
              }
              if (mod[0] !== _diff_match_patch.DIFF_DELETE) {
                index1 += mod[1].length;
              }
            }
          }
        }
      }
      text = text.substring(nullPadding.length, text.length - nullPadding.length);
      return text;
    };
  }
});

// node_modules/simperium/lib/simperium/jsondiff/index.js
var require_jsondiff2 = __commonJS({
  "node_modules/simperium/lib/simperium/jsondiff/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _jsondiff = require_jsondiff();
    var jsondiff = new _jsondiff.JSONDiff({
      list_diff: false
    });
    exports.default = jsondiff;
  }
});

// node_modules/simperium/lib/simperium/util/change.js
var require_change = __commonJS({
  "node_modules/simperium/lib/simperium/util/change.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.buildChange = buildChange;
    exports.compressChanges = compressChanges;
    exports.transform = rebase;
    exports.modify = modify;
    exports.apply = apply_diff;
    exports.isEmptyChange = isEmptyChange;
    exports.diff = exports.type = void 0;
    var _v = _interopRequireDefault(require_v4());
    var _jsondiff = _interopRequireDefault(require_jsondiff2());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var transform_object_diff = _jsondiff.default.transform_object_diff;
    var apply_object_diff = _jsondiff.default.apply_object_diff;
    var object_diff = _jsondiff.default.object_diff;
    exports.diff = object_diff;
    var changeTypes = {
      MODIFY: "M",
      REMOVE: "-"
    };
    exports.type = changeTypes;
    function modify(id, version, patch) {
      return {
        o: "M",
        id,
        ccid: (0, _v.default)(),
        v: patch
      };
    }
    function buildChange(type, id, object, ghost) {
      if (type === "-") return {
        o: "-",
        id,
        ccid: (0, _v.default)()
      };
      var change = {
        o: "M",
        id,
        ccid: (0, _v.default)(),
        v: object_diff(ghost.data, object)
      };
      if (ghost.version > 0) change.sv = ghost.version;
      return change;
    }
    function compressChanges(changes, origin) {
      if (changes.length === 0) {
        return {};
      }
      if (changes.length === 1) {
        var change = changes[0];
        if (change.o === "M") {
          return change.v;
        }
        return null;
      }
      var modified = changes.reduce(function(from, change2) {
        if (from === null) return null;
        if (change2.o === "-") return null;
        return apply_object_diff(from, change2.v);
      }, origin);
      if (modified === null) return null;
      return object_diff(origin, modified);
    }
    function rebase(modifications, upstream, base) {
      return transform_object_diff(modifications, upstream, base);
    }
    function apply_diff(modifications, base) {
      return apply_object_diff(base, modifications);
    }
    function isEmptyChange(change) {
      switch (change.o) {
        case "M": {
          return Object.keys(change.v).length === 0;
        }
        default: {
          false;
        }
      }
    }
  }
});

// node_modules/simperium/lib/simperium/util/parse_message.js
var require_parse_message = __commonJS({
  "node_modules/simperium/lib/simperium/util/parse_message.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    function _default(data) {
      var marker = data.indexOf(":");
      return {
        command: data.slice(0, marker),
        data: data.slice(marker + 1)
      };
    }
  }
});

// node_modules/simperium/lib/simperium/util/parse_version_message.js
var require_parse_version_message = __commonJS({
  "node_modules/simperium/lib/simperium/util/parse_version_message.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    function _default(data) {
      var dataMark = data.indexOf("\n"), versionMark = data.indexOf("."), id = data.slice(0, versionMark), version = parseInt(data.slice(versionMark + 1, dataMark)), payload = JSON.parse(data.slice(dataMark + 1));
      return {
        data: payload.data,
        id,
        version
      };
    }
  }
});

// node_modules/simperium/lib/simperium/util/index.js
var require_util = __commonJS({
  "node_modules/simperium/lib/simperium/util/index.js"(exports) {
    "use strict";
    function _typeof(obj) {
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    Object.defineProperty(exports, "parseMessage", {
      enumerable: true,
      get: function get() {
        return _parse_message.default;
      }
    });
    Object.defineProperty(exports, "parseVersionMessage", {
      enumerable: true,
      get: function get() {
        return _parse_version_message.default;
      }
    });
    exports.change = void 0;
    var change = _interopRequireWildcard(require_change());
    exports.change = change;
    var _parse_message = _interopRequireDefault(require_parse_message());
    var _parse_version_message = _interopRequireDefault(require_parse_version_message());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _getRequireWildcardCache() {
      if (typeof WeakMap !== "function") return null;
      var cache = /* @__PURE__ */ new WeakMap();
      _getRequireWildcardCache = function _getRequireWildcardCache2() {
        return cache;
      };
      return cache;
    }
    function _interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") {
        return { default: obj };
      }
      var cache = _getRequireWildcardCache();
      if (cache && cache.has(obj)) {
        return cache.get(obj);
      }
      var newObj = {};
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key, desc);
          } else {
            newObj[key] = obj[key];
          }
        }
      }
      newObj.default = obj;
      if (cache) {
        cache.set(obj, newObj);
      }
      return newObj;
    }
  }
});

// node_modules/simperium/lib/simperium/util/operation.js
var require_operation = __commonJS({
  "node_modules/simperium/lib/simperium/util/operation.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = buildChange;
    var _ = require_util();
    function ownKeys(object, enumerableOnly) {
      var keys = Object.keys(object);
      if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) symbols = symbols.filter(function(sym) {
          return Object.getOwnPropertyDescriptor(object, sym).enumerable;
        });
        keys.push.apply(keys, symbols);
      }
      return keys;
    }
    function _objectSpread(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i] != null ? arguments[i] : {};
        if (i % 2) {
          ownKeys(Object(source), true).forEach(function(key) {
            _defineProperty(target, key, source[key]);
          });
        } else if (Object.getOwnPropertyDescriptors) {
          Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
        } else {
          ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
          });
        }
      }
      return target;
    }
    function _defineProperty(obj, key, value) {
      if (key in obj) {
        Object.defineProperty(obj, key, { value, enumerable: true, configurable: true, writable: true });
      } else {
        obj[key] = value;
      }
      return obj;
    }
    function buildChange(operation, ghost) {
      switch (operation.type) {
        case "modify": {
          return _.change.buildChange("M", operation.id, operation.object, ghost);
        }
        case "remove": {
          return _.change.buildChange("-", operation.id, {}, ghost);
        }
        case "full": {
          return _objectSpread({}, operation.originalChange, {
            d: operation.object
          });
        }
        default: {
          operation.type;
          throw new Error("Unknown operation type " + JSON.stringify(operation));
        }
      }
    }
  }
});

// node_modules/simperium/lib/simperium/channel.js
var require_channel = __commonJS({
  "node_modules/simperium/lib/simperium/channel.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = Channel;
    exports.revisionCache = void 0;
    var _inherits = _interopRequireDefault(require_inherits());
    var _events = __require("events");
    var _util = require_util();
    var _uuid = require_uuid();
    var _operation = _interopRequireDefault(require_operation());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var UNKNOWN_CV = "?";
    var CODE_INVALID_VERSION = 405;
    var CODE_DUPLICATE_CHANGE = 409;
    var CODE_EMPTY_RESPONSE = 412;
    var CODE_INVALID_DIFF = 440;
    var operation = {
      MODIFY: _util.change.type.MODIFY,
      REMOVE: _util.change.type.REMOVE
    };
    var internal = {};
    internal.updateChangeVersion = function(cv) {
      var _this = this;
      return this.store.setChangeVersion(cv).then(function() {
        _this.emit("change-version", cv);
        return cv;
      });
    };
    internal.buildModifyChange = function(id, object, ghost) {
      var payload = _util.change.buildChange(_util.change.type.MODIFY, id, object, ghost), empty = true, key;
      for (key in payload.v) {
        if (key) {
          empty = false;
          break;
        }
      }
      if (empty) {
        this.emit("unmodified", id, object, ghost);
        return;
      }
      this.localQueue.queue({
        type: "modify",
        id,
        object
      });
    };
    internal.updateObjectVersion = function(id, version, data, original, patch, acknowledged) {
      var _this2 = this;
      var save = function save2() {
        return _this2.store.put(id, version, data);
      };
      if (acknowledged) {
        return save().then(function() {
          internal.updateAcknowledged.call(_this2, acknowledged);
        });
      }
      return this.onBeforeNetworkChange(id, data, original, patch).then(function(local) {
        var localModifications = _util.change.diff(original, local), transformed = _util.change.transform(localModifications, patch, original);
        _this2.localQueue.dequeueChangesFor(id);
        return save().then(function() {
          var update = data;
          if (transformed) {
            update = _util.change.apply(transformed, data);
            _this2.localQueue.queue({
              type: "modify",
              id,
              object: update
            });
          }
          _this2.emit("update", id, update, original, patch, _this2.isIndexing);
        });
      });
    };
    internal.removeObject = function(id, acknowledged) {
      var notify;
      if (!acknowledged) {
        notify = this.emit.bind(this, "remove", id);
      } else {
        notify = internal.updateAcknowledged.bind(this, acknowledged);
      }
      return this.store.remove(id).then(notify);
    };
    internal.updateAcknowledged = function(change) {
      var id = change.id;
      if (this.localQueue.sent[id] === change) {
        this.localQueue.acknowledge(change);
        this.emit("acknowledge", id, change);
      }
    };
    internal.findAcknowledgedChange = function(change) {
      var possibleChange = this.localQueue.sent[change.id];
      if (possibleChange) {
        if ((change.ccids || []).indexOf(possibleChange.ccid) > -1) {
          return possibleChange;
        }
      }
    };
    internal.requestObjectVersion = function(id, version) {
      var _this3 = this;
      return new Promise(function(resolve) {
        _this3.once("version.".concat(id, ".").concat(version), function(data) {
          resolve(data);
        });
        _this3.send("e:".concat(id, ".").concat(version));
      });
    };
    internal.applyChange = function(change, ghost) {
      var _this4 = this;
      var acknowledged = internal.findAcknowledgedChange.call(this, change), updateChangeVersion = internal.updateChangeVersion.bind(this, change.cv);
      var error, original, patch, modified;
      if (change.error) {
        error = new Error("".concat(change.error, " - Could not apply change to: ").concat(ghost.key));
        error.code = change.error;
        error.change = change;
        error.ghost = ghost;
        internal.handleChangeError.call(this, error, change, acknowledged);
        return;
      }
      if (change.o === operation.MODIFY) {
        if (ghost && ghost.version !== change.sv) {
          internal.requestObjectVersion.call(this, change.id, change.sv).then(function(data) {
            internal.applyChange.call(_this4, change, {
              version: change.sv,
              data
            });
          });
          return;
        }
        original = ghost.data;
        patch = change.v;
        modified = _util.change.apply(patch, original);
        return internal.updateObjectVersion.call(this, change.id, change.ev, modified, original, patch, acknowledged).then(updateChangeVersion);
      } else if (change.o === operation.REMOVE) {
        return internal.removeObject.bind(this)(change.id, acknowledged).then(updateChangeVersion);
      }
    };
    internal.handleChangeError = function(err, change, acknowledged) {
      var _this5 = this;
      switch (err.code) {
        case CODE_INVALID_VERSION:
        case CODE_INVALID_DIFF:
          if (!acknowledged || !acknowledged.d) {
            this.store.get(change.id).then(function(object) {
              _this5.localQueue.queue({
                type: "full",
                originalChange: acknowledged,
                object
              });
            });
          } else {
            this.localQueue.dequeueChangesFor(change.id);
          }
          break;
        case CODE_DUPLICATE_CHANGE:
          internal.updateAcknowledged.call(this, acknowledged);
          break;
        case CODE_EMPTY_RESPONSE:
          internal.updateAcknowledged.call(this, acknowledged);
          break;
        default:
          this.emit("error", err, change);
      }
    };
    internal.indexingComplete = function() {
      var _this6 = this;
      this.setIsIndexing(false);
      internal.updateChangeVersion.call(this, this.index_cv).then(function() {
        _this6.localQueue.start();
      });
      this.emit("index", this.index_cv);
      this.index_last_id = null;
      this.index_cv = null;
      this.emit("ready");
    };
    function Channel(appid, access_token, store, name) {
      var _this7 = this;
      var message = this.message = new _events.EventEmitter();
      this.name = name;
      this.isIndexing = false;
      this.appid = appid;
      this.store = store;
      this.access_token = access_token;
      this.session_id = "node-" + (0, _uuid.v4)();
      message.on("auth", this.onAuth.bind(this));
      message.on("i", this.onIndex.bind(this));
      message.on("c", this.onChanges.bind(this));
      message.on("e", this.onVersion.bind(this));
      message.on("cv", this.onChangeVersion.bind(this));
      message.on("o", function() {
      });
      this.networkQueue = new NetworkQueue();
      this.localQueue = new LocalQueue(this.store);
      this.localQueue.on("send", function(data) {
        _this7.emit("send", "c:".concat(JSON.stringify(data)));
      });
      this.localQueue.on("error", internal.handleChangeError.bind(this));
    }
    (0, _inherits.default)(Channel, _events.EventEmitter);
    Channel.prototype.update = function(object) {
      var _this8 = this;
      var sync = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : true;
      this.onBucketUpdate(object.id);
      if (sync === true) {
        return this.store.get(object.id).then(function(ghost) {
          return internal.buildModifyChange.call(_this8, object.id, object.data, ghost);
        }).then(function() {
          return object;
        });
      }
      return Promise.resolve(object);
    };
    Channel.prototype.setIsIndexing = function(isIndexing) {
      this.isIndexing = isIndexing;
      this.emit("indexingStateChange", this.isIndexing);
    };
    Channel.prototype.remove = function(id) {
      var _this9 = this;
      this.store.get(id).then(function() {
        return _this9.localQueue.queue({
          type: "remove",
          id
        });
      });
    };
    Channel.prototype.getRevisions = function(id) {
      var _this10 = this;
      return new Promise(function(resolve, reject) {
        collectionRevisions(_this10, id, function(error, revisions) {
          if (error) {
            reject(error);
            return;
          }
          resolve(revisions);
        });
      });
    };
    Channel.prototype.hasLocalChanges = function() {
      return Promise.resolve(Object.keys(this.localQueue.queues).length > 0);
    };
    Channel.prototype.getVersion = function(id) {
      return this.store.get(id).then(function(ghost) {
        if (ghost && ghost.version) {
          return ghost.version;
        }
        return 0;
      });
    };
    Channel.prototype.beforeNetworkChange = function(changeResolver) {
      this.changeResolver = changeResolver;
    };
    Channel.prototype.onBeforeNetworkChange = function(id, data, base, patch) {
      if (this.changeResolver) {
        return Promise.resolve(this.changeResolver(id, data, base, patch));
      }
      return Promise.resolve();
    };
    Channel.prototype.handleMessage = function(data) {
      var message = (0, _util.parseMessage)(data);
      this.message.emit(message.command, message.data);
    };
    Channel.prototype.send = function(data) {
      this.emit("send", data);
    };
    Channel.prototype.reload = function() {
      var _this11 = this;
      this.store.eachGhost(function(ghost) {
        _this11.emit("update", ghost.key, ghost.data);
      });
    };
    Channel.prototype.onBucketUpdate = function(id) {
      if (!this.isIndexing) {
        return;
      }
      if (this.index_last_id == null || this.index_cv == null) {
        return;
      } else if (this.index_last_id === id) {
        internal.indexingComplete.call(this);
      }
    };
    Channel.prototype.onAuth = function(data) {
      var _this12 = this;
      var auth;
      var init;
      try {
        auth = JSON.parse(data);
        this.emit("unauthorized", auth);
        return;
      } catch (error) {
        this.once("ready", function() {
          _this12.localQueue.resendSentChanges();
        });
        init = function init2(cv) {
          if (cv) {
            _this12.localQueue.start();
            _this12.sendChangeVersionRequest(cv);
          } else {
            _this12.startIndexing();
          }
        };
        this.store.getChangeVersion().then(init);
        return;
      }
    };
    Channel.prototype.startIndexing = function() {
      this.localQueue.pause();
      this.setIsIndexing(true);
      this.sendIndexRequest();
    };
    Channel.prototype.onConnect = function() {
      var init = {
        name: this.name,
        clientid: this.session_id,
        api: "1.1",
        token: this.access_token,
        app_id: this.appid,
        library: "node-simperium",
        version: "0.0.1"
      };
      this.send("init:".concat(JSON.stringify(init)));
    };
    Channel.prototype.onIndex = function(data) {
      var page = JSON.parse(data), objects = page.index, mark = page.mark, cv = page.current, update = internal.updateObjectVersion.bind(this);
      var objectId;
      objects.forEach(function(object) {
        objectId = object.id;
        update(object.id, object.v, object.d);
      });
      if (!mark) {
        if (objectId) {
          this.index_last_id = objectId;
        }
        if (!this.index_last_id) {
          internal.indexingComplete.call(this);
        }
        this.index_cv = cv;
      } else {
        this.sendIndexRequest(mark);
      }
    };
    Channel.prototype.sendIndexRequest = function(mark) {
      this.send("i:1:".concat(mark ? mark : "", "::10"));
    };
    Channel.prototype.sendChangeVersionRequest = function(cv) {
      this.send("cv:".concat(cv));
    };
    Channel.prototype.onChanges = function(changes) {
      var _this13 = this;
      JSON.parse(changes).forEach(function(change) {
        _this13.networkQueue.queueFor(change.id).add(function(done) {
          return _this13.store.get(change.id).then(function(ghost) {
            return internal.applyChange.call(_this13, change, ghost);
          }).then(done, done);
        });
      });
      this.emit("ready");
    };
    Channel.prototype.onChangeVersion = function(data) {
      var _this14 = this;
      if (data === UNKNOWN_CV) {
        this.store.setChangeVersion(null).then(function() {
          return _this14.startIndexing();
        });
      }
    };
    Channel.prototype.onVersion = function(data) {
      if (data.slice(-2) === "\n?") {
        return;
      }
      var ghost = (0, _util.parseVersionMessage)(data);
      this.emit("version", ghost.id, ghost.version, ghost.data);
      this.emit("version." + ghost.id, ghost.id, ghost.version, ghost.data);
      this.emit("version." + ghost.id + "." + ghost.version, ghost.data);
    };
    function NetworkQueue() {
      this.queues = {};
    }
    NetworkQueue.prototype.queueFor = function(id) {
      var queues = this.queues, queue = queues[id];
      if (!queue) {
        queue = new Queue();
        queue.on("finish", function() {
          delete queues[id];
        });
        queues[id] = queue;
      }
      return queue;
    };
    function Queue() {
      this.queue = [];
      this.running = false;
    }
    (0, _inherits.default)(Queue, _events.EventEmitter);
    Queue.prototype.add = function(fn) {
      this.queue.push(fn);
      this.start();
      return this;
    };
    Queue.prototype.start = function() {
      if (this.running) return;
      this.running = true;
      this.emit("start");
      setImmediate(this.run.bind(this));
    };
    Queue.prototype.run = function() {
      var fn;
      this.running = true;
      if (this.queue.length === 0) {
        this.running = false;
        this.emit("finish");
        return;
      }
      fn = this.queue.shift();
      fn(this.run.bind(this));
    };
    function LocalQueue(store) {
      this.store = store;
      this.sent = {};
      this.queues = {};
      this.ready = false;
    }
    (0, _inherits.default)(LocalQueue, _events.EventEmitter);
    LocalQueue.prototype.start = function() {
      var queueId;
      this.ready = true;
      for (queueId in this.queues) {
        this.processQueue(queueId);
      }
    };
    LocalQueue.prototype.pause = function() {
      this.ready = false;
    };
    LocalQueue.prototype.acknowledge = function(change) {
      if (this.sent[change.id] === change) {
        delete this.sent[change.id];
      }
      this.processQueue(change.id);
    };
    LocalQueue.prototype.queue = function(change) {
      var queue = this.queues[change.id];
      if (!queue) {
        queue = [];
        this.queues[change.id] = queue;
      }
      queue.push(change);
      this.emit("queued", change.id, change, queue);
      if (!this.ready) return;
      this.processQueue(change.id);
    };
    LocalQueue.prototype.dequeueChangesFor = function(id) {
      var changes = [], sent = this.sent[id], queue = this.queues[id];
      if (sent) {
        changes.push(sent);
      }
      if (queue) {
        delete this.queues[id];
        changes = changes.concat(queue);
      }
      return changes;
    };
    LocalQueue.prototype.processQueue = function(id) {
      var _this15 = this;
      var queue = this.queues[id];
      if (!queue) return;
      if (queue.length === 0) {
        delete this.queues[id];
        return;
      }
      if (this.sent[id]) {
        this.emit("wait", id);
        return;
      }
      this.store.get(id).then(function(ghost) {
        var changes = _this15.queues[id];
        if (_this15.sent[id]) {
          _this15.emit("wait", id);
          return;
        }
        var sending = changes.reduce(function(chosen, next) {
          return "remove" === chosen.type ? chosen : next;
        });
        var change = (0, _operation.default)(sending, ghost);
        _this15.queues[id] = [];
        if (_util.change.isEmptyChange(change)) {
          return;
        }
        _this15.sent[id] = change;
        _this15.emit("send", change);
      });
    };
    LocalQueue.prototype.resendSentChanges = function() {
      for (var ccid in this.sent) {
        this.emit("send", this.sent[ccid]);
      }
    };
    var revisionCache = /* @__PURE__ */ new Map();
    exports.revisionCache = revisionCache;
    function collectionRevisions(channel, id, callback) {
      var TIMEOUT = 200;
      var requestedVersions = /* @__PURE__ */ new Set();
      var versions = [];
      var latestVersion;
      var timeout;
      function onVersion(id2, version, data) {
        revisionCache.set("".concat(id2, ".").concat(version), data);
        versions.push({
          id: id2,
          version,
          data
        });
        if (versions.length === latestVersion) {
          finish();
          return;
        }
        fetchNextVersion(version);
        clearTimeout(timeout);
        timeout = setTimeout(finish, TIMEOUT);
      }
      function finish() {
        clearTimeout(timeout);
        channel.removeListener("version.".concat(id), onVersion);
        callback(null, versions.sort(function(a, b) {
          return b.version - a.version;
        }));
      }
      function fetchNextVersion(prevVersion) {
        var version = prevVersion;
        while (version > 0 && requestedVersions.has(version)) {
          version -= 1;
        }
        if (!version) {
          return;
        }
        requestedVersions.add(version);
        if (revisionCache.has("".concat(id, ".").concat(version))) {
          onVersion(id, version, revisionCache.get("".concat(id, ".").concat(version)));
        } else {
          channel.send("e:".concat(id, ".").concat(version));
        }
      }
      channel.on("version.".concat(id), onVersion);
      channel.store.get(id).then(function(_ref) {
        var version = _ref.version;
        latestVersion = version;
        for (var i = 0; i < 60 && version - i > 0; i++) {
          fetchNextVersion(version - i);
        }
        var firstArchive = Math.round((version - 60) / 10) * 10 + 1;
        for (var _i = 0; _i < 100 && firstArchive - 10 * _i > 0; _i++) {
          fetchNextVersion(firstArchive - 10 * _i);
        }
      }, callback);
      timeout = setTimeout(finish, TIMEOUT * 4);
    }
  }
});

// node_modules/simperium/lib/simperium/ghost/store.js
var require_store = __commonJS({
  "node_modules/simperium/lib/simperium/ghost/store.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = Store;
    function Store(bucket) {
      this.bucket = bucket;
      this.index = {};
    }
    Store.prototype.getChangeVersion = function() {
      var _this = this;
      return new Promise(function(resolve) {
        setImmediate(function() {
          resolve(_this.cv);
        });
      });
    };
    Store.prototype.setChangeVersion = function(cv) {
      var _this2 = this;
      return new Promise(function(resolve) {
        setImmediate(function() {
          _this2.cv = cv;
          resolve(cv);
        });
      });
    };
    Store.prototype.put = function(id, version, data) {
      var _this3 = this;
      return new Promise(function(resolve) {
        setImmediate(function() {
          _this3.index[id] = JSON.stringify({
            version,
            data
          });
          resolve(true);
        });
      });
    };
    Store.prototype.get = function(id) {
      var _this4 = this;
      return new Promise(function(resolve) {
        setImmediate(function() {
          var ghost = _this4.index[id];
          if (!ghost) {
            ghost = {
              data: {}
            };
            ghost.key = id;
            _this4.index[id] = JSON.stringify(ghost);
          } else {
            ghost = JSON.parse(ghost);
          }
          resolve(ghost);
        });
      });
    };
    Store.prototype.remove = function(id) {
      var _this5 = this;
      return new Promise(function(resolve) {
        setImmediate(function() {
          delete _this5.index[id];
          resolve();
        });
      });
    };
  }
});

// node_modules/simperium/lib/simperium/ghost/default.js
var require_default = __commonJS({
  "node_modules/simperium/lib/simperium/ghost/default.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    var _store = _interopRequireDefault(require_store());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _default(bucket) {
      return new _store.default(bucket);
    }
  }
});

// node_modules/simperium/lib/simperium/storage/default.js
var require_default2 = __commonJS({
  "node_modules/simperium/lib/simperium/storage/default.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    function _default() {
      return new BucketStore();
    }
    function BucketStore() {
      this.objects = {};
    }
    BucketStore.prototype.get = function(id, callback) {
      callback(null, {
        id,
        data: this.objects[id]
      });
    };
    BucketStore.prototype.update = function(id, object, isIndexing, callback) {
      this.objects[id] = object;
      callback(null, {
        id,
        data: object,
        isIndexing
      });
    };
    BucketStore.prototype.remove = function(id, callback) {
      delete this.objects[id];
      callback(null);
    };
    BucketStore.prototype.find = function(query, callback) {
      var objects = [];
      var key;
      for (key in this.objects) {
        objects.push({
          id: key,
          data: this.objects[key]
        });
      }
      callback(null, objects);
    };
  }
});

// node_modules/websocket/index.js
var require_websocket2 = __commonJS({
  "node_modules/websocket/index.js"(exports, module) {
    module.exports = require_websocket();
  }
});

// node_modules/simperium/lib/simperium/client.js
var require_client = __commonJS({
  "node_modules/simperium/lib/simperium/client.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = Client;
    exports.Heartbeat = Heartbeat;
    exports.ReconnectionTimer = ReconnectionTimer;
    Object.defineProperty(exports, "Bucket", {
      enumerable: true,
      get: function get() {
        return _bucket.default;
      }
    });
    Object.defineProperty(exports, "Channel", {
      enumerable: true,
      get: function get() {
        return _channel.default;
      }
    });
    var _inherits = _interopRequireDefault(require_inherits());
    var _events = __require("events");
    var _bucket = _interopRequireDefault(require_bucket());
    var _channel = _interopRequireDefault(require_channel());
    var _default = _interopRequireDefault(require_default());
    var _default2 = _interopRequireDefault(require_default2());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function Client(appId, accessToken, options) {
      options = options || {};
      options.ghostStoreProvider = options.ghostStoreProvider || _default.default;
      options.objectStoreProvider = options.objectStoreProvider || _default2.default;
      options.hearbeatInterval = options.heartbeatInterval || 4;
      options.websocketClientProvider = options.websocketClientProvider || defaultWebsocketClientProvider;
      this.accessToken = accessToken;
      this.open = false;
      this.options = options;
      this.heartbeat = new Heartbeat(options.hearbeatInterval, this.sendHeartbeat.bind(this));
      this.heartbeat.on("timeout", this.onConnectionTimeout.bind(this));
      this.reconnectionTimer = new ReconnectionTimer(function(attempt) {
        var time = (attempt >= 3 ? (attempt - 3) * 3e3 : 0) + 3e3;
        return time;
      }, this.onReconnect.bind(this));
      this.appId = appId;
      options.url = options.url || "wss://api.simperium.com/sock/1/".concat(this.appId, "/websocket");
      this.reconnect = true;
      this.on("message:h", this.onHeartbeat.bind(this));
      this.buckets = [];
      this.connect();
    }
    (0, _inherits.default)(Client, _events.EventEmitter);
    Client.prototype.bucket = function(name) {
      var channelId = this.buckets.length, bucket = new _bucket.default(name, this.options.objectStoreProvider), channel = new _channel.default(this.appId, this.accessToken, this.options.ghostStoreProvider(bucket), name), send = this.sendChannelMessage.bind(this, channelId), receive = channel.handleMessage.bind(channel);
      bucket.setChannel(channel);
      this.buckets.push(bucket);
      channel.on("unauthorized", this.onUnauthorized.bind(this));
      channel.on("send", send);
      this.on("connect", channel.onConnect.bind(channel));
      this.on("channel:".concat(channelId), receive);
      this.on("access-token", function(token) {
        channel.access_token = token;
      });
      if (this.open) channel.onConnect();
      return bucket;
    };
    Client.prototype.onHeartbeat = function(message) {
      var counter = parseInt(message);
      this.heartbeat.tick(counter);
    };
    Client.prototype.onConnect = function() {
      this.open = true;
      this.heartbeat.start();
      this.reconnectionTimer.reset();
      this.emit("connect");
    };
    Client.prototype.onReconnect = function(attempt) {
      this.emit("reconnect", attempt);
      this.connect();
    };
    Client.prototype.onConnectionTimeout = function() {
      this.disconnect();
    };
    Client.prototype.onConnectionFailed = function() {
      this.emit("disconnect");
      if (this.reconnect) this.reconnectionTimer.start();
    };
    Client.prototype.onMessage = function(message) {
      this.parseMessage(message);
      this.heartbeat.tick();
    };
    Client.prototype.onUnauthorized = function(details) {
      this.reconnect = false;
      this.emit("unauthorized", details);
    };
    Client.prototype.parseMessage = function(event) {
      var data = event.data, marker = data.indexOf(":"), prefix = data.slice(0, marker), channelId = parseInt(prefix), channelMessage = data.slice(marker + 1);
      this.emit("message", data);
      if (isNaN(channelId)) {
        this.emit("message:".concat(prefix), channelMessage);
      } else {
        this.emit("channel:".concat(channelId), channelMessage);
      }
    };
    Client.prototype.sendHeartbeat = function(count) {
      this.send("h:".concat(count));
    };
    Client.prototype.send = function(data) {
      this.emit("send", data);
      try {
        this.socket.send(data);
      } catch (e) {
        this.emit("error", e);
      }
    };
    Client.prototype.sendChannelMessage = function(id, message) {
      this.send("".concat(id, ":").concat(message));
    };
    Client.prototype.connect = function() {
      if (this.open) {
        this.disconnect();
      }
      this.reconnect = true;
      this.socket = this.options.websocketClientProvider(this.options.url);
      this.socket.onopen = this.onConnect.bind(this);
      this.socket.onmessage = this.onMessage.bind(this);
      this.socket.onclose = this.onConnectionFailed.bind(this);
    };
    Client.prototype.disconnect = function() {
      if (this.open) {
        this.socket.close();
      } else {
        this.onClose();
      }
    };
    Client.prototype.end = function() {
      this.reconnect = false;
      this.reconnectionTimer.stop();
      this.heartbeat.stop();
      this.disconnect();
    };
    Client.prototype.onClose = function() {
      this.connection = null;
      this.heartbeat.stop();
      if (this.reconnect !== false) this.reconnectionTimer.start();
      this.emit("close");
    };
    Client.prototype.setAccessToken = function(token) {
      this.accessToken = token;
      this.emit("access-token", token);
      this.connect();
    };
    function Heartbeat(seconds, onBeat) {
      this.count = 0;
      this.seconds = seconds;
      _events.EventEmitter.call(this);
      if (onBeat) this.on("beat", onBeat);
    }
    (0, _inherits.default)(Heartbeat, _events.EventEmitter);
    Heartbeat.prototype.onBeat = function() {
      this.count++;
      this.timeout = setTimeout(this.onTimeout.bind(this), this.seconds * 1e3 * 2);
      this.emit("beat", this.count);
    };
    Heartbeat.prototype.onTimeout = function() {
      this.emit("timeout");
      this.stop();
    };
    Heartbeat.prototype.tick = function(count) {
      if (count > 0 && typeof count === "number") {
        this.count = count;
      }
      this.start();
    };
    Heartbeat.prototype.start = function() {
      this.stop();
      clearTimeout(this.timer);
      this.timer = setTimeout(this.onBeat.bind(this), this.seconds * 1e3);
    };
    Heartbeat.prototype.stop = function() {
      clearTimeout(this.timer);
      clearTimeout(this.timeout);
    };
    function ReconnectionTimer(interval, onTripped) {
      _events.EventEmitter.call(this);
      this.started = false;
      this.interval = interval || function() {
        return 1e3;
      };
      if (onTripped) this.on("tripped", onTripped);
      this.reset();
    }
    (0, _inherits.default)(ReconnectionTimer, _events.EventEmitter);
    ReconnectionTimer.prototype.onInterval = function() {
      this.emit("tripped", this.attempt);
      this.attempt++;
    };
    ReconnectionTimer.prototype.start = function() {
      this.started = true;
      this.timer = setTimeout(this.onInterval.bind(this), this.interval(this.attempt));
    };
    ReconnectionTimer.prototype.restart = function() {
      this.reset();
      this.start();
    };
    ReconnectionTimer.prototype.reset = ReconnectionTimer.prototype.stop = function() {
      this.attempt = 0;
      this.started = false;
      clearTimeout(this.timer);
    };
    function defaultWebsocketClientProvider(url) {
      var WebSocketClient;
      if (typeof window !== "undefined" && window.WebSocket) {
        WebSocketClient = window.WebSocket;
      } else {
        WebSocketClient = require_websocket2().w3cwebsocket;
      }
      return new WebSocketClient(url);
    }
    Client.Bucket = _bucket.default;
  }
});

// node_modules/simperium/lib/simperium/http-request.js
var require_http_request = __commonJS({
  "node_modules/simperium/lib/simperium/http-request.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    var _https = __require("https");
    function _default(apiKey, url, body) {
      return new Promise(function(resolve, reject) {
        var headers = {
          "X-Simperium-API-Key": apiKey
        };
        var req = (0, _https.request)(url, {
          method: "POST",
          headers
        }, function(res) {
          var responseData = "";
          res.on("data", function(data) {
            responseData += data.toString();
          });
          res.on("end", function() {
            resolve(responseData);
          });
        });
        req.on("error", function(e) {
          reject(e);
        });
        req.end(body);
      });
    }
  }
});

// node_modules/simperium/lib/simperium/auth.js
var require_auth = __commonJS({
  "node_modules/simperium/lib/simperium/auth.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = exports.Auth = exports.AuthError = void 0;
    var _events = _interopRequireDefault(__require("events"));
    var _httpRequest = _interopRequireDefault(require_http_request());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function _typeof(obj) {
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    function _defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
      }
    }
    function _createClass(Constructor, protoProps, staticProps) {
      if (protoProps) _defineProperties(Constructor.prototype, protoProps);
      if (staticProps) _defineProperties(Constructor, staticProps);
      return Constructor;
    }
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    function _possibleConstructorReturn(self, call) {
      if (call && (_typeof(call) === "object" || typeof call === "function")) {
        return call;
      }
      return _assertThisInitialized(self);
    }
    function _assertThisInitialized(self) {
      if (self === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return self;
    }
    function _inherits(subClass, superClass) {
      if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
      }
      subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } });
      if (superClass) _setPrototypeOf(subClass, superClass);
    }
    function _wrapNativeSuper(Class) {
      var _cache = typeof Map === "function" ? /* @__PURE__ */ new Map() : void 0;
      _wrapNativeSuper = function _wrapNativeSuper2(Class2) {
        if (Class2 === null || !_isNativeFunction(Class2)) return Class2;
        if (typeof Class2 !== "function") {
          throw new TypeError("Super expression must either be null or a function");
        }
        if (typeof _cache !== "undefined") {
          if (_cache.has(Class2)) return _cache.get(Class2);
          _cache.set(Class2, Wrapper);
        }
        function Wrapper() {
          return _construct(Class2, arguments, _getPrototypeOf(this).constructor);
        }
        Wrapper.prototype = Object.create(Class2.prototype, { constructor: { value: Wrapper, enumerable: false, writable: true, configurable: true } });
        return _setPrototypeOf(Wrapper, Class2);
      };
      return _wrapNativeSuper(Class);
    }
    function isNativeReflectConstruct() {
      if (typeof Reflect === "undefined" || !Reflect.construct) return false;
      if (Reflect.construct.sham) return false;
      if (typeof Proxy === "function") return true;
      try {
        Date.prototype.toString.call(Reflect.construct(Date, [], function() {
        }));
        return true;
      } catch (e) {
        return false;
      }
    }
    function _construct(Parent, args, Class) {
      if (isNativeReflectConstruct()) {
        _construct = Reflect.construct;
      } else {
        _construct = function _construct2(Parent2, args2, Class2) {
          var a = [null];
          a.push.apply(a, args2);
          var Constructor = Function.bind.apply(Parent2, a);
          var instance = new Constructor();
          if (Class2) _setPrototypeOf(instance, Class2.prototype);
          return instance;
        };
      }
      return _construct.apply(null, arguments);
    }
    function _isNativeFunction(fn) {
      return Function.toString.call(fn).indexOf("[native code]") !== -1;
    }
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2;
        return o2;
      };
      return _setPrototypeOf(o, p);
    }
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2);
      };
      return _getPrototypeOf(o);
    }
    var fromJSON = function fromJSON2(json) {
      var data;
      try {
        data = JSON.parse(json);
      } catch (error) {
        throw new Error(json);
      }
      if (!data.access_token && typeof data.access_token !== "string") {
        throw new Error("access_token not present");
      }
      return {
        options: data,
        access_token: new String(data.access_token).toString()
      };
    };
    var EventEmitter = _events.default.EventEmitter;
    var baseUrl = "https://auth.simperium.com/1";
    var AuthError = /* @__PURE__ */ (function(_Error) {
      _inherits(AuthError2, _Error);
      function AuthError2(underlyingError) {
        var _this;
        _classCallCheck(this, AuthError2);
        _this = _possibleConstructorReturn(this, _getPrototypeOf(AuthError2).call(this, "Failed to authenticate user."));
        _this.underlyingError = underlyingError;
        return _this;
      }
      return AuthError2;
    })(_wrapNativeSuper(Error));
    exports.AuthError = AuthError;
    var Auth = /* @__PURE__ */ (function(_EventEmitter) {
      _inherits(Auth2, _EventEmitter);
      function Auth2(appId, appSecret) {
        var _this2;
        _classCallCheck(this, Auth2);
        _this2 = _possibleConstructorReturn(this, _getPrototypeOf(Auth2).call(this));
        _this2.appId = appId;
        _this2.appSecret = appSecret;
        return _this2;
      }
      _createClass(Auth2, [{
        key: "authorize",
        value: function authorize(username, password) {
          var body = JSON.stringify({
            username,
            password
          });
          return this.request("authorize/", body);
        }
      }, {
        key: "create",
        value: function create(username, password, provider) {
          var userData = {
            username,
            password
          };
          if (provider) {
            userData.provider = provider;
          }
          var body = JSON.stringify(userData);
          return this.request("create/", body);
        }
      }, {
        key: "request",
        value: function request(endpoint, body) {
          var _this3 = this;
          var authUrl = "".concat(baseUrl, "/").concat(this.appId, "/").concat(endpoint);
          return (0, _httpRequest.default)(this.appSecret, authUrl, body).then(function(response) {
            try {
              var user = fromJSON(response);
              _this3.emit("authorize", user);
              return user;
            } catch (error) {
              throw new AuthError(error);
            }
          });
        }
      }]);
      return Auth2;
    })(EventEmitter);
    exports.Auth = Auth;
    var _default = function _default2(appId, appSecret) {
      return new Auth(appId, appSecret);
    };
    exports.default = _default;
  }
});

// node_modules/simperium/lib/simperium/index.js
var require_simperium = __commonJS({
  "node_modules/simperium/lib/simperium/index.js"(exports) {
    "use strict";
    function _typeof(obj) {
      if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
        _typeof = function _typeof2(obj2) {
          return typeof obj2;
        };
      } else {
        _typeof = function _typeof2(obj2) {
          return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
        };
      }
      return _typeof(obj);
    }
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = createClient;
    Object.defineProperty(exports, "Client", {
      enumerable: true,
      get: function get() {
        return _client.default;
      }
    });
    Object.defineProperty(exports, "Bucket", {
      enumerable: true,
      get: function get() {
        return _bucket.default;
      }
    });
    Object.defineProperty(exports, "Auth", {
      enumerable: true,
      get: function get() {
        return _auth.default;
      }
    });
    exports.util = void 0;
    var _client = _interopRequireDefault(require_client());
    var _bucket = _interopRequireDefault(require_bucket());
    var _auth = _interopRequireDefault(require_auth());
    var util = _interopRequireWildcard(require_util());
    exports.util = util;
    function _getRequireWildcardCache() {
      if (typeof WeakMap !== "function") return null;
      var cache = /* @__PURE__ */ new WeakMap();
      _getRequireWildcardCache = function _getRequireWildcardCache2() {
        return cache;
      };
      return cache;
    }
    function _interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") {
        return { default: obj };
      }
      var cache = _getRequireWildcardCache();
      if (cache && cache.has(obj)) {
        return cache.get(obj);
      }
      var newObj = {};
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key, desc);
          } else {
            newObj[key] = obj[key];
          }
        }
      }
      newObj.default = obj;
      if (cache) {
        cache.set(obj, newObj);
      }
      return newObj;
    }
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function createClient(appId, token, options) {
      return new _client.default(appId, token, options).on("error", function() {
      });
    }
  }
});

// simperium-interop:simperium
var m;
var load = () => m ??= require_simperium();
function simperium_default(...a) {
  const x = load();
  return (x && x.__esModule ? x.default : x)(...a);
}

export {
  require_change,
  simperium_default
};
