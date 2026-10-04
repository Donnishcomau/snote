#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  Box_default,
  Text,
  measure_element_default,
  render_default,
  stringWidth,
  use_app_default,
  use_box_metrics_default,
  use_input_default,
  use_paste_default,
  use_stdin_default,
  use_stdout_default
} from "./chunks/chunk-MRAMNRR7.js";
import {
  require_react
} from "./chunks/chunk-CT7MGM3M.js";
import "./chunks/chunk-GGREWLKO.js";
import {
  require_change,
  simperium_default
} from "./chunks/chunk-TKYY3J3T.js";
import "./chunks/chunk-J73DZ7ZA.js";
import {
  __commonJS,
  __export,
  __require,
  __toESM
} from "./chunks/chunk-SRSFEH3H.js";

// node_modules/remove-markdown/index.js
var require_remove_markdown = __commonJS({
  "node_modules/remove-markdown/index.js"(exports, module) {
    module.exports = function(md, options) {
      options = options || {};
      options.listUnicodeChar = options.hasOwnProperty("listUnicodeChar") ? options.listUnicodeChar : false;
      options.stripListLeaders = options.hasOwnProperty("stripListLeaders") ? options.stripListLeaders : true;
      options.gfm = options.hasOwnProperty("gfm") ? options.gfm : true;
      options.useImgAltText = options.hasOwnProperty("useImgAltText") ? options.useImgAltText : true;
      options.abbr = options.hasOwnProperty("abbr") ? options.abbr : false;
      options.replaceLinksWithURL = options.hasOwnProperty("replaceLinksWithURL") ? options.replaceLinksWithURL : false;
      options.separateLinksAndTexts = options.hasOwnProperty("separateLinksAndTexts") ? options.separateLinksAndTexts : null;
      options.htmlTagsToSkip = options.hasOwnProperty("htmlTagsToSkip") ? options.htmlTagsToSkip : [];
      options.throwError = options.hasOwnProperty("throwError") ? options.throwError : false;
      var output = md || "";
      output = output.replace(/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/gm, "");
      try {
        if (options.stripListLeaders) {
          if (options.listUnicodeChar)
            output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, options.listUnicodeChar + " $1");
          else
            output = output.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm, "$1");
        }
        if (options.gfm) {
          output = output.replace(/\n={2,}/g, "\n").replace(/~{3}.*\n/g, "").replace(/~~/g, "").replace(/```(?:.*)\n([\s\S]*?)```/g, (_, code) => code.trim());
        }
        if (options.abbr) {
          output = output.replace(/\*\[.*\]:.*\n/, "");
        }
        let htmlReplaceRegex = /<[^>]*>/g;
        if (options.htmlTagsToSkip && options.htmlTagsToSkip.length > 0) {
          const joinedHtmlTagsToSkip = options.htmlTagsToSkip.join("|");
          htmlReplaceRegex = new RegExp(
            `<(?!/?(${joinedHtmlTagsToSkip})(?=>|s[^>]*>))[^>]*>`,
            "g"
          );
        }
        if (options.separateLinksAndTexts) {
          output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1" + options.separateLinksAndTexts + "$2");
        }
        output = output.replace(htmlReplaceRegex, "").replace(/^[=\-]{2,}\s*$/g, "").replace(/\[\^.+?\](\: .*?$)?/g, "").replace(/\s{0,2}\[.*?\]: .*?$/g, "").replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, options.useImgAltText ? "$1" : "").replace(/\[([\s\S]*?)\]\s*[\(\[](.*?)[\)\]]/g, options.replaceLinksWithURL ? "$2" : "$1").replace(/^(\n)?\s{0,3}>\s?/gm, "$1").replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g, "").replace(/^(\n)?\s{0,}#{1,6}\s*( (.+))? +#+$|^(\n)?\s{0,}#{1,6}\s*( (.+))?$/gm, "$1$3$4$6").replace(/([\*]+)(\S)(.*?\S)??\1/g, "$2$3").replace(/(^|\W)([_]+)(\S)(.*?\S)??\2($|\W)/g, "$1$3$4$5").replace(/(`{3,})(.*?)\1/gm, "$2").replace(/`(.+?)`/g, "$1").replace(/~(.*?)~/g, "$1");
      } catch (e) {
        if (options.throwError) throw e;
        console.error("remove-markdown encountered error: %s", e);
        return md;
      }
      return output;
    };
  }
});

// node_modules/lodash/_freeGlobal.js
var require_freeGlobal = __commonJS({
  "node_modules/lodash/_freeGlobal.js"(exports, module) {
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    module.exports = freeGlobal;
  }
});

// node_modules/lodash/_root.js
var require_root = __commonJS({
  "node_modules/lodash/_root.js"(exports, module) {
    var freeGlobal = require_freeGlobal();
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    module.exports = root;
  }
});

// node_modules/lodash/_Symbol.js
var require_Symbol = __commonJS({
  "node_modules/lodash/_Symbol.js"(exports, module) {
    var root = require_root();
    var Symbol2 = root.Symbol;
    module.exports = Symbol2;
  }
});

// node_modules/lodash/_arrayMap.js
var require_arrayMap = __commonJS({
  "node_modules/lodash/_arrayMap.js"(exports, module) {
    function arrayMap(array, iteratee) {
      var index = -1, length = array == null ? 0 : array.length, result = Array(length);
      while (++index < length) {
        result[index] = iteratee(array[index], index, array);
      }
      return result;
    }
    module.exports = arrayMap;
  }
});

// node_modules/lodash/isArray.js
var require_isArray = __commonJS({
  "node_modules/lodash/isArray.js"(exports, module) {
    var isArray = Array.isArray;
    module.exports = isArray;
  }
});

// node_modules/lodash/_getRawTag.js
var require_getRawTag = __commonJS({
  "node_modules/lodash/_getRawTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var nativeObjectToString = objectProto.toString;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    module.exports = getRawTag;
  }
});

// node_modules/lodash/_objectToString.js
var require_objectToString = __commonJS({
  "node_modules/lodash/_objectToString.js"(exports, module) {
    var objectProto = Object.prototype;
    var nativeObjectToString = objectProto.toString;
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    module.exports = objectToString;
  }
});

// node_modules/lodash/_baseGetTag.js
var require_baseGetTag = __commonJS({
  "node_modules/lodash/_baseGetTag.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var getRawTag = require_getRawTag();
    var objectToString = require_objectToString();
    var nullTag = "[object Null]";
    var undefinedTag = "[object Undefined]";
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    module.exports = baseGetTag;
  }
});

// node_modules/lodash/isObjectLike.js
var require_isObjectLike = __commonJS({
  "node_modules/lodash/isObjectLike.js"(exports, module) {
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    module.exports = isObjectLike;
  }
});

// node_modules/lodash/isSymbol.js
var require_isSymbol = __commonJS({
  "node_modules/lodash/isSymbol.js"(exports, module) {
    var baseGetTag = require_baseGetTag();
    var isObjectLike = require_isObjectLike();
    var symbolTag = "[object Symbol]";
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }
    module.exports = isSymbol;
  }
});

// node_modules/lodash/_baseToString.js
var require_baseToString = __commonJS({
  "node_modules/lodash/_baseToString.js"(exports, module) {
    var Symbol2 = require_Symbol();
    var arrayMap = require_arrayMap();
    var isArray = require_isArray();
    var isSymbol = require_isSymbol();
    var INFINITY = 1 / 0;
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolToString = symbolProto ? symbolProto.toString : void 0;
    function baseToString(value) {
      if (typeof value == "string") {
        return value;
      }
      if (isArray(value)) {
        return arrayMap(value, baseToString) + "";
      }
      if (isSymbol(value)) {
        return symbolToString ? symbolToString.call(value) : "";
      }
      var result = value + "";
      return result == "0" && 1 / value == -INFINITY ? "-0" : result;
    }
    module.exports = baseToString;
  }
});

// node_modules/lodash/toString.js
var require_toString = __commonJS({
  "node_modules/lodash/toString.js"(exports, module) {
    var baseToString = require_baseToString();
    function toString(value) {
      return value == null ? "" : baseToString(value);
    }
    module.exports = toString;
  }
});

// node_modules/lodash/escapeRegExp.js
var require_escapeRegExp = __commonJS({
  "node_modules/lodash/escapeRegExp.js"(exports, module) {
    var toString = require_toString();
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reHasRegExpChar = RegExp(reRegExpChar.source);
    function escapeRegExp2(string) {
      string = toString(string);
      return string && reHasRegExpChar.test(string) ? string.replace(reRegExpChar, "\\$&") : string;
    }
    module.exports = escapeRegExp2;
  }
});

// node_modules/@babel/runtime/helpers/typeof.js
var require_typeof = __commonJS({
  "node_modules/@babel/runtime/helpers/typeof.js"(exports, module) {
    function _typeof(o) {
      "@babel/helpers - typeof";
      return module.exports = _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
        return typeof o2;
      } : function(o2) {
        return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
      }, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof(o);
    }
    module.exports = _typeof, module.exports.__esModule = true, module.exports["default"] = module.exports;
  }
});

// node_modules/@babel/runtime/helpers/toPrimitive.js
var require_toPrimitive = __commonJS({
  "node_modules/@babel/runtime/helpers/toPrimitive.js"(exports, module) {
    var _typeof = require_typeof()["default"];
    function toPrimitive(t, r) {
      if ("object" != _typeof(t) || !t) return t;
      var e = t[Symbol.toPrimitive];
      if (void 0 !== e) {
        var i = e.call(t, r || "default");
        if ("object" != _typeof(i)) return i;
        throw new TypeError("@@toPrimitive must return a primitive value.");
      }
      return ("string" === r ? String : Number)(t);
    }
    module.exports = toPrimitive, module.exports.__esModule = true, module.exports["default"] = module.exports;
  }
});

// node_modules/@babel/runtime/helpers/toPropertyKey.js
var require_toPropertyKey = __commonJS({
  "node_modules/@babel/runtime/helpers/toPropertyKey.js"(exports, module) {
    var _typeof = require_typeof()["default"];
    var toPrimitive = require_toPrimitive();
    function toPropertyKey(t) {
      var i = toPrimitive(t, "string");
      return "symbol" == _typeof(i) ? i : i + "";
    }
    module.exports = toPropertyKey, module.exports.__esModule = true, module.exports["default"] = module.exports;
  }
});

// node_modules/@babel/runtime/helpers/defineProperty.js
var require_defineProperty = __commonJS({
  "node_modules/@babel/runtime/helpers/defineProperty.js"(exports, module) {
    var toPropertyKey = require_toPropertyKey();
    function _defineProperty(e, r, t) {
      return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
        value: t,
        enumerable: true,
        configurable: true,
        writable: true
      }) : e[r] = t, e;
    }
    module.exports = _defineProperty, module.exports.__esModule = true, module.exports["default"] = module.exports;
  }
});

// node_modules/@babel/runtime/helpers/objectSpread2.js
var require_objectSpread2 = __commonJS({
  "node_modules/@babel/runtime/helpers/objectSpread2.js"(exports, module) {
    var defineProperty = require_defineProperty();
    function ownKeys(e, r) {
      var t = Object.keys(e);
      if (Object.getOwnPropertySymbols) {
        var o = Object.getOwnPropertySymbols(e);
        r && (o = o.filter(function(r2) {
          return Object.getOwnPropertyDescriptor(e, r2).enumerable;
        })), t.push.apply(t, o);
      }
      return t;
    }
    function _objectSpread2(e) {
      for (var r = 1; r < arguments.length; r++) {
        var t = null != arguments[r] ? arguments[r] : {};
        r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
          defineProperty(e, r2, t[r2]);
        }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
          Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
        });
      }
      return e;
    }
    module.exports = _objectSpread2, module.exports.__esModule = true, module.exports["default"] = module.exports;
  }
});

// node_modules/redux/lib/redux.js
var require_redux = __commonJS({
  "node_modules/redux/lib/redux.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var _objectSpread = require_objectSpread2();
    function _interopDefaultLegacy(e) {
      return e && typeof e === "object" && "default" in e ? e : { "default": e };
    }
    var _objectSpread__default = /* @__PURE__ */ _interopDefaultLegacy(_objectSpread);
    function formatProdErrorMessage(code) {
      return "Minified Redux error #" + code + "; visit https://redux.js.org/Errors?code=" + code + " for the full message or use the non-minified dev environment for full errors. ";
    }
    var $$observable = (function() {
      return typeof Symbol === "function" && Symbol.observable || "@@observable";
    })();
    var randomString = function randomString2() {
      return Math.random().toString(36).substring(7).split("").join(".");
    };
    var ActionTypes = {
      INIT: "@@redux/INIT" + randomString(),
      REPLACE: "@@redux/REPLACE" + randomString(),
      PROBE_UNKNOWN_ACTION: function PROBE_UNKNOWN_ACTION() {
        return "@@redux/PROBE_UNKNOWN_ACTION" + randomString();
      }
    };
    function isPlainObject(obj) {
      if (typeof obj !== "object" || obj === null) return false;
      var proto = obj;
      while (Object.getPrototypeOf(proto) !== null) {
        proto = Object.getPrototypeOf(proto);
      }
      return Object.getPrototypeOf(obj) === proto;
    }
    function createStore2(reducer, preloadedState, enhancer) {
      var _ref2;
      if (typeof preloadedState === "function" && typeof enhancer === "function" || typeof enhancer === "function" && typeof arguments[3] === "function") {
        throw new Error(true ? formatProdErrorMessage(0) : "It looks like you are passing several store enhancers to createStore(). This is not supported. Instead, compose them together to a single function. See https://redux.js.org/tutorials/fundamentals/part-4-store#creating-a-store-with-enhancers for an example.");
      }
      if (typeof preloadedState === "function" && typeof enhancer === "undefined") {
        enhancer = preloadedState;
        preloadedState = void 0;
      }
      if (typeof enhancer !== "undefined") {
        if (typeof enhancer !== "function") {
          throw new Error(true ? formatProdErrorMessage(1) : "Expected the enhancer to be a function. Instead, received: '" + kindOf(enhancer) + "'");
        }
        return enhancer(createStore2)(reducer, preloadedState);
      }
      if (typeof reducer !== "function") {
        throw new Error(true ? formatProdErrorMessage(2) : "Expected the root reducer to be a function. Instead, received: '" + kindOf(reducer) + "'");
      }
      var currentReducer = reducer;
      var currentState = preloadedState;
      var currentListeners = [];
      var nextListeners = currentListeners;
      var isDispatching = false;
      function ensureCanMutateNextListeners() {
        if (nextListeners === currentListeners) {
          nextListeners = currentListeners.slice();
        }
      }
      function getState() {
        if (isDispatching) {
          throw new Error(true ? formatProdErrorMessage(3) : "You may not call store.getState() while the reducer is executing. The reducer has already received the state as an argument. Pass it down from the top reducer instead of reading it from the store.");
        }
        return currentState;
      }
      function subscribe(listener) {
        if (typeof listener !== "function") {
          throw new Error(true ? formatProdErrorMessage(4) : "Expected the listener to be a function. Instead, received: '" + kindOf(listener) + "'");
        }
        if (isDispatching) {
          throw new Error(true ? formatProdErrorMessage(5) : "You may not call store.subscribe() while the reducer is executing. If you would like to be notified after the store has been updated, subscribe from a component and invoke store.getState() in the callback to access the latest state. See https://redux.js.org/api/store#subscribelistener for more details.");
        }
        var isSubscribed = true;
        ensureCanMutateNextListeners();
        nextListeners.push(listener);
        return function unsubscribe() {
          if (!isSubscribed) {
            return;
          }
          if (isDispatching) {
            throw new Error(true ? formatProdErrorMessage(6) : "You may not unsubscribe from a store listener while the reducer is executing. See https://redux.js.org/api/store#subscribelistener for more details.");
          }
          isSubscribed = false;
          ensureCanMutateNextListeners();
          var index = nextListeners.indexOf(listener);
          nextListeners.splice(index, 1);
          currentListeners = null;
        };
      }
      function dispatch(action) {
        if (!isPlainObject(action)) {
          throw new Error(true ? formatProdErrorMessage(7) : "Actions must be plain objects. Instead, the actual type was: '" + kindOf(action) + "'. You may need to add middleware to your store setup to handle dispatching other values, such as 'redux-thunk' to handle dispatching functions. See https://redux.js.org/tutorials/fundamentals/part-4-store#middleware and https://redux.js.org/tutorials/fundamentals/part-6-async-logic#using-the-redux-thunk-middleware for examples.");
        }
        if (typeof action.type === "undefined") {
          throw new Error(true ? formatProdErrorMessage(8) : 'Actions may not have an undefined "type" property. You may have misspelled an action type string constant.');
        }
        if (isDispatching) {
          throw new Error(true ? formatProdErrorMessage(9) : "Reducers may not dispatch actions.");
        }
        try {
          isDispatching = true;
          currentState = currentReducer(currentState, action);
        } finally {
          isDispatching = false;
        }
        var listeners = currentListeners = nextListeners;
        for (var i = 0; i < listeners.length; i++) {
          var listener = listeners[i];
          listener();
        }
        return action;
      }
      function replaceReducer(nextReducer) {
        if (typeof nextReducer !== "function") {
          throw new Error(true ? formatProdErrorMessage(10) : "Expected the nextReducer to be a function. Instead, received: '" + kindOf(nextReducer));
        }
        currentReducer = nextReducer;
        dispatch({
          type: ActionTypes.REPLACE
        });
      }
      function observable() {
        var _ref;
        var outerSubscribe = subscribe;
        return _ref = {
          /**
           * The minimal observable subscription method.
           * @param {Object} observer Any object that can be used as an observer.
           * The observer object should have a `next` method.
           * @returns {subscription} An object with an `unsubscribe` method that can
           * be used to unsubscribe the observable from the store, and prevent further
           * emission of values from the observable.
           */
          subscribe: function subscribe2(observer) {
            if (typeof observer !== "object" || observer === null) {
              throw new Error(true ? formatProdErrorMessage(11) : "Expected the observer to be an object. Instead, received: '" + kindOf(observer) + "'");
            }
            function observeState() {
              if (observer.next) {
                observer.next(getState());
              }
            }
            observeState();
            var unsubscribe = outerSubscribe(observeState);
            return {
              unsubscribe
            };
          }
        }, _ref[$$observable] = function() {
          return this;
        }, _ref;
      }
      dispatch({
        type: ActionTypes.INIT
      });
      return _ref2 = {
        dispatch,
        subscribe,
        getState,
        replaceReducer
      }, _ref2[$$observable] = observable, _ref2;
    }
    var legacy_createStore = createStore2;
    function assertReducerShape(reducers) {
      Object.keys(reducers).forEach(function(key) {
        var reducer = reducers[key];
        var initialState2 = reducer(void 0, {
          type: ActionTypes.INIT
        });
        if (typeof initialState2 === "undefined") {
          throw new Error(true ? formatProdErrorMessage(12) : 'The slice reducer for key "' + key + `" returned undefined during initialization. If the state passed to the reducer is undefined, you must explicitly return the initial state. The initial state may not be undefined. If you don't want to set a value for this reducer, you can use null instead of undefined.`);
        }
        if (typeof reducer(void 0, {
          type: ActionTypes.PROBE_UNKNOWN_ACTION()
        }) === "undefined") {
          throw new Error(true ? formatProdErrorMessage(13) : 'The slice reducer for key "' + key + '" returned undefined when probed with a random type. ' + ("Don't try to handle '" + ActionTypes.INIT + `' or other actions in "redux/*" `) + "namespace. They are considered private. Instead, you must return the current state for any unknown actions, unless it is undefined, in which case you must return the initial state, regardless of the action type. The initial state may not be undefined, but can be null.");
        }
      });
    }
    function combineReducers5(reducers) {
      var reducerKeys = Object.keys(reducers);
      var finalReducers = {};
      for (var i = 0; i < reducerKeys.length; i++) {
        var key = reducerKeys[i];
        if (false) {
          if (typeof reducers[key] === "undefined") {
            warning('No reducer provided for key "' + key + '"');
          }
        }
        if (typeof reducers[key] === "function") {
          finalReducers[key] = reducers[key];
        }
      }
      var finalReducerKeys = Object.keys(finalReducers);
      var unexpectedKeyCache;
      if (false) {
        unexpectedKeyCache = {};
      }
      var shapeAssertionError;
      try {
        assertReducerShape(finalReducers);
      } catch (e) {
        shapeAssertionError = e;
      }
      return function combination(state, action) {
        if (state === void 0) {
          state = {};
        }
        if (shapeAssertionError) {
          throw shapeAssertionError;
        }
        if (false) {
          var warningMessage = getUnexpectedStateShapeWarningMessage(state, finalReducers, action, unexpectedKeyCache);
          if (warningMessage) {
            warning(warningMessage);
          }
        }
        var hasChanged = false;
        var nextState = {};
        for (var _i = 0; _i < finalReducerKeys.length; _i++) {
          var _key = finalReducerKeys[_i];
          var reducer = finalReducers[_key];
          var previousStateForKey = state[_key];
          var nextStateForKey = reducer(previousStateForKey, action);
          if (typeof nextStateForKey === "undefined") {
            var actionType = action && action.type;
            throw new Error(true ? formatProdErrorMessage(14) : "When called with an action of type " + (actionType ? '"' + String(actionType) + '"' : "(unknown type)") + ', the slice reducer for key "' + _key + '" returned undefined. To ignore an action, you must explicitly return the previous state. If you want this reducer to hold no value, you can return null instead of undefined.');
          }
          nextState[_key] = nextStateForKey;
          hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
        }
        hasChanged = hasChanged || finalReducerKeys.length !== Object.keys(state).length;
        return hasChanged ? nextState : state;
      };
    }
    function bindActionCreator(actionCreator, dispatch) {
      return function() {
        return dispatch(actionCreator.apply(this, arguments));
      };
    }
    function bindActionCreators(actionCreators, dispatch) {
      if (typeof actionCreators === "function") {
        return bindActionCreator(actionCreators, dispatch);
      }
      if (typeof actionCreators !== "object" || actionCreators === null) {
        throw new Error(true ? formatProdErrorMessage(16) : "bindActionCreators expected an object or a function, but instead received: '" + kindOf(actionCreators) + `'. Did you write "import ActionCreators from" instead of "import * as ActionCreators from"?`);
      }
      var boundActionCreators = {};
      for (var key in actionCreators) {
        var actionCreator = actionCreators[key];
        if (typeof actionCreator === "function") {
          boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
        }
      }
      return boundActionCreators;
    }
    function compose() {
      for (var _len = arguments.length, funcs = new Array(_len), _key = 0; _key < _len; _key++) {
        funcs[_key] = arguments[_key];
      }
      if (funcs.length === 0) {
        return function(arg) {
          return arg;
        };
      }
      if (funcs.length === 1) {
        return funcs[0];
      }
      return funcs.reduce(function(a, b) {
        return function() {
          return a(b.apply(void 0, arguments));
        };
      });
    }
    function applyMiddleware2() {
      for (var _len = arguments.length, middlewares = new Array(_len), _key = 0; _key < _len; _key++) {
        middlewares[_key] = arguments[_key];
      }
      return function(createStore3) {
        return function() {
          var store = createStore3.apply(void 0, arguments);
          var _dispatch = function dispatch() {
            throw new Error(true ? formatProdErrorMessage(15) : "Dispatching while constructing your middleware is not allowed. Other middleware would not be applied to this dispatch.");
          };
          var middlewareAPI = {
            getState: store.getState,
            dispatch: function dispatch() {
              return _dispatch.apply(void 0, arguments);
            }
          };
          var chain = middlewares.map(function(middleware) {
            return middleware(middlewareAPI);
          });
          _dispatch = compose.apply(void 0, chain)(store.dispatch);
          return _objectSpread__default["default"](_objectSpread__default["default"]({}, store), {}, {
            dispatch: _dispatch
          });
        };
      };
    }
    exports.__DO_NOT_USE__ActionTypes = ActionTypes;
    exports.applyMiddleware = applyMiddleware2;
    exports.bindActionCreators = bindActionCreators;
    exports.combineReducers = combineReducers5;
    exports.compose = compose;
    exports.createStore = createStore2;
    exports.legacy_createStore = legacy_createStore;
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports, module) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug2(...args) {
          if (!debug2.enabled) {
            return;
          }
          const self2 = debug2;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self2.diff = ms;
          self2.prev = prevTime;
          self2.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self2, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self2, args);
          const logFn = self2.log || createDebug.log;
          logFn.apply(self2, args);
        }
        debug2.namespace = namespace;
        debug2.useColors = createDebug.useColors();
        debug2.color = createDebug.selectColor(namespace);
        debug2.extend = extend;
        debug2.destroy = createDebug.destroy;
        Object.defineProperty(debug2, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug2);
        }
        return debug2;
      }
      function extend(namespace, delimiter2) {
        const newDebug = createDebug(this.namespace + (typeof delimiter2 === "undefined" ? ":" : delimiter2) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search2, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search2.length) {
          if (templateIndex < template.length && (template[templateIndex] === search2[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports, module) {
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.storage = localstorage();
    exports.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports.storage.setItem("debug", namespaces);
        } else {
          exports.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports.storage.getItem("debug") || exports.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/has-flag/index.js
var require_has_flag = __commonJS({
  "node_modules/has-flag/index.js"(exports, module) {
    "use strict";
    module.exports = (flag, argv = process.argv) => {
      const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
      const position = argv.indexOf(prefix + flag);
      const terminatorPosition = argv.indexOf("--");
      return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
    };
  }
});

// node_modules/supports-color/index.js
var require_supports_color = __commonJS({
  "node_modules/supports-color/index.js"(exports, module) {
    "use strict";
    var os3 = __require("os");
    var tty = __require("tty");
    var hasFlag = require_has_flag();
    var { env } = process;
    var forceColor;
    if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
      forceColor = 0;
    } else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
      forceColor = 1;
    }
    if ("FORCE_COLOR" in env) {
      if (env.FORCE_COLOR === "true") {
        forceColor = 1;
      } else if (env.FORCE_COLOR === "false") {
        forceColor = 0;
      } else {
        forceColor = env.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(env.FORCE_COLOR, 10), 3);
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
    function supportsColor(haveStream, streamIsTTY) {
      if (forceColor === 0) {
        return 0;
      }
      if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
        return 3;
      }
      if (hasFlag("color=256")) {
        return 2;
      }
      if (haveStream && !streamIsTTY && forceColor === void 0) {
        return 0;
      }
      const min = forceColor || 0;
      if (env.TERM === "dumb") {
        return min;
      }
      if (process.platform === "win32") {
        const osRelease = os3.release().split(".");
        if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
          return Number(osRelease[2]) >= 14931 ? 3 : 2;
        }
        return 1;
      }
      if ("CI" in env) {
        if (["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
          return 1;
        }
        return min;
      }
      if ("TEAMCITY_VERSION" in env) {
        return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
      }
      if (env.COLORTERM === "truecolor") {
        return 3;
      }
      if ("TERM_PROGRAM" in env) {
        const version = parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
        switch (env.TERM_PROGRAM) {
          case "iTerm.app":
            return version >= 3 ? 3 : 2;
          case "Apple_Terminal":
            return 2;
        }
      }
      if (/-256(color)?$/i.test(env.TERM)) {
        return 2;
      }
      if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
        return 1;
      }
      if ("COLORTERM" in env) {
        return 1;
      }
      return min;
    }
    function getSupportLevel(stream) {
      const level = supportsColor(stream, stream && stream.isTTY);
      return translateLevel(level);
    }
    module.exports = {
      supportsColor: getSupportLevel,
      stdout: translateLevel(supportsColor(true, tty.isatty(1))),
      stderr: translateLevel(supportsColor(true, tty.isatty(2)))
    };
  }
});

// node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/debug/src/node.js"(exports, module) {
    var tty = __require("tty");
    var util = __require("util");
    exports.init = init;
    exports.log = log;
    exports.formatArgs = formatArgs;
    exports.save = save;
    exports.load = load;
    exports.useColors = useColors;
    exports.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require_supports_color();
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports.inspectOpts ? Boolean(exports.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug2) {
      debug2.inspectOpts = {};
      const keys = Object.keys(exports.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug2.inspectOpts[keys[i]] = exports.inspectOpts[keys[i]];
      }
    }
    module.exports = require_common()(exports);
    var { formatters } = module.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports, module) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module.exports = require_browser();
    } else {
      module.exports = require_node();
    }
  }
});

// node_modules/react/cjs/react-jsx-runtime.production.js
var require_react_jsx_runtime_production = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.production.js"(exports) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    function jsxProd(type, config, maybeKey) {
      var key = null;
      void 0 !== maybeKey && (key = "" + maybeKey);
      void 0 !== config.key && (key = "" + config.key);
      if ("key" in config) {
        maybeKey = {};
        for (var propName in config)
          "key" !== propName && (maybeKey[propName] = config[propName]);
      } else maybeKey = config;
      config = maybeKey.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key,
        ref: void 0 !== config ? config : null,
        props: maybeKey
      };
    }
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsx = jsxProd;
    exports.jsxs = jsxProd;
  }
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "node_modules/react/jsx-runtime.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_jsx_runtime_production();
    } else {
      module.exports = null;
    }
  }
});

// src/cli/quiet-warnings.ts
process.noDeprecation = true;
process.removeAllListeners("warning");

// src/cli/main.tsx
var import_react19 = __toESM(require_react(), 1);
import fs9 from "node:fs";
import os2 from "node:os";
import path8 from "node:path";

// src/core/crash-report.ts
function crashReport(err, ctx) {
  let name = "Unknown";
  let message = "Unknown";
  let stackLines = [];
  if (err instanceof Error) {
    name = err.name;
    message = err.message;
    if (err.stack) {
      stackLines = err.stack.split("\n");
    }
  } else {
    message = String(err);
  }
  if (message.length > 200) {
    message = message.slice(0, 200);
  }
  stackLines = stackLines.map((line) => line.replaceAll(ctx.home, "~")).slice(0, 12);
  const record = {
    version: ctx.version,
    when: ctx.when.toISOString(),
    terminal: `${ctx.columns}x${ctx.rows}`,
    error: { name, message, stack: stackLines }
  };
  const messageText = [
    "snote hit a bug and stopped.",
    `A report was saved to: {path}`,
    "Hand that file to your coding agent, or attach it to an issue."
  ].join("\n");
  return { record, message: messageText };
}

// src/core/secure-fs.ts
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
function secureMkdir(dir) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  chmodSync(dir, 448);
}
function secureWriteFileSync(path9, data) {
  writeFileSync(path9, data, { mode: 384 });
  chmodSync(path9, 384);
}

// src/core/crash-ring.ts
var MAX_KEY_EVENTS = 20;
function pushKeyEvent(ring, event) {
  const newRing = [...ring, event];
  if (newRing.length > MAX_KEY_EVENTS) {
    return newRing.slice(newRing.length - MAX_KEY_EVENTS);
  }
  return newRing;
}
function sessionSnapshot(state, keys, term) {
  const noteLengths = [];
  state.data.notes.forEach((note) => {
    noteLengths.push((note.content ?? "").length);
  });
  return {
    version: term.version,
    terminal: `${term.columns}x${term.rows}`,
    noteCount: state.data.notes.size,
    noteLengths,
    tagCount: state.data.tags.size,
    collectionType: state.ui.collection.type,
    keys
  };
}

// src/tui/app-keys.ts
var import_react = __toESM(require_react(), 1);

// vendor/simplenote/utils/tag-hash.ts
var tagHashOf = (tagName) => {
  const normalized = tagName.normalize("NFC");
  const lowercased = normalized.toLocaleLowerCase("en-US");
  const encoded = encodeURIComponent(lowercased);
  return encoded.replace(
    /[!'()*\-_~.]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
};
var tagNameOf = (tagHash) => decodeURIComponent(tagHash);
var withTag = (tags2, tag) => {
  const hash = tagHashOf(tag);
  const tagAt = tags2.findIndex((tagName) => tagHashOf(tagName) === hash);
  return tagAt > -1 ? tags2 : [...tags2, tag];
};
var withoutTag = (tags2, tag) => {
  const hash = tagHashOf(tag);
  for (const tagName of tags2) {
    if (tagHashOf(tagName) === hash) {
      return tags2.filter((tagName2) => tagHashOf(tagName2) !== hash);
    }
  }
  return tags2;
};

// vendor/simplenote/utils/is-email-tag.ts
var naiveEmailPattern = /^(?:[^@]+)@(?:.+)(?:\.[^.]{2,})$/;
var isEmailTag = (tagName) => naiveEmailPattern.test(tagName);
var is_email_tag_default = isEmailTag;

// src/core/sanitize.ts
var ESC = "\x1B";
var CSI_OR_OSC = new RegExp(
  ESC + "\\[[\\d?;]*[@-~]|" + ESC + "\\](?:[^" + ESC + "\x07]|" + ESC + "\\\\)*(?:\x07|" + ESC + "\\\\)",
  "g"
);
var ANY_ESC_PAIR = new RegExp(ESC + ".", "g");
var CONTROL_BYTES = new RegExp("[\\u0080-\\u009f\\x00-\\x08\\x0b-\\x1f\\x7f]", "g");
var VARIATION_SELECTORS = /[\uFE0F\uFE0E]/g;
function sanitizeForTerminal(s) {
  return s.replace(CSI_OR_OSC, "").replace(ANY_ESC_PAIR, "").replace(CONTROL_BYTES, "").replace(VARIATION_SELECTORS, "");
}

// src/core/collection.ts
function tagRows(tags2) {
  const arr = [];
  tags2.forEach((tag) => {
    if (typeof tag?.name === "string" && tag.name !== "" && !is_email_tag_default(tag.name)) arr.push(tag);
  });
  arr.sort((a, b) => {
    const aIdx = a.index ?? Infinity;
    const bIdx = b.index ?? Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });
  return arr.map((tag) => sanitizeForTerminal(tag.name));
}
function inCollection(note, collection2, hasQuery = false) {
  if (collection2.type === "all" || collection2.type === "trash") {
    return true;
  }
  if (collection2.type === "untagged") {
    return note.tags.length === 0;
  }
  if (hasQuery) {
    return true;
  }
  const hash = tagHashOf(collection2.tagName);
  return note.tags.some((tagName) => tagHashOf(tagName) === hash);
}
function moveTagActions(rows, tagName, delta) {
  const i = rows.findIndex(
    (name) => tagHashOf(name) === tagHashOf(tagName)
  );
  if (i === -1) {
    return [];
  }
  const j = i + delta;
  if (j < 0 || j >= rows.length) {
    return [];
  }
  const copy = [...rows];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy.map((name, k) => ({
    type: "REORDER_TAG",
    tagName: name,
    newIndex: k
  }));
}

// vendor/simplenote/state/selectors.ts
var notesAreEqual = (a, b) => !!(a && b && a.content === b.content && a.creationDate === b.creationDate && a.modificationDate === b.modificationDate && !!a.deleted === !!b.deleted && a.publishURL === b.publishURL && a.shareURL === b.shareURL && a.tags.length === b.tags.length && a.systemTags.length === b.systemTags.length && a.tags.every((tag) => b.tags.includes(tag)) && a.systemTags.every((tag) => b.systemTags.includes(tag)));
var getRevision = (state, noteId, revisionVersion, includeDeletedTags) => {
  const note = state.data.notes.get(noteId);
  const revisions = state.data.noteRevisions.get(noteId);
  const revision = revisions?.get(revisionVersion);
  if (!note || !revision) {
    return null;
  }
  const noteEmailTags = note.tags.filter((tagName) => is_email_tag_default(tagName));
  const revisionCanonicalTags = revision.tags.filter((tagName) => {
    const tagHash = tagHashOf(tagName);
    const hasTag = state.data.tags.has(tagHash);
    return !is_email_tag_default(tagName) && (hasTag || includeDeletedTags);
  });
  return {
    ...revision,
    tags: [...noteEmailTags, ...revisionCanonicalTags],
    systemTags: note.systemTags
  };
};

// vendor/simplenote/utils/note-utils.ts
var import_remove_markdown = __toESM(require_remove_markdown(), 1);
var import_escapeRegExp = __toESM(require_escapeRegExp(), 1);

// vendor/simplenote/utils/filter-notes.ts
var tagPattern = () => /(?:\btag:)([^\s,]+)/g;
var withoutTags = (s) => s.replace(tagPattern(), "").trim();
var getTerms = (filterText) => {
  if (!filterText) {
    return [];
  }
  const literalsPattern = /(?:")((?:"|[^"])+?)(?:")/g;
  const boundaryPattern = /[\b\s]/g;
  let match;
  let storedLastIndex = 0;
  let withoutLiterals = "";
  const filter = withoutTags(filterText);
  const literals = [];
  while ((match = literalsPattern.exec(filter)) !== null) {
    literals.push(match[0].slice(1, -1));
    withoutLiterals += filter.slice(storedLastIndex, match.index);
    storedLastIndex = literalsPattern.lastIndex;
  }
  if ((storedLastIndex > 0 || literals.length === 0) && storedLastIndex < filter.length) {
    withoutLiterals += filter.slice(storedLastIndex);
  }
  const terms = withoutLiterals.split(boundaryPattern).map((a) => a.trim()).filter((a) => a);
  return [...literals, ...terms];
};

// vendor/simplenote/utils/note-utils.ts
var maxTitleChars = 64;
var isLowSurrogate = (c) => 56320 <= c && c <= 57343;
var removeMarkdownWithFix = (inputString) => {
  return (0, import_remove_markdown.default)(inputString.replace(/(\s)\s+/g, "$1"), {
    stripListLeaders: false
  });
};
var getTitle = (content) => {
  const titlePattern = new RegExp(`\\s*([^
]{1,${maxTitleChars}})`, "g");
  const titleMatch = titlePattern.exec(content);
  if (!titleMatch) {
    return "New Note\u2026";
  }
  const [, title] = titleMatch;
  return title;
};
var getPreview = (content, searchQuery2) => {
  let preview = "";
  let lines = 0;
  if (searchQuery2?.trim()) {
    const terms = getTerms(searchQuery2);
    if (terms.length > 0) {
      const firstTerm = terms[0].toLocaleLowerCase();
      const leadingChars = 30 - firstTerm.length;
      const regExp = new RegExp(
        "(?:\\s|^)[^\n]{0," + leadingChars + "}" + // up to leadingChars of text before the match
        (0, import_escapeRegExp.default)(firstTerm) + ".{0,200}(?=\\s|$)",
        // up to 200 characters of text after the match, splitting at a word boundary
        "ims"
      );
      const matches = regExp.exec(content);
      if (matches && matches.length > 0) {
        preview = matches[0].split("\n").filter(
          (line) => line !== "\r" && line !== "" && line !== getTitle(content)
        ).join("\n");
        return isLowSurrogate(preview.charCodeAt(0)) ? preview.slice(1) : preview;
      }
    }
  }
  let index = content.indexOf("\n");
  if (index === -1) {
    return "";
  }
  while (index > -1 && lines < 3) {
    const nextNewline = content.indexOf("\n", index);
    if (-1 === nextNewline) {
      return preview + content.slice(index).trim();
    }
    const nextLine = content.slice(index, nextNewline).trim();
    if (nextLine) {
      preview += nextLine + "\n";
      lines++;
    }
    index = nextNewline + 1;
  }
  return preview.trim();
};
var formatPreview = (stripMarkdown, s) => stripMarkdown ? removeMarkdownWithFix(s) || s : s;
var previewCache = /* @__PURE__ */ new Map();
var noteTitleAndPreview = (note, searchQuery2) => {
  const stripMarkdown = isMarkdown(note);
  const cached = previewCache.get(note.content);
  if (cached) {
    const [value, wasMarkdown, savedQuery] = cached;
    if (wasMarkdown === stripMarkdown && savedQuery === searchQuery2) {
      return value;
    }
  }
  const content = note.content || "";
  const title = formatPreview(stripMarkdown, getTitle(content));
  const preview = formatPreview(
    stripMarkdown,
    getPreview(content, searchQuery2)
  );
  const result = { title, preview };
  previewCache.set(note.content, [result, stripMarkdown, searchQuery2]);
  return result;
};
function isMarkdown(note) {
  return note.systemTags.includes("markdown");
}
var note_utils_default = noteTitleAndPreview;

// src/core/history.ts
function revisionsOf(state, noteId) {
  if (noteId === null) {
    return [];
  }
  const revisions = state.data.noteRevisions.get(noteId);
  if (!revisions) {
    return [];
  }
  const result = [];
  revisions.forEach((note, version) => {
    result.push({ version, note });
  });
  result.sort((a, b) => b.version - a.version);
  return result;
}
function revisionLabel(rev) {
  const title = sanitizeForTerminal(noteTitleAndPreview(rev.note).title);
  const dateStr = new Date(rev.note.modificationDate * 1e3).toISOString().slice(0, 16).replace("T", " ");
  return `v${rev.version}  ${dateStr}  ${title}`;
}
function restoreRevisionAction(state, noteId, version) {
  const note = getRevision(state, noteId, version, true);
  if (note === null) {
    return null;
  }
  return { type: "RESTORE_NOTE_REVISION", noteId, note };
}

// src/core/layout.ts
function paneLayout(width, tagsOpen, tagsFocused, reading = false) {
  if (width >= 80) {
    const tagsWidth = tagsOpen ? 14 : 0;
    return {
      tagsWidth,
      listWidthProp: width - tagsWidth,
      previewWidthProp: width - tagsWidth
    };
  }
  if (width >= 50) {
    if (tagsOpen) {
      return {
        tagsWidth: 20,
        listWidthProp: Math.ceil((width - 20) * 2.5),
        previewWidthProp: 0
      };
    } else {
      return {
        tagsWidth: 0,
        listWidthProp: width,
        previewWidthProp: width
      };
    }
  }
  if (tagsOpen && tagsFocused) {
    return {
      tagsWidth: width,
      listWidthProp: 0,
      previewWidthProp: 0
    };
  }
  if (reading) {
    return { tagsWidth: 0, listWidthProp: 0, previewWidthProp: Math.ceil((width - 1) / 0.6) };
  }
  return {
    tagsWidth: 0,
    listWidthProp: Math.ceil(width * 2.5),
    previewWidthProp: 0
  };
}
function shouldAutoOpenTags(width, tagCount) {
  return width >= 100 && tagCount > 0;
}

// src/core/note-keys.ts
function noteKeyAction(input, noteId, state) {
  const inTrash = state.ui.collection.type === "trash";
  switch (input) {
    case "d":
      if (noteId !== null && !inTrash) {
        return { type: "TRASH_NOTE", noteId };
      }
      return null;
    case "u":
      if (noteId !== null && inTrash) {
        return { type: "RESTORE_NOTE", noteId };
      }
      return null;
    case "D":
      if (noteId !== null && inTrash) {
        return { type: "DELETE_NOTE_FOREVER", noteId };
      }
      return null;
    case "T":
      if (inTrash) {
        return { type: "SHOW_ALL_NOTES" };
      }
      return { type: "SELECT_TRASH" };
    case "S":
      return { type: "setSortReversed", sortReversed: !state.settings.sortReversed };
    case "s":
      const cycle = ["modificationDate", "creationDate", "alphabetical"];
      const idx = cycle.indexOf(state.settings.sortType);
      const nextSort = cycle[(idx + 1) % cycle.length];
      return { type: "setSortType", sortType: nextSort };
    case "p":
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyPinned = note.systemTags.includes("pinned");
          return { type: "PIN_NOTE", noteId, shouldPin: !alreadyPinned };
        }
      }
      return null;
    case "m":
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyMarkdown = note.systemTags.includes("markdown");
          return { type: "MARKDOWN_NOTE", noteId, shouldEnableMarkdown: !alreadyMarkdown };
        }
      }
      return null;
    case "P":
      if (noteId !== null && !inTrash) {
        const note = state.data.notes.get(noteId);
        if (note) {
          const alreadyPublished = note.systemTags.includes("published");
          return { type: "PUBLISH_NOTE", noteId, shouldPublish: !alreadyPublished };
        }
      }
      return null;
    default:
      return null;
  }
}
function sortLabel(state) {
  const map = {
    modificationDate: "sort: modified",
    creationDate: "sort: created",
    alphabetical: "sort: a-z"
  };
  let label = map[state.settings.sortType];
  if (state.settings.sortReversed) {
    label += " (rev)";
  }
  return label;
}
function emptyTrashActions(state) {
  const inTrash = state.ui.collection.type === "trash";
  if (!inTrash) {
    return [];
  }
  const actions = [];
  for (const [noteId, note] of state.data.notes) {
    if (Boolean(note.deleted)) {
      actions.push({ type: "DELETE_NOTE_FOREVER", noteId });
    }
  }
  return actions;
}
function publishLink(note) {
  if (!note || !note.systemTags?.includes("published")) {
    return null;
  }
  if (typeof note.publishURL === "string" && note.publishURL.length > 0) {
    return "https://simp.ly/p/" + note.publishURL;
  }
  return null;
}
function sharedLine(note) {
  if (!note) {
    return null;
  }
  const emails = note.tags.filter(is_email_tag_default);
  if (emails.length > 0) {
    return "shared with: " + emails.join(", ");
  }
  if (note.systemTags.includes("shared")) {
    return "shared";
  }
  return null;
}

// src/tui/app-actions.ts
import { basename as basename3, dirname, join as join5 } from "node:path";

// src/core/editor.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4, basename as basename2 } from "node:path";

// src/cli/env-check.ts
import { delimiter, join } from "node:path";
import fs from "node:fs";
function findOnPath(command, pathVar, exists = fs.existsSync) {
  if (command.includes("/")) {
    return exists(command) ? command : null;
  }
  if (!pathVar) return null;
  const dirs = pathVar.split(delimiter);
  for (const dir of dirs) {
    if (dir === "") continue;
    const candidate = join(dir, command);
    if (exists(candidate)) return candidate;
  }
  return null;
}
function envReport(env, exists = fs.existsSync) {
  const editorRaw = env.EDITOR?.trim() ?? "";
  const editorCommand = editorRaw ? editorRaw.split(/\s+/)[0] : "nvim";
  const commands = [editorCommand, "wl-copy", "omarchy-launch-tui"];
  const lines = [];
  for (const cmd of commands) {
    const found = findOnPath(cmd, env.PATH, exists);
    if (found) {
      lines.push(`ok       ${cmd}: ${found}`);
    } else {
      lines.push(`missing  ${cmd}`);
    }
  }
  return lines.join("\n");
}

// src/core/editor-select.ts
import { existsSync, readFileSync } from "node:fs";
import { basename, join as join2 } from "node:path";
var TERMINAL_EDITORS = /* @__PURE__ */ new Set(["nvim", "vim", "vi", "nano", "micro", "hx", "helix", "fresh"]);
function isTerminalEditor(cmd) {
  const first = cmd.trim().split(/\s+/)[0] ?? "";
  return TERMINAL_EDITORS.has(basename(first));
}
function defaultReadFirstLine(file) {
  try {
    const content = readFileSync(file, "utf-8");
    const first = content.split("\n")[0]?.trim();
    return first ? first : null;
  } catch {
    return null;
  }
}
function selectEditor(env, exists = existsSync, readFirstLine = defaultReadFirstLine) {
  const snoteEditor = env.SNOTE_EDITOR?.trim();
  if (snoteEditor) {
    return snoteEditor;
  }
  const stateDir2 = env.XDG_STATE_HOME ?? (env.HOME ? join2(env.HOME, ".local/state") : null);
  if (stateDir2) {
    const defaultsFile = join2(stateDir2, "omarchy/defaults/editor");
    if (exists(defaultsFile)) {
      const line = readFirstLine(defaultsFile)?.trim();
      if (line) {
        const firstToken = line.split(/\s+/)[0];
        if (findOnPath(firstToken, env.PATH, exists)) {
          return line;
        }
      }
    }
  }
  if (findOnPath("nvim", env.PATH, exists)) {
    return "nvim";
  }
  const editor = env.EDITOR?.trim();
  if (editor && !editor.startsWith("omarchy-launch-editor")) {
    return editor;
  }
  if (findOnPath("omawrite", env.PATH, exists)) {
    return "omawrite";
  }
  return "vi";
}
function editorFinishHint(editorCmd) {
  const cmd = editorCmd.split(/\s+/)[0];
  const name = basename(cmd);
  if (name === "omawrite") {
    return "save with Ctrl+S and close the window to return";
  }
  if (name === "nvim" || name === "vim") {
    return "Esc then :wq to save and return";
  }
  return "save and close the editor to return";
}

// src/core/export-note.ts
import { homedir } from "node:os";
import { join as join3 } from "node:path";
import { writeFile } from "node:fs/promises";
var FILENAME_LENGTH = 40;
var INVALID_CHARS = /[\/\\?<>:*|"\u0000-\u001f]/g;
function exportFileName(content) {
  const raw = (content ?? "").split("\n").map((line) => line.trim()).find((line) => line !== "");
  if (raw === void 0) return "untitled";
  const cleaned = raw.replace(/^#\s+/, "").replace(INVALID_CHARS, "").slice(0, FILENAME_LENGTH);
  return cleaned === "" ? "untitled" : cleaned;
}
function exportText(note) {
  const content = note.content ?? "";
  const tagLines = note.tags ?? [];
  if (tagLines.length === 0) return content;
  return `${content}

Tags:
  ${tagLines.join(", ")}`;
}
function documentsDir(env = process.env) {
  const xdg = env.XDG_DOCUMENTS_DIR;
  if (xdg && xdg.trim() !== "") return xdg;
  return join3(homedir(), "Documents");
}
async function exportNote(note, dir) {
  const base = exportFileName(note.content ?? "");
  const text = exportText(note);
  for (let n = 1; ; n++) {
    const path9 = join3(dir, n === 1 ? `${base}.md` : `${base} ${n}.md`);
    try {
      await writeFile(path9, text, { encoding: "utf8", flag: "wx" });
      return path9;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}

// src/core/editor.ts
var NVIM_HINT = "snote \xB7 i insert \xB7 Esc done typing \xB7 o new line \xB7 dd delete line \xB7 u undo \xB7 :wq save & return \xB7 :q! discard";
function nvimHintLuaString() {
  const level = NVIM_HINT.includes("]") ? "=" : "";
  const safe = NVIM_HINT.replaceAll("%", "%%");
  return "[" + level + "[" + safe + "]" + level + "]";
}
function nvimHintArgs() {
  const hint = "'%#Comment#' .. " + nvimHintLuaString();
  const setWinbar = 'vim.api.nvim_set_option_value("winbar", ' + hint + ", { win = 0 })";
  const recordBuf = "vim.g.snote_buf = vim.api.nvim_get_current_buf()";
  const guard = 'if vim.api.nvim_win_get_config(0).relative == "" and vim.api.nvim_get_current_buf() == vim.g.snote_buf then ' + setWinbar + " end";
  return [
    "-c",
    "lua " + recordBuf + " " + setWinbar,
    "-c",
    "autocmd BufWinEnter,WinEnter * lua " + guard
  ];
}
async function editInEditor(initial, opts) {
  const editor = opts?.editor ?? selectEditor(process.env);
  const parts = editor.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  const tmpDir = mkdtempSync(join4(tmpdir(), "snote-"));
  try {
    const stem = exportFileName(initial);
    const tmpFile = join4(tmpDir, `${stem}.md`);
    writeFileSync2(tmpFile, initial, "utf-8");
    const direct = process.env.SNOTE_EDITOR_DIRECT === "1";
    const uwsm = direct ? null : findOnPath("uwsm", process.env.PATH);
    const hint = basename2(cmd) === "nvim" ? nvimHintArgs() : [];
    const result = isTerminalEditor(cmd) ? spawnSync(cmd, [...args, ...hint, tmpFile], { stdio: "inherit" }) : uwsm ? spawnSync("uwsm", ["app", "-S", "both", "--", cmd, ...args, tmpFile], {
      stdio: ["ignore", "ignore", "ignore"]
    }) : spawnSync(cmd, [...args, tmpFile], { stdio: ["ignore", "ignore", "ignore"] });
    if (result.error) {
      throw new Error(
        "editor failed: " + (result.error.code ?? result.error.message)
      );
    }
    if (result.status !== 0) {
      throw new Error("editor failed: exit " + result.status);
    }
    const edited = readFileSync2(tmpFile, "utf-8");
    return edited === initial ? null : edited;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// src/core/new-note.ts
function newNoteFields(collection2, topNote) {
  const systemTags = topNote?.systemTags.includes("markdown") ? ["markdown"] : [];
  const tags2 = collection2.type === "tag" ? [collection2.tagName] : [];
  return { systemTags, tags: tags2 };
}

// src/core/clipboard.ts
import { spawnSync as spawnSync2 } from "node:child_process";
function copyToClipboard(text, command = ["wl-copy"]) {
  if (!text || command.length === 0) {
    return false;
  }
  const result = spawnSync2(command[0], command.slice(1), {
    input: text,
    stdio: ["pipe", "ignore", "ignore"]
  });
  return result.error === void 0 && result.status === 0;
}

// vendor/simplenote/utils/task-transform.ts
var checkboxRegex = /^(\s*)- \[( |x|X)\](\s)/gm;
var withCheckboxCharacters = (s) => s.replace(
  checkboxRegex,
  (match, prespace, inside, postspace) => prespace + (inside === " " ? "\uE000" : "\uE001") + postspace
);
var withCheckboxSyntax = (s) => s.replace(
  /\ue000|\ue001/g,
  (match) => match === "\uE000" ? "- [ ]" : "- [x]"
);

// src/core/checklist.ts
var ITEM = new RegExp(checkboxRegex.source);
function checklistItems(content) {
  const items = [];
  const lines = content.split("\n");
  lines.forEach((line, lineIndex) => {
    const match = ITEM.exec(line);
    if (match) {
      items.push({
        line: lineIndex,
        checked: match[2] !== " ",
        text: line.slice(match[0].length)
      });
    }
  });
  return items;
}
function toggleChecklistItem(content, index) {
  if (!Number.isInteger(index)) {
    return content;
  }
  const items = checklistItems(content);
  if (index < 0 || index >= items.length) {
    return content;
  }
  const item = items[index];
  const lines = content.split("\n");
  const line = lines[item.line];
  const match = ITEM.exec(line);
  const toggled = match[1] + "- [" + (match[2] === " " ? "x" : " ") + "]" + match[3];
  lines[item.line] = toggled + line.slice(match[0].length);
  return lines.join("\n");
}
function insertChecklistItem(content, afterIndex, text) {
  const t = text.trim();
  if (t === "") {
    return content;
  }
  const items = checklistItems(content);
  const item = items[afterIndex];
  if (item) {
    const lines = content.split("\n");
    const itemLine = lines[item.line];
    const match = ITEM.exec(itemLine);
    const indent = match[1];
    const newLine = indent + "- [ ] " + t;
    lines.splice(item.line + 1, 0, newLine);
    return lines.join("\n");
  }
  const itemText = "- [ ] " + t;
  if (content === "") {
    return itemText;
  }
  if (content.endsWith("\n")) {
    return content + itemText;
  }
  return content + "\n" + itemText;
}

// src/core/editor-conflict-merge.ts
var import_change = __toESM(require_change(), 1);
function mergeEditorReturn(base, local, current) {
  if (current === base) {
    return { content: local, conflict: false };
  }
  const b = { content: base };
  const l = { content: local };
  const c = { content: current };
  const localDiff = (0, import_change.diff)(b, l);
  const remoteDiff = (0, import_change.diff)(b, c);
  if (local === base) {
    return { content: current, conflict: false };
  }
  let merged;
  try {
    const transformed = (0, import_change.transform)(localDiff, remoteDiff, b);
    if (transformed && Object.keys(transformed).length > 0) {
      merged = (0, import_change.apply)(transformed, c);
    }
  } catch {
    merged = void 0;
  }
  if (merged && typeof merged.content === "string") {
    return { content: merged.content, conflict: false };
  }
  return {
    content: `${local}

--- conflicting change from another device ---
${current}`,
    conflict: true
  };
}

// vendor/simplenote/state/data/actions.ts
var actions_exports = {};
__export(actions_exports, {
  addCollaborator: () => addCollaborator,
  editNote: () => editNote,
  exportNotes: () => exportNotes,
  importNote: () => importNote,
  markdownNote: () => markdownNote,
  pinNote: () => pinNote,
  publishNote: () => publishNote,
  removeCollaborator: () => removeCollaborator,
  renameTag: () => renameTag,
  toggleAnalytics: () => toggleAnalytics
});
var addCollaborator = (noteId, collaboratorAccount) => ({
  type: "ADD_COLLABORATOR",
  noteId,
  collaboratorAccount
});
var editNote = (noteId, changes) => ({
  type: "EDIT_NOTE",
  noteId,
  changes
});
var exportNotes = () => ({
  type: "EXPORT_NOTES"
});
var importNote = (note) => ({
  type: "IMPORT_NOTE",
  note
});
var markdownNote = (noteId, shouldEnableMarkdown) => ({
  type: "MARKDOWN_NOTE",
  noteId,
  shouldEnableMarkdown
});
var pinNote = (noteId, shouldPin) => ({
  type: "PIN_NOTE",
  noteId,
  shouldPin
});
var publishNote = (noteId, shouldPublish) => ({
  type: "PUBLISH_NOTE",
  noteId,
  shouldPublish
});
var removeCollaborator = (noteId, collaboratorAccount) => ({
  type: "REMOVE_COLLABORATOR",
  noteId,
  collaboratorAccount
});
var renameTag = (oldTagName, newTagName) => ({
  type: "RENAME_TAG",
  oldTagName,
  newTagName
});
var toggleAnalytics = () => ({
  type: "TOGGLE_ANALYTICS"
});

// src/tui/app-actions.ts
function editSelectedNote(ctx) {
  const { store, selectedEntry, setRawMode, runEditor, onEditorError, suspend } = ctx;
  if (selectedEntry) {
    setRawMode(false);
    const editor = runEditor ?? editInEditor;
    let result = null;
    let editorError;
    let editorFailed = false;
    let settle;
    const editorDone = new Promise((resolve) => {
      settle = resolve;
    });
    const run = async () => {
      try {
        announceEditorIfGui();
        result = await editor(selectedEntry.note.content ?? "");
      } catch (err) {
        editorError = err;
        editorFailed = true;
      }
      setRawMode(true);
      settle();
    };
    const done = suspend ? suspend(run) : run();
    void editorDone.then(() => {
      if (editorFailed) {
        onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
        return;
      }
      if (result !== null) {
        const current = store.getState().data.notes.get(selectedEntry.id)?.content ?? "";
        const merged = mergeEditorReturn(selectedEntry.note.content ?? "", result, current);
        store.dispatch({
          type: "EDIT_NOTE",
          noteId: selectedEntry.id,
          changes: { content: merged.content }
        });
        if (merged.conflict) {
          onEditorError?.("A change from another device could not be merged automatically - both versions were kept.");
        }
      }
    });
    void Promise.resolve(done);
  }
}
function saveInlineEdit(ctx) {
  const { store, selectedEntry, base, local, onEditorError } = ctx;
  if (!selectedEntry) return;
  const current = store.getState().data.notes.get(selectedEntry.id)?.content ?? "";
  const merged = mergeEditorReturn(base, local, current);
  store.dispatch(editNote(selectedEntry.id, { content: merged.content }));
  if (merged.conflict) {
    onEditorError?.("A change from another device could not be merged automatically - both versions were kept.");
  }
}
function createNote(ctx) {
  const { store, setRawMode, runEditor, setSelectedIndex, onEditorError, onNoteCreated, suspend } = ctx;
  setRawMode(false);
  const noteId = crypto.randomUUID();
  const editor = runEditor ?? editInEditor;
  let result = null;
  let editorError;
  let editorFailed = false;
  let settle;
  const editorDone = new Promise((resolve) => {
    settle = resolve;
  });
  const run = async () => {
    try {
      announceEditorIfGui();
      result = await editor("");
    } catch (err) {
      editorError = err;
      editorFailed = true;
    }
    setRawMode(true);
    settle();
  };
  const done = suspend ? suspend(run) : run();
  void editorDone.then(() => {
    if (editorFailed) {
      onEditorError?.(editorError instanceof Error ? editorError.message : String(editorError));
      return;
    }
    if (result !== null) {
      const fields = newNoteFields(store.getState().ui.collection, ctx.topNote);
      store.dispatch({
        type: "CREATE_NOTE_WITH_ID",
        noteId,
        note: { content: result, systemTags: fields.systemTags, tags: fields.tags },
        meta: { nextNoteToOpen: noteId }
      });
      setSelectedIndex((i) => i);
      onNoteCreated?.();
    }
  });
  void Promise.resolve(done);
}
function copyLink(ctx) {
  const { selectedEntry, copyText, setCopyResult } = ctx;
  if (selectedEntry) {
    const link = publishLink(selectedEntry.note);
    if (link !== null) {
      const ok = (copyText ?? copyToClipboard)(link);
      setCopyResult({ noteId: selectedEntry.id, ok });
    }
  }
}
function forceSyncNow(ctx) {
  const { store, onForceSync, timerRef, setSyncedAt } = ctx;
  const fn = onForceSync ?? store.forceSync;
  if (fn) fn.call(store);
  if (timerRef.current) clearTimeout(timerRef.current);
  const hhmm = (/* @__PURE__ */ new Date()).toTimeString().slice(0, 5);
  setSyncedAt(hhmm);
  timerRef.current = setTimeout(() => {
    setSyncedAt(null);
    timerRef.current = null;
  }, 3e3);
}
function insertCheckItem(ctx) {
  const { store, selectedEntry, itemIndex, value } = ctx;
  if (!selectedEntry) return;
  const content = selectedEntry.note.content ?? "";
  const at = Math.min(itemIndex, checklistItems(content).length - 1);
  store.dispatch(editNote(selectedEntry.id, { content: insertChecklistItem(content, at, value) }));
}
function announceEditorIfGui() {
  const cmd = selectEditor(process.env);
  if (isTerminalEditor(cmd)) return;
  const first = cmd.trim().split(/\s+/)[0] ?? "";
  const name = basename3(first);
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  process.stdout.write(`Editing in ${displayName} \u2014 ${editorFinishHint(cmd)}
`);
}
function exportSelectedNote(ctx) {
  const { selectedEntry, value, setNotice, setNoticeError } = ctx;
  if (!selectedEntry) return;
  const base = exportFileName(selectedEntry.note.content ?? "");
  const target = value.trim() !== "" ? value : join5(documentsDir(), `${base}.md`);
  const dir = dirname(target);
  exportNote(selectedEntry.note, dir).then((path9) => setNotice(`exported: ${path9}`)).catch(
    (err) => setNoticeError(`export failed: ${err instanceof Error ? err.message : String(err)}`)
  );
}

// src/tui/app-keys.ts
var keyLog = [];
function recordKeyEvent(input, key, textPromptOpen) {
  keyLog = pushKeyEvent(keyLog, { input: textPromptOpen && input ? "<text>" : input, key: { ...key } });
}
function getKeyLog() {
  return keyLog;
}
function handleSearchKey(input, key, ctx) {
  const { store, setSearchOpen, setQuery, setSelectedIndex, rememberSelection } = ctx;
  if (key.return) {
    setSearchOpen(false);
    return;
  }
  if (key.escape) {
    if (rememberSelection) {
      rememberSelection();
      setSearchOpen(false);
      return;
    }
    store.dispatch({ type: "SEARCH", searchQuery: "" });
    setQuery("");
    setSearchOpen(false);
    setSelectedIndex(0);
    return;
  }
  if (key.backspace || key.delete) {
    const currentQuery = store.getState().ui.searchQuery;
    if (currentQuery.length > 0) {
      store.dispatch({
        type: "SEARCH",
        searchQuery: currentQuery.slice(0, -1)
      });
      setSelectedIndex(0);
    }
    return;
  }
  if (input && input !== "\r" && input !== "\x1B" && !key.ctrl && !key.meta && !key.tab) {
    store.dispatch({ type: "SEARCH", searchQuery: store.getState().ui.searchQuery + input });
    setSelectedIndex(0);
    return;
  }
  return;
}
function handleSearchClearKey(keyName, ctx) {
  if (keyName !== "Escape" || !ctx.query) return false;
  ctx.remember(ctx.selectedId, true);
  return true;
}
function dispatchTagRow(store, tagNames, index) {
  if (index === 0) store.dispatch({ type: "SHOW_ALL_NOTES" });
  else if (index === tagNames.length + 1) store.dispatch({ type: "SHOW_UNTAGGED_NOTES" });
  else if (index !== tagNames.length + 2) store.dispatch({ type: "OPEN_TAG", tagName: tagNames[index - 1] });
}
function handleTagsKey(input, keyName, ctx) {
  const { store, tagNames, tagIndex, setTagIndex, setSelectedIndex, setTagsFocused, setTagsOpen, setTagDialog } = ctx;
  if (keyName === "downArrow" || input === "j") {
    const next = Math.min(tagIndex + 1, tagNames.length + 2);
    setTagIndex(next);
    dispatchTagRow(store, tagNames, next);
    setSelectedIndex(0);
    return;
  }
  if (keyName === "upArrow" || input === "k") {
    const next = Math.max(tagIndex - 1, 0);
    setTagIndex(next);
    dispatchTagRow(store, tagNames, next);
    setSelectedIndex(0);
    return;
  }
  if (keyName === "Enter") {
    if (tagIndex === tagNames.length + 2) store.dispatch({ type: "SELECT_TRASH" });
    else dispatchTagRow(store, tagNames, tagIndex);
    setSelectedIndex(0);
    setTagsFocused(false);
    return;
  }
  if (keyName === "Tab" || keyName === "rightArrow") {
    setTagsFocused(false);
    return;
  }
  if (input === "t" || keyName === "Escape") {
    setTagsOpen(false);
    setTagsFocused(false);
    return;
  }
  if (tagIndex > 0 && tagIndex <= tagNames.length) {
    if (input === "R") {
      setTagDialog({ kind: "rename", tagName: tagNames[tagIndex - 1] });
      return;
    }
    if (input === "x") {
      setTagDialog({ kind: "delete", tagName: tagNames[tagIndex - 1] });
      return;
    }
    if (input === "K" || input === "J") {
      const delta = input === "K" ? -1 : 1;
      const actions = moveTagActions(tagNames, tagNames[tagIndex - 1], delta);
      if (actions.length > 0) {
        actions.forEach((action) => store.dispatch(action));
        setTagIndex(tagIndex + delta);
      }
      return;
    }
  }
  return;
}
function handleHistoryKey(input, keyName, ctx) {
  const { store, noteEntries, selectedIndex, historyIndex, setHistoryIndex, setHistoryOpen } = ctx;
  const state = store.getState();
  const selectedId = noteEntries[selectedIndex]?.id ?? null;
  const revisions = selectedId ? revisionsOf(state, selectedId) : [];
  if (keyName === "downArrow" || input === "j") {
    setHistoryIndex((i) => Math.min(i + 1, revisions.length - 1));
    return;
  }
  if (keyName === "upArrow" || input === "k") {
    setHistoryIndex((i) => Math.max(i - 1, 0));
    return;
  }
  if (keyName === "Enter") {
    const rev = revisions[historyIndex];
    if (rev) {
      const action = restoreRevisionAction(store.getState(), selectedId, rev.version);
      if (action) store.dispatch(action);
    } else {
      store.dispatch({ type: "CLOSE_REVISION" });
    }
    setHistoryOpen(false);
    return;
  }
  if (keyName === "Escape" || input === "h") {
    store.dispatch({ type: "CLOSE_REVISION" });
    setHistoryOpen(false);
    return;
  }
  return;
}
function openHistory(ctx) {
  const { store, selectedEntry, setHistoryOpen, setHistoryIndex } = ctx;
  if (selectedEntry) {
    store.dispatch({ type: "OPEN_NOTE", noteId: selectedEntry.id });
    store.dispatch({ type: "REVISIONS_TOGGLE" });
    setHistoryOpen(true);
    setHistoryIndex(0);
  }
}
function handleIdleKey(input, ctx) {
  const { store, selectedEntry } = ctx;
  if (input === "g") {
    if (selectedEntry) ctx.setTagEditorOpen(true);
  } else if (input === "w") {
    if (selectedEntry) {
      if (selectedEntry.note.deleted) {
        ctx.setNotice?.("In trash: press u to restore first");
      } else {
        ctx.setExportAsk?.(true);
      }
    }
  } else if (input === "y") {
    copyLink({ selectedEntry, copyText: ctx.copyText, setCopyResult: ctx.setCopyResult });
  } else if (input === "r") {
    forceSyncNow({ store, onForceSync: ctx.onForceSync, timerRef: ctx.syncedTimerRef, setSyncedAt: ctx.setSyncedAt });
  } else if (input === "E") {
    const n = emptyTrashActions(store.getState()).length;
    if (n > 0) ctx.setEmptyAsk(n);
  }
}
function useAppEffects(width, tagCount, setTagsOpen, syncedTimerRef, onStart) {
  const autoOpened = import_react.default.useRef(false);
  import_react.default.useEffect(() => {
    if (!autoOpened.current && shouldAutoOpenTags(width, tagCount)) {
      autoOpened.current = true;
      setTagsOpen(true);
    }
  }, [width, tagCount]);
  import_react.default.useEffect(() => {
    onStart?.();
  }, []);
  import_react.default.useEffect(() => () => {
    if (syncedTimerRef.current) {
      clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = null;
    }
  }, []);
}

// src/core/browser-shim.ts
function ensure(target, name, value) {
  if (!(name in target)) {
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  }
}
function installBrowserShim(target = globalThis) {
  if (typeof target.window === "undefined") {
    const win = {
      addEventListener() {
      },
      removeEventListener() {
      },
      dispatchEvent() {
        return true;
      }
    };
    ensure(target, "window", win);
  }
  if (typeof target.navigator === "undefined") {
    ensure(target, "navigator", { onLine: true });
  } else {
    const nav = target.navigator;
    if (typeof nav.onLine !== "boolean") {
      Object.defineProperty(nav, "onLine", { value: true, configurable: true });
    }
  }
  const desc = Object.getOwnPropertyDescriptor(target, "localStorage");
  const ls = desc && "value" in desc ? desc.value : void 0;
  if (typeof ls?.setItem !== "function") {
    const map = /* @__PURE__ */ new Map();
    const lsStore = {
      getItem(key) {
        return map.has(key) ? map.get(key) : null;
      },
      setItem(key, value) {
        map.set(key, value);
      },
      removeItem(key) {
        map.delete(key);
      }
    };
    Object.defineProperty(target, "localStorage", {
      value: lsStore,
      configurable: true,
      writable: true
    });
  }
}
installBrowserShim();

// src/core/store.ts
var import_redux4 = __toESM(require_redux(), 1);

// vendor/simplenote/state/data/reducer.ts
var import_redux = __toESM(require_redux(), 1);
var analyticsAllowed = (state = null, action) => {
  switch (action.type) {
    case "REMOTE_ANALYTICS_UPDATE":
    case "SET_ANALYTICS":
      return action.allowAnalytics;
    default:
      return state;
  }
};
var accountVerification = (state = "unknown", action) => action.type === "UPDATE_ACCOUNT_VERIFICATION" && "dismissed" !== state ? action.state : state;
var modified = (entity) => ({
  ...entity,
  modificationDate: Date.now() / 1e3
});
var notes = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "ADD_COLLABORATOR":
    case "ADD_NOTE_TAG": {
      const note = state.get(action.noteId);
      if (!note) {
        return state;
      }
      const tagName = action.type === "ADD_COLLABORATOR" ? action.collaboratorAccount : action.tagName;
      const tags2 = withTag(note.tags, tagName);
      return tags2 !== note.tags ? new Map(state).set(action.noteId, modified({ ...note, tags: tags2 })) : state;
    }
    case "CREATE_NOTE_WITH_ID":
      return new Map(state).set(action.noteId, {
        content: "",
        creationDate: Date.now() / 1e3,
        modificationDate: Date.now() / 1e3,
        deleted: false,
        publishURL: "",
        shareURL: "",
        systemTags: [],
        tags: [],
        ...action.note
      });
    case "DELETE_NOTE_FOREVER":
    case "NOTE_BUCKET_REMOVE":
    case "REMOTE_NOTE_DELETE_FOREVER": {
      if (!state.has(action.noteId)) {
        return state;
      }
      const next = new Map(state);
      next.delete(action.noteId);
      return next;
    }
    case "EDIT_NOTE": {
      const prev = state.get(action.noteId) ?? {
        content: "",
        creationDate: Date.now() / 1e3,
        modificationDate: Date.now() / 1e3,
        deleted: false,
        publishURL: "",
        shareURL: "",
        systemTags: [],
        tags: []
      };
      return new Map(state).set(
        action.noteId,
        modified({ ...prev, ...action.changes })
      );
    }
    case "NOTE_BUCKET_UPDATE":
    case "REMOTE_NOTE_UPDATE":
    case "RESTORE_NOTE_REVISION":
      return new Map(state).set(action.noteId, action.note);
    case "IMPORT_NOTE_WITH_ID": {
      return new Map(state).set(action.noteId, action.note);
    }
    case "MARKDOWN_NOTE": {
      if (!state.has(action.noteId)) {
        return state;
      }
      const note = state.get(action.noteId);
      const alreadyMarkdown = note.systemTags.includes("markdown");
      if (alreadyMarkdown === action.shouldEnableMarkdown) {
        return state;
      }
      const systemTags = action.shouldEnableMarkdown ? [...note.systemTags, "markdown"] : note.systemTags.filter((tag) => tag !== "markdown");
      return new Map(state).set(
        action.noteId,
        modified({ ...note, systemTags })
      );
    }
    case "PIN_NOTE": {
      if (!state.has(action.noteId)) {
        return state;
      }
      const note = state.get(action.noteId);
      const alreadyPinned = note.systemTags.includes("pinned");
      if (alreadyPinned === action.shouldPin) {
        return state;
      }
      const systemTags = action.shouldPin ? [...note.systemTags, "pinned"] : note.systemTags.filter((tag) => tag !== "pinned");
      return new Map(state).set(
        action.noteId,
        modified({ ...note, systemTags })
      );
    }
    case "PUBLISH_NOTE": {
      if (!state.has(action.noteId)) {
        return state;
      }
      const note = state.get(action.noteId);
      const alreadyPinned = note.systemTags.includes("published");
      if (alreadyPinned === action.shouldPublish) {
        return state;
      }
      const systemTags = action.shouldPublish ? [...note.systemTags, "published"] : note.systemTags.filter((tag) => tag !== "published");
      return new Map(state).set(
        action.noteId,
        modified({ ...note, systemTags })
      );
    }
    case "REMOVE_COLLABORATOR":
    case "REMOVE_NOTE_TAG": {
      const note = state.get(action.noteId);
      if (!note) {
        return state;
      }
      const tagName = action.type === "REMOVE_COLLABORATOR" ? action.collaboratorAccount : action.tagName;
      const tags2 = withoutTag(note.tags, tagName);
      return tags2 !== note.tags ? new Map(state).set(action.noteId, modified({ ...note, tags: tags2 })) : state;
    }
    case "RENAME_TAG": {
      const oldHash = tagHashOf(action.oldTagName);
      const newHash = tagHashOf(action.newTagName);
      const next = new Map(state);
      if (oldHash === newHash) {
        return next;
      }
      next.forEach((note, noteId) => {
        const newTags = [];
        const hashes = /* @__PURE__ */ new Set();
        let hasRenamedTag = false;
        note.tags.forEach((tagName) => {
          const hash = tagHashOf(tagName);
          hasRenamedTag = hasRenamedTag || hash === oldHash || hash === newHash;
          if (hashes.has(hash)) {
            return;
          }
          if (oldHash !== hash) {
            hashes.add(hash);
            newTags.push(tagName);
          }
          if (!hashes.has(newHash)) {
            hashes.add(newHash);
            newTags.push(action.newTagName);
          }
        });
        if (!hasRenamedTag) {
          return;
        }
        next.set(noteId, modified({ ...note, tags: newTags }));
      });
      return next;
    }
    case "RESTORE_NOTE":
      if (!state.has(action.noteId)) {
        return state;
      }
      return new Map(state).set(
        action.noteId,
        modified({
          ...state.get(action.noteId),
          deleted: false
        })
      );
    case "TRASH_NOTE":
      if (!state.has(action.noteId)) {
        return state;
      }
      return new Map(state).set(
        action.noteId,
        modified({
          ...state.get(action.noteId),
          deleted: true
        })
      );
    case "TRASH_TAG": {
      const next = new Map(state);
      let changedIt = false;
      next.forEach((note, noteId) => {
        const tags2 = withoutTag(note.tags, action.tagName);
        if (tags2 === note.tags) {
          return;
        }
        changedIt = true;
        next.set(noteId, modified({ ...note, tags: tags2 }));
      });
      return changedIt ? next : state;
    }
    default:
      return state;
  }
};
var noteRevisions = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "LOAD_REVISIONS": {
      const stored = state.get(action.noteId) ?? /* @__PURE__ */ new Map();
      const next = new Map(stored);
      action.revisions.forEach(([version, note]) => next.set(version, note));
      return new Map(state).set(action.noteId, next);
    }
    default:
      return state;
  }
};
var preferences = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "SET_ANALYTICS":
      const prefKey = "preferences-key";
      return new Map(state).set(prefKey, {
        ...state.get(prefKey) ?? {},
        analytics_enabled: action.allowAnalytics
      });
    case "PREFERENCES_BUCKET_REMOVE": {
      const next = new Map(state);
      return next.delete(action.id) ? next : state;
    }
    case "PREFERENCES_BUCKET_UPDATE":
      return new Map(state).set(action.id, action.data);
    default:
      return state;
  }
};
var tags = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "ADD_COLLABORATOR":
    case "ADD_NOTE_TAG": {
      const tagName = action.type === "ADD_COLLABORATOR" ? action.collaboratorAccount : action.tagName;
      return state.has(tagHashOf(tagName)) ? state : new Map(state).set(tagHashOf(tagName), { name: tagName });
    }
    case "EDIT_NOTE":
    case "IMPORT_NOTE_WITH_ID": {
      const newTags = "EDIT_NOTE" === action.type ? action.changes.tags : action.note.tags;
      if (!newTags?.length) {
        return state;
      }
      const next = new Map(state);
      let hasUpdates = false;
      newTags.forEach((tagName) => {
        const tagHash = tagHashOf(tagName);
        if (!state.has(tagHash)) {
          next.set(tagHash, { name: tagName });
          hasUpdates = true;
        }
      });
      return hasUpdates ? next : state;
    }
    case "REMOTE_TAG_DELETE":
    case "TAG_BUCKET_REMOVE": {
      const next = new Map(state);
      return next.delete(action.tagHash) ? next : state;
    }
    case "REMOTE_TAG_UPDATE":
    case "TAG_BUCKET_UPDATE":
      return new Map(state).set(action.tagHash, action.tag);
    case "RENAME_TAG": {
      const prevHash = tagHashOf(action.oldTagName);
      const nextHash = tagHashOf(action.newTagName);
      const next = new Map(state);
      const prevTag = state.get(prevHash) ?? {};
      next.set(nextHash, { ...prevTag, name: action.newTagName });
      if (prevHash !== nextHash) {
        next.delete(prevHash);
      }
      return next;
    }
    case "REORDER_TAG": {
      const actionTagHash = tagHashOf(action.tagName);
      const actionTag = state.get(actionTagHash);
      if (!actionTag) {
        return state;
      }
      const next = new Map(state);
      next.delete(actionTagHash);
      [...next.entries()].sort(
        (a, b) => "undefined" !== typeof a[1].index && "undefined" !== typeof b[1].index ? a[1].index - b[1].index : "undefined" === typeof a[1].index ? 1 : -1
      ).forEach(([tagId, tag], index) => {
        next.set(tagId, {
          ...tag,
          index: index < action.newIndex ? index : index + 1
        });
      });
      next.set(actionTagHash, { ...actionTag, index: action.newIndex });
      return next;
    }
    case "TAG_REFRESH": {
      const next = new Map(state);
      action.noteTags.forEach((noteIds, tagHash) => {
        if (!next.has(tagHash)) {
          next.set(tagHash, { name: tagNameOf(tagHash) });
        }
      });
      return next;
    }
    case "RESTORE_NOTE_REVISION": {
      const next = new Map(state);
      action.note.tags.forEach((tagName) => {
        const tagHash = tagHashOf(tagName);
        if (!next.has(tagHash)) {
          next.set(tagHash, { name: tagName });
        }
      });
      return next;
    }
    case "TRASH_TAG": {
      const next = new Map(state);
      return next.delete(tagHashOf(action.tagName)) ? next : state;
    }
    default:
      return state;
  }
};
var noteTags = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "ADD_COLLABORATOR":
    case "ADD_NOTE_TAG": {
      const tagHash = tagHashOf(
        action.type === "ADD_COLLABORATOR" ? action.collaboratorAccount : action.tagName
      );
      return new Map(state).set(
        tagHash,
        (state.get(tagHash) ?? /* @__PURE__ */ new Set()).add(action.noteId)
      );
    }
    case "EDIT_NOTE":
    case "IMPORT_NOTE_WITH_ID": {
      const newTags = "EDIT_NOTE" === action.type ? action.changes.tags : action.note.tags;
      if (!newTags?.length) {
        return state;
      }
      const { noteId } = action;
      const newHashes = new Set(newTags.map(tagHashOf));
      const next = new Map(state);
      next.forEach((notes2, tagHash) => {
        if (notes2.has(noteId) && !newHashes.has(tagHash)) {
          const nextNotes = new Set(notes2);
          nextNotes.delete(noteId);
          next.set(tagHash, nextNotes);
          return;
        }
        if (!notes2.has(noteId) && newHashes.has(tagHash)) {
          next.set(tagHash, new Set(notes2).add(noteId));
        }
      });
      return next;
    }
    case "TAG_REFRESH":
      return action.noteTags;
    case "REMOTE_TAG_DELETE":
    case "TAG_BUCKET_REMOVE": {
      const next = new Map(state);
      return next.delete(action.tagHash) ? next : state;
    }
    case "REMOVE_COLLABORATOR":
    case "REMOVE_NOTE_TAG": {
      const tagHash = tagHashOf(
        action.type === "REMOVE_COLLABORATOR" ? action.collaboratorAccount : action.tagName
      );
      const tagNotes = state.get(tagHash);
      if (!tagNotes) {
        return state;
      }
      const next = new Set(tagNotes);
      return next.delete(action.noteId) ? new Map(state).set(tagHash, next) : state;
    }
    case "TRASH_TAG": {
      const next = new Map(state);
      return next.delete(tagHashOf(action.tagName)) ? next : state;
    }
    default:
      return state;
  }
};
var reducer_default = (0, import_redux.combineReducers)({
  accountVerification,
  analyticsAllowed,
  notes,
  noteRevisions,
  noteTags,
  preferences,
  tags
});

// vendor/simplenote/state/ui/reducer.ts
var import_redux2 = __toESM(require_redux(), 1);
var emptyList = [];
var editorSelection = (state = /* @__PURE__ */ new Map(), action) => {
  switch (action.type) {
    case "REMOTE_NOTE_UPDATE": {
      if (action.remoteInfo?.patch?.content?.o !== "d" || !state.has(action.noteId)) {
        return state;
      }
      const [_prevStart, _prevEnd, direction] = state.get(action.noteId);
      const patches = action.remoteInfo.patch.content.v.split("	");
      const original = action.remoteInfo.original.content;
      const prevStart = withCheckboxSyntax(
        withCheckboxCharacters(original).slice(0, _prevStart)
      ).length;
      const prevEnd = withCheckboxSyntax(
        withCheckboxCharacters(original).slice(0, _prevEnd)
      ).length;
      const [_nextStart, _nextEnd] = patches.reduce(
        (offsets, patch) => {
          const [start2, end, offset] = offsets;
          if (offset > start2 && offset > end) {
            return offsets;
          }
          const op = patch[0];
          const data = patch.slice(1);
          switch (op) {
            case "=":
              return [start2, end, offset + parseInt(data, 10)];
            case "-": {
              const delta = parseInt(data, 10);
              return [
                start2 > offset ? start2 - delta : start2,
                end > offset ? end - delta : end,
                offset
              ];
            }
            case "+": {
              const insertion = decodeURIComponent(data);
              const delta = insertion.length;
              return [
                start2 > offset ? start2 + delta : start2,
                end > offset ? end + delta : end,
                offset
              ];
            }
            default:
              return offsets;
          }
        },
        [prevStart, prevEnd, 0]
      );
      const nextStart = withCheckboxCharacters(
        action.note.content.slice(0, _nextStart)
      ).length;
      const nextEnd = withCheckboxCharacters(
        action.note.content.slice(0, _nextEnd)
      ).length;
      return new Map(state).set(action.noteId, [nextStart, nextEnd, direction]);
    }
    case "STORE_EDITOR_SELECTION":
      return new Map(state).set(action.noteId, [
        action.start,
        action.end,
        action.direction
      ]);
    default:
      return state;
  }
};
var alternateLoginEmail = (state = null, action) => {
  switch (action.type) {
    case "SHOW_ALTERNATE_LOGIN_PROMPT":
      return action.email ? atob(action.email) : null;
    case "HIDE_ALTERNATE_LOGIN_PROMPT":
      return null;
    default:
      return state;
  }
};
var collection = (state = { type: "all" }, action) => {
  switch (action.type) {
    case "CREATE_NOTE_WITH_ID": {
      if (state.type === "trash") {
        return { type: "all" };
      } else if (state.type === "tag") {
        return { type: "tag", tagName: state.tagName };
      }
      return state;
    }
    case "OPEN_TAG":
      return { type: "tag", tagName: action.tagName };
    case "RENAME_TAG": {
      if (state.type === "tag" && state.tagName === action.oldTagName) {
        return { type: "tag", tagName: action.newTagName };
      }
      return state;
    }
    case "SELECT_TRASH":
      return { type: "trash" };
    case "SHOW_ALL_NOTES":
      return { type: "all" };
    case "SHOW_UNTAGGED_NOTES":
      return { type: "untagged" };
    case "TRASH_TAG": {
      const openedTagIsGone = state.type === "tag" && tagHashOf(state.tagName) === tagHashOf(action.tagName);
      const lastTagDisappeared = state.type === "untagged" && action?.remainingTags === 0;
      return openedTagIsGone || lastTagDisappeared ? { type: "all" } : state;
    }
    default:
      return state;
  }
};
var dialogs = (state = [], action) => {
  switch (action.type) {
    case "CLOSE_DIALOG":
      return state.slice(0, -1);
    case "TRASH_TAG":
      return state.filter((dialog) => dialog.type !== "TRASH-TAG-CONFIRMATION");
    case "REMOTE_TAG_DELETE":
      return state.filter(
        (dialog) => !(dialog.type === "TRASH-TAG-CONFIRMATION" && tagHashOf(dialog.tagName) === action.tagHash)
      );
    case "SHOW_DIALOG": {
      const { type, name, ...data } = action;
      const newDialog = state.find((dialog) => dialog.type === name) ? state : [...state, { type: name, ...data }];
      return newDialog;
    }
    default:
      return state;
  }
};
var editMode = (state = true, action) => {
  switch (action.type) {
    case "TOGGLE_EDIT_MODE": {
      return !state;
    }
    case "CREATE_NOTE_WITH_ID":
      return true;
    default:
      return state;
  }
};
var editingTags = (state = false, action) => {
  switch (action.type) {
    case "TAG_EDITING_TOGGLE":
      return !state;
    case "OPEN_NOTE":
    case "SELECT_NOTE":
    case "OPEN_TAG":
    case "SELECT_TRASH":
    case "SHOW_ALL_NOTES":
    case "SHOW_UNTAGGED_NOTES":
    case "NAVIGATION_TOGGLE":
      return false;
    default:
      return state;
  }
};
var filteredNotes = (state = emptyList, action) => {
  if ("undefined" === typeof action.meta?.searchResults) {
    return state;
  }
  return action.meta.searchResults.noteIds;
};
var hasLoadedNotes = (state = false, action) => {
  switch (action.type) {
    case "FILTER_NOTES":
      return true;
    default:
      return state;
  }
};
var numberOfMatchesInNote = (state = null, action) => {
  switch (action.type) {
    case "STORE_NUMBER_OF_MATCHES_IN_NOTE":
      return action.matches;
    default:
      return state;
  }
};
var openedNote = (state = null, action) => {
  switch (action.type) {
    case "CLOSE_NOTE":
      return null;
    case "OPEN_NOTE":
      return action?.noteId ?? state;
    case "SELECT_NOTE":
      return action.noteId;
    default:
      return "undefined" !== typeof action.meta?.nextNoteToOpen ? action.meta.nextNoteToOpen : state;
  }
};
var openedRevision = (state = null, action) => {
  switch (action.type) {
    case "CLOSE_REVISION":
    case "RESTORE_NOTE_REVISION":
      return null;
    case "OPEN_REVISION":
      return [action.noteId, action.version];
    default:
      return state;
  }
};
var showAlternateLoginPrompt = (state = false, action) => {
  switch (action.type) {
    case "SHOW_ALTERNATE_LOGIN_PROMPT":
      return !state;
    case "HIDE_ALTERNATE_LOGIN_PROMPT":
      return false;
    default:
      return state;
  }
};
var showNoteList = (state = true, action) => {
  switch (action.type) {
    case "NOTE_LIST_TOGGLE":
      return !state;
    case "FOCUS_SEARCH_FIELD":
      return true;
    case "OPEN_NOTE":
      return false;
    default:
      return state;
  }
};
var unsyncedNoteIds = (state = emptyList, action) => "SET_UNSYNCED_NOTE_IDS" === action.type ? action.noteIds : state;
var searchQuery = (state = "", action) => {
  switch (action.type) {
    case "SEARCH":
      return action.searchQuery;
    default:
      return state;
  }
};
var selectedSearchMatchIndex = (state = null, action) => {
  switch (action.type) {
    case "STORE_SEARCH_SELECTION":
      return action.index;
    default:
      return state;
  }
};
var simperiumConnected = (state = false, action) => "SIMPERIUM_CONNECTION_STATUS_TOGGLE" === action.type ? action.simperiumConnected : state;
var showNoteActions = (state = false, action) => {
  switch (action.type) {
    case "NOTE_ACTIONS_TOGGLE":
      return !state;
    case "NAVIGATION_TOGGLE":
    case "NOTE_ACTIONS_CLOSE":
    case "NOTE_INFO_TOGGLE":
    case "REVISIONS_TOGGLE":
    case "SELECT_NOTE":
    case "SHOW_DIALOG":
    case "TRASH_NOTE":
      return false;
    default:
      return state;
  }
};
var showNoteInfo = (state = false, action) => {
  switch (action.type) {
    case "NOTE_INFO_TOGGLE":
      return !state;
    case "NAVIGATION_TOGGLE":
    case "NOTE_ACTIONS_TOGGLE":
    case "SELECT_NOTE":
      return false;
    default:
      return state;
  }
};
var showNavigation = (state = false, action) => {
  switch (action.type) {
    case "NAVIGATION_TOGGLE":
      return !state;
    case "OPEN_TAG":
    case "SELECT_TRASH":
    case "SHOW_ALL_NOTES":
    case "SHOW_UNTAGGED_NOTES":
      return false;
    case "SHOW_DIALOG":
      if (action.name === "SETTINGS") {
        return false;
      }
      return state;
    default:
      return state;
  }
};
var showRevisions = (state = false, action) => {
  switch (action.type) {
    case "REVISIONS_TOGGLE":
      return !state;
    case "CLOSE_REVISION":
    case "NAVIGATION_TOGGLE":
    case "OPEN_NOTE":
    case "SELECT_NOTE":
    case "CREATE_NOTE_WITH_ID":
    case "RESTORE_NOTE_REVISION":
      return false;
    default:
      return state;
  }
};
var restoreDeletedTags = (state = true, action) => {
  switch (action.type) {
    case "TOGGLE_RESTORING_DELETED_TAGS":
      return !state;
    case "REVISIONS_TOGGLE":
      return true;
    default:
      return state;
  }
};
var tagSuggestions = (state = emptyList, action) => {
  if ("undefined" === typeof action.meta?.searchResults) {
    return state;
  }
  return action.meta.searchResults.tagHashes;
};
var reducer_default2 = (0, import_redux2.combineReducers)({
  collection,
  alternateLoginEmail,
  dialogs,
  editMode,
  editorSelection,
  editingTags,
  filteredNotes,
  hasLoadedNotes,
  numberOfMatchesInNote,
  openedNote,
  openedRevision,
  restoreDeletedTags,
  searchQuery,
  selectedSearchMatchIndex,
  showAlternateLoginPrompt,
  showNavigation,
  showNoteActions,
  showNoteInfo,
  showNoteList,
  showRevisions,
  simperiumConnected,
  tagSuggestions,
  unsyncedNoteIds
});

// vendor/simplenote/state/settings/reducer.ts
var import_redux3 = __toESM(require_redux(), 1);
var accountName = (state = null, action) => {
  switch (action.type) {
    case "setAccountName":
      return action.accountName;
    default:
      return state;
  }
};
var autoHideMenuBar = (state = false, action) => {
  switch (action.type) {
    case "setAutoHideMenuBar":
      return action.autoHideMenuBar;
    case "TOGGLE_AUTO_HIDE_MENU_BAR":
      return !state;
    default:
      return state;
  }
};
var focusModeEnabled = (state = false, action) => {
  switch (action.type) {
    case "setFocusMode":
      return action.focusModeEnabled;
    case "TOGGLE_FOCUS_MODE":
      return !state;
    default:
      return state;
  }
};
var keyboardShortcuts = (state = true, action) => {
  switch (action.type) {
    case "KEYBOARD_SHORTCUTS_TOGGLE":
      return !state;
    default:
      return state;
  }
};
var lineLength = (state = "narrow", action) => {
  switch (action.type) {
    case "setLineLength":
      return action.lineLength;
    default:
      return state;
  }
};
var markdownEnabled = (state = false, action) => {
  switch (action.type) {
    case "SET_SYSTEM_TAG":
      if ("markdown" === action.tagName) {
        return action.shouldHaveTag;
      }
      return state;
    default:
      return state;
  }
};
var noteDisplay = (state = "comfy", action) => {
  switch (action.type) {
    case "setNoteDisplay":
      return action.noteDisplay;
    default:
      return state;
  }
};
var sendNotifications = (state = window.Notification?.permission === "granted", action) => {
  switch (action.type) {
    case "REQUEST_NOTIFICATIONS":
      return action.sendNotifications ? window.Notification?.permission === "granted" : false;
    default:
      return state && window.Notification?.permission === "granted";
  }
};
var sortReversed = (state = false, action) => {
  switch (action.type) {
    case "setSortReversed":
      return action.sortReversed;
    case "setSortType":
      return typeof action.sortReversed !== "undefined" ? action.sortReversed : state;
    case "TOGGLE_SORT_ORDER":
      return !state;
    default:
      return state;
  }
};
var sortTagsAlpha = (state = false, action) => {
  switch (action.type) {
    case "setSortTagsAlpha":
      return action.sortTagsAlpha;
    case "TOGGLE_SORT_TAGS_ALPHA":
      return !state;
    default:
      return state;
  }
};
var sortType = (state = "modificationDate", action) => {
  switch (action.type) {
    case "setSortType":
      return action.sortType;
    default:
      return state;
  }
};
var spellCheckEnabled = (state = true, action) => {
  switch (action.type) {
    case "setSpellCheck":
      return action.spellCheckEnabled;
    case "TOGGLE_SPELLCHECK":
      return !state;
    default:
      return state;
  }
};
var theme = (state = "system", action) => {
  switch (action.type) {
    case "setTheme":
      return action.theme;
    default:
      return state;
  }
};
var reducer_default3 = (0, import_redux3.combineReducers)({
  accountName,
  autoHideMenuBar,
  focusModeEnabled,
  keyboardShortcuts,
  lineLength,
  markdownEnabled,
  noteDisplay,
  sendNotifications,
  sortReversed,
  sortTagsAlpha,
  sortType,
  spellCheckEnabled,
  theme
});

// src/core/simperium-reducer.ts
var initialState = {
  connected: false,
  syncing: false,
  connectionStatus: "red",
  tracking: false,
  pendingNotes: {},
  ghosts: [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map()]
};
function pendingCount(state) {
  return Object.keys(state.pendingNotes).length;
}
var LOCAL_NOTE_ACTIONS = /* @__PURE__ */ new Set([
  "CREATE_NOTE_WITH_ID",
  "EDIT_NOTE",
  "IMPORT_NOTE_WITH_ID",
  "ADD_NOTE_TAG",
  "REMOVE_NOTE_TAG",
  "MARKDOWN_NOTE",
  "PIN_NOTE",
  "PUBLISH_NOTE",
  "RESTORE_NOTE",
  "TRASH_NOTE",
  "RESTORE_NOTE_REVISION"
]);
var REMOVE_NOTE_ACTIONS = /* @__PURE__ */ new Set([
  "DELETE_NOTE_FOREVER",
  "REMOTE_NOTE_DELETE_FOREVER"
]);
function simperiumReducer(state = initialState, action) {
  switch (action.type) {
    case "CHANGE_CONNECTION_STATUS": {
      if (state.connectionStatus === action.status) {
        return state;
      }
      return { ...state, connected: action.status === "green", connectionStatus: action.status };
    }
    case "SUBMIT_PENDING_CHANGE": {
      if (!state.tracking) {
        return state;
      }
      const entityId = action.entityId;
      if (!(entityId in state.pendingNotes)) {
        return state;
      }
      return { ...state, pendingNotes: { ...state.pendingNotes, [entityId]: "sent" } };
    }
    case "ACKNOWLEDGE_PENDING_CHANGE": {
      if (!state.tracking) {
        return state;
      }
      const entityId = action.entityId;
      if (state.pendingNotes[entityId] !== "sent") {
        return state;
      }
      const rest = {};
      for (const key of Object.keys(state.pendingNotes)) {
        if (key !== entityId) {
          rest[key] = state.pendingNotes[key];
        }
      }
      return { ...state, pendingNotes: rest };
    }
    case "GHOST_SET_CHANGE_VERSION": {
      const { bucketName, version } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1])
      ];
      newGhosts[0].set(bucketName, version);
      return { ...state, ghosts: newGhosts };
    }
    case "GHOST_SET_ENTITY": {
      const { bucketName, entityId, ghost } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1])
      ];
      let bucket = newGhosts[1].get(bucketName);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Map();
        newGhosts[1].set(bucketName, bucket);
      }
      bucket.set(entityId, ghost);
      return { ...state, ghosts: newGhosts };
    }
    case "GHOST_REMOVE_ENTITY": {
      const { bucketName, entityId } = action;
      const newGhosts = [
        new Map(state.ghosts[0]),
        new Map(state.ghosts[1])
      ];
      const bucket = newGhosts[1].get(bucketName);
      if (bucket) {
        bucket.delete(entityId);
      }
      return { ...state, ghosts: newGhosts };
    }
    default: {
      if (state.tracking && "noteId" in action) {
        const noteId = action.noteId;
        if (LOCAL_NOTE_ACTIONS.has(action.type)) {
          return { ...state, pendingNotes: { ...state.pendingNotes, [noteId]: "dirty" } };
        }
        if (REMOVE_NOTE_ACTIONS.has(action.type)) {
          if (!(noteId in state.pendingNotes)) {
            return state;
          }
          const rest = {};
          for (const key of Object.keys(state.pendingNotes)) {
            if (key !== noteId) {
              rest[key] = state.pendingNotes[key];
            }
          }
          return { ...state, pendingNotes: rest };
        }
      }
      return state;
    }
  }
}

// vendor/simplenote/state/simperium/middleware.ts
var import_debug2 = __toESM(require_src(), 1);

// vendor/simplenote/state/analytics/actions.ts
var actions_exports2 = {};
__export(actions_exports2, {
  logAnalyticsEvent: () => logAnalyticsEvent
});
var logAnalyticsEvent = () => {
};

// vendor/simplenote/state/electron/actions.ts
var actions_exports3 = {};
__export(actions_exports3, {
  handleElectronActions: () => handleElectronActions
});
var handleElectronActions = () => {
};

// vendor/simplenote/state/settings/actions.ts
var actions_exports4 = {};
__export(actions_exports4, {
  activateTheme: () => activateTheme,
  setAccountName: () => setAccountName,
  setLineLength: () => setLineLength,
  setNoteDisplay: () => setNoteDisplay,
  setSortType: () => setSortType,
  toggleAutoHideMenuBar: () => toggleAutoHideMenuBar,
  toggleFocusMode: () => toggleFocusMode,
  toggleKeyboardShortcuts: () => toggleKeyboardShortcuts,
  toggleSortOrder: () => toggleSortOrder,
  toggleSortTagsAlpha: () => toggleSortTagsAlpha,
  toggleSpellCheck: () => toggleSpellCheck
});
var activateTheme = (theme3) => ({
  type: "setTheme",
  theme: theme3
});
var setNoteDisplay = (noteDisplay2) => ({
  type: "setNoteDisplay",
  noteDisplay: noteDisplay2
});
var setLineLength = (lineLength2) => ({
  type: "setLineLength",
  lineLength: lineLength2
});
var toggleKeyboardShortcuts = () => ({
  type: "KEYBOARD_SHORTCUTS_TOGGLE"
});
var toggleSortOrder = () => ({
  type: "TOGGLE_SORT_ORDER"
});
var setSortType = (sortType2, sortReversed2) => ({
  type: "setSortType",
  sortType: sortType2,
  sortReversed: sortReversed2
});
var toggleSortTagsAlpha = () => ({
  type: "TOGGLE_SORT_TAGS_ALPHA"
});
var setAccountName = (accountName2) => ({
  type: "setAccountName",
  accountName: accountName2
});
var toggleFocusMode = () => ({
  type: "TOGGLE_FOCUS_MODE"
});
var toggleSpellCheck = () => ({
  type: "TOGGLE_SPELLCHECK"
});
var toggleAutoHideMenuBar = () => ({
  type: "TOGGLE_AUTO_HIDE_MENU_BAR"
});

// vendor/simplenote/state/simperium/actions.ts
var actions_exports5 = {};
__export(actions_exports5, {
  handleSimperiumActions: () => handleSimperiumActions
});
var handleSimperiumActions = () => {
};

// vendor/simplenote/state/ui/actions.ts
var actions_exports6 = {};
__export(actions_exports6, {
  closeDialog: () => closeDialog,
  closeNote: () => closeNote,
  closeNoteActions: () => closeNoteActions,
  closeWindow: () => closeWindow,
  createNote: () => createNote2,
  deleteOpenNoteForever: () => deleteOpenNoteForever,
  dismissEmailVerifyDialog: () => dismissEmailVerifyDialog,
  emptyTrash: () => emptyTrash,
  filterNotes: () => filterNotes,
  focusSearchField: () => focusSearchField,
  hideAlternateLoginPrompt: () => hideAlternateLoginPrompt,
  logout: () => logout,
  openNote: () => openNote,
  openTag: () => openTag,
  reallyLogOut: () => reallyLogOut,
  restoreOpenNote: () => restoreOpenNote,
  search: () => search,
  selectNote: () => selectNote,
  selectNoteAbove: () => selectNoteAbove,
  selectNoteBelow: () => selectNoteBelow,
  selectTrash: () => selectTrash,
  showAllNotes: () => showAllNotes,
  showAlternateLoginPrompt: () => showAlternateLoginPrompt2,
  showDialog: () => showDialog,
  showUntaggedNotes: () => showUntaggedNotes,
  storeRevisions: () => storeRevisions,
  toggleEditMode: () => toggleEditMode,
  toggleNavigation: () => toggleNavigation,
  toggleNoteActions: () => toggleNoteActions,
  toggleNoteInfo: () => toggleNoteInfo,
  toggleNoteList: () => toggleNoteList,
  toggleRestoringDeletedTags: () => toggleRestoringDeletedTags,
  toggleRevisions: () => toggleRevisions,
  toggleTagDrawer: () => toggleTagDrawer,
  toggleTagEditing: () => toggleTagEditing,
  trashOpenNote: () => trashOpenNote
});
var closeDialog = () => ({
  type: "CLOSE_DIALOG"
});
var closeNote = () => ({
  type: "CLOSE_NOTE"
});
var closeNoteActions = () => ({
  type: "NOTE_ACTIONS_CLOSE"
});
var closeWindow = () => ({
  type: "CLOSE_WINDOW"
});
var createNote2 = (note) => ({
  type: "CREATE_NOTE",
  note
});
var dismissEmailVerifyDialog = () => ({
  type: "UPDATE_ACCOUNT_VERIFICATION",
  state: "dismissed"
});
var deleteOpenNoteForever = () => ({
  type: "DELETE_OPEN_NOTE_FOREVER"
});
var emptyTrash = () => ({
  type: "EMPTY_TRASH"
});
var filterNotes = (noteIds, tagHashes) => ({
  type: "FILTER_NOTES",
  noteIds,
  tagHashes
});
var focusSearchField = () => ({
  type: "FOCUS_SEARCH_FIELD"
});
var logout = () => ({
  type: "LOGOUT"
});
var openNote = (noteId) => ({
  type: "OPEN_NOTE",
  noteId
});
var openTag = (tagName) => ({
  type: "OPEN_TAG",
  tagName
});
var reallyLogOut = () => ({
  type: "REALLY_LOG_OUT"
});
var restoreOpenNote = () => ({
  type: "RESTORE_OPEN_NOTE"
});
var selectNoteAbove = () => ({
  type: "SELECT_NOTE_ABOVE"
});
var selectNoteBelow = () => ({
  type: "SELECT_NOTE_BELOW"
});
var selectTrash = () => ({
  type: "SELECT_TRASH"
});
var showAllNotes = () => ({
  type: "SHOW_ALL_NOTES"
});
var showUntaggedNotes = () => ({
  type: "SHOW_UNTAGGED_NOTES"
});
var showDialog = (name, data = {}) => ({
  type: "SHOW_DIALOG",
  name,
  ...data
});
var showAlternateLoginPrompt2 = (email) => ({
  type: "SHOW_ALTERNATE_LOGIN_PROMPT",
  email
});
var hideAlternateLoginPrompt = (email) => ({
  type: "HIDE_ALTERNATE_LOGIN_PROMPT",
  email
});
var storeRevisions = (noteId, revisions) => ({
  type: "STORE_REVISIONS",
  noteId,
  revisions
});
var toggleRevisions = () => ({
  type: "REVISIONS_TOGGLE"
});
var toggleRestoringDeletedTags = () => ({
  type: "TOGGLE_RESTORING_DELETED_TAGS"
});
var search = (searchQuery2) => ({
  type: "SEARCH",
  searchQuery: searchQuery2
});
var selectNote = (noteId) => ({ type: "SELECT_NOTE", noteId });
var toggleEditMode = () => ({
  type: "TOGGLE_EDIT_MODE"
});
var toggleNavigation = () => ({
  type: "NAVIGATION_TOGGLE"
});
var toggleNoteList = () => ({
  type: "NOTE_LIST_TOGGLE"
});
var toggleNoteActions = () => ({
  type: "NOTE_ACTIONS_TOGGLE"
});
var toggleNoteInfo = () => ({
  type: "NOTE_INFO_TOGGLE"
});
var toggleTagDrawer = (show) => ({
  type: "TAG_DRAWER_TOGGLE",
  show
});
var toggleTagEditing = () => ({
  type: "TAG_EDITING_TOGGLE"
});
var trashOpenNote = () => ({
  type: "TRASH_OPEN_NOTE"
});

// vendor/simplenote/state/actions.ts
var actions_default = {
  analytics: actions_exports2,
  data: actions_exports,
  electron: actions_exports3,
  simperium: actions_exports5,
  settings: actions_exports4,
  ui: actions_exports6
};

// vendor/simplenote/state/simperium/functions/bucket-queue.ts
var import_debug = __toESM(require_src(), 1);
var BucketQueue = class {
  log;
  bucket;
  queue;
  runTimer = null;
  constructor(bucket) {
    this.bucket = bucket;
    this.log = (0, import_debug.default)(`bucket-queue:${bucket.name}`);
    this.queue = /* @__PURE__ */ new Map();
    bucket.on("index", () => this.schedule());
    window.addEventListener("online", () => this.schedule());
  }
  add(entityId, deadline) {
    const existingDeadline = this.queue.get(entityId) ?? Infinity;
    const nextDeadline = Math.min(deadline, existingDeadline);
    this.log(`added "${entityId}" with deadline ${new Date(nextDeadline)}`);
    this.queue.set(entityId, nextDeadline);
    this.schedule();
  }
  has(entityId) {
    return this.queue.has(entityId);
  }
  run() {
    this.runTimer = null;
    this.process();
    this.schedule();
  }
  nextDeadline() {
    let next = Infinity;
    for (const deadline of this.queue.values()) {
      next = Math.min(next, deadline);
    }
    return next === Infinity ? null : next;
  }
  schedule() {
    if (this.runTimer) {
      clearTimeout(this.runTimer);
      this.runTimer = null;
    }
    const deadline = this.nextDeadline();
    if (deadline === null) {
      return;
    }
    this.runTimer = setTimeout(
      () => this.run(),
      this.bucket.isIndexing || !navigator.onLine ? 1e4 : Math.max(0, deadline - Date.now())
    );
  }
  process() {
    if (this.bucket.isIndexing) {
      this.log("skipping processing run because bucket is indexing");
      return;
    }
    if (!navigator.onLine) {
      this.log("skipping processing run because browser is offline");
      return;
    }
    const entityId = this.getNextNote();
    if (null === entityId) {
      return;
    }
    this.log(`telling bucket to sync ${entityId}`);
    this.queue.delete(entityId);
    this.bucket.touch(entityId).then(() => this.log(`sync'd ${entityId}`));
  }
  getNextNote() {
    const now = Date.now();
    for (const [entityId, deadline] of this.queue) {
      if (deadline <= now) {
        return entityId;
      }
    }
    return null;
  }
};

// vendor/simplenote/state/simperium/functions/in-memory-bucket.ts
var InMemoryBucket = class {
  entities;
  constructor() {
    this.entities = /* @__PURE__ */ new Map();
  }
  get(id, callback) {
    callback(null, { id, data: this.entities.get(id) });
  }
  find(query, callback) {
    callback(
      null,
      [...this.entities].map(([id, data]) => ({ id, data }))
    );
  }
  remove(id, callback) {
    this.entities.delete(id);
    callback(null);
  }
  // OMARCHY: Added for Simperium client compatibility - store.put is called during indexing
  put(id, version, data) {
    console.log("[TEST] InMemoryBucket.put: id=" + id + " version=" + version + " data=", data);
    this.entities.set(id, data);
    console.log("[TEST] InMemoryBucket.put: entities.size=" + this.entities.size);
    return Promise.resolve({ id, data, version });
  }
  update(id, data, isIndexing, callback) {
    this.entities.set(id, data);
    callback(null, { id, data, isIndexing });
  }
};

// vendor/simplenote/state/simperium/functions/in-memory-ghost.ts
var InMemoryGhost = class {
  cv;
  entities;
  constructor() {
    this.cv = "";
    this.entities = /* @__PURE__ */ new Map();
  }
  getChangeVersion() {
    return Promise.resolve(this.cv);
  }
  setChangeVersion(version) {
    this.cv = version;
    return Promise.resolve();
  }
  get(entityId) {
    return Promise.resolve(
      this.entities.get(entityId) ?? { key: entityId, data: {} }
    );
  }
  put(entityId, version, data) {
    const ghost = { key: entityId, data, version };
    this.entities.set(entityId, ghost);
    return Promise.resolve(ghost);
  }
  remove(entityId) {
    const ghost = this.entities.get(entityId);
    this.entities.delete(entityId);
    return Promise.resolve(ghost);
  }
  eachGhost(iterator) {
    this.entities.forEach((ghost) => iterator(ghost));
  }
};

// vendor/simplenote/state/simperium/functions/note-bucket.ts
var NoteBucket = class {
  store;
  constructor(store) {
    this.store = store;
  }
  get(noteId, callback) {
    const note = this.store.getState().data.notes.get(noteId);
    callback(null, { id: noteId, data: note });
  }
  find(query, callback) {
    callback(
      null,
      [...this.store.getState().data.notes.entries()].map(([noteId, note]) => ({
        id: noteId,
        data: note
      }))
    );
  }
  remove(noteId, callback) {
    this.store.dispatch({
      type: "NOTE_BUCKET_REMOVE",
      noteId
    });
    callback(null);
  }
  update(noteId, note, isIndexing, callback) {
    this.store.dispatch({
      type: "NOTE_BUCKET_UPDATE",
      noteId,
      note,
      isIndexing
    });
    callback(null, { id: noteId, data: note });
  }
};

// vendor/simplenote/state/simperium/functions/preferences-bucket.ts
var PreferencesBucket = class {
  store;
  constructor(store) {
    this.store = store;
  }
  get(id, callback) {
    const data = this.store.getState().data.preferences.get(id);
    callback(null, { id, data });
  }
  find(query, callback) {
    callback(
      null,
      [...this.store.getState().data.preferences.entries()].map(
        ([id, data]) => ({ id, data })
      )
    );
  }
  remove(id, callback) {
    this.store.dispatch({
      type: "PREFERENCES_BUCKET_REMOVE",
      id
    });
    callback(null);
  }
  update(id, data, isIndexing, callback) {
    this.store.dispatch({
      type: "PREFERENCES_BUCKET_UPDATE",
      id,
      data,
      isIndexing
    });
    callback(null, { id, data });
  }
};

// vendor/simplenote/state/simperium/functions/redux-ghost.ts
var ReduxGhost = class {
  bucketName;
  store;
  constructor(bucketName, store) {
    this.bucketName = bucketName;
    this.store = store;
  }
  getChangeVersion() {
    const cv = this.store.getState().simperium.ghosts[0].get(this.bucketName);
    return Promise.resolve(cv);
  }
  setChangeVersion(version) {
    this.store.dispatch({
      type: "GHOST_SET_CHANGE_VERSION",
      bucketName: this.bucketName,
      version
    });
    return Promise.resolve();
  }
  get(entityId) {
    const bucket = this.store.getState().simperium.ghosts[1].get(this.bucketName);
    const ghost = bucket?.get(entityId);
    return Promise.resolve(ghost ?? { key: entityId, data: {} });
  }
  put(entityId, version, data) {
    const ghost = { key: entityId, data, version };
    this.store.dispatch({
      type: "GHOST_SET_ENTITY",
      bucketName: this.bucketName,
      entityId,
      ghost
    });
    return Promise.resolve(ghost);
  }
  remove(entityId) {
    const bucket = this.store.getState().simperium.ghosts[1].get(this.bucketName);
    const ghost = bucket?.get(entityId);
    this.store.dispatch({
      type: "GHOST_REMOVE_ENTITY",
      bucketName: this.bucketName,
      entityId
    });
    return Promise.resolve(ghost);
  }
  eachGhost(iterator) {
    const bucket = this.store.getState().simperium.ghosts[1].get(this.bucketName) ?? /* @__PURE__ */ new Map();
    bucket.forEach((ghost) => iterator(ghost));
  }
};

// vendor/simplenote/state/simperium/functions/tag-bucket.ts
var TagBucket = class {
  store;
  constructor(store) {
    this.store = store;
  }
  get(tagId, callback) {
    const tag = this.store.getState().data.tags.get(tagId);
    callback(null, { id: tagId, data: tag });
  }
  find(query, callback) {
    callback(
      null,
      [...this.store.getState().data.tags.entries()].map(([tagHash, tag]) => ({
        id: tagHash,
        data: tag
      }))
    );
  }
  remove(tagId, callback) {
    this.store.dispatch({
      type: "TAG_BUCKET_REMOVE",
      tagHash: tagId
    });
    callback(null);
  }
  update(tagId, tag, isIndexing, callback) {
    this.store.dispatch({
      type: "TAG_BUCKET_UPDATE",
      tagHash: tagId,
      tag,
      isIndexing
    });
    callback(null, { id: tagId, data: tag });
  }
};

// vendor/simplenote/state/simperium/functions/unconfirmed-changes.ts
var getUnconfirmedNotes = (state) => {
  const notes2 = [];
  state.data.notes.forEach((note, noteId) => {
    const ghost = state.simperium.ghosts[1].get("note")?.get(noteId);
    const ghostData = ghost?.data;
    if (!ghost || !notesAreEqual(note, ghostData)) {
      notes2.push(noteId);
    }
  });
  return notes2;
};
var getUnconfirmedPreferences = (state) => {
  return [];
};
var getUnconfirmedTags = (state) => {
  return [];
};
var getUnconfirmedChanges = (state) => {
  return {
    notes: getUnconfirmedNotes(state),
    preferences: getUnconfirmedPreferences(state),
    tags: getUnconfirmedTags(state)
  };
};

// vendor/simplenote/state/simperium/functions/connection-monitor.ts
var start = (client, { dispatch, getState }) => {
  let lastMessageAt = -Infinity;
  client.on("message", () => {
    lastMessageAt = Date.now();
    if (getState().simperium.connectionStatus !== "green") {
      dispatch({ type: "CHANGE_CONNECTION_STATUS", status: "green" });
    }
  });
  setInterval(() => {
    const timeSinceLastMessage = Date.now() - lastMessageAt;
    const currentStatus = getState().simperium.connectionStatus;
    if (timeSinceLastMessage > 8e3 && currentStatus === "green") {
      dispatch({ type: "CHANGE_CONNECTION_STATUS", status: "red" });
    }
  }, 1e3);
  window.addEventListener("online", () => {
    if (getState().simperium.connectionStatus === "offline") {
      dispatch({ type: "CHANGE_CONNECTION_STATUS", status: "red" });
    }
  });
  window.addEventListener("offline", () => {
    dispatch({ type: "CHANGE_CONNECTION_STATUS", status: "offline" });
  });
  client.on("disconnect", () => {
    dispatch({
      type: "CHANGE_CONNECTION_STATUS",
      status: navigator.onLine ? "red" : "offline"
    });
  });
};

// vendor/simplenote/state/simperium/functions/tab-close-confirmation.ts
var confirmBeforeClosingTab = () => Promise.resolve(true);

// vendor/simplenote/state/simperium/functions/username-monitor.ts
var getAccountName = (client) => new Promise((resolve) => {
  const usernameMonitor = (message) => {
    if (!message.startsWith("0:auth:")) {
      return;
    }
    const [prefix, accountName2] = message.split("0:auth:");
    client.off("message", usernameMonitor);
    resolve(accountName2);
  };
  client.on("message", usernameMonitor);
});

// vendor/simplenote/utils/platform.ts
var isElectron = false;

// vendor/simplenote/state/persistence.ts
var stopSyncing = () => {
};

// vendor/simplenote/state/simperium/middleware.ts
var debug = (0, import_debug2.default)("simperium-middleware");
var initSimperium = (appId, logout3, token, username, clientOptions, ghostStoreProvider, noteEditDelayMs = 2e3) => (store) => {
  const { dispatch, getState } = store;
  const client = simperium_default(appId, token, {
    ...clientOptions,
    objectStoreProvider: (bucket) => {
      switch (bucket.name) {
        case "account":
          return new InMemoryBucket();
        case "note":
          return new NoteBucket(store);
        case "preferences":
          return new PreferencesBucket(store);
        case "tag":
          return new TagBucket(store);
      }
    },
    ghostStoreProvider: ghostStoreProvider ? ghostStoreProvider : (bucket) => {
      switch (bucket.name) {
        case "account":
          return new InMemoryGhost();
        default:
          return new ReduxGhost(bucket.name, store);
      }
    }
  });
  clientOptions?.onClient?.(client);
  client.on("unauthorized", () => logout3());
  getAccountName(client).then((accountName2) => {
    debug(`authenticated: ${accountName2}`);
    dispatch(actions_default.settings.setAccountName(accountName2));
  });
  start(client, store);
  if (!isElectron) {
    confirmBeforeClosingTab();
  }
  const noteBucket = client.bucket("note");
  noteBucket.channel.on(
    "update",
    (entityId, updatedEntity, original, patch, isIndexing) => {
      if (original && patch && "undefined" !== typeof isIndexing) {
        dispatch({
          type: "REMOTE_NOTE_UPDATE",
          noteId: entityId,
          note: updatedEntity,
          remoteInfo: {
            original,
            patch,
            isIndexing
          }
        });
      } else {
        dispatch({
          type: "REMOTE_NOTE_UPDATE",
          noteId: entityId,
          note: updatedEntity
        });
      }
    }
  );
  noteBucket.channel.on(
    "remove",
    (noteId) => dispatch({
      type: "REMOTE_NOTE_DELETE_FOREVER",
      noteId
    })
  );
  if ("Notification" in window) {
    import(
      /* webpackChunkName: 'change-announcer' */
      "./chunks/change-announcer-BLVXA55G.js"
    ).then(
      ({ announceNoteUpdates }) => noteBucket.channel.on("update", announceNoteUpdates())
    );
  }
  noteBucket.channel.localQueue.on("send", (change) => {
    dispatch({
      type: "SUBMIT_PENDING_CHANGE",
      entityId: change.id,
      ccid: change.ccid
    });
  });
  noteBucket.channel.on("acknowledge", (entityId, change) => {
    dispatch({
      type: "ACKNOWLEDGE_PENDING_CHANGE",
      entityId,
      ccid: change.ccid
    });
  });
  const tagBucket = client.bucket("tag");
  tagBucket.channel.on(
    "update",
    (entityId, updatedEntity, original, patch, isIndexing) => {
      if (original && patch && "undefined" !== typeof isIndexing) {
        dispatch({
          type: "REMOTE_TAG_UPDATE",
          tagHash: entityId,
          tag: updatedEntity,
          remoteInfo: {
            original,
            patch,
            isIndexing
          }
        });
      } else {
        dispatch({
          type: "REMOTE_TAG_UPDATE",
          tagHash: entityId,
          tag: updatedEntity
        });
      }
    }
  );
  tagBucket.channel.on(
    "remove",
    (tagId) => dispatch({
      type: "REMOTE_TAG_DELETE",
      tagHash: tagId
    })
  );
  const parseVerificationToken = (token2) => {
    try {
      const { username: username2, verified_at: verifiedAt } = JSON.parse(
        token2
      );
      return { username: username2, verifiedAt };
    } catch (e) {
      return null;
    }
  };
  const updateVerificationState = (entity) => {
    const { token: token2, sent_to } = entity;
    const parsedToken = parseVerificationToken(token2);
    const hasValidToken = parsedToken && parsedToken.username === username;
    const hasPendingEmail = sent_to === username;
    const state = hasValidToken ? "verified" : hasPendingEmail ? "pending" : "unverified";
    return dispatch({
      type: "UPDATE_ACCOUNT_VERIFICATION",
      state
    });
  };
  const accountBucket = client.bucket("account");
  accountBucket.on("update", (entityId, entity) => {
    if ("email-verification" === entityId) {
      updateVerificationState(entity);
    }
  });
  accountBucket.channel.on("ready", () => {
    if ("unknown" === getState().data.accountVerification) {
      dispatch({
        type: "UPDATE_ACCOUNT_VERIFICATION",
        state: "unverified"
      });
    }
  });
  const preferencesBucket = client.bucket("preferences");
  preferencesBucket.channel.on("update", (entityId, updatedEntity) => {
    if ("preferences-key" !== entityId) {
      return;
    }
    if (!!updatedEntity.analytics_enabled !== getState().data.analyticsAllowed) {
      dispatch({
        type: "REMOTE_ANALYTICS_UPDATE",
        allowAnalytics: !!updatedEntity.analytics_enabled
      });
    }
  });
  preferencesBucket.channel.once("ready", async () => {
    const preferences2 = await preferencesBucket.get("preferences-key");
    dispatch({
      type: "REMOTE_ANALYTICS_UPDATE",
      allowAnalytics: !!preferences2?.data?.analytics_enabled
    });
  });
  const noteQueue = new BucketQueue(noteBucket);
  const queueNoteUpdate = (noteId, delay = noteEditDelayMs) => noteQueue.add(noteId, Date.now() + delay);
  const hasRequestedRevisions = /* @__PURE__ */ new Set();
  const tagQueue = new BucketQueue(tagBucket);
  const queueTagUpdate = (tagHash, delay = 20) => tagQueue.add(tagHash, Date.now() + delay);
  const preferencesQueue = new BucketQueue(preferencesBucket);
  const queuePreferencesUpdate = (entityId, delay = 20) => preferencesQueue.add(entityId, Date.now() + delay);
  if (false) {
    window.account = accountBucket;
    window.noteBucket = noteBucket;
    window.tagBucket = tagBucket;
    window.noteQueue = noteQueue;
    window.tagQueue = tagQueue;
  }
  window.addEventListener("storage", (event) => {
    if (event.key === "simplenote_logout") {
      stopSyncing();
      client.end();
      logout3();
    }
  });
  return (next) => (action) => {
    const prevState = store.getState();
    const result = next(action);
    const nextState = store.getState();
    switch (action.type) {
      case "ADD_COLLABORATOR":
      case "ADD_NOTE_TAG": {
        const tagHash = tagHashOf(
          action.type === "ADD_COLLABORATOR" ? action.collaboratorAccount : action.tagName
        );
        if (!prevState.data.tags.has(tagHash)) {
          queueTagUpdate(tagHash);
        }
        queueNoteUpdate(action.noteId);
        return result;
      }
      case "REMOVE_COLLABORATOR":
      case "REMOVE_NOTE_TAG":
        queueNoteUpdate(action.noteId);
        return result;
      case "CREATE_NOTE_WITH_ID":
      case "INSERT_TASK_INTO_NOTE":
      case "EDIT_NOTE":
        queueNoteUpdate(action.noteId);
        return result;
      case "FILTER_NOTES":
      case "OPEN_NOTE":
      case "SELECT_NOTE": {
        const noteId = action.noteId ?? action.meta?.nextNoteToOpen ?? getState().ui.openedNote;
        if (noteId && !nextState.data.noteRevisions.get(noteId)?.size && !hasRequestedRevisions.has(noteId)) {
          hasRequestedRevisions.add(noteId);
          setTimeout(() => {
            if (getState().ui.openedNote === noteId) {
              noteBucket.getRevisions(noteId).then((revisions) => {
                dispatch({
                  type: "LOAD_REVISIONS",
                  noteId,
                  revisions: revisions.map(({ data, version }) => [
                    version,
                    data
                  ]).sort((a, b) => a[0] - b[0])
                });
              });
            }
          }, 250);
        }
        return result;
      }
      case "REVISIONS_TOGGLE": {
        const showRevisions2 = nextState.ui.showRevisions;
        const noteId = nextState.ui.openedNote;
        if (noteId && showRevisions2) {
          noteBucket.getRevisions(noteId).then((revisions) => {
            dispatch({
              type: "LOAD_REVISIONS",
              noteId,
              revisions: revisions.map(({ data, version }) => [version, data]).sort((a, b) => a[0] - b[0])
            });
          });
        }
        return result;
      }
      case "RESTORE_NOTE_REVISION": {
        action.note.tags.map(tagHashOf).forEach((tagHash) => {
          if (!prevState.data.tags.has(tagHash)) {
            queueTagUpdate(tagHash, 10);
          }
        });
        queueNoteUpdate(action.noteId, 10);
        return result;
      }
      // other note editing actions however
      // should trigger an immediate sync
      case "MARKDOWN_NOTE":
      case "PIN_NOTE":
      case "PUBLISH_NOTE":
      case "RESTORE_NOTE":
      case "TRASH_NOTE":
        queueNoteUpdate(action.noteId, 10);
        return result;
      case "IMPORT_NOTE_WITH_ID": {
        action.note.tags.forEach((tag) => {
          const tagHash = tagHashOf(tag);
          if (!prevState.data.tags.has(tagHash)) {
            queueTagUpdate(tagHash, 10);
          }
        });
        queueNoteUpdate(action.noteId, 10);
        return result;
      }
      case "DELETE_NOTE_FOREVER":
        setTimeout(() => noteBucket.remove(action.noteId), 10);
        return result;
      case "RENAME_TAG": {
        const oldHash = tagHashOf(action.oldTagName);
        const newHash = tagHashOf(action.newTagName);
        if (newHash !== oldHash) {
          setTimeout(() => tagBucket.remove(oldHash), 10);
        }
        nextState.data.notes.forEach((note, noteId) => {
          if (prevState.data.notes.get(noteId) !== note) {
            queueNoteUpdate(noteId);
          }
        });
        queueTagUpdate(newHash);
        return result;
      }
      case "REORDER_TAG":
        nextState.data.tags.forEach((tag, tagHash) => {
          queueTagUpdate(tagHash);
        });
        return result;
      case "SET_ANALYTICS":
        queuePreferencesUpdate("preferences-key");
        return result;
      case "TRASH_TAG": {
        tagBucket.remove(tagHashOf(action.tagName));
        nextState.data.notes.forEach((note, noteId) => {
          if (prevState.data.notes.get(noteId) !== note) {
            queueNoteUpdate(noteId);
          }
        });
        return result;
      }
      case "CLOSE_WINDOW": {
        const changes = getUnconfirmedChanges(nextState);
        changes.notes.forEach((noteId) => noteQueue.add(noteId, Date.now()));
        if (changes.notes.length > 0) {
          store.dispatch({
            type: "SHOW_DIALOG",
            name: "CLOSE-WINDOW-CONFIRMATION"
          });
          return result;
        }
        store.dispatch({
          type: "REALLY_CLOSE_WINDOW"
        });
        return result;
      }
      case "LOGOUT": {
        const changes = getUnconfirmedChanges(nextState);
        changes.notes.forEach((noteId) => noteQueue.add(noteId, Date.now()));
        if (changes.notes.length > 0) {
          store.dispatch({
            type: "SHOW_DIALOG",
            name: "LOGOUT-CONFIRMATION"
          });
          return result;
        }
        stopSyncing();
        localStorage.setItem("simplenote_logout", Math.random().toString());
        client.end();
        logout3();
        return result;
      }
      case "REALLY_LOG_OUT":
        stopSyncing();
        localStorage.setItem("simplenote_logout", Math.random().toString());
        client.end();
        logout3();
        return result;
    }
    return result;
  };
};

// src/core/simperium-version-fix.ts
var UNDEFINED_REQUEST = /^e:(.+)\.undefined$/;
function installSimperiumVersionFix(client) {
  const withBuckets = client ?? { buckets: [] };
  for (const bucket of withBuckets.buckets ?? []) {
    const channel = bucket?.channel;
    if (!channel || typeof channel.send !== "function") {
      continue;
    }
    if (channel.send.__versionFix) {
      continue;
    }
    const originalSend = channel.send.bind(channel);
    const wrappedSend = function(data) {
      const match = typeof data === "string" ? data.match(UNDEFINED_REQUEST) : null;
      if (match && typeof channel.emit === "function") {
        const id = match[1];
        setTimeout(() => {
          channel.emit(`version.${id}.undefined`, {});
        }, 0);
        return void 0;
      }
      return originalSend(data);
    };
    wrappedSend.__versionFix = true;
    channel.send = wrappedSend;
  }
}

// src/core/simperium-reconnect-fix.ts
var openNetworkQueues = /* @__PURE__ */ new WeakMap();
function guardUntilIdle(obj, key, countOpen, beforeCall, capture) {
  const original = obj[key];
  if (typeof original !== "function" || original.__reconnectFix) {
    return;
  }
  const callOriginal = original.bind(obj);
  const wrapped = function(...args) {
    const captured = capture?.();
    const retry = () => {
      if (countOpen() === 0) {
        beforeCall?.(captured);
        callOriginal(...args);
      } else {
        setTimeout(retry, 10);
      }
    };
    setTimeout(retry, 10);
    return void 0;
  };
  wrapped.__reconnectFix = true;
  obj[key] = wrapped;
}
function installOnChannel(channel) {
  const networkQueue = channel?.networkQueue;
  const localQueue = channel?.localQueue;
  if (!networkQueue || !localQueue) {
    return;
  }
  const originalQueueFor = networkQueue.queueFor;
  if (typeof originalQueueFor !== "function" || originalQueueFor.__reconnectFix) {
    return;
  }
  const open = openNetworkQueues.get(networkQueue) ?? /* @__PURE__ */ new Set();
  openNetworkQueues.set(networkQueue, open);
  const countOpen = () => open.size;
  const drainedSinceLastPurge = /* @__PURE__ */ new Set();
  const wrappedQueueFor = function(id) {
    const queue = originalQueueFor.call(this, id);
    if (!open.has(id)) {
      open.add(id);
      queue.on("finish", () => {
        open.delete(id);
        drainedSinceLastPurge.add(id);
      });
    }
    return queue;
  };
  wrappedQueueFor.__reconnectFix = true;
  networkQueue.queueFor = wrappedQueueFor;
  const purgeStaleSent = (sentAtInvocation) => {
    const sent = localQueue.sent;
    if (!sent) {
      return;
    }
    for (const id of drainedSinceLastPurge) {
      if (id in sent && sent[id] === sentAtInvocation?.get(id)) {
        delete sent[id];
        localQueue.processQueue(id);
      }
    }
    drainedSinceLastPurge.clear();
  };
  guardUntilIdle(localQueue, "start", countOpen);
  guardUntilIdle(
    localQueue,
    "resendSentChanges",
    countOpen,
    purgeStaleSent,
    () => (
      // 'ready' is emitted synchronously in `onChanges` (channel.js:702-714)
      // before any queued change has run, so this synchronous snapshot holds
      // only entries from before this catch-up.
      new Map(Object.entries(localQueue.sent ?? {}))
    )
  );
}
function installSimperiumReconnectFix(client) {
  const withBuckets = client ?? {};
  for (const bucket of withBuckets.buckets ?? []) {
    installOnChannel(bucket?.channel);
  }
}
function whenCatchUpApplied(client, bucketName) {
  const buckets = (client ?? {}).buckets ?? [];
  const channel = buckets.find((b) => b?.name === bucketName)?.channel;
  if (!channel || typeof channel.once !== "function") {
    return Promise.resolve();
  }
  const FALLBACK_MS = 4e3;
  const clientEmitter = client ?? {};
  return new Promise((resolve) => {
    let settled = false;
    let fallbackTimer;
    const clearFallback = () => {
      if (fallbackTimer !== void 0) {
        clearTimeout(fallbackTimer);
        fallbackTimer = void 0;
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearFallback();
      channel.message?.off?.("auth", onAuthMessage);
      clientEmitter.off?.("disconnect", onDisconnect);
      resolve();
    };
    const onAuthMessage = (data) => {
      let isErrorReply = true;
      try {
        JSON.parse(data);
      } catch {
        isErrorReply = false;
      }
      if (isErrorReply) return;
      clearFallback();
      fallbackTimer = setTimeout(finish, FALLBACK_MS);
    };
    const onDisconnect = () => {
      clearFallback();
    };
    channel.message?.on("auth", onAuthMessage);
    clientEmitter.on?.("disconnect", onDisconnect);
    channel.once?.("ready", () => {
      const check = () => {
        if (settled) return;
        const open = channel.networkQueue ? openNetworkQueues.get(channel.networkQueue) : void 0;
        if (!open || open.size === 0) finish();
        else setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });
  });
}

// src/core/simperium-stale-delete-fix.ts
var installed = /* @__PURE__ */ new WeakSet();
function installOnChannel2(channel, store) {
  if (!channel || typeof channel.on !== "function") {
    return;
  }
  if (installed.has(channel)) {
    return;
  }
  installed.add(channel);
  const seenDuringIndex = /* @__PURE__ */ new Set();
  const reconcile = (queuePaused) => {
    if (!queuePaused) {
      return;
    }
    const { notes: notes2 } = store.getState().data;
    const { pendingNotes } = store.getState().simperium;
    for (const id of notes2.keys()) {
      if (seenDuringIndex.has(id) || id in pendingNotes) {
        continue;
      }
      store.dispatch({
        type: "REMOTE_NOTE_DELETE_FOREVER",
        noteId: id
      });
    }
  };
  channel.on("indexingStateChange", (isIndexing) => {
    if (isIndexing) {
      seenDuringIndex.clear();
    }
  });
  channel.on("update", (id, _data, _original, _patch, isIndexing) => {
    if (isIndexing && typeof id === "string") {
      seenDuringIndex.add(id);
    }
  });
  channel.on("index", () => {
    reconcile(channel.isIndexing === false);
  });
}
function installSimperiumStaleDeleteFix(client, store) {
  const withBuckets = client ?? {};
  for (const bucket of withBuckets.buckets ?? []) {
    if (bucket?.name === "note") {
      installOnChannel2(bucket.channel, store);
    }
  }
}

// src/core/simperium-removed-note-fix.ts
var installed2 = /* @__PURE__ */ new WeakSet();
function installOnChannel3(channel) {
  if (!channel || typeof channel.on !== "function" || typeof channel.emit !== "function") {
    return;
  }
  if (installed2.has(channel)) {
    return;
  }
  installed2.add(channel);
  const removed = /* @__PURE__ */ new Set();
  channel.on("remove", (id) => {
    if (typeof id === "string") {
      removed.add(id);
    }
  });
  const originalEmit = channel.emit.bind(channel);
  channel.emit = (event, ...args) => {
    if (typeof event === "string" && event.startsWith("version.")) {
      const id = event.slice("version.".length).split(".")[0];
      if (removed.has(id)) {
        return false;
      }
    }
    return originalEmit(event, ...args);
  };
}
function installSimperiumRemovedNoteFix(client) {
  const withBuckets = client ?? {};
  for (const bucket of withBuckets.buckets ?? []) {
    if (bucket?.name === "note") {
      installOnChannel3(bucket.channel);
    }
  }
}

// src/core/simperium-auth-watchdog.ts
var installed3 = /* @__PURE__ */ new WeakSet();
function installSimperiumAuthWatchdog(client, timeoutMs) {
  const c = client;
  if (!c || typeof c.on !== "function" || typeof c.disconnect !== "function") {
    return;
  }
  if (installed3.has(c)) {
    return;
  }
  installed3.add(c);
  const INIT = /^\d+:init:/;
  const AUTH = /^\d+:auth:/;
  let timer;
  let inits = 0;
  let auths = 0;
  const clear = () => {
    if (timer !== void 0) {
      clearTimeout(timer);
      timer = void 0;
    }
  };
  const arm = () => {
    clear();
    inits = 0;
    auths = 0;
    timer = setTimeout(() => {
      timer = void 0;
      if (auths >= inits) {
        return;
      }
      if (c.reconnect === false) {
        return;
      }
      c.disconnect();
    }, timeoutMs);
  };
  c.on("connect", arm);
  c.on("send", (data) => {
    if (typeof data === "string" && INIT.test(data)) {
      inits++;
    }
  });
  c.on("message", (data) => {
    if (typeof data === "string" && AUTH.test(data)) {
      auths++;
    }
  });
  c.on("disconnect", clear);
  c.on("close", clear);
}

// src/core/store.ts
var baseReducer = (0, import_redux4.combineReducers)({
  data: reducer_default,
  ui: reducer_default2,
  settings: reducer_default3,
  simperium: simperiumReducer,
  browser: (state = { windowWidth: 1024, windowHeight: 768, systemTheme: "light" }) => state
});
var rootReducer = (state, action) => {
  if (action.type === "TAG_BUCKET_UPDATE" || action.type === "REMOTE_TAG_UPDATE") {
    const tag = action.tag;
    if (!tag || typeof tag.name !== "string" || tag.name === "") {
      return state;
    }
  }
  return baseReducer(state, action);
};
function makeStore(opts = {}) {
  let middleware = (0, import_redux4.applyMiddleware)();
  let stopSync;
  let client;
  const armAuthWatchdog = (c) => {
    client = c;
    installSimperiumAuthWatchdog(c, opts.sync?.authWatchdogMs ?? 1e4);
  };
  if (opts.sync && !opts.stubClient) {
    const logoutCallback = opts.sync.onLogout ? opts.sync.onLogout : () => {
      if (stopSync) stopSync();
    };
    const syncMiddleware = initSimperium(
      opts.sync.appId,
      logoutCallback,
      opts.sync.token,
      opts.sync.username,
      // pass onClient so the middleware hands us the constructed client (T80)
      { ...opts.sync.clientOptions, onClient: (c) => {
        client = c;
        installSimperiumAuthWatchdog(c, opts.sync.authWatchdogMs ?? 1e4);
      } },
      opts.sync.ghostStoreProvider,
      opts.sync.noteEditDelayMs
    );
    middleware = (0, import_redux4.applyMiddleware)(syncMiddleware);
  }
  const preloadedBase = opts.preloadedState || {};
  const preloaded = opts.sync && !opts.stubClient && !preloadedBase.simperium ? { ...preloadedBase, simperium: { ...initialState, tracking: true } } : preloadedBase;
  const enhancedStore = (0, import_redux4.createStore)(rootReducer, preloaded, middleware);
  const store = enhancedStore;
  if (opts.sync && !opts.stubClient) {
    store.stopSync = () => {
      store.dispatch({ type: "LOGOUT" });
    };
    store.forceSync = () => {
      for (const bucket of client?.buckets ?? []) {
        const channel = bucket.channel;
        Promise.resolve().then(() => channel?.store?.getChangeVersion?.()).then((cv) => {
          if (cv) {
            try {
              channel?.sendChangeVersionRequest?.(cv);
            } catch {
            }
          }
        }).catch(() => {
        });
      }
      const noteBucket = (client?.buckets ?? []).find(
        (b) => b?.name === "note"
      );
      const pending = Object.keys(store.getState().simperium.pendingNotes);
      for (const id of pending) {
        try {
          Promise.resolve(noteBucket?.touch?.(id)).catch(() => {
          });
        } catch {
        }
      }
    };
    installSimperiumVersionFix(client);
    installSimperiumReconnectFix(client);
    installSimperiumStaleDeleteFix(client, store);
    installSimperiumRemovedNoteFix(client);
    store.client = client;
  }
  return store;
}

// src/core/persistence.ts
import * as fs2 from "node:fs";
import * as path from "node:path";
function reviver(_key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("__map" in value) {
      const entries = value.__map;
      const map = /* @__PURE__ */ new Map();
      for (const [k, v] of entries) {
        map.set(k, reviver("", v));
      }
      return map;
    }
    if ("__set" in value) {
      return new Set(value.__set);
    }
  }
  return value;
}
function replacer(_key, value) {
  if (value instanceof Map) {
    const entries = [];
    value.forEach((v, k) => {
      entries.push([String(k), v]);
    });
    return { __map: entries };
  }
  if (value instanceof Set) {
    return { __set: [...value] };
  }
  return value;
}
function saveState(state, dir) {
  const data = state.data;
  const toSave = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "noteRevisions") {
      continue;
    }
    toSave[key] = value;
  }
  const file = { version: 1, data: toSave };
  const filePath = path.join(dir, "state.json");
  const tmpPath = filePath + ".tmp";
  secureMkdir(dir);
  secureWriteFileSync(tmpPath, JSON.stringify(file, replacer));
  fs2.renameSync(tmpPath, filePath);
}
function loadState(dir) {
  const filePath = path.join(dir, "state.json");
  if (!fs2.existsSync(filePath)) {
    return void 0;
  }
  let raw;
  try {
    raw = fs2.readFileSync(filePath, "utf8");
  } catch {
    return void 0;
  }
  let file;
  try {
    file = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (file.version !== 1) {
    return void 0;
  }
  const revivedData = {};
  for (const [key, value] of Object.entries(file.data)) {
    revivedData[key] = reviver(key, value);
  }
  return { data: revivedData };
}
function persistOnChange(store, dir, delayMs = 500) {
  let timer = null;
  let lastState = null;
  const flush = () => {
    if (lastState) {
      saveState(lastState, dir);
      lastState = null;
    }
    timer = null;
  };
  const schedule = () => {
    const state = store.getState();
    if (lastState && lastState.data === state.data) {
      return;
    }
    lastState = state;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };
  const unsubscribe = store.subscribe(schedule);
  const unsubscribeAndFlush = () => {
    unsubscribe();
    flush();
  };
  return unsubscribeAndFlush;
}

// src/core/ghost-store.ts
import { readFileSync as readFileSync4, renameSync as renameSync2, existsSync as existsSync3 } from "node:fs";
import { join as join7 } from "node:path";
var COALESCE_WINDOW_MS = 100;
var FileGhostStore = class {
  dir;
  filePath;
  cv;
  ghosts;
  // coalescing state.
  lastWrite = 0;
  timer = null;
  _dirExists = false;
  // OMARCHY: boundary cast
  constructor(dir, bucketName) {
    this.dir = dir;
    this.filePath = join7(dir, `ghosts-${bucketName}.json`);
    this.cv = "";
    this.ghosts = /* @__PURE__ */ new Map();
    this._dirExists = existsSync3(this.filePath);
    if (existsSync3(this.filePath)) {
      try {
        const raw = readFileSync4(this.filePath, "utf8");
        const file = JSON.parse(raw);
        if (file.version !== 1) {
          return;
        }
        this.cv = file.cv ?? "";
        for (const entry of file.ghosts) {
          this.ghosts.set(entry.key, {
            key: entry.key,
            version: entry.version,
            data: entry.data
          });
        }
      } catch {
      }
    }
  }
  persist() {
    if (!existsSync3(this.dir)) {
      if (this._dirExists) {
        return;
      }
      secureMkdir(this.dir);
      this._dirExists = true;
    }
    const file = {
      version: 1,
      cv: this.cv,
      ghosts: Array.from(this.ghosts.values()).map((g) => ({
        key: g.key,
        version: g.version,
        data: g.data
      }))
    };
    const tmpPath = this.filePath + ".tmp";
    secureWriteFileSync(tmpPath, JSON.stringify(file));
    renameSync2(tmpPath, this.filePath);
    this._dirExists = true;
  }
  // write everything now, cancelling any delayed write.
  writeNow() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.persist();
    this.lastWrite = Date.now();
  }
  getChangeVersion() {
    return Promise.resolve(this.cv);
  }
  setChangeVersion(version) {
    this.cv = version;
    this.writeNow();
    return Promise.resolve();
  }
  get(entityId) {
    const ghost = this.ghosts.get(entityId);
    if (ghost) {
      return Promise.resolve(ghost);
    }
    return Promise.resolve({ key: entityId, version: 0, data: {} });
  }
  put(entityId, version, data) {
    const ghost = { key: entityId, version, data };
    this.ghosts.set(entityId, ghost);
    if (this.timer === null) {
      if (Date.now() - this.lastWrite >= COALESCE_WINDOW_MS) {
        this.writeNow();
      } else {
        this.timer = setTimeout(() => {
          this.timer = null;
          try {
            if (existsSync3(this.filePath)) {
              this.persist();
              this.lastWrite = Date.now();
            }
          } catch {
          }
        }, COALESCE_WINDOW_MS);
        this.timer.unref();
      }
    }
    return Promise.resolve(ghost);
  }
  remove(entityId) {
    const ghost = this.ghosts.get(entityId);
    this.ghosts.delete(entityId);
    this.writeNow();
    return Promise.resolve(ghost ?? { key: entityId, version: 0, data: {} });
  }
  eachGhost(iterator) {
    this.ghosts.forEach((ghost) => iterator(ghost));
  }
  flush() {
    this.writeNow();
    return Promise.resolve();
  }
};

// src/core/requeue.ts
async function unsyncedNoteIds2(notes2, ghosts) {
  const result = [];
  for (const [id, note] of notes2) {
    const g = (await ghosts.get(id)).data;
    if (!g || !g.modificationDate) {
      result.push(id);
      continue;
    }
    if (!notesAreEqual(note, g) && note.modificationDate > g.modificationDate) {
      result.push(id);
    }
  }
  return result;
}
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function lineCounts(text) {
  const counts = /* @__PURE__ */ new Map();
  for (const line of text.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}
function offlineEditIncluded(base, local, current) {
  const b = lineCounts(base);
  const l = lineCounts(local);
  const c = lineCounts(current);
  for (const line of /* @__PURE__ */ new Set([...b.keys(), ...l.keys()])) {
    const inBase = b.get(line) ?? 0;
    const inLocal = l.get(line) ?? 0;
    const inCurrent = c.get(line) ?? 0;
    if (inLocal > inBase && inCurrent < inLocal) return false;
    if (inLocal < inBase && inCurrent > inLocal) return false;
  }
  return true;
}
function rebaseOfflineEdit(base, local, current) {
  const merged = { ...current };
  for (const key of Object.keys(local)) {
    if (key === "content") continue;
    const k = key;
    if (!same(local[k], base[k])) merged[key] = local[k];
  }
  merged.content = mergeEditorReturn(
    String(base.content ?? ""),
    String(local.content ?? ""),
    String(current.content ?? "")
  ).content;
  merged.modificationDate = Math.max(Number(local.modificationDate) || 0, Date.now() / 1e3);
  return merged;
}
async function requeueUnsynced(store, ghosts, whenCaughtUp) {
  const ids = await unsyncedNoteIds2(store.getState().data.notes, ghosts);
  const held = [];
  for (const id of ids) {
    const note = store.getState().data.notes.get(id);
    if (!note) continue;
    const base = (await ghosts.get(id)).data;
    if (whenCaughtUp && base && base.modificationDate) {
      held.push({ id, base, local: note });
      continue;
    }
    store.dispatch({
      type: "IMPORT_NOTE_WITH_ID",
      noteId: id,
      note
    });
  }
  if (held.length > 0 && whenCaughtUp) {
    await whenCaughtUp();
    for (const { id, base, local: heldLocal } of held) {
      const current = (await ghosts.get(id)).data ?? base;
      const now = store.getState().data.notes.get(id);
      if (!now) continue;
      if (now.content !== heldLocal.content && now.content !== current.content) continue;
      if (heldLocal.content !== String(base.content ?? "") && offlineEditIncluded(String(base.content ?? ""), heldLocal.content, String(current.content ?? "")))
        continue;
      const note = rebaseOfflineEdit(base, heldLocal, current);
      if (same({ ...note, modificationDate: 0 }, { ...current, modificationDate: 0 })) continue;
      store.dispatch({
        type: "IMPORT_NOTE_WITH_ID",
        noteId: id,
        note
      });
    }
  }
  return ids;
}

// src/core/tombstones.ts
import * as fs3 from "node:fs";
import * as path2 from "node:path";
var TOMBSTONE_FILE = "tombstones.json";
function loadTombstones(dir) {
  const filePath = path2.join(dir, TOMBSTONE_FILE);
  if (!fs3.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs3.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    for (const item of parsed) {
      if (typeof item !== "string") {
        return [];
      }
    }
    return parsed;
  } catch {
    return [];
  }
}
function saveTombstones(dir, ids) {
  const filePath = path2.join(dir, TOMBSTONE_FILE);
  const tmpPath = filePath + ".tmp";
  secureMkdir(dir);
  secureWriteFileSync(tmpPath, JSON.stringify(ids));
  fs3.renameSync(tmpPath, filePath);
}
function addTombstone(dir, id) {
  const list = loadTombstones(dir);
  if (!list.includes(id)) {
    list.push(id);
  }
  saveTombstones(dir, list);
}
async function tombstonesToResend(ids, ghosts) {
  const result = [];
  for (const id of ids) {
    const info = await ghosts.get(id);
    if (info.version && info.version > 0) {
      result.push(id);
    }
  }
  return result;
}
async function resendDeletions(store, dir, ghosts) {
  const ids = loadTombstones(dir);
  if (ids.length === 0) {
    return [];
  }
  const keep = await tombstonesToResend(ids, ghosts);
  saveTombstones(dir, keep);
  for (const id of keep) {
    store.dispatch({ type: "DELETE_NOTE_FOREVER", noteId: id });
  }
  return keep;
}
function trackDeletions(store, dir) {
  const originalDispatch = store.dispatch;
  store.dispatch = ((action) => {
    if (action.type === "DELETE_NOTE_FOREVER") {
      addTombstone(dir, action.noteId);
    }
    return originalDispatch(action);
  });
}

// src/cli/args.ts
import { parseArgs } from "node:util";
function splitNewFlag(argv) {
  return {
    args: argv.filter((a) => a !== "--new"),
    startNew: argv.includes("--new")
  };
}
function parseCli(argv) {
  const result = parseArgs({
    args: argv,
    options: {
      check: { type: "boolean" },
      logout: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      "data-dir": { type: "string" },
      "app-id": { type: "string" },
      server: { type: "string" }
    }
  });
  const values = result.values;
  return {
    check: values.check ?? false,
    logout: values.logout ?? false,
    help: values.help ?? false,
    dataDir: values["data-dir"] ?? void 0,
    appId: values["app-id"] ?? void 0,
    server: values.server ?? void 0
  };
}
function checkReport(info) {
  return [
    `editor: ${info.editor}`,
    `data dir: ${info.dataDir}`,
    `terminal: ${info.columns}x${info.rows}`
  ].join("\n");
}
var USAGE = [
  "usage: snote [options]",
  "",
  "Options:",
  "  --check          Check configuration and exit",
  "  --logout         Logout current account",
  "  --help, -h       Show this help message",
  "  --version, -v    Print the snote version and exit",
  "  --data-dir <value>   Data directory path",
  "  --app-id <value>     Simperium app ID",
  "  --server <value>     Simperium server URL",
  "  --report        Write a bundle for your coding agent",
  "  --new            Open the editor for a new note at start"
].join("\n");

// src/core/status-file.ts
import * as fs4 from "node:fs";
import * as path3 from "node:path";
var MAX_TITLE_CHARS = 40;
function statusTitle(note) {
  let title = sanitizeForTerminal(note_utils_default(note).title);
  title = title.replace(/[\n\r\t]/g, " ").trim();
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS - 1) + "\u2026";
  }
  return title;
}
function buildStatus(state, synced) {
  const live = [];
  for (const [id, note] of state.data.notes) {
    if (!note.deleted) {
      live.push([id, note]);
    }
  }
  live.sort(([idA, a], [idB, b]) => {
    if (a.modificationDate !== b.modificationDate) {
      return b.modificationDate - a.modificationDate;
    }
    return idA.localeCompare(idB);
  });
  const lastEntry = live[0];
  return {
    version: 1,
    count: live.length,
    last: lastEntry ? {
      title: statusTitle(lastEntry[1]),
      modified: lastEntry[1].modificationDate
    } : null,
    synced
  };
}
function writeStatusFile(dir, status) {
  fs4.mkdirSync(dir, { recursive: true });
  const filePath = path3.join(dir, "status.json");
  const tmpPath = filePath + ".tmp";
  secureWriteFileSync(tmpPath, JSON.stringify(status) + "\n");
  fs4.renameSync(tmpPath, filePath);
}
function statusDir(env) {
  const override = env.SNOTE_STATUS_DIR;
  if (override) {
    return override;
  }
  const base = env.XDG_DATA_HOME || path3.join(env.HOME ?? "", ".local", "share");
  return path3.join(base, "omarchy-snote-plugin");
}
function removeStatusFile(dir) {
  for (const name of ["status.json", "status.json.tmp"]) {
    try {
      fs4.rmSync(path3.join(dir, name), { force: true });
    } catch {
    }
  }
}
function watchStatus(store, dir, opts) {
  const delayMs = opts?.delayMs ?? 1e3;
  const now = opts?.now ?? Date.now;
  let timer = null;
  let lastNotes = null;
  let lastSynced = false;
  let synced = null;
  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      writeStatusFile(dir, buildStatus(store.getState(), synced));
    } catch {
    }
  };
  const schedule = () => {
    const state = store.getState();
    const notesChanged = state.data.notes !== lastNotes;
    lastNotes = state.data.notes;
    const isSynced = state.simperium.connected && pendingCount(state.simperium) === 0;
    const justSynced = isSynced && !lastSynced;
    lastSynced = isSynced;
    if (justSynced) {
      synced = new Date(now()).toISOString();
    }
    if (!notesChanged && !justSynced) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };
  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    unsubscribe();
    if (timer !== null) {
      flush();
    }
  };
}

// package.json
var package_default = {
  name: "snote",
  version: "0.2.2",
  description: "Simplenote client for Omarchy: keyboard-driven TUI on the official Simperium sync engine",
  license: "GPL-2.0",
  type: "module",
  bin: {
    snote: "dist/cli.js"
  },
  engines: {
    node: ">=22"
  },
  scripts: {
    typecheck: "tsc --noEmit",
    lint: "eslint src test vendor",
    test: "vitest run",
    "test:keymap": "vitest run test/keymap.test.ts",
    "lint:ansi": "node scripts/lint-ansi.mjs",
    build: "node scripts/build.mjs",
    "build:plugin": "node scripts/build-plugin-dist.mjs",
    pack: "node scripts/pack.mjs",
    size: "vitest run test/packaging/size.test.ts",
    "smoke:real": "node scripts/smoke-real.mjs",
    dev: "tsx src/cli/index.ts"
  },
  dependencies: {
    debug: "^4.4.0",
    ink: "^7.1.1",
    lodash: "^4.17.21",
    react: "^19.0.0",
    "react-ink-textarea": "0.4.0",
    redux: "^4.2.1",
    "remove-markdown": "^0.6.0",
    simperium: "1.1.4"
  },
  devDependencies: {
    "@types/debug": "^4.1.12",
    "@types/lodash": "^4.17.13",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/ws": "^8.5.13",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/mocker": "4.1.11",
    esbuild: "0.28.2",
    eslint: "^9.0.0",
    "ink-testing-library": "^4.0.0",
    tsx: "^4.19.0",
    typescript: "^5.6.0",
    vitest: "4.1.11",
    ws: "^8.18.0"
  }
};

// src/cli/version.ts
var VERSION = package_default.version;

// src/core/token.ts
import * as fs5 from "node:fs";
import * as os from "node:os";
import * as path4 from "node:path";
function defaultDataDir() {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && xdg !== "") {
    return path4.join(xdg, "snote");
  }
  return path4.join(os.homedir(), ".local", "share", "snote");
}
async function saveToken(dir, { email, token, server }) {
  const filePath = path4.join(dir, "auth.json");
  secureMkdir(dir);
  const payload = server === void 0 ? { email, token } : { email, token, server };
  const data = JSON.stringify(payload);
  fs5.writeFileSync(filePath, data, { mode: 384 });
  fs5.chmodSync(filePath, 384);
}
async function loadToken(dir) {
  const filePath = path4.join(dir, "auth.json");
  let raw;
  try {
    raw = fs5.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || !("email" in parsed) || !("token" in parsed) || typeof parsed.email !== "string" || typeof parsed.token !== "string") {
    return null;
  }
  const server = parsed.server;
  return {
    email: parsed.email,
    token: parsed.token,
    ...typeof server === "string" ? { server } : {}
  };
}
async function logout2(dir) {
  fs5.rmSync(dir, { recursive: true, force: true });
  secureMkdir(dir);
}
function accountDir(root, email) {
  const name = email.trim().toLowerCase().replace(/[^a-z0-9 @._+\-]/g, "_");
  const safe = name === "" || name === "." || name === ".." ? "_" : name;
  return path4.join(root, safe);
}
var ROOT_ONLY_FILES = ["auth.json", "blog.json", "blog-sent.json"];
function migrateLegacyData(root, email) {
  if (!fs5.existsSync(root)) {
    return [];
  }
  const acctPath = accountDir(root, email);
  for (const name of ["blog.json", "blog-sent.json"]) {
    const from = path4.join(acctPath, name);
    const to = path4.join(root, name);
    if (fs5.existsSync(from) && !fs5.existsSync(to)) {
      fs5.renameSync(from, to);
    }
  }
  const entries = fs5.readdirSync(root, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile());
  const filesToMove = files.filter((e) => !ROOT_ONLY_FILES.includes(e.name));
  if (filesToMove.length === 0) {
    return [];
  }
  secureMkdir(acctPath);
  const moved = [];
  for (const entry of filesToMove) {
    const from = path4.join(root, entry.name);
    const to = path4.join(acctPath, entry.name);
    if (!fs5.existsSync(to)) {
      fs5.renameSync(from, to);
      moved.push(entry.name);
    }
  }
  return moved.sort();
}
async function prepareDataDir(root) {
  const saved = await loadToken(root);
  if (!saved) {
    return [];
  }
  return migrateLegacyData(root, saved.email);
}

// src/core/instance-lock.ts
import { closeSync, existsSync as existsSync6, openSync, readFileSync as readFileSync7, unlinkSync, writeSync } from "node:fs";
import { join as join11 } from "node:path";
var LOCK_FILE = "instance.lock";
var heldByProcess = /* @__PURE__ */ new Set();
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function readLockPid(lockPath) {
  try {
    return existsSync6(lockPath) ? readFileSync7(lockPath, "utf8").trim() : "";
  } catch {
    return "";
  }
}
function acquireInstanceLock(dir) {
  const lockPath = join11(dir, LOCK_FILE);
  const writeLock = () => {
    const fd = openSync(lockPath, "wx");
    try {
      writeSync(fd, String(process.pid));
    } finally {
      closeSync(fd);
    }
  };
  let acquired = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeLock();
      acquired = true;
      break;
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
      const fileOwner = Number.parseInt(readLockPid(lockPath), 10);
      const ownerAlive = heldByProcess.has(lockPath) || isPidAlive(fileOwner);
      if (ownerAlive) {
        const owner = heldByProcess.has(lockPath) ? String(process.pid) : String(fileOwner);
        throw new Error(
          `another snote is already using ${dir} (pid ${owner}) \u2014 it holds the instance lock`
        );
      }
      try {
        unlinkSync(lockPath);
      } catch {
      }
    }
  }
  if (!acquired) {
    const owner = readLockPid(lockPath);
    const alive = /^\d+$/.test(owner) && isPidAlive(Number(owner));
    throw new Error(
      `another snote is already using ${dir}${alive ? ` (pid ${owner})` : ""} \u2014 it holds the instance lock`
    );
  }
  heldByProcess.add(lockPath);
  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      heldByProcess.delete(lockPath);
      try {
        unlinkSync(lockPath);
      } catch {
      }
    }
  };
}

// src/core/config.ts
var APP_ID = process.env.SNOTE_APP_ID ?? "chalk-bump-f49";
var API_KEY = process.env.SNOTE_API_KEY ?? "c8c2b86337154cdabc989b23e30c6bf4";
var ACCOUNT_BASE = process.env.SNOTE_ACCOUNT_BASE ?? "https://app.simplenote.com";
var AUTH_BASE = process.env.SNOTE_AUTH_BASE ?? "https://auth.simperium.com";

// src/core/auth.ts
async function requestLoginCode(email, opts) {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/request-login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      request_source: "electron"
    })
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
}
async function completeLogin(email, code, opts) {
  const accountUrl = opts?.accountBase ?? ACCOUNT_BASE;
  const url = `${accountUrl}/account/complete-login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      auth_code: code.trim().toUpperCase()
    })
  });
  if (!res.ok) {
    let message = `completeLogin failed: ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody.message) message = String(errBody.message);
    } catch {
    }
    throw new Error(`${res.status} ${message}`);
  }
  const json = await res.json();
  return json.sync_token;
}
async function loginWithPassword(email, password, opts) {
  const authUrl = opts?.authBase ?? AUTH_BASE;
  const appId = opts?.appId ?? APP_ID;
  const apiKey = opts?.apiKey ?? API_KEY;
  const url = `${authUrl}/1/${appId}/authorize/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Simperium-API-Key": apiKey
    },
    body: JSON.stringify({
      username: email.trim().toLowerCase(),
      password
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

// src/cli/login-calls.ts
function loginCalls(server, appId) {
  let opts;
  if (server) {
    const base = server.replace(/^ws/, "http");
    opts = { accountBase: base, authBase: base, appId };
  } else {
    opts = { appId };
  }
  return {
    requestCode: (email) => requestLoginCode(email, opts),
    completeLogin: (email, code) => completeLogin(email, code, opts),
    passwordLogin: (email, password) => loginWithPassword(email, password, opts)
  };
}

// src/tui/Root.tsx
var import_react18 = __toESM(require_react(), 1);

// src/tui/Login.tsx
var import_react2 = __toESM(require_react(), 1);

// src/tui/theme.ts
var theme2 = {
  heading: { bold: true },
  headingFocused: { bold: true, inverse: true },
  muted: { dimColor: true },
  accent: { color: "blue" },
  selection: { bold: true, inverse: true },
  error: { color: "red" },
  warning: { color: "yellow" },
  success: { color: "green" }
};

// src/tui/Login.tsx
var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
function Login({
  width,
  height,
  requestCode,
  completeLogin: completeLogin2,
  onLoggedIn,
  passwordLogin
}) {
  const [step, setStep] = (0, import_react2.useState)("email");
  const [email, setEmail] = (0, import_react2.useState)("");
  const [code, setCode] = (0, import_react2.useState)("");
  const [password, setPassword] = (0, import_react2.useState)("");
  const [error, setError] = (0, import_react2.useState)("");
  use_input_default((input, key) => {
    if (key.return) {
      if (step === "email") {
        if (email.trim() === "") return;
        setError("");
        requestCode(email.trim()).then(() => {
          setStep("code");
        }).catch((err) => {
          setError(err.message);
        });
      } else if (step === "code") {
        if (code.trim() === "") return;
        setError("");
        completeLogin2(email.trim(), code.trim()).then((token) => {
          onLoggedIn({ email: email.trim(), token });
        }).catch((err) => {
          setError(err.message);
          setCode("");
        });
      } else if (step === "password") {
        if (password === "") return;
        setError("");
        passwordLogin(email.trim(), password).then((token) => {
          onLoggedIn({ email: email.trim(), token });
        }).catch((err) => {
          setError(err.message);
          setPassword("");
        });
      }
      return;
    }
    if (key.tab) {
      if (step === "email" && passwordLogin !== void 0 && email.trim() !== "") {
        setStep("password");
        setError("");
      }
      return;
    }
    if (key.escape) {
      if (step === "code") {
        setStep("email");
        setCode("");
        setError("");
      } else if (step === "password") {
        setStep("email");
        setPassword("");
        setError("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (step === "email") {
        setEmail((prev) => prev.slice(0, -1));
      } else if (step === "code") {
        setCode((prev) => prev.slice(0, -1));
      } else if (step === "password") {
        setPassword((prev) => prev.slice(0, -1));
      }
      return;
    }
    if (input !== "" && !key.ctrl && !key.meta && !key.tab && !key.escape) {
      if (step === "email") {
        setEmail((prev) => prev + input);
      } else if (step === "code") {
        setCode((prev) => prev + input);
      } else if (step === "password") {
        setPassword((prev) => prev + input);
      }
    }
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Box_default, { flexDirection: "column", height, width, paddingX: 2, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { bold: true, children: "Simplenote login" }),
    step === "email" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { children: [
        "Email: ",
        email
      ] }),
      passwordLogin !== void 0 ? (
        // T70
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Text, { children: "Tab: log in with a password" })
      ) : null
    ] }) : step === "password" ? (
      // T70
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { children: [
          "Password login for ",
          email
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { children: [
          "Password: ",
          "*".repeat(password.length)
        ] })
      ] })
    ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { children: [
        "Code sent to ",
        email
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { children: [
        "Code: ",
        code
      ] })
    ] }),
    error !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Text, { ...theme2.error, children: [
      "Error: ",
      error
    ] }) : null
  ] });
}

// src/tui/App.tsx
var import_react17 = __toESM(require_react(), 1);

// src/core/keymap.ts
var keymap = [
  { key: "j", action: "move_down", description: "Move down" },
  { key: "k", action: "move_up", description: "Move up" },
  { key: "Enter", action: "open_note", description: "Open note" },
  { key: "Tab", action: "next_pane", description: "Next pane" },
  { key: "q", action: "quit", description: "Quit" },
  { key: "v", action: "toggle_preview", description: "Toggle rendered markdown preview" },
  { key: "?", action: "help", description: "Show this help" },
  { key: "Escape", action: "close", description: "Close overlay / back" },
  { key: "e", action: "edit_note", description: "Edit in $EDITOR" },
  { key: "n", action: "new_note", description: "New note" },
  { key: "g", action: "edit_tags", description: "Edit tags of the selected note" },
  { key: "w", action: "export_note", description: "Export note to .md" },
  { key: "b", action: "send_blog", description: "Send to blog as draft" },
  { key: "L", action: "logout", description: "Log out (asks first)" },
  { key: "d", action: "trash_note", description: "Move to trash" },
  { key: "u", action: "restore_note", description: "Restore from trash (trash view)" },
  { key: "D", action: "delete_forever", description: "Delete forever (trash view)" },
  { key: "T", action: "toggle_trash", description: "Show trash / all notes" },
  { key: "E", action: "empty_trash", description: "Empty the trash (trash view)" },
  { key: "p", action: "toggle_pin", description: "Pin / unpin" },
  { key: "m", action: "toggle_markdown", description: "Markdown on / off" },
  { key: "s", action: "cycle_sort", description: "Sort: modified, created, a-z" },
  { key: "S", action: "reverse_sort", description: "Reverse the sort order" },
  { key: "/", action: "search", description: "Search notes" },
  { key: "t", action: "focus_tags", description: "Show / focus the tags pane" },
  { key: "J", action: "move_tag_down", description: "Move tag down (tags pane)" },
  { key: "K", action: "move_tag_up", description: "Move tag up (tags pane)" },
  { key: "R", action: "rename_tag", description: "Rename tag (tags pane)" },
  { key: "x", action: "delete_tag", description: "Delete tag (tags pane)" },
  { key: "r", action: "force_sync", description: "Sync now" },
  { key: "P", action: "toggle_publish", description: "Publish / unpublish" },
  { key: "y", action: "copy_link", description: "Copy the public link" },
  { key: "h", action: "history", description: "Note history (Enter restores)" },
  { key: "c", action: "toggle_check", description: "Tick / untick item (note)" },
  { key: "a", action: "add_check_item", description: "Add checklist item (note)" },
  { key: "i", action: "edit_note_inline", description: "Edit inline (built-in editor)" }
];
function keyNameFromEvent(key) {
  if (key.return) return "Enter";
  if (key.tab) return "Tab";
  if (key.escape) return "Escape";
  if (key.upArrow) return "upArrow";
  if (key.downArrow) return "downArrow";
  if (key.leftArrow) return "leftArrow";
  if (key.rightArrow) return "rightArrow";
  return null;
}

// src/core/help-sections.ts
var SECTIONS = [
  {
    name: "Navigate",
    actions: [
      "move_down",
      "move_up",
      "open_note",
      "next_pane",
      "search",
      "toggle_preview",
      "help",
      "close"
    ]
  },
  {
    name: "Notes",
    actions: [
      "new_note",
      "edit_note",
      "edit_note_inline",
      "toggle_pin",
      "toggle_markdown",
      "history",
      "toggle_check",
      "add_check_item",
      "export_note",
      "send_blog"
    ]
  },
  {
    name: "Tags",
    actions: [
      "edit_tags",
      "focus_tags",
      "move_tag_down",
      "move_tag_up",
      "rename_tag",
      "delete_tag"
    ]
  },
  {
    name: "Trash",
    actions: [
      "trash_note",
      "restore_note",
      "delete_forever",
      "toggle_trash",
      "empty_trash"
    ]
  },
  {
    name: "Sync & Sort",
    actions: [
      "cycle_sort",
      "reverse_sort",
      "force_sync",
      "toggle_publish",
      "copy_link"
    ]
  },
  {
    name: "App",
    actions: [
      "quit",
      "logout"
    ]
  }
];

// src/core/help-layout.ts
function layoutHelp(cols, rows, editor = "nvim") {
  const grouped = SECTIONS.map((section) => ({
    name: section.name,
    entries: keymap.filter((e) => section.actions.includes(e.action))
  }));
  const sectionLines = (groups) => {
    const lines = [];
    for (const g of groups) {
      lines.push(g.name);
      for (const entry of g.entries) {
        lines.push(entry.key.padEnd(8) + "  " + entry.description);
      }
    }
    return lines;
  };
  const footers = [
    "Found a bug? Run snote --report to save a report bundle.",
    "Editing: " + editorFinishHint(editor)
  ];
  if (cols >= 100) {
    const leftLines = sectionLines(grouped.slice(0, 3));
    const rightLines = sectionLines(grouped.slice(3));
    const colWidth = Math.floor((cols - 4) / 2);
    const rowCount = Math.max(leftLines.length, rightLines.length);
    const mergedRows = [];
    for (let i = 0; i < rowCount; i++) {
      const row = (leftLines[i] ?? "").padEnd(colWidth) + (rightLines[i] ?? "");
      mergedRows.push(row.replace(/\s+$/, ""));
    }
    return [
      "Help - Keyboard Shortcuts",
      ...mergedRows,
      ...footers
    ];
  }
  const totalEntryRows = grouped.reduce((sum, g) => sum + g.entries.length, 0);
  const availableContent = Math.max(1, rows - 4 - grouped.length);
  const stacked = [];
  for (const g of grouped) {
    const maxRows = Math.max(1, Math.round(availableContent * g.entries.length / totalEntryRows));
    stacked.push(g.name);
    for (const entry of g.entries.slice(0, maxRows)) {
      stacked.push(entry.key.padEnd(8) + "  " + entry.description);
    }
  }
  return [
    "Help - Keyboard Shortcuts",
    ...stacked,
    ...footers
  ];
}

// src/tui/Help.tsx
var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
function helpColumns(entries, rows) {
  const n = Math.max(1, rows);
  if (entries.length === 0) return [];
  const result = [];
  for (let i = 0; i < entries.length; i += n) {
    result.push(entries.slice(i, i + n));
  }
  return result;
}
function Section({
  name,
  entries,
  rowWidth,
  maxRows
}) {
  const subCols = helpColumns(entries, Math.max(1, maxRows));
  const subColWidth = Math.floor(rowWidth / Math.max(1, subCols.length));
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Box_default, { flexDirection: "column", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 1, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { bold: true, children: name }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "row", children: subCols.map((colEntries, ci) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "column", width: subColWidth, children: colEntries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "row", children: (() => {
      const full = entry.key.padEnd(8) + "  " + entry.description;
      const sliced = full.slice(0, subColWidth - 1);
      const keyLen = Math.min(8, sliced.length);
      const keyPart = sliced.slice(0, keyLen);
      const restPart = sliced.slice(keyLen);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { ...theme2.accent, children: keyPart }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: restPart })
      ] });
    })() }, entry.action)) }, ci)) })
  ] });
}
function Help({ width, height, entries, editor }) {
  const contentRows = Math.max(1, height - 4);
  const displayEntries = entries ?? keymap;
  const columns = helpColumns(displayEntries, contentRows);
  const colWidth = Math.floor((width - 6) / Math.max(1, columns.length));
  const sectionEntries = SECTIONS.map(
    (section) => keymap.filter((e) => section.actions.includes(e.action))
  );
  const totalEntryRows = sectionEntries.reduce((sum, s) => sum + s.length, 0);
  const twoCols = width >= 100;
  const leftSections = twoCols ? sectionEntries.slice(0, 3) : sectionEntries;
  const rightSections = twoCols ? sectionEntries.slice(3) : [];
  const sectionCount = twoCols ? 3 : SECTIONS.length;
  const availableContent = Math.max(1, height - 4 - sectionCount);
  const sectionRowBudget = sectionEntries.map(
    (s) => Math.max(1, Math.round(availableContent * s.length / totalEntryRows))
  );
  const editorHint = editorFinishHint(editor ?? "nvim");
  const wide = entries === void 0 && width >= 100;
  const wideLines = wide ? layoutHelp(width, height, editor ?? "nvim") : [];
  const flatContent = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Box_default, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { bold: true, children: "Help - Keyboard Shortcuts" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "row", paddingX: 2, children: columns.map((colEntries, ci) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "column", width: colWidth, children: colEntries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "row", children: (() => {
      const full = entry.key.padEnd(8) + "  " + entry.description;
      const sliced = full.slice(0, colWidth - 1);
      const keyLen = Math.min(8, sliced.length);
      const keyPart = sliced.slice(0, keyLen);
      const restPart = sliced.slice(keyLen);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { ...theme2.accent, children: keyPart }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: restPart })
      ] });
    })() }, entry.action)) }, ci)) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: "Found a bug? Run snote --report to save a report bundle." }) })
  ] });
  const narrow = entries === void 0 && width < 100 && height < 30;
  const narrowCols = narrow ? helpColumns(displayEntries, Math.ceil(displayEntries.length / 2)) : [];
  const narrowColWidth = narrow ? Math.floor((width - 6) / 2) : 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    Box_default,
    {
      flexDirection: "column",
      width,
      height: wide ? wideLines.length + 2 : height,
      borderStyle: "single",
      children: wide ? wideLines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: line }, i)) : narrow ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { bold: true, children: "Help - Keyboard Shortcuts" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "row", paddingX: 2, children: narrowCols.map((colEntries, ci) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "column", width: narrowColWidth, children: colEntries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Box_default, { flexDirection: "row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { ...theme2.accent, children: entry.key.padEnd(8) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: entry.description.slice(0, narrowColWidth - 9) })
        ] }, entry.action)) }, ci)) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: "Found a bug? Run snote --report to save a report bundle." }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Text, { children: [
          "Editing: ",
          editorHint
        ] }) })
      ] }) : entries !== void 0 ? flatContent : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { bold: true, children: "Help - Keyboard Shortcuts" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Box_default, { flexDirection: twoCols ? "row" : "column", paddingX: 2, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "column", children: leftSections.map((sec, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Section,
            {
              name: SECTIONS[i].name,
              entries: sec,
              rowWidth: width - 4,
              maxRows: sectionRowBudget[i] ?? 1
            },
            SECTIONS[i].name
          )) }),
          rightSections.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { flexDirection: "column", children: rightSections.map((sec, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Section,
            {
              name: SECTIONS[i + 3].name,
              entries: sec,
              rowWidth: width - 4,
              maxRows: sectionRowBudget[i + 3] ?? 1
            },
            SECTIONS[i + 3].name
          )) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Text, { children: "Found a bug? Run snote --report to save a report bundle." }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Box_default, { paddingX: 2, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Text, { children: [
          "Editing: ",
          editorHint
        ] }) })
      ] })
    }
  );
}

// src/tui/BottomArea.tsx
var import_react7 = __toESM(require_react(), 1);
import { join as join15 } from "node:path";

// src/tui/TagEditor.tsx
var import_react3 = __toESM(require_react(), 1);

// src/tui/tag-input.ts
function suggestTag(input, allTags, tags2) {
  if (input === "") return null;
  const inputLower = input.toLowerCase();
  const existingHashes = new Set(tags2.map((t) => tagHashOf(t)));
  for (const name of allTags) {
    if (name.toLowerCase().startsWith(inputLower)) {
      const hash = tagHashOf(name);
      if (!existingHashes.has(hash)) {
        return name;
      }
    }
  }
  return null;
}
function tagInputStep(text, input, key, tags2, allTags) {
  if (key.escape) {
    return { text, close: true };
  }
  if (key.return) {
    const t = text.trim();
    if (t === "") return { text };
    const tHash = tagHashOf(t);
    for (const tagName of tags2) {
      if (tagHashOf(tagName) === tHash) {
        return { text: "" };
      }
    }
    return { text: "", add: t };
  }
  if (key.tab) {
    const suggestion = suggestTag(text, allTags, tags2);
    return { text: suggestion ?? text };
  }
  if (key.backspace || key.delete) {
    if (text !== "") {
      return { text: text.slice(0, -1) };
    } else if (tags2.length > 0) {
      return { text: "", remove: tags2[tags2.length - 1] };
    } else {
      return { text: "" };
    }
  }
  if (key.ctrl || key.meta) {
    return { text };
  }
  if (input === "") {
    return { text };
  }
  return { text: text + input };
}

// src/tui/split-input.ts
function splitPastedInput(input) {
  if (input.length > 1 && !input.includes("\x1B")) {
    return [...input];
  }
  return null;
}

// src/tui/TagEditor.tsx
var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
function TagEditor({ tags: tags2, allTags, onAdd, onRemove, onClose }) {
  const [text, setText] = (0, import_react3.useState)("");
  const suggestion = suggestTag(text, allTags, tags2);
  use_input_default((input, key) => {
    const pasted = splitPastedInput(input);
    if (pasted) {
      let next = text;
      for (const ch of pasted) {
        const step2 = ch === "\r" ? tagInputStep(next, "", { ...key, return: true }, tags2, allTags) : tagInputStep(next, ch, key, tags2, allTags);
        next = step2.text;
        if (step2.add) onAdd(step2.add);
        if (step2.remove) onRemove(step2.remove);
        if (step2.close) onClose();
      }
      setText(next);
      return;
    }
    const step = tagInputStep(text, input, key, tags2, allTags);
    setText(step.text);
    if (step.add) onAdd(step.add);
    if (step.remove) onRemove(step.remove);
    if (step.close) onClose();
  });
  const displayTags = tags2.map((t) => `[${sanitizeForTerminal(t)}] `);
  let display = "tags: ";
  display += displayTags.join("");
  display += text === "" ? "+ type to add" : "+ ";
  if (suggestion) {
    const restOfSuggestion = sanitizeForTerminal(suggestion.slice(text.length));
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Box_default, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Text, { bold: true, inverse: true, children: [
        display,
        text
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Text, { ...theme2.muted, children: restOfSuggestion })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Box_default, { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Text, { bold: true, inverse: true, children: [
    display,
    text
  ] }) });
}

// src/tui/StatusBar.tsx
var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
function StatusBar({ connected, count, width, label, pending }) {
  const statusText = connected ? "connected" : "offline";
  const statusRole = connected ? theme2.success : theme2.error;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Box_default, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Text, { ...theme2.muted, children: "[" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Text, { ...statusRole, children: statusText }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Text, { ...theme2.muted, children: "]" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Text, { children: " " }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Text, { children: [
      count,
      " notes"
    ] }),
    pending && pending > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Text, { ...theme2.warning, children: [
      " ",
      pending,
      " pending"
    ] }) : null,
    label ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(Text, { ...theme2.warning, children: [
      " ",
      label
    ] }) : null
  ] });
}

// src/tui/Prompt.tsx
var import_react4 = __toESM(require_react(), 1);
var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
function Prompt({ label, initial, onSubmit, onCancel }) {
  const [text, setText] = import_react4.default.useState(initial);
  const textRef = import_react4.default.useRef(text);
  const write = (next) => {
    textRef.current = next;
    setText(next);
  };
  const handle = (input, key) => {
    if (key.escape) {
      onCancel();
      return true;
    }
    if (key.return) {
      const trimmed = textRef.current.trim();
      if (trimmed === "" || trimmed === initial) {
        onCancel();
      } else {
        onSubmit(trimmed);
      }
      return true;
    }
    if (key.backspace || key.delete) {
      if (textRef.current.length > 0) {
        write(textRef.current.slice(0, -1));
      }
      return true;
    }
    if (key.ctrl || key.meta) {
      return true;
    }
    if (input !== "") {
      write(textRef.current + input);
    }
    return false;
  };
  use_input_default((input, key) => {
    const chars = splitPastedInput(input);
    if (chars) {
      for (const ch of chars) {
        const stop = ch === "\r" ? handle("", { ...key, return: true, escape: false }) : handle(ch, { ...key, return: false, escape: false });
        if (stop) return;
      }
      return;
    }
    handle(input, key);
  });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Box_default, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Text, { bold: true, inverse: true, children: [
      label,
      ": "
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Text, { bold: true, inverse: true, children: text })
  ] });
}
function Confirm({ question, onYes, onNo, destructive }) {
  use_input_default((input, key) => {
    if (key.escape) {
      onNo();
      return;
    }
    if (input === "y" || input === "Y") {
      onYes();
      return;
    }
    if (input === "n" || input === "N") {
      onNo();
      return;
    }
  });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Box_default, { children: destructive ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Text, { bold: true, ...theme2.error, children: [
    question,
    " y/n"
  ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Text, { children: [
    question,
    " y/n"
  ] }) });
}

// src/tui/dialog-actions.ts
var logoutHandlers = (setLogoutAsk, onLogout) => {
  const yes = () => {
    setLogoutAsk(false);
    if (onLogout) {
      onLogout();
    }
  };
  const no = () => {
    setLogoutAsk(false);
  };
  const submit = (value) => {
    if (value === "logout") {
      yes();
    } else {
      setLogoutAsk(false);
    }
  };
  return { yes, no, submit };
};
var emptyTrashHandlers = (store, setEmptyAsk) => {
  const submit = (value) => {
    if (value === "empty") {
      for (const a of emptyTrashActions(store.getState())) {
        store.dispatch(a);
      }
    }
    setEmptyAsk(0);
  };
  const no = () => {
    setEmptyAsk(0);
  };
  return { submit, no };
};
var renameHandlers = (store, tagDialog, setTagDialog) => {
  const submit = (value) => {
    const tagName = tagDialog.tagName;
    store.dispatch({ type: "RENAME_TAG", oldTagName: tagName, newTagName: value });
    setTagDialog(null);
  };
  const cancel = () => {
    setTagDialog(null);
  };
  return { submit, cancel };
};
var deleteTagHandlers = (store, tagDialog, setTagDialog) => {
  const yes = () => {
    store.dispatch({ type: "TRASH_TAG", tagName: tagDialog.tagName });
    setTagDialog(null);
  };
  const no = () => {
    setTagDialog(null);
  };
  return { yes, no };
};

// src/tui/blog-send-ask.ts
var import_react5 = __toESM(require_react(), 1);
import * as fs8 from "node:fs";
import * as path7 from "node:path";

// src/core/blog-config.ts
import * as fs6 from "node:fs";
import * as path5 from "node:path";
var BLOG_FILE = "blog.json";
var DEFAULT_BLOG_ORIGIN = "https://skryf.art";
function blogOriginFromEnv(env) {
  const fromEnv = env.SNOTE_BLOG_ORIGIN;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BLOG_ORIGIN;
}
async function saveBlogConfig(dir, { origin, token }) {
  if (!origin.startsWith("https://")) {
    throw new Error(
      `Invalid blog origin: must start with https://, got "${origin}"`
    );
  }
  if (!token || token.length === 0) {
    throw new Error("Blog token must be a non-empty string");
  }
  const filePath = path5.join(dir, BLOG_FILE);
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const payload = { origin: trimmedOrigin, token };
  const data = JSON.stringify(payload);
  secureMkdir(dir);
  fs6.writeFileSync(filePath, data, { mode: 384 });
  fs6.chmodSync(filePath, 384);
}
async function loadBlogConfig(dir) {
  const filePath = path5.join(dir, BLOG_FILE);
  let raw;
  try {
    raw = fs6.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || !("origin" in parsed) || !("token" in parsed) || typeof parsed.origin !== "string" || typeof parsed.token !== "string") {
    return null;
  }
  return {
    origin: parsed.origin,
    token: parsed.token
  };
}

// src/core/blog-client.ts
function normalizeBlogUrl(url, origin) {
  const base = origin.replace(/\/+$/, "");
  if (url.startsWith("//")) {
    const scheme = /^(https?:)\/\//i.exec(base)?.[1] ?? "https:";
    return scheme + url;
  }
  if (url.startsWith("/")) {
    return base + url;
  }
  return url;
}
async function postBlogDraft({
  origin,
  token,
  title,
  markdown
}) {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const url = `${trimmedOrigin}/api/agent/posts`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ title, markdown, draft: true })
  });
  if (response.status === 201) {
    const body = await response.json();
    return { id: body.id, url: normalizeBlogUrl(body.url, origin) };
  }
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (response.status === 422) {
    const body = await response.json();
    throw new Error(body.error);
  }
  if (response.status === 429) {
    throw new Error("rate limited");
  }
  throw new Error(`HTTP ${response.status}`);
}

// src/core/blog-markdown.ts
var CHECKBOX_UNCHECKED = /^- \[ \] (.+)$/;
var CHECKBOX_CHECKED = /^- \[[xX]\] (.+)$/;
function checklistGlyphs(content) {
  const lines = content.split("\n");
  const result = lines.map((line) => {
    const uncheckedMatch = line.match(CHECKBOX_UNCHECKED);
    if (uncheckedMatch) {
      return "- \u2610 " + uncheckedMatch[1];
    }
    const checkedMatch = line.match(CHECKBOX_CHECKED);
    if (checkedMatch) {
      return "- \u2611 " + checkedMatch[1];
    }
    return line;
  });
  return result.join("\n");
}

// src/core/blog-draft.ts
function noteToBlogDraft(content) {
  const lines = content.split("\n");
  let titleLineIndex = -1;
  let titleLine = "";
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      titleLineIndex = i;
      titleLine = trimmed;
      break;
    }
  }
  if (titleLineIndex === -1) {
    throw new Error("title is required");
  }
  let title = titleLine;
  if (title.startsWith("# ")) {
    title = title.slice(2);
  }
  if (title.length > 200) {
    throw new Error("title is too long");
  }
  const remainingLines = lines.slice(titleLineIndex + 1);
  const markdownBody = remainingLines.join("\n");
  const markdown = checklistGlyphs(markdownBody);
  return { title, markdown };
}

// src/core/blog-sent.ts
import * as fs7 from "node:fs";
import * as path6 from "node:path";
var BLOG_SENT_FILE = "blog-sent.json";
function blogStatusLine(record) {
  if (!record) {
    return null;
  }
  const url = record.url.startsWith("//") ? "https:" + record.url : record.url;
  return "Sent as draft \xB7 " + record.sentAt.slice(0, 10) + " \xB7 " + url;
}
function recordBlogSend(dir, noteId, { postId, url, sentAt }) {
  const filePath = path6.join(dir, BLOG_SENT_FILE);
  let data = {};
  if (fs7.existsSync(filePath)) {
    try {
      const raw = fs7.readFileSync(filePath, "utf8");
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  data[noteId] = { postId, url, sentAt };
  secureMkdir(dir);
  secureWriteFileSync(filePath, JSON.stringify(data));
}
function loadBlogSend(dir, noteId) {
  const filePath = path6.join(dir, BLOG_SENT_FILE);
  if (!fs7.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs7.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    const record = data;
    if (!(noteId in record)) {
      return null;
    }
    const value = record[noteId];
    if (value === null || typeof value !== "object" || !("postId" in value) || !("url" in value) || !("sentAt" in value) || typeof value.postId !== "string" || typeof value.url !== "string" || typeof value.sentAt !== "string") {
      return null;
    }
    return {
      postId: value.postId,
      url: value.url,
      sentAt: value.sentAt
    };
  } catch {
    return null;
  }
}

// src/core/blog-send.ts
async function sendNoteToBlog({
  dir,
  noteId,
  content,
  force,
  now
}) {
  const config = await loadBlogConfig(dir);
  if (!config) {
    throw new Error("blog is not configured");
  }
  const existing = loadBlogSend(dir, noteId);
  if (existing && !force) {
    return { already: true };
  }
  const { title, markdown } = noteToBlogDraft(content);
  const result = await postBlogDraft({
    origin: config.origin,
    token: config.token,
    title,
    markdown
  });
  recordBlogSend(dir, noteId, {
    postId: result.id,
    url: result.url,
    sentAt: now
  });
  return {
    url: result.url,
    sentAt: now,
    postId: result.id,
    already: false
  };
}

// src/tui/blog-send-ask.ts
var cell = {
  current: {
    blogSendAsk: null,
    setBlogSendAsk: () => {
    },
    closeBlogSend: () => {
    },
    blogOpen: false
  }
};
function useBlogSendAsk() {
  return cell.current;
}
function useBlogSendAskState(noteId, content, setNotice, setNoticeError) {
  const [phase, setPhase] = (0, import_react5.useState)(null);
  const pending = (0, import_react5.useRef)(null);
  const [tick, setTick] = (0, import_react5.useState)(0);
  const noteIdRef = (0, import_react5.useRef)(noteId);
  noteIdRef.current = noteId;
  const contentRef = (0, import_react5.useRef)(content);
  contentRef.current = content;
  import_react5.default.useLayoutEffect(() => {
    if (tick === 0) return;
    const next = pending.current;
    if (next === null) return;
    pending.current = null;
    setPhase(next === "close" ? null : next);
  }, [tick]);
  const request = (next) => {
    pending.current = next;
    setTick((t) => t + 1);
  };
  use_input_default((input, key) => {
    if (phase?.kind !== "send" && phase?.kind !== "resend") return;
    const resend = phase.kind === "resend";
    if (key.escape || input === "n" || input === "N") {
      request("close");
      return;
    }
    if (input === "y" || input === "Y") {
      request("close");
      const id = noteIdRef.current;
      if (!id) return;
      sendNoteToBlog({
        dir: defaultDataDir(),
        noteId: id,
        content: contentRef.current,
        force: resend,
        now: (/* @__PURE__ */ new Date()).toISOString()
      }).then(
        () => setNotice("draft sent to your blog"),
        (error) => {
          const msg = error instanceof Error ? error.message.trim().toLowerCase() : "";
          setNoticeError(msg !== "" ? msg : "send to blog failed");
        }
      );
    }
  });
  const setBlogSendAsk = (v) => {
    if (v === null) {
      request("close");
      return;
    }
    const dir = defaultDataDir();
    const configured = fs8.existsSync(path7.join(dir, "blog.json"));
    const id = noteIdRef.current;
    if (!configured) request({ kind: "token", origin: blogOriginFromEnv(process.env) });
    else if (id && loadBlogSend(dir, id)) request({ kind: "resend" });
    else request({ kind: "send" });
  };
  const closeBlogSend = () => request("close");
  cell.current = {
    blogSendAsk: phase ? { onYes: () => {
    }, onNo: closeBlogSend } : null,
    setBlogSendAsk,
    closeBlogSend,
    blogOpen: phase !== null
  };
  return { phase, request };
}

// src/tui/blog-send-dialog.tsx
var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);
var SEND_QUESTION = "Send this note to your blog as a draft?";
var RESEND_QUESTION = "Already sent as a draft. Send again as a new draft?";
function BlogSendDialog({
  phase,
  setNoticeError,
  request
}) {
  if (phase.kind === "origin") {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      Prompt,
      {
        label: "Blog origin",
        initial: "",
        onSubmit: (origin) => request({ kind: "token", origin }),
        onCancel: () => request("close")
      },
      "origin"
    );
  }
  if (phase.kind === "token") {
    const origin = phase.origin;
    const label = origin === DEFAULT_BLOG_ORIGIN ? "Skryf token (create one at https://skryf.art/settings/keys)" : "Blog token";
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      Prompt,
      {
        label,
        initial: "",
        onSubmit: (token) => {
          const dir = defaultDataDir();
          saveBlogConfig(dir, { origin, token }).then(
            () => request({ kind: "send" }),
            (error) => {
              const msg = error instanceof Error ? error.message : "blog setup failed";
              setNoticeError(msg);
              request("close");
            }
          );
        },
        onCancel: () => request("close")
      },
      "token"
    );
  }
  const resend = phase.kind === "resend";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Box_default, { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Text, { children: (resend ? RESEND_QUESTION : SEND_QUESTION) + " y/n" }) });
}

// src/tui/KeyHints.tsx
var import_react6 = __toESM(require_react(), 1);
var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
var LIST_HINTS = [
  { key: "?", label: "Help" },
  { key: "n", label: "New" },
  { key: "e", label: "Edit" },
  { key: "g", label: "Add tag" },
  { key: "/", label: "Search" },
  { key: "q", label: "Quit" },
  { key: "Tab", label: "Tags" }
];
var TAGS_HINTS = [
  { key: "j/k", label: "Move" },
  { key: "Enter", label: "Select" },
  { key: "R", label: "Rename" },
  { key: "x", label: "Delete" },
  { key: "Escape", label: "Back" }
];
var TRASH_HINTS = [
  { key: "u", label: "Restore" },
  { key: "D", label: "Delete" },
  { key: "E", label: "Empty" },
  { key: "T", label: "Back" }
];
var EDITING_HINTS = [
  { key: "Enter", label: "Confirm" },
  { key: "Escape", label: "Cancel" }
];
function hintsForContext(ctx) {
  if (ctx === "tags") return TAGS_HINTS;
  if (ctx === "trash") return TRASH_HINTS;
  if (ctx === "editing") return EDITING_HINTS;
  return LIST_HINTS;
}
function visibleHints(entries, width) {
  let list = [...entries];
  while (list.length > 0) {
    const lineLen = list.map((e) => e.key + " " + e.label).join("  ").length;
    if (lineLen <= width) break;
    list = list.slice(0, -1);
  }
  return list;
}
function KeyHints({ context, width }) {
  const hints = visibleHints(hintsForContext(context), width);
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Box_default, { children: hints.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_react6.default.Fragment, { children: [
    i > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Text, { children: "  " }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Text, { ...theme2.accent, children: h.key }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(Text, { children: [
      " ",
      h.label
    ] })
  ] }, h.key)) });
}

// src/tui/BottomArea.tsx
var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);
var itemAskRef = {
  current: { itemAsk: false, setItemAsk: () => {
  }, itemIndex: 0 }
};
function useItemAsk() {
  return itemAskRef.current;
}
var exportAskRef = {
  current: { exportAsk: false, setExportAsk: () => {
  } }
};
function useExportAsk() {
  return exportAskRef.current;
}
function BottomArea({
  store,
  view,
  selectedEntry,
  width,
  onLogout,
  tagEditorOpen,
  setTagEditorOpen,
  tagDialog,
  setTagDialog,
  logoutAsk,
  setLogoutAsk,
  emptyAsk,
  setEmptyAsk,
  copyResult,
  tagsFocused,
  searchOpen,
  itemIndex = 0,
  setNotice,
  setNoticeError
}) {
  const { allTagNames, connected, noteEntries, inTrash, sortLabelStr, pending } = view;
  const blogLine = selectedEntry ? blogStatusLine(loadBlogSend(defaultDataDir(), String(selectedEntry.id))) : null;
  const [itemAsk, setItemAsk] = (0, import_react7.useState)(false);
  itemAskRef.current = { itemAsk, setItemAsk, itemIndex };
  const [exportAsk, setExportAsk] = (0, import_react7.useState)(false);
  exportAskRef.current = { exportAsk, setExportAsk };
  const exportPathRef = (0, import_react7.useRef)(null);
  const { phase, request } = useBlogSendAskState(
    selectedEntry ? String(selectedEntry.id) : null,
    selectedEntry?.note.content ?? "",
    (message) => setNotice?.(message),
    (message) => setNoticeError?.(message)
  );
  const logout3 = logoutHandlers(setLogoutAsk, onLogout);
  const emptyTrash2 = emptyTrashHandlers(store, setEmptyAsk);
  const rename = tagDialog?.kind === "rename" ? renameHandlers(store, tagDialog, setTagDialog) : null;
  const deleteTag = tagDialog?.kind === "delete" ? deleteTagHandlers(store, tagDialog, setTagDialog) : null;
  const handleItemAskSubmit = (value) => {
    insertCheckItem({ store, selectedEntry, itemIndex, value });
    setItemAsk(false);
  };
  const handleItemAskCancel = () => {
    setItemAsk(false);
  };
  const initialFor = (kind) => {
    if (kind === "rename") return tagDialog.tagName;
    if (exportPathRef.current === null) {
      const base = exportFileName(selectedEntry?.note.content ?? "");
      exportPathRef.current = join15(documentsDir(), `${base}.md`);
    }
    return exportPathRef.current;
  };
  const handleExportSubmit = (value) => {
    exportSelectedNote({ selectedEntry, value, setNotice: (v) => setNotice?.(v), setNoticeError: (v) => setNoticeError?.(v) });
    exportPathRef.current = null;
    setExportAsk(false);
  };
  const handleExportCancel = () => {
    if (exportPathRef.current !== null) {
      handleExportSubmit(exportPathRef.current);
    } else {
      setExportAsk(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: tagEditorOpen ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      TagEditor,
      {
        tags: selectedEntry.note.tags,
        allTags: allTagNames,
        onAdd: (name) => {
          if (is_email_tag_default(name)) return;
          store.dispatch({
            type: "ADD_NOTE_TAG",
            noteId: selectedEntry.id,
            tagName: name
          });
        },
        onRemove: (name) => store.dispatch({
          type: "REMOVE_NOTE_TAG",
          noteId: selectedEntry.id,
          tagName: name
        }),
        onClose: () => setTagEditorOpen(false)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyHints, { context: "editing", width })
  ] }) : tagDialog?.kind === "rename" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      Prompt,
      {
        label: "rename tag",
        initial: initialFor("rename"),
        onSubmit: rename.submit,
        onCancel: rename.cancel
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyHints, { context: "editing", width })
  ] }) : tagDialog?.kind === "delete" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    Confirm,
    {
      question: "delete tag " + tagDialog.tagName + "?",
      onYes: deleteTag.yes,
      onNo: deleteTag.no,
      destructive: true
    }
  ) : itemAsk ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      Prompt,
      {
        label: "new check item",
        initial: "",
        onSubmit: handleItemAskSubmit,
        onCancel: handleItemAskCancel
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyHints, { context: "editing", width })
  ] }) : exportAsk ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      Prompt,
      {
        label: "export",
        initial: initialFor("export"),
        onSubmit: handleExportSubmit,
        onCancel: handleExportCancel
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyHints, { context: "editing", width })
  ] }) : phase ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    BlogSendDialog,
    {
      phase,
      setNoticeError: (message) => setNoticeError?.(message),
      request
    }
  ) : logoutAsk ? pendingCount(store.getState().simperium) > 0 ? (() => {
    const unsynced = pendingCount(store.getState().simperium);
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      Prompt,
      {
        label: "log out: " + unsynced + " unsynced notes will be lost - type 'logout' to confirm",
        initial: "",
        onSubmit: logout3.submit,
        onCancel: logout3.no
      }
    );
  })() : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    Confirm,
    {
      question: "log out and delete local data?",
      onYes: logout3.yes,
      onNo: logout3.no,
      destructive: true
    }
  ) : emptyAsk ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
    Prompt,
    {
      label: "empty trash (" + emptyAsk + " notes) - type 'empty' to confirm",
      initial: "",
      onSubmit: emptyTrash2.submit,
      onCancel: emptyTrash2.no
    }
  ) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
    blogLine ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Text, { children: blogLine }) : null,
    selectedEntry && (() => {
      const sl = sharedLine(selectedEntry.note);
      return sl ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(Text, { children: sl }) : null;
    })(),
    selectedEntry && selectedEntry.note.systemTags?.includes("published") ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(Text, { children: [
      "published: " + (publishLink(selectedEntry.note) ?? "waiting for link"),
      copyResult?.noteId === selectedEntry.id ? copyResult.ok ? " (copied)" : " (copy failed)" : ""
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(KeyHints, { context: tagsFocused ? "tags" : inTrash ? "trash" : "list", width }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(StatusBar, { connected, count: noteEntries.length, width, label: inTrash ? sortLabelStr && sortLabelStr !== "sort: modified" ? "trash  " + sortLabelStr : "trash" : sortLabelStr && sortLabelStr !== "sort: modified" ? sortLabelStr : void 0, pending })
  ] }) });
}

// src/tui/Divider.tsx
var import_jsx_runtime9 = __toESM(require_jsx_runtime(), 1);
function Divider({ height }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Box_default, { width: 1, height, flexDirection: "column", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(Text, { ...theme2.muted, children: Array.from({ length: Math.max(0, height) }, () => "\u2502").join("\n") }) });
}

// src/tui/PaneHeading.tsx
var import_jsx_runtime10 = __toESM(require_jsx_runtime(), 1);
function PaneHeading({ label, focused = false }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(Text, { ...focused ? theme2.headingFocused : theme2.heading, children: label });
}

// src/tui/TagPane.tsx
var import_jsx_runtime11 = __toESM(require_jsx_runtime(), 1);
function TagPane({
  tags: tags2,
  selectedIndex,
  focused,
  width,
  height,
  trashRow = false,
  divider = false
}) {
  const rows = trashRow ? ["All notes", ...tags2, "Untagged", "Trash"] : ["All notes", ...tags2, "Untagged"];
  const visibleStart = Math.max(0, selectedIndex - Math.floor((height - 1) / 2));
  const visibleEnd = Math.min(rows.length, visibleStart + height - 1);
  const hiddenAbove = visibleStart;
  const hiddenBelow = rows.length - visibleEnd;
  const moreAboveSlot = hiddenAbove > 0 ? 0 : -1;
  const moreBelowSlot = hiddenBelow > 0 ? Math.max(visibleEnd - visibleStart - 1, 0) : -1;
  const labels = rows.slice(visibleStart, visibleEnd).map((tag, idx) => {
    if (idx === moreAboveSlot) return "\u2026 " + hiddenAbove + " more";
    if (idx === moreBelowSlot && idx !== moreAboveSlot) return "\u2026 " + hiddenBelow + " more";
    return String(tag ?? "");
  });
  const content = /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Box_default, { flexDirection: "column", width, height, children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(PaneHeading, { label: "Tags", focused }),
    labels.map((label, idx) => {
      const actualIndex = visibleStart + idx;
      const isSelected = actualIndex === selectedIndex;
      const isMore = idx === moreAboveSlot || idx === moreBelowSlot && idx !== moreAboveSlot;
      return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Box_default, { children: [
        isMore ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Text, { children: "\xA0" }) : isSelected ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Text, { bold: true, children: ">" }) : actualIndex === 0 || actualIndex === rows.length - 1 || trashRow && actualIndex === rows.length - 2 ? /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Text, { children: "\xB7" }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Text, { children: " " }),
        /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Text, { children: label.slice(0, width - 2) })
      ] }, actualIndex);
    })
  ] });
  if (divider) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(Box_default, { flexDirection: "row", width, height, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Box_default, { flexDirection: "column", width: width - 1, height, children: content }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(Divider, { height })
    ] });
  }
  return content;
}

// src/core/wrap.ts
function wrapLines(content, width) {
  const w = Math.max(1, width);
  const lines = content.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") {
      result.push({ text: "", line: i });
    } else {
      let rest = line;
      while (rest.length > w) {
        const cut = rest.lastIndexOf(" ", w);
        if (cut <= 0) {
          result.push({ text: rest.slice(0, w).trimEnd(), line: i });
          rest = rest.slice(w).replace(/^ +/, "");
        } else {
          result.push({ text: rest.slice(0, cut).trimEnd(), line: i });
          rest = rest.slice(cut).replace(/^ +/, "");
        }
      }
      result.push({ text: rest, line: i });
    }
  }
  return result;
}

// src/core/note-row.ts
function noteRow(note, width, query) {
  const { title: rawTitle, preview: rawPreview } = note_utils_default(note, query);
  const title = sanitizeForTerminal(rawTitle);
  const preview = sanitizeForTerminal(rawPreview);
  const truncatedTitle = title.length > width - 2 ? wrapLines(title, width - 4)[0].text + ".." : title;
  const marker = "";
  const rows = wrapLines(preview, width - 2);
  const previewLines = rows.slice(0, 2).map((r) => r.text).filter((t) => t !== "");
  return { title: truncatedTitle, marker, previewLines };
}

// src/tui/NoteList.tsx
var import_jsx_runtime12 = __toESM(require_jsx_runtime(), 1);
function listColWidth(width) {
  return Math.min(Math.floor(width * 0.4), 60);
}
function isBoundary(notes2, i) {
  return i > 0 && notes2[i - 1].systemTags.includes("pinned") && !notes2[i].systemTags.includes("pinned");
}
function NoteList({
  notes: notes2,
  selectedIndex,
  width,
  height,
  query,
  focused = false
}) {
  const listHeight = height - 2;
  const colWidth = listColWidth(width);
  const bodyHeight = listHeight - 1;
  const perNote = 4;
  const boundaryExists = notes2.some((_, i) => isBoundary(notes2, i));
  const visibleCount = Math.max(
    1,
    Math.floor((listHeight - (boundaryExists ? 1 : 0)) / perNote)
  );
  const maxStart = Math.max(0, notes2.length - visibleCount);
  let visibleStart = Math.min(
    Math.max(0, selectedIndex - Math.floor(visibleCount / 2)),
    maxStart
  );
  const visibleEnd = Math.min(notes2.length, visibleStart + visibleCount);
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Box_default, { flexDirection: "column", height: listHeight, width: colWidth, children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(PaneHeading, { label: "Notes", focused }),
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Box_default, { flexDirection: "column", height: bodyHeight, children: notes2.slice(visibleStart, visibleEnd).map((note, idx) => {
      const actualIndex = visibleStart + idx;
      const isSelected = actualIndex === selectedIndex;
      const { title, marker, previewLines } = noteRow(note, colWidth, query);
      const lines = [];
      if (isBoundary(notes2, actualIndex)) {
        lines.push(
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Text, { wrap: "truncate", ...theme2.muted, children: "\u2500".repeat(colWidth - 2) }, `rule-${idx}`)
        );
      }
      lines.push(
        /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Box_default, { children: [
          isSelected ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Text, { bold: true, inverse: true, children: ">" }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Text, { children: " " }),
          /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(Text, { bold: isSelected, inverse: isSelected, children: [
            title,
            marker
          ] })
        ] }, `title-${idx}`)
      );
      for (let p = 0; p < previewLines.length; p++) {
        lines.push(
          /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Box_default, { marginLeft: 2, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Text, { children: previewLines[p] }) }, `preview-${idx}-${p}`)
        );
      }
      lines.push(/* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Text, { children: " " }, `blank-${idx}`));
      return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(Box_default, { flexDirection: "column", children: lines }, idx);
    }) })
  ] });
}

// src/tui/History.tsx
var import_jsx_runtime13 = __toESM(require_jsx_runtime(), 1);
function History({
  rows,
  selectedIndex,
  loading,
  width,
  height
}) {
  const listHeight = height - 3;
  const colWidth = Math.floor(width * 0.4);
  const visibleStart = Math.max(0, selectedIndex - Math.floor(listHeight / 2));
  const visibleEnd = Math.min(rows.length, visibleStart + listHeight);
  const truncate = (text) => {
    if (text.length > colWidth - 2) {
      return text.slice(0, colWidth - 4) + "..";
    }
    return text;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(Box_default, { flexDirection: "column", height: listHeight, width: colWidth, children: [
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(PaneHeading, { label: "History", focused: true }),
    /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Box_default, { flexDirection: "column", children: rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Box_default, { children: /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Text, { children: loading ? "loading..." : "no earlier versions" }) }) : rows.slice(visibleStart, visibleEnd).map((row, idx) => {
      const actualIndex = visibleStart + idx;
      const isSelected = actualIndex === selectedIndex;
      const truncated = truncate(row);
      return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(Box_default, { children: [
        isSelected && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Text, { bold: true, children: ">" }),
        !isSelected && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Text, { children: " " }),
        /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(Text, { children: truncated })
      ] }, idx);
    }) })
  ] });
}

// src/tui/Preview.tsx
var import_remove_markdown2 = __toESM(require_remove_markdown(), 1);
var import_jsx_runtime14 = __toESM(require_jsx_runtime(), 1);
function previewColWidth(width) {
  return Math.min(Math.floor(width * 0.6) - 1, 100);
}
function isMarkdownNote(note) {
  return note.systemTags.includes("markdown");
}
function Preview({ note, width, height, rendered = false, cursorLine, focused, inTrash = false }) {
  const previewHeight = height - 2;
  const colWidth = previewColWidth(width);
  if (!note) {
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Box_default, { flexDirection: "row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Divider, { height: previewHeight }),
      /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
        Box_default,
        {
          flexDirection: "column",
          height: previewHeight,
          width: colWidth,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(PaneHeading, { label: "Preview", focused }),
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Box_default, { flexDirection: "column", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Text, { children: "Select a note to preview" }) })
          ]
        }
      )
    ] });
  }
  const title = sanitizeForTerminal(note_utils_default(note).title);
  const content = sanitizeForTerminal(note.content || "");
  let displayContent;
  let processedLines = [];
  if (typeof cursorLine === "number") {
    displayContent = content;
  } else if (rendered && isMarkdownNote(note)) {
    processedLines = [];
    content.split("\n").forEach((raw) => {
      const headingMatch = raw.match(/^#{1,6}\s+(.*)$/);
      if (headingMatch) {
        processedLines.push({ text: (0, import_remove_markdown2.default)(headingMatch[1]), isHeading: true });
        return;
      }
      const checklistMatch = raw.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
      if (checklistMatch) {
        processedLines.push({
          text: (checklistMatch[1] === " " ? "\u2610 " : "\u2611 ") + (0, import_remove_markdown2.default)(checklistMatch[2]),
          isHeading: false
        });
        return;
      }
      const bulletMatch = raw.match(/^[-*]\s+(.*)$/);
      if (bulletMatch) {
        processedLines.push({ text: "\u2022 " + (0, import_remove_markdown2.default)(bulletMatch[1]), isHeading: false });
        return;
      }
      processedLines.push({ text: (0, import_remove_markdown2.default)(raw), isHeading: false });
    });
    displayContent = processedLines.map((p) => p.text).join("\n");
  } else {
    displayContent = content;
  }
  let bodyContent;
  let bodyHeadingFlags = [];
  if (typeof cursorLine !== "number") {
    const nl = displayContent.indexOf("\n");
    const firstLine = nl === -1 ? displayContent : displayContent.slice(0, nl);
    if (firstLine === title) {
      bodyContent = nl === -1 ? "" : displayContent.slice(nl + 1);
      bodyHeadingFlags = processedLines.length > 1 ? processedLines.slice(1).map((p) => p.isHeading) : [];
    } else {
      bodyContent = displayContent;
      bodyHeadingFlags = processedLines.map((p) => p.isHeading);
    }
  } else {
    bodyContent = displayContent;
    bodyHeadingFlags = processedLines.map((p) => p.isHeading);
  }
  const rows = wrapLines(bodyContent, colWidth);
  let cursorRowIndex = null;
  if (typeof cursorLine === "number") {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].line === cursorLine) {
        cursorRowIndex = i;
        break;
      }
    }
  }
  const shownTags = note.tags.filter((t) => !is_email_tag_default(t)).map((t) => sanitizeForTerminal(t));
  const avail = shownTags.length > 0 ? previewHeight - 3 : previewHeight - 2;
  let start2 = 0;
  let gutterRows = [];
  if (cursorRowIndex !== null && cursorRowIndex !== void 0) {
    const at = cursorRowIndex;
    start2 = at < avail ? 0 : at - avail + 1;
    gutterRows = rows.map((r, i) => {
      if (i - start2 < 0) return null;
      if (r.line === cursorLine) return ">";
      return " ";
    });
  }
  const visibleRows = rows.slice(start2, start2 + avail);
  const titleText = /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(PaneHeading, { label: "Preview: " + title, focused });
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Box_default, { flexDirection: "row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Divider, { height: previewHeight }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
      Box_default,
      {
        flexDirection: "column",
        height: previewHeight,
        width: colWidth,
        children: [
          titleText,
          shownTags.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Text, { children: shownTags.map((t) => "#" + t).join(" ") }) : null,
          inTrash ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Text, { children: " " }) : /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Text, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Text, { ...theme2.accent, children: "g" }),
            " add tag"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Box_default, { flexDirection: "column", children: visibleRows.map((row, idx) => {
            const gutter = gutterRows[start2 + idx] ?? "";
            const rowText = row.text || " ";
            const isHeading = bodyHeadingFlags[row.line] ?? false;
            const uncheckedMatch = rowText.match(/^(☐)(\s*)(.*)$/);
            const checkedMatch = rowText.match(/^(☑)(\s*)(.*)$/);
            let inner;
            if (uncheckedMatch || checkedMatch) {
              const match = uncheckedMatch || checkedMatch;
              const isUnchecked = !!uncheckedMatch;
              const trailing = match[2] + match[3];
              inner = /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(import_jsx_runtime14.Fragment, { children: [
                " ",
                /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Text, { ...isUnchecked ? theme2.muted : theme2.success, children: match[1] }),
                trailing
              ] });
            } else {
              inner = rowText;
            }
            return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(Text, { bold: isHeading, wrap: "truncate", children: [
              gutter,
              inner
            ] }, idx);
          }) })
        ]
      }
    )
  ] });
}

// src/tui/InlineEditor.tsx
var import_react13 = __toESM(require_react(), 1);

// node_modules/react-ink-textarea/dist/TextArea.js
var import_jsx_runtime15 = __toESM(require_jsx_runtime(), 1);
var import_react12 = __toESM(require_react(), 1);

// node_modules/react-ink-textarea/dist/constants.js
var DEFAULT_CURSOR_INTERVAL = 500;
var DEFAULT_TYPING_PAUSE = 450;
var DEFAULT_MAX_UNDO = 128;
var DEFAULT_UNDO_GROUP_DELAY = 750;
var DEFAULT_AUTO_NEW_LINE_LIMIT = 3;
var DEFAULT_INITIAL_LINE_COUNT = 2;
var DEFAULT_TAB_WIDTH = 4;
var DEFAULT_KEYBINDINGS = {
  Enter: true,
  "Ctrl+J": true,
  "Ctrl+Enter": true,
  "Shift+Enter": true,
  "Alt+Enter": true,
  Up: true,
  Down: true,
  Left: true,
  Right: true,
  "Alt+B": true,
  "Alt+F": true,
  "Ctrl+A": true,
  "Ctrl+E": true,
  "Ctrl+W": true,
  "Ctrl+U": true,
  "Ctrl+K": true,
  Backspace: true,
  Delete: true,
  "Alt+Backspace": true,
  "Ctrl+Z": true,
  "Ctrl+Y": true
};
var NAV_KEYBINDINGS = [
  "Up",
  "Down",
  "Left",
  "Right",
  "Alt+B",
  "Alt+F",
  "Ctrl+A",
  "Ctrl+E"
];

// node_modules/react-ink-textarea/node_modules/ansi-styles/index.js
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

// node_modules/react-ink-textarea/dist/textUtils.js
var segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
var graphemeWidth = (g, tabWidth = 1) => {
  if (g.length === 0)
    return 0;
  if (g === "	")
    return Math.max(1, tabWidth);
  const c = g.charCodeAt(0);
  if (g.length === 1) {
    if (c >= 32 && c < 127)
      return 1;
    if (c < 32)
      return 0;
  }
  return stringWidth(g);
};
var COMBINING_RANGES = [
  [768, 879],
  [6832, 6911],
  [7616, 7679],
  [8400, 8447],
  [65056, 65071]
];
var isLikelyCombining = (code) => {
  for (const [lo, hi] of COMBINING_RANGES) {
    if (code >= lo && code <= hi)
      return true;
  }
  return false;
};
var isHighSurrogate = (code) => code >= 55296 && code <= 56319;
var isLowSurrogate2 = (code) => code >= 56320 && code <= 57343;
var prevGraphemeOffset = (value, cursor) => {
  if (cursor <= 0)
    return 0;
  if (cursor > value.length)
    cursor = value.length;
  const prev = value.charCodeAt(cursor - 1);
  if (prev < 128 && !isLowSurrogate2(prev)) {
    return cursor - 1;
  }
  let lastStart = 0;
  for (const seg of segmenter.segment(value)) {
    if (seg.index >= cursor)
      break;
    lastStart = seg.index;
  }
  return lastStart;
};
var nextGraphemeOffset = (value, cursor) => {
  if (cursor >= value.length)
    return value.length;
  if (cursor < 0)
    cursor = 0;
  const here = value.charCodeAt(cursor);
  const next = cursor + 1 < value.length ? value.charCodeAt(cursor + 1) : -1;
  if (here < 128 && !isHighSurrogate(here) && (next === -1 || !isLikelyCombining(next))) {
    return cursor + 1;
  }
  for (const seg of segmenter.segment(value)) {
    const segEnd = seg.index + seg.segment.length;
    if (segEnd > cursor)
      return segEnd;
  }
  return value.length;
};
var countTrailingEmptyLines = (text) => {
  let count = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "\n") {
      count++;
    } else {
      break;
    }
  }
  return count;
};
var findLineStart = (value, cursor) => {
  if (cursor <= 0)
    return 0;
  const idx = value.lastIndexOf("\n", cursor - 1);
  return idx === -1 ? 0 : idx + 1;
};
var findLineEnd = (value, cursor) => {
  const idx = value.indexOf("\n", cursor);
  return idx === -1 ? value.length : idx;
};
var findPrevWordBoundary = (value, cursor) => {
  let pos = cursor - 1;
  while (pos >= 0 && /\s/.test(value[pos])) {
    pos -= 1;
  }
  while (pos >= 0 && !/\s/.test(value[pos])) {
    pos -= 1;
  }
  return pos + 1;
};
var findNextWordBoundary = (value, cursor) => {
  let pos = cursor;
  while (pos < value.length && !/\s/.test(value[pos])) {
    pos += 1;
  }
  while (pos < value.length && /\s/.test(value[pos])) {
    pos += 1;
  }
  return pos;
};
var getCursorLineAndColumn = (value, cursor) => {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < cursor; i++) {
    if (value[i] === "\n") {
      line += 1;
      lastLineStart = i + 1;
    }
  }
  return { line, column: cursor - lastLineStart };
};
var computeVisualUpCursor = (value, cursor, lineWidth, rows) => {
  if (rows && rows.length > 0 && lineWidth > 0) {
    const { line, column } = getCursorLineAndColumn(value, cursor);
    const idx = visualRowForCursor(rows, line, column, lineWidth);
    if (idx <= 0)
      return findLineStart(value, cursor);
    const cur = rows[idx];
    const prev = rows[idx - 1];
    if (prev.isVirtualLine)
      return findLineStart(value, cursor);
    const offsetInCur = cursor - cur.absStart;
    return prev.absStart + Math.min(offsetInCur, prev.text.length);
  }
  const { line: currentLine, column: col } = getCursorLineAndColumn(value, cursor);
  const vRow = Math.floor(col / lineWidth);
  const vCol = col % lineWidth;
  if (vRow > 0) {
    const lineStart = findLineStart(value, cursor);
    const lineEnd = findLineEnd(value, cursor);
    return Math.min(lineStart + (vRow - 1) * lineWidth + vCol, lineEnd);
  }
  if (currentLine === 0)
    return findLineStart(value, cursor);
  const prevLineEnd = findLineStart(value, cursor) - 1;
  const prevLineStart = findLineStart(value, prevLineEnd);
  const prevLineLength = prevLineEnd - prevLineStart;
  const prevLastVRow = Math.floor(prevLineLength / lineWidth);
  return Math.min(prevLineStart + prevLastVRow * lineWidth + vCol, prevLineStart + prevLineLength);
};
var computeVisualDownCursor = (value, cursor, lineWidth, rows) => {
  if (rows && rows.length > 0 && lineWidth > 0) {
    const { line, column: column2 } = getCursorLineAndColumn(value, cursor);
    const idx = visualRowForCursor(rows, line, column2, lineWidth);
    if (idx < 0)
      return null;
    let nextIdx = idx + 1;
    while (nextIdx < rows.length && rows[nextIdx].isVirtualLine)
      nextIdx += 1;
    if (nextIdx >= rows.length)
      return null;
    const cur = rows[idx];
    const next = rows[nextIdx];
    const offsetInCur = cursor - cur.absStart;
    return next.absStart + Math.min(offsetInCur, next.text.length);
  }
  const { column } = getCursorLineAndColumn(value, cursor);
  const currentLineStart = findLineStart(value, cursor);
  const currentLineEnd = findLineEnd(value, cursor);
  const currentLineLength = currentLineEnd - currentLineStart;
  const vRow = Math.floor(column / lineWidth);
  const vCol = column % lineWidth;
  const lastVRow = Math.floor(currentLineLength / lineWidth);
  if (vRow < lastVRow) {
    return Math.min(currentLineStart + (vRow + 1) * lineWidth + vCol, currentLineEnd);
  }
  if (currentLineEnd >= value.length)
    return null;
  const nextLineStart = currentLineEnd + 1;
  const nextLineEnd = findLineEnd(value, nextLineStart);
  return Math.min(nextLineStart + vCol, nextLineEnd);
};
var computeLabels = (value, labels) => {
  if (labels.length === 0 || value.length === 0)
    return [];
  const out = new Array(value.length).fill("text");
  for (const rule of labels) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g";
    const re = new RegExp(rule.pattern.source, flags);
    for (const m of value.matchAll(re)) {
      const start2 = m.index ?? 0;
      const end = start2 + m[0].length;
      if (end === start2)
        continue;
      const resolved = typeof rule.label === "string" ? rule.label : rule.label(m);
      if (!resolved)
        continue;
      for (let i = start2; i < end; i++) {
        if (out[i] === "text")
          out[i] = resolved;
      }
    }
  }
  return out;
};
var computeSegments = (labelByChar) => {
  const segs = [];
  if (labelByChar.length === 0)
    return segs;
  let start2 = 0;
  for (let i = 1; i <= labelByChar.length; i++) {
    if (i === labelByChar.length || labelByChar[i] !== labelByChar[start2]) {
      segs.push({ start: start2, end: i, label: labelByChar[start2] });
      start2 = i;
    }
  }
  return segs;
};
var getLabelAt = (labelByChar, cursor) => {
  if (cursor < 0 || cursor >= labelByChar.length)
    return "text";
  return labelByChar[cursor];
};
var findSegmentIndex = (segments, cursor) => {
  if (segments.length === 0)
    return 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (cursor >= s.start && cursor < s.end)
      return i;
  }
  return segments.length;
};
var buildVisualRows = (lines, lineWidthAt, cursorLine, cursorColumn, initialLineCount, tabWidth = 1) => {
  const rows = [];
  let absStart = 0;
  const resolveWidth = typeof lineWidthAt === "function" ? lineWidthAt : () => lineWidthAt;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    const lineAbsStart = absStart;
    const firstWidth = resolveWidth(lineIdx, 0);
    if (firstWidth <= 0 || lineText.length === 0) {
      rows.push({
        lineIdx,
        chunkIdx: 0,
        absStart: lineAbsStart,
        text: lineText,
        isLastChunkOfLine: true,
        isVirtualLine: false
      });
    } else {
      let chunkBuf = "";
      let chunkVisualWidth = 0;
      let chunkSliceStart = 0;
      let chunkIdx = 0;
      let lastChunkVisualWidth = 0;
      const widthForCurrentChunk = () => Math.max(1, resolveWidth(lineIdx, chunkIdx));
      const flushChunk = (isLast) => {
        rows.push({
          lineIdx,
          chunkIdx,
          absStart: lineAbsStart + chunkSliceStart,
          text: chunkBuf,
          isLastChunkOfLine: isLast,
          isVirtualLine: false
        });
        lastChunkVisualWidth = chunkVisualWidth;
        chunkIdx += 1;
        chunkSliceStart += chunkBuf.length;
        chunkBuf = "";
        chunkVisualWidth = 0;
      };
      const isAsciiSimple = (() => {
        for (let i = 0; i < lineText.length; i++) {
          const c = lineText.charCodeAt(i);
          if (c >= 128 || c < 32)
            return false;
        }
        return true;
      })();
      if (isAsciiSimple) {
        let i = 0;
        while (i < lineText.length) {
          const w = widthForCurrentChunk();
          chunkBuf = lineText.slice(i, i + w);
          chunkVisualWidth = chunkBuf.length;
          i += chunkBuf.length;
          flushChunk(i >= lineText.length);
        }
      } else {
        for (const seg of segmenter.segment(lineText)) {
          const g = seg.segment;
          const gw = graphemeWidth(g, tabWidth);
          if (chunkVisualWidth + gw > widthForCurrentChunk() && chunkBuf.length > 0) {
            flushChunk(false);
          }
          chunkBuf += g;
          chunkVisualWidth += gw;
        }
        flushChunk(true);
      }
      const isCursorLine = lineIdx === cursorLine;
      const lastChunkWidth = resolveWidth(lineIdx, Math.max(0, chunkIdx - 1));
      const cursorWantsExtraRow = isCursorLine && cursorColumn === lineText.length && cursorColumn > 0 && lastChunkVisualWidth === lastChunkWidth;
      if (cursorWantsExtraRow) {
        const prev = rows[rows.length - 1];
        rows[rows.length - 1] = { ...prev, isLastChunkOfLine: false };
        rows.push({
          lineIdx,
          chunkIdx,
          absStart: lineAbsStart + lineText.length,
          text: "",
          isLastChunkOfLine: true,
          isVirtualLine: false
        });
      }
    }
    absStart = lineAbsStart + lineText.length + 1;
  }
  const padCount = Math.max(0, initialLineCount - lines.length);
  for (let p = 0; p < padCount; p++) {
    rows.push({
      lineIdx: lines.length + p,
      chunkIdx: 0,
      absStart,
      text: "",
      isLastChunkOfLine: true,
      isVirtualLine: true
    });
  }
  return rows;
};
var visualRowForCursor = (rows, cursorLine, cursorColumn, lineWidth) => {
  if (lineWidth <= 0) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.lineIdx === cursorLine && !row.isVirtualLine)
        return i;
    }
    return -1;
  }
  let lineAbsStart = -1;
  let pick = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.lineIdx !== cursorLine || row.isVirtualLine) {
      if (lineAbsStart >= 0)
        break;
      continue;
    }
    if (lineAbsStart < 0)
      lineAbsStart = row.absStart;
    const chunkStartCol = row.absStart - lineAbsStart;
    if (chunkStartCol <= cursorColumn) {
      pick = i;
    } else {
      break;
    }
  }
  return pick;
};
var getCursorFromLineColumn = (value, line, column) => {
  const lines = value.split("\n");
  const numLines = lines.length;
  const clampedLine = Math.max(0, Math.min(line, numLines - 1));
  const targetLine = lines[clampedLine] ?? "";
  let clampedCol;
  if (line > numLines - 1) {
    clampedCol = targetLine.length;
  } else {
    clampedCol = Math.max(0, Math.min(column, targetLine.length));
  }
  let cursor = 0;
  for (let i = 0; i < clampedLine; i++) {
    cursor += lines[i].length + 1;
  }
  cursor += clampedCol;
  return { cursor, clampedLine, clampedCol };
};

// node_modules/react-ink-textarea/dist/hooks/useCursorState.js
var import_react8 = __toESM(require_react(), 1);
var normalizeNewlines = (s) => s.indexOf("\r") === -1 ? s : s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
var useCursorState = ({ controlledValue, controlledPosition, onChange, onCursorAttempt }) => {
  const isControlled = controlledValue !== void 0;
  const [internalValue, setInternalValue] = (0, import_react8.useState)("");
  const [internalCursor, setInternalCursor] = (0, import_react8.useState)(0);
  const rawValue = isControlled ? controlledValue : internalValue;
  const value = normalizeNewlines(rawValue);
  const valueRef = (0, import_react8.useRef)(value);
  (0, import_react8.useEffect)(() => {
    valueRef.current = value;
  }, [value]);
  const processExternalPosition = () => {
    if (controlledPosition === void 0) {
      const clamped = Math.max(0, Math.min(internalCursor, value.length));
      return { cursor: clamped, wasClamped: clamped !== internalCursor };
    }
    const [line, col] = controlledPosition;
    const { cursor: cursor2, clampedLine, clampedCol } = getCursorFromLineColumn(value, line, col);
    return {
      cursor: cursor2,
      wasClamped: line !== clampedLine || col !== clampedCol
    };
  };
  const { cursor, wasClamped } = processExternalPosition();
  const lastClampDispatchRef = (0, import_react8.useRef)(null);
  (0, import_react8.useEffect)(() => {
    if (!wasClamped)
      return;
    if (lastClampDispatchRef.current === cursor)
      return;
    lastClampDispatchRef.current = cursor;
    onCursorAttempt?.(cursor);
  }, [wasClamped, cursor]);
  const setValue = (updater) => {
    const newValue = typeof updater === "function" ? updater(value) : updater;
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  };
  const isCursorControlled = controlledPosition !== void 0;
  const setCursor = (updater, valueForCalculation) => {
    const newCursor = typeof updater === "function" ? updater(cursor) : updater;
    if (!isCursorControlled) {
      setInternalCursor(newCursor);
    }
    if (onCursorAttempt) {
      onCursorAttempt(newCursor, valueForCalculation);
    }
  };
  return { value, cursor, setValue, setCursor };
};

// node_modules/react-ink-textarea/dist/hooks/useUndo.js
var import_react9 = __toESM(require_react(), 1);
var useUndo = ({ maxUndo, undoGroupDelay }) => {
  const undoStack = (0, import_react9.useRef)([]);
  const redoStack = (0, import_react9.useRef)([]);
  const lastMutationTime = (0, import_react9.useRef)(0);
  const lastMutationType = (0, import_react9.useRef)(null);
  const pushCapped = (stack, entry) => {
    if (stack.length >= maxUndo) {
      stack.shift();
    }
    stack.push(entry);
  };
  const pushUndo = (type, value, cursor) => {
    redoStack.current.length = 0;
    const now = Date.now();
    const elapsed = now - lastMutationTime.current;
    const sameType = type === lastMutationType.current;
    lastMutationTime.current = now;
    lastMutationType.current = type;
    if (elapsed < undoGroupDelay && sameType) {
      return;
    }
    pushCapped(undoStack.current, { value, cursor });
  };
  const undo = (value, cursor) => {
    const entry = undoStack.current.pop();
    if (entry) {
      pushCapped(redoStack.current, { value, cursor });
    }
    return entry;
  };
  const redo = (value, cursor) => {
    const entry = redoStack.current.pop();
    if (entry) {
      pushCapped(undoStack.current, { value, cursor });
    }
    return entry;
  };
  const resetMutationTracking = () => {
    lastMutationTime.current = 0;
    lastMutationType.current = null;
  };
  return { pushUndo, undo, redo, resetMutationTracking };
};

// node_modules/react-ink-textarea/dist/hooks/useCursorBlink.js
var import_react10 = __toESM(require_react(), 1);
var useCursorBlink = ({ isActive, cursorInterval, typingPause, disableCursorBlink }) => {
  const [cursorVisible, setCursorVisible] = (0, import_react10.useState)(true);
  const blinkIntervalRef = (0, import_react10.useRef)(null);
  const typingTimeoutRef = (0, import_react10.useRef)(null);
  const isActiveRef = (0, import_react10.useRef)(isActive);
  (0, import_react10.useEffect)(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  const clearAll = () => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };
  (0, import_react10.useEffect)(() => {
    if (!isActive || disableCursorBlink) {
      clearAll();
      setCursorVisible(true);
      return;
    }
    blinkIntervalRef.current = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, cursorInterval);
    return clearAll;
  }, [isActive, cursorInterval, disableCursorBlink]);
  const resetBlink = () => {
    setCursorVisible(true);
    clearAll();
    if (disableCursorBlink)
      return;
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      if (!isActiveRef.current)
        return;
      blinkIntervalRef.current = setInterval(() => {
        setCursorVisible((prev) => !prev);
      }, cursorInterval);
    }, typingPause);
  };
  return { cursorVisible, resetBlink };
};

// node_modules/react-ink-textarea/dist/hooks/useKeyboardInput.js
var useKeyboardInput = ({ isActive, value, cursor, keybindings, autoNewLineLimit, onSubmit, onFirstLineUp, onLastLineDown, onFirstCharacterLeft, onLastCharacterRight, onTab, setValue, setCursor, pushUndo, undo, redo, resetMutationTracking, resetBlink, lineWidth, visualRows }) => {
  use_paste_default((text) => {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalized)
      return;
    resetBlink();
    pushUndo("insert", value, cursor);
    const newValue = value.slice(0, cursor) + normalized + value.slice(cursor);
    setValue(newValue);
    setCursor(cursor + normalized.length, newValue);
    resetMutationTracking();
  }, { isActive });
  use_input_default((input, key) => {
    const isCtrlJ = key.ctrl && input === "j";
    const isCtrlEnter = key.return && key.ctrl || input === "\x1B[27;5;13~" || input.endsWith("[27;5;13~");
    const isShiftEnter = key.return && key.shift || input === "\x1B[27;2;13~" || input.endsWith("[27;2;13~");
    const isAltEnter = key.return && key.meta || input === "\x1B[27;3;13~" || input.endsWith("[27;3;13~");
    const newlineChord = isCtrlJ ? "Ctrl+J" : isCtrlEnter ? "Ctrl+Enter" : isShiftEnter ? "Shift+Enter" : isAltEnter ? "Alt+Enter" : null;
    if (newlineChord) {
      if (!keybindings[newlineChord])
        return;
      resetBlink();
      pushUndo("insert", value, cursor);
      const newValue = value.slice(0, cursor) + "\n" + value.slice(cursor);
      setValue(newValue);
      setCursor(cursor + 1, newValue);
      return;
    }
    if (key.return) {
      if (!keybindings.Enter)
        return;
      onSubmit(value);
      return;
    }
    if (key.upArrow) {
      if (!keybindings.Up)
        return;
      const { line, column } = getCursorLineAndColumn(value, cursor);
      if (lineWidth > 0) {
        const idx = visualRowForCursor(visualRows, line, column, lineWidth);
        if (idx <= 0) {
          if (onFirstLineUp)
            onFirstLineUp();
          return;
        }
        resetBlink();
        setCursor((c) => computeVisualUpCursor(value, c, lineWidth, visualRows));
      } else {
        if (line === 0) {
          if (onFirstLineUp)
            onFirstLineUp();
          return;
        }
        resetBlink();
        setCursor((c) => {
          const { line: currentLine, column: col } = getCursorLineAndColumn(value, c);
          if (currentLine === 0)
            return findLineStart(value, c);
          const prevLineEnd = findLineStart(value, c) - 1;
          const prevLineStart = findLineStart(value, prevLineEnd);
          const prevLineLength = prevLineEnd - prevLineStart;
          return prevLineStart + Math.min(col, prevLineLength);
        });
      }
      return;
    }
    if (key.downArrow) {
      if (!keybindings.Down)
        return;
      resetBlink();
      if (lineWidth > 0) {
        const newPos = computeVisualDownCursor(value, cursor, lineWidth, visualRows);
        if (newPos !== null) {
          setCursor(newPos);
        } else {
          const trailingEmpty = countTrailingEmptyLines(value);
          if (trailingEmpty >= autoNewLineLimit) {
            if (onLastLineDown) {
              onLastLineDown();
              return;
            }
            setCursor(value.length);
            return;
          }
          pushUndo("insert", value, cursor);
          const newValue = value + "\n";
          setValue(newValue);
          setCursor(newValue.length, newValue);
        }
      } else {
        const currentLineEnd = findLineEnd(value, cursor);
        const isOnLastLine = currentLineEnd >= value.length;
        if (isOnLastLine) {
          const trailingEmpty = countTrailingEmptyLines(value);
          if (trailingEmpty >= autoNewLineLimit) {
            if (onLastLineDown) {
              onLastLineDown();
              return;
            }
            setCursor(value.length);
            return;
          }
          pushUndo("insert", value, cursor);
          const newValue = value + "\n";
          setValue(newValue);
          setCursor(newValue.length, newValue);
        } else {
          setCursor((c) => {
            const { column } = getCursorLineAndColumn(value, c);
            const nextLineStart = currentLineEnd + 1;
            const nextLineEnd = findLineEnd(value, nextLineStart);
            const nextLineLength = nextLineEnd - nextLineStart;
            return nextLineStart + Math.min(column, nextLineLength);
          });
        }
      }
      return;
    }
    if (key.leftArrow) {
      if (!keybindings.Left)
        return;
      if (cursor === 0) {
        if (onFirstCharacterLeft)
          onFirstCharacterLeft();
        return;
      }
      resetBlink();
      setCursor((c) => prevGraphemeOffset(value, c));
      return;
    }
    if (key.rightArrow) {
      if (!keybindings.Right)
        return;
      if (cursor === value.length) {
        if (onLastCharacterRight)
          onLastCharacterRight();
        return;
      }
      resetBlink();
      setCursor((c) => nextGraphemeOffset(value, c));
      return;
    }
    if (key.meta && input === "b") {
      if (!keybindings["Alt+B"])
        return;
      resetBlink();
      setCursor((c) => findPrevWordBoundary(value, c));
      return;
    }
    if (key.meta && input === "f") {
      if (!keybindings["Alt+F"])
        return;
      resetBlink();
      setCursor((c) => findNextWordBoundary(value, c));
      return;
    }
    if (key.ctrl && input === "a") {
      if (!keybindings["Ctrl+A"])
        return;
      resetBlink();
      setCursor((c) => findLineStart(value, c));
      return;
    }
    if (key.ctrl && input === "e") {
      if (!keybindings["Ctrl+E"])
        return;
      resetBlink();
      setCursor((c) => findLineEnd(value, c));
      return;
    }
    if (key.ctrl && input === "w") {
      if (!keybindings["Ctrl+W"])
        return;
      resetBlink();
      pushUndo("delete", value, cursor);
      const boundary = findPrevWordBoundary(value, cursor);
      const newValue = value.slice(0, boundary) + value.slice(cursor);
      setValue(newValue);
      setCursor(boundary, newValue);
      resetMutationTracking();
      return;
    }
    const killToLineStart = () => {
      resetBlink();
      const lineStart = findLineStart(value, cursor);
      if (lineStart === cursor) {
        if (cursor === 0)
          return;
        pushUndo("delete", value, cursor);
        const target = cursor - 1;
        const newValue2 = value.slice(0, target) + value.slice(cursor);
        setValue(newValue2);
        setCursor(target, newValue2);
        resetMutationTracking();
        return;
      }
      pushUndo("delete", value, cursor);
      const newValue = value.slice(0, lineStart) + value.slice(cursor);
      setValue(newValue);
      setCursor(lineStart, newValue);
      resetMutationTracking();
    };
    if (key.ctrl && input === "u") {
      if (!keybindings["Ctrl+U"])
        return;
      killToLineStart();
      return;
    }
    if (key.ctrl && input === "k") {
      if (!keybindings["Ctrl+K"])
        return;
      resetBlink();
      pushUndo("delete", value, cursor);
      const lineEnd = findLineEnd(value, cursor);
      const killEnd = value[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
      const newValue = value.slice(0, cursor) + value.slice(killEnd);
      setValue(newValue);
      setCursor(cursor, newValue);
      resetMutationTracking();
      return;
    }
    if (key.backspace || key.delete) {
      if (key.super && key.backspace) {
        if (!keybindings["Ctrl+U"])
          return;
        killToLineStart();
        return;
      }
      if (key.meta) {
        if (!keybindings["Alt+Backspace"])
          return;
        resetBlink();
        pushUndo("delete", value, cursor);
        const boundary = findPrevWordBoundary(value, cursor);
        const newValue = value.slice(0, boundary) + value.slice(cursor);
        setValue(newValue);
        setCursor(boundary, newValue);
        resetMutationTracking();
        return;
      }
      const chord = key.backspace ? "Backspace" : "Delete";
      if (!keybindings[chord])
        return;
      if (cursor > 0) {
        resetBlink();
        pushUndo("delete", value, cursor);
        const target = prevGraphemeOffset(value, cursor);
        const newValue = value.slice(0, target) + value.slice(cursor);
        setValue(newValue);
        setCursor(target, newValue);
      }
      return;
    }
    if (key.ctrl && input === "z") {
      if (!keybindings["Ctrl+Z"])
        return;
      resetBlink();
      const entry = undo(value, cursor);
      if (entry) {
        setValue(entry.value);
        setCursor(entry.cursor);
      }
      resetMutationTracking();
      return;
    }
    if (key.ctrl && input === "y") {
      if (!keybindings["Ctrl+Y"])
        return;
      resetBlink();
      const entry = redo(value, cursor);
      if (entry) {
        setValue(entry.value);
        setCursor(entry.cursor);
      }
      resetMutationTracking();
      return;
    }
    if (key.tab) {
      if (onTab)
        onTab(!!key.shift);
      return;
    }
    if (key.ctrl || key.escape) {
      return;
    }
    if (input && input.length > 0) {
      resetBlink();
      pushUndo("insert", value, cursor);
      const newValue = value.slice(0, cursor) + input + value.slice(cursor);
      setValue(newValue);
      setCursor(cursor + input.length, newValue);
    }
  }, { isActive });
};

// node_modules/react-ink-textarea/dist/hooks/useViewport.js
var import_react11 = __toESM(require_react(), 1);
var useViewport = ({ rowCount, viewportLines, cursorRowIndex }) => {
  const [scrollOffset, setScrollOffset] = (0, import_react11.useState)(0);
  const cap = Number.isFinite(viewportLines) ? Math.max(1, viewportLines) : Number.POSITIVE_INFINITY;
  (0, import_react11.useEffect)(() => {
    if (!Number.isFinite(cap)) {
      if (scrollOffset !== 0)
        setScrollOffset(0);
      return;
    }
    const maxOffset = Math.max(0, rowCount - cap);
    let next = scrollOffset;
    if (cursorRowIndex >= 0 && cursorRowIndex < scrollOffset) {
      next = cursorRowIndex;
    } else if (cursorRowIndex >= scrollOffset + cap) {
      next = cursorRowIndex - cap + 1;
    }
    next = Math.min(maxOffset, Math.max(0, next));
    if (next !== scrollOffset)
      setScrollOffset(next);
  }, [cursorRowIndex, rowCount, cap, scrollOffset]);
  if (!Number.isFinite(cap)) {
    return { visibleRowStart: 0, visibleRowEnd: rowCount };
  }
  const start2 = Math.min(scrollOffset, Math.max(0, rowCount - cap));
  const end = Math.min(rowCount, start2 + cap);
  return { visibleRowStart: start2, visibleRowEnd: end };
};

// node_modules/react-ink-textarea/dist/TextArea.js
var MAX_MEASURE_PASSES = 24;
var DEFAULT_TEXT_STYLE = {};
var DEFAULT_INVISIBLE_STYLE = { color: "gray", dim: true };
var mergeStyleProps = (base, override) => ({ ...base, ...override ?? {} });
var resolveStyles = (input) => {
  const byLabel = {};
  if (input) {
    for (const [k, v] of Object.entries(input)) {
      if (k === "text" || k === "invisibleCharacter" || !v)
        continue;
      byLabel[k] = { ...v };
    }
  }
  return {
    text: mergeStyleProps(DEFAULT_TEXT_STYLE, input?.text),
    invisibleCharacter: mergeStyleProps(DEFAULT_INVISIBLE_STYLE, input?.invisibleCharacter),
    byLabel
  };
};
var styleToTextProps = (s) => ({
  color: s.color,
  bold: s.bold,
  italic: s.italic,
  underline: s.underline,
  strikethrough: s.strikethrough,
  dimColor: s.dim,
  inverse: s.inverse,
  backgroundColor: s.bgColor
});
var graphemeSegmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
var isAsciiOnly = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 128 || c < 32)
      return false;
  }
  return true;
};
var renderRowBody = ({ chunk, chunkAbsStart, cursorPos, cursorVisible, isCursorAtLineEnd, inv, showAnyInvisible, invisibleProps, labelByChar, labelTextProps, tabWidth }) => {
  const nodes = [];
  let buf = "";
  let bufKey = null;
  let segIdx = 0;
  const propsForKey = (key) => {
    const sep = key.indexOf("|");
    const label = key.slice(0, sep);
    const mode = key.slice(sep + 1);
    if (mode === "I")
      return invisibleProps;
    return label && label !== "text" ? labelTextProps[label] : void 0;
  };
  const flush = () => {
    if (buf.length === 0)
      return;
    const props = propsForKey(bufKey);
    nodes.push((0, import_jsx_runtime15.jsx)(Text, { ...props, children: buf }, `s${segIdx++}`));
    buf = "";
    bufKey = null;
  };
  const steps = [];
  if (isAsciiOnly(chunk)) {
    for (let i = 0; i < chunk.length; i++) {
      steps.push({ unit: chunk[i], codeUnitOffset: i });
    }
  } else {
    for (const seg of graphemeSegmenter.segment(chunk)) {
      steps.push({ unit: seg.segment, codeUnitOffset: seg.index });
    }
  }
  for (const step of steps) {
    const g = step.unit;
    const i = step.codeUnitOffset;
    let isInv;
    let display;
    if (g === "	") {
      if (showAnyInvisible && inv.tab) {
        display = "\u2192" + " ".repeat(Math.max(0, tabWidth - 1));
        isInv = true;
      } else {
        display = " ".repeat(Math.max(1, tabWidth));
        isInv = false;
      }
    } else {
      isInv = showAnyInvisible && g === " " && inv.space;
      display = isInv ? "\xB7" : g;
    }
    const charLabel = isInv ? "" : labelByChar[chunkAbsStart + i] ?? "text";
    const isCur = i === cursorPos;
    const cellStr = isCur ? cursorVisible ? g === "	" ? `\x1B[7m${display.charAt(0)}\x1B[27m${display.slice(1)}` : `\x1B[7m${display}\x1B[27m` : display === " " && isCursorAtLineEnd ? " " : display : display;
    const key = `${charLabel}|${isInv ? "I" : "T"}`;
    if (key !== bufKey)
      flush();
    bufKey = key;
    buf += cellStr;
  }
  if (cursorPos === chunk.length) {
    const cursorStr = cursorVisible ? "\x1B[7m \x1B[27m" : " ";
    const key = "text|T";
    if (key !== bufKey)
      flush();
    bufKey = key;
    buf += cursorStr;
  }
  flush();
  return nodes;
};
var TextArea = ({ ref, focus: isActive, onSubmit, placeholder, linePrefix, lineSuffix, cursorInterval = DEFAULT_CURSOR_INTERVAL, typingPause = DEFAULT_TYPING_PAUSE, maxUndo = DEFAULT_MAX_UNDO, undoGroupDelay = DEFAULT_UNDO_GROUP_DELAY, autoNewLineLimit = DEFAULT_AUTO_NEW_LINE_LIMIT, highlightActiveLine = false, activeLineColor = void 0, disableArrowNavigation = false, disableCursorBlink = false, value: controlledValue, cursorPosition: controlledPosition, onChange, onCursorChange, onFirstLineUp, onLastLineDown, onFirstCharacterLeft, onLastCharacterRight, onTab, initialLineCount = DEFAULT_INITIAL_LINE_COUNT, viewportLines, tabWidth = DEFAULT_TAB_WIDTH, onDimensions, showInvisibles = false, styles: styles2, labels, keybindings }) => {
  const resolvedKeybindings = (0, import_react12.useMemo)(() => {
    const merged = {
      ...DEFAULT_KEYBINDINGS,
      ...keybindings ?? {}
    };
    if (disableArrowNavigation === true) {
      for (const k of NAV_KEYBINDINGS)
        merged[k] = false;
    }
    return merged;
  }, [keybindings, disableArrowNavigation]);
  const resolvedStyles = (0, import_react12.useMemo)(() => resolveStyles(styles2), [styles2]);
  const textProps = (0, import_react12.useMemo)(() => styleToTextProps(resolvedStyles.text), [resolvedStyles.text]);
  const invisibleProps = (0, import_react12.useMemo)(() => styleToTextProps(resolvedStyles.invisibleCharacter), [resolvedStyles.invisibleCharacter]);
  const labelTextProps = (0, import_react12.useMemo)(() => {
    const out = {};
    for (const [k, v] of Object.entries(resolvedStyles.byLabel)) {
      out[k] = styleToTextProps(v);
    }
    return out;
  }, [resolvedStyles.byLabel]);
  const inv = typeof showInvisibles === "boolean" ? {
    space: showInvisibles,
    tab: showInvisibles,
    newline: showInvisibles
  } : {
    space: !!showInvisibles.space,
    tab: !!showInvisibles.tab,
    newline: !!showInvisibles.newline
  };
  const showAnyInvisible = inv.space || inv.tab || inv.newline;
  const dispatchCursorRef = (0, import_react12.useRef)(null);
  const { value, cursor, setValue, setCursor } = useCursorState({
    controlledValue,
    controlledPosition,
    onChange,
    onCursorAttempt: (newCursor, valueForCalc) => {
      dispatchCursorRef.current?.(newCursor, valueForCalc);
    }
  });
  (0, import_react12.useImperativeHandle)(ref, () => ({
    insert: (text) => {
      if (!text)
        return;
      const newValue = value.slice(0, cursor) + text + value.slice(cursor);
      setValue(newValue);
      setCursor(cursor + text.length, newValue);
    }
  }), [value, cursor, setValue, setCursor]);
  const lines = (0, import_react12.useMemo)(() => value.split("\n"), [value]);
  const placeholderLines = (0, import_react12.useMemo)(() => placeholder ? placeholder.split("\n") : [], [placeholder]);
  const placeholderLineStartOffsets = (0, import_react12.useMemo)(() => {
    const offsets = new Array(placeholderLines.length);
    let offset = 0;
    for (let i = 0; i < placeholderLines.length; i++) {
      offsets[i] = offset;
      offset += placeholderLines[i].length + 1;
    }
    return offsets;
  }, [placeholderLines]);
  const contentRef = (0, import_react12.useRef)(null);
  const { width: measuredWidth } = use_box_metrics_default(contentRef);
  const [lineWidth, setLineWidth] = (0, import_react12.useState)(0);
  (0, import_react12.useEffect)(() => {
    if (measuredWidth > 0) {
      setLineWidth((prev) => prev === measuredWidth ? prev : measuredWidth);
    }
  }, [measuredWidth]);
  (0, import_react12.useEffect)(() => {
    if (measuredWidth > 0) {
      onDimensions?.(measuredWidth);
    }
  }, [measuredWidth, onDimensions]);
  const measurePerLine = linePrefix != null || lineSuffix != null;
  const chunkKey = (lineIdx, chunkIdx) => `${lineIdx}:${chunkIdx}`;
  const chunkRefs = (0, import_react12.useRef)(/* @__PURE__ */ new Map());
  const getChunkRef = (lineIdx, chunkIdx) => {
    const key = chunkKey(lineIdx, chunkIdx);
    let r = chunkRefs.current.get(key);
    if (!r) {
      r = { current: null };
      chunkRefs.current.set(key, r);
    }
    return r;
  };
  const [chunkWidths, setChunkWidths] = (0, import_react12.useState)({});
  const [baseLineWidth, setBaseLineWidth] = (0, import_react12.useState)(0);
  const recentLayoutsRef = (0, import_react12.useRef)([]);
  const measureHardCapRef = (0, import_react12.useRef)(0);
  const getChunkWidth = (lineIdx, chunkIdx) => {
    if (!measurePerLine)
      return lineWidth;
    const w = chunkWidths[chunkKey(lineIdx, chunkIdx)];
    if (w != null && w > 0)
      return w;
    return baseLineWidth > 0 ? baseLineWidth : lineWidth;
  };
  (0, import_react12.useEffect)(() => {
    if (!measurePerLine) {
      if (baseLineWidth !== 0)
        setBaseLineWidth(0);
      setChunkWidths((prev) => Object.keys(prev).length ? {} : prev);
      return;
    }
    const next = {};
    let base = 0;
    for (const [key, ref2] of chunkRefs.current) {
      const node = ref2.current;
      if (!node)
        continue;
      const { width } = measure_element_default(node);
      if (width > 0) {
        next[key] = width;
        if (width > base)
          base = width;
      }
    }
    const baseChanged = base !== baseLineWidth;
    const nextKeys = Object.keys(next);
    const prevKeys = Object.keys(chunkWidths);
    const widthsChanged = prevKeys.length !== nextKeys.length || !nextKeys.every((k) => chunkWidths[k] === next[k]);
    if (!baseChanged && !widthsChanged) {
      recentLayoutsRef.current = [];
      measureHardCapRef.current = 0;
      return;
    }
    const sig = base + "|" + nextKeys.sort().map((k) => k + ":" + next[k]).join(",");
    if (recentLayoutsRef.current.includes(sig) || measureHardCapRef.current >= MAX_MEASURE_PASSES) {
      return;
    }
    recentLayoutsRef.current.push(sig);
    if (recentLayoutsRef.current.length > 8)
      recentLayoutsRef.current.shift();
    measureHardCapRef.current += 1;
    if (baseChanged)
      setBaseLineWidth(base);
    if (widthsChanged)
      setChunkWidths(next);
  });
  const { pushUndo, undo, redo, resetMutationTracking } = useUndo({
    maxUndo,
    undoGroupDelay
  });
  const { cursorVisible, resetBlink } = useCursorBlink({
    isActive,
    cursorInterval,
    typingPause,
    disableCursorBlink
  });
  const { line: cursorLine, column: cursorColumn } = getCursorLineAndColumn(value, cursor);
  const visualRows = (0, import_react12.useMemo)(
    () => buildVisualRows(lines, getChunkWidth, isActive ? cursorLine : -1, isActive ? cursorColumn : 0, initialLineCount, tabWidth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      lines,
      lineWidth,
      chunkWidths,
      baseLineWidth,
      measurePerLine,
      isActive,
      cursorLine,
      cursorColumn,
      initialLineCount,
      tabWidth
    ]
  );
  useKeyboardInput({
    isActive,
    value,
    cursor,
    keybindings: resolvedKeybindings,
    autoNewLineLimit,
    onSubmit,
    onFirstLineUp,
    onLastLineDown,
    onFirstCharacterLeft,
    onLastCharacterRight,
    onTab,
    setValue,
    setCursor,
    pushUndo,
    undo,
    redo,
    resetMutationTracking,
    resetBlink,
    lineWidth: getChunkWidth(cursorLine, 0),
    visualRows
  });
  const totalLines = Math.max(lines.length, initialLineCount);
  const hasContent = value.length > 0;
  const labelByChar = (0, import_react12.useMemo)(() => computeLabels(value, labels ?? []), [value, labels]);
  const segments = (0, import_react12.useMemo)(() => computeSegments(labelByChar), [labelByChar]);
  const placeholderLabelByChar = (0, import_react12.useMemo)(() => computeLabels(placeholder ?? "", labels ?? []), [placeholder, labels]);
  const renderPlaceholderLine = (lineText, absStart, keyPrefix) => {
    if (lineText.length === 0) {
      return [
        (0, import_jsx_runtime15.jsx)(Text, { ...textProps, dimColor: true, children: " " }, `${keyPrefix}-empty`)
      ];
    }
    const nodes = [];
    let buf = "";
    let bufLabel = null;
    let segCounter = 0;
    const flush = () => {
      if (buf.length > 0) {
        const lp = bufLabel !== null && bufLabel !== "text" ? labelTextProps[bufLabel] : void 0;
        nodes.push((0, import_jsx_runtime15.jsx)(Text, { ...textProps, ...lp, dimColor: true, children: buf }, `${keyPrefix}-${segCounter++}`));
        buf = "";
        bufLabel = null;
      }
    };
    for (let i = 0; i < lineText.length; i++) {
      const charLabel = placeholderLabelByChar[absStart + i] ?? "text";
      if (bufLabel !== null && bufLabel !== charLabel)
        flush();
      buf += lineText[i];
      bufLabel = charLabel;
    }
    flush();
    return nodes;
  };
  const lastDispatchRef = (0, import_react12.useRef)(null);
  const prevCursorRef = (0, import_react12.useRef)(cursor);
  const dispatchCursor = (targetCursor, valueForCalc) => {
    if (!onCursorChange)
      return;
    const v = valueForCalc ?? value;
    const { line, column } = getCursorLineAndColumn(v, targetCursor);
    const type = targetCursor === 0 ? "text" : getLabelAt(labelByChar, targetCursor - 1);
    const idx = targetCursor === 0 ? 0 : findSegmentIndex(segments, targetCursor - 1);
    const last = lastDispatchRef.current;
    if (last !== null && last.line === line && last.col === column && last.type === type && last.idx === idx) {
      return;
    }
    lastDispatchRef.current = { line, col: column, type, idx };
    onCursorChange([line, column], type, idx);
  };
  dispatchCursorRef.current = dispatchCursor;
  (0, import_react12.useEffect)(() => {
    if (prevCursorRef.current !== cursor) {
      dispatchCursorRef.current?.(cursor);
    }
    prevCursorRef.current = cursor;
  }, [cursor]);
  const renderLine = (content, key, lineNumber, totalLinesArg, isVirtualLine, ref2, isContinuationLine, continuationIndex, isActiveLine, isLastChunkOfLine) => {
    const decorationProps = {
      lineNumber,
      totalLines: totalLinesArg,
      isActiveLine,
      isVirtualLine,
      isContinuationLine,
      continuationIndex,
      isLastChunkOfLine
    };
    const prefix = typeof linePrefix === "function" ? linePrefix(decorationProps) : linePrefix;
    const suffix = typeof lineSuffix === "function" ? lineSuffix(decorationProps) : lineSuffix;
    const hasPrefix = !!prefix;
    const hasSuffix = !!suffix;
    const isHighlighted = highlightActiveLine && isActiveLine;
    const contentBoxRef = measurePerLine && !isVirtualLine ? getChunkRef(lineNumber, continuationIndex) : ref2;
    if (!hasPrefix && !hasSuffix) {
      return (0, import_jsx_runtime15.jsx)(Box_default, { width: "100%", backgroundColor: isHighlighted ? activeLineColor : void 0, children: (0, import_jsx_runtime15.jsx)(Box_default, { ref: contentBoxRef, flexGrow: 1, children: content }) }, key);
    }
    return (0, import_jsx_runtime15.jsxs)(Box_default, { width: "100%", flexDirection: "row", backgroundColor: isHighlighted ? activeLineColor : void 0, children: [hasPrefix ? (0, import_jsx_runtime15.jsx)(Box_default, { flexShrink: 0, children: prefix }) : null, (0, import_jsx_runtime15.jsx)(Box_default, { ref: contentBoxRef, flexGrow: 1, children: content }), hasSuffix ? (0, import_jsx_runtime15.jsx)(Box_default, { flexShrink: 0, children: suffix }) : null] }, key);
  };
  const cursorRowIndex = isActive ? visualRowForCursor(visualRows, cursorLine, cursorColumn, getChunkWidth(cursorLine, 0)) : -1;
  const { stdout } = use_stdout_default();
  const [terminalRows, setTerminalRows] = (0, import_react12.useState)(stdout?.rows ?? 0);
  (0, import_react12.useEffect)(() => {
    if (!stdout)
      return;
    const onResize = () => setTerminalRows(stdout.rows);
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const resolvedViewportLines = viewportLines ?? (terminalRows > 0 ? Math.max(1, Math.floor(terminalRows * 0.5)) : Number.POSITIVE_INFINITY);
  const { visibleRowStart, visibleRowEnd } = useViewport({
    rowCount: Math.max(visualRows.length, initialLineCount),
    viewportLines: resolvedViewportLines,
    cursorRowIndex
  });
  if (value.length === 0 && !isActive && placeholderLines.length > 0) {
    const visibleCount = Math.max(0, visibleRowEnd - visibleRowStart);
    return (0, import_jsx_runtime15.jsx)(Box_default, { flexDirection: "column", width: "100%", children: Array.from({ length: visibleCount }, (_, k) => {
      const i = visibleRowStart + k;
      return renderLine((0, import_jsx_runtime15.jsx)(Text, { children: renderPlaceholderLine(placeholderLines[i] ?? " ", placeholderLineStartOffsets[i] ?? 0, `ph-${i}`) }), i, i, initialLineCount, i > 0, k === 0 ? contentRef : void 0, false, 0, false, true);
    }) });
  }
  if (value.length === 0 && isActive) {
    const visibleCount = Math.max(0, visibleRowEnd - visibleRowStart);
    return (0, import_jsx_runtime15.jsx)(Box_default, { flexDirection: "column", width: "100%", children: Array.from({ length: visibleCount }, (_, k) => {
      const i = visibleRowStart + k;
      const phLine = placeholderLines[i];
      const isCursorRow = i === cursorLine && cursorVisible;
      let content;
      if (phLine && phLine.length > 0) {
        const firstChar = phLine[0];
        const restOffset = (placeholderLineStartOffsets[i] ?? 0) + 1;
        const rest = phLine.slice(1);
        content = (0, import_jsx_runtime15.jsxs)(Text, { ...textProps, children: [isCursorRow ? (0, import_jsx_runtime15.jsx)(Text, { children: `\x1B[7m${firstChar}\x1B[27m` }, "cur") : renderPlaceholderLine(firstChar, placeholderLineStartOffsets[i] ?? 0, `ph-${i}-h`), rest.length > 0 ? renderPlaceholderLine(rest, restOffset, `ph-${i}-r`) : null] });
      } else {
        content = (0, import_jsx_runtime15.jsx)(Text, { ...textProps, children: isCursorRow ? "\x1B[7m \x1B[27m" : " " });
      }
      return renderLine(content, i, i, initialLineCount, i > 0, k === 0 ? contentRef : void 0, false, 0, isActive && i === cursorLine, true);
    }) });
  }
  const renderedLines = [];
  const cursorLineStartAbs = cursor - cursorColumn;
  let cursorChunkIdx = 0;
  let cursorPosInChunk = cursorColumn;
  if (isActive) {
    for (const r of visualRows) {
      if (r.isVirtualLine || r.lineIdx !== cursorLine)
        continue;
      const chunkStartCol = r.absStart - cursorLineStartAbs;
      if (chunkStartCol <= cursorColumn) {
        cursorChunkIdx = r.chunkIdx;
        cursorPosInChunk = cursorColumn - chunkStartCol;
      } else {
        break;
      }
    }
  }
  for (let i = visibleRowStart; i < visibleRowEnd; i++) {
    const row = visualRows[i];
    const lineIdx = row.lineIdx;
    const c = row.chunkIdx;
    const isVirtualLine = row.isVirtualLine;
    const lineText = isVirtualLine ? "" : lines[lineIdx] ?? "";
    const isCursorLine = isActive && !isVirtualLine && lineIdx === cursorLine;
    const isContinuation = c > 0;
    const isActiveRow = isCursorLine && c === cursorChunkIdx;
    const hasTrailingNewline = !isVirtualLine && lineIdx < lines.length - 1;
    const showNewlineGlyph = inv.newline && row.isLastChunkOfLine && hasTrailingNewline;
    const cursorPos = isActiveRow ? cursorPosInChunk : -1;
    const isCursorAtLineEnd = cursorColumn >= lineText.length;
    const chunkAbsStart = row.absStart;
    const showPlaceholder = !isContinuation && !!placeholderLines[lineIdx] && !hasContent;
    if (isVirtualLine) {
      renderedLines.push(renderLine((0, import_jsx_runtime15.jsx)(Text, { children: showPlaceholder ? renderPlaceholderLine(placeholderLines[lineIdx], placeholderLineStartOffsets[lineIdx] ?? 0, `ph-pad-${lineIdx}`) : " " }), `pad-${lineIdx}`, lineIdx, totalLines, true, void 0, false, 0, false, false));
      continue;
    }
    const chunk = row.text;
    const bodyNodes = renderRowBody({
      chunk,
      chunkAbsStart,
      cursorPos,
      cursorVisible,
      isCursorAtLineEnd,
      inv,
      showAnyInvisible,
      invisibleProps,
      labelByChar,
      labelTextProps,
      tabWidth
    });
    if (bodyNodes.length === 0 && !showNewlineGlyph && !showPlaceholder) {
      bodyNodes.push((0, import_jsx_runtime15.jsx)(Text, { children: " " }, "b"));
    }
    renderedLines.push(renderLine((0, import_jsx_runtime15.jsxs)(Text, { ...textProps, wrap: measurePerLine ? "truncate" : "wrap", children: [bodyNodes, showNewlineGlyph ? (0, import_jsx_runtime15.jsx)(Text, { ...invisibleProps, children: "\u21B5" }, "nl") : null, showPlaceholder ? renderPlaceholderLine(placeholderLines[lineIdx], placeholderLineStartOffsets[lineIdx] ?? 0, `ph-${lineIdx}`) : null] }), `${lineIdx}-${c}`, lineIdx, totalLines, false, i === visibleRowStart ? contentRef : void 0, isContinuation, c, isActiveRow, row.isLastChunkOfLine));
  }
  return (0, import_jsx_runtime15.jsx)(Box_default, { flexDirection: "column", width: "100%", children: renderedLines });
};

// src/tui/InlineEditor.tsx
var import_jsx_runtime16 = __toESM(require_jsx_runtime(), 1);
function endPosition(text) {
  const lines = text.split("\n");
  const last = lines.length - 1;
  return [last, lines[last].length];
}
var DISCARD_PROMPT_LONG = "discard changes? (y/n, Esc keeps editing)";
var DISCARD_PROMPT_SHORT = "discard changes? (y/n)";
var FOOTER_HINT = "Ctrl+S save \xB7 Esc cancel \xB7 Enter new line";
function InlineEditor({ width, height, base, onClose, onSave }) {
  const colWidth = previewColWidth(width);
  const discardPrompt = colWidth >= DISCARD_PROMPT_LONG.length ? DISCARD_PROMPT_LONG : DISCARD_PROMPT_SHORT;
  const footerRows = Math.max(1, Math.ceil(FOOTER_HINT.length / Math.max(1, colWidth)));
  const [value, setValue] = (0, import_react13.useState)(base);
  const [cursorPosition, setCursorPosition] = (0, import_react13.useState)(() => endPosition(base));
  const [confirmDiscard, setConfirmDiscard] = (0, import_react13.useState)(false);
  const ref = (0, import_react13.useRef)(null);
  use_input_default((input, key) => {
    if (confirmDiscard) {
      if (input === "y" || input === "Y") {
        setConfirmDiscard(false);
        onClose();
      } else if (input === "n" || input === "N" || key.escape) {
        setConfirmDiscard(false);
      }
      return;
    }
    if (key.ctrl && input === "s") {
      onSave(value);
      return;
    }
    if (key.escape) {
      if (value !== base) setConfirmDiscard(true);
      else onClose();
    }
  });
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)(Box_default, { flexDirection: "column", width: colWidth, height, children: [
    confirmDiscard ? /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Text, { children: discardPrompt }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      TextArea,
      {
        ref,
        focus: !confirmDiscard,
        viewportLines: Math.max(1, height - (confirmDiscard ? 1 : 0) - footerRows),
        onSubmit: () => ref.current?.insert("\n"),
        value,
        cursorPosition,
        onChange: setValue,
        onCursorChange: (position) => setCursorPosition(position)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(Text, { children: FOOTER_HINT })
  ] });
}

// src/tui/MainPanes.tsx
var import_jsx_runtime17 = __toESM(require_jsx_runtime(), 1);
function MainPanes({
  store,
  view,
  width,
  height,
  tagsOpen,
  tagsFocused,
  tagIndex,
  rendered,
  searchOpen,
  selectedNote,
  historyOpen,
  historyIndex,
  reading = false,
  noteFocused = false,
  cursorLine = null,
  inlineEditOpen = false,
  onCloseEdit = () => {
  },
  inlineEditBase = "",
  onSaveEdit = () => {
  }
}) {
  const { noteEntries, selectedIndex, tagNames, query, collection: collection2 } = view;
  const selectedId = noteEntries[selectedIndex]?.id ?? null;
  const revisions = historyOpen && selectedId ? revisionsOf(store.getState(), selectedId) : [];
  const previewNote = historyOpen ? revisions[historyIndex]?.note ?? selectedNote : selectedNote;
  const layout = paneLayout(width, tagsOpen, tagsFocused, reading);
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(import_jsx_runtime17.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(Box_default, { flexDirection: "row", children: [
      layout.tagsWidth > 0 ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        TagPane,
        {
          tags: tagNames,
          selectedIndex: tagIndex,
          focused: tagsFocused,
          width: layout.tagsWidth,
          height: height - 4,
          trashRow: true,
          divider: true
        }
      ) : null,
      layout.listWidthProp > 0 ? historyOpen ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        History,
        {
          rows: revisions.map(revisionLabel),
          selectedIndex: historyIndex,
          loading: revisions.length === 0,
          width: layout.listWidthProp,
          height: layout.tagsWidth > 0 ? height - 2 : height - 1
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
        NoteList,
        {
          notes: noteEntries.map((e) => e.note),
          selectedIndex,
          width: layout.listWidthProp,
          height: layout.tagsWidth > 0 ? height - 2 : height - 1,
          query,
          focused: !tagsFocused && !noteFocused
        }
      ) : null,
      layout.previewWidthProp > 0 ? inlineEditOpen ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(InlineEditor, { note: previewNote, width: layout.previewWidthProp, height: layout.tagsWidth > 0 ? height - 2 : height - 1, base: inlineEditBase, onClose: onCloseEdit, onSave: onSaveEdit }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Preview, { note: previewNote, width: layout.previewWidthProp, height: layout.tagsWidth > 0 ? height - 2 : height - 1, rendered, cursorLine, focused: noteFocused, inTrash: collection2.type === "trash" }) : null
    ] }),
    tagsFocused ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Text, { children: "focus: tags" }) : noteFocused ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Text, { children: "focus: notes" }) : searchOpen || query !== "" ? (() => {
      const full = "search: " + query;
      const shown = full.length > width - 2 ? full.slice(0, width - 4) + ".." : full;
      return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Text, { bold: true, inverse: searchOpen, children: shown });
    })() : collection2.type === "tag" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Text, { children: "tag: " + collection2.tagName }) : collection2.type === "untagged" ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(Text, { children: "filter: untagged" }) : null
  ] });
}

// src/tui/useAppState.ts
var import_react14 = __toESM(require_react(), 1);

// src/tui/app-model.ts
function sortEntries(entries, sortType2, sortReversed2, inTrash) {
  const filtered = entries.filter((entry) => Boolean(entry.note.deleted) === inTrash);
  return [...filtered].sort((a, b) => {
    const aPinned = a.note.systemTags.includes("pinned");
    const bPinned = b.note.systemTags.includes("pinned");
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    let comparison = 0;
    switch (sortType2) {
      case "modificationDate":
        comparison = b.note.modificationDate - a.note.modificationDate;
        break;
      case "creationDate":
        comparison = b.note.creationDate - a.note.creationDate;
        break;
      case "alphabetical":
        comparison = noteTitleAndPreview(a.note).title.localeCompare(noteTitleAndPreview(b.note).title);
        break;
      default:
        comparison = b.note.modificationDate - a.note.modificationDate;
    }
    if (comparison === 0) {
      return a.id.localeCompare(b.id);
    }
    const result = sortReversed2 ? -comparison : comparison;
    return result;
  });
}

// src/core/search.ts
var TAG_TOKEN_PATTERN = /(?:\btag:)([^\s,]+)/g;
function parseQuery(query) {
  const tags2 = /* @__PURE__ */ new Set();
  const terms = getTerms(query).map((t) => t.toLocaleLowerCase());
  for (const match of query.matchAll(TAG_TOKEN_PATTERN)) {
    tags2.add(tagHashOf(match[1]));
  }
  return { terms, tags: tags2 };
}
function matchParsed(note, parsed) {
  const contentLower = (note.content ?? "").toLocaleLowerCase();
  for (const term of parsed.terms) {
    if (!contentLower.includes(term)) {
      return false;
    }
  }
  const untaggedHash = "untagged";
  if (parsed.tags.has(untaggedHash)) {
    if (note.tags.length !== 0) {
      return false;
    }
  } else {
    for (const tagHash of parsed.tags) {
      const matches = note.tags.some(
        (nTag) => tagHashOf(nTag) === tagHash
      );
      if (!matches) {
        return false;
      }
    }
  }
  return true;
}

// src/tui/useAppState.ts
function useAppState(store) {
  const [noteEntries, setNoteEntries] = (0, import_react14.useState)([]);
  const selectedIdRef = (0, import_react14.useRef)(null);
  const openedRef = (0, import_react14.useRef)(null);
  const [selectedIndex, setSelectedIndex] = (0, import_react14.useState)(0);
  const [connected, setConnected] = (0, import_react14.useState)(false);
  const [pending, setPending] = (0, import_react14.useState)(0);
  const [allTagNames, setAllTagNames] = (0, import_react14.useState)([]);
  const [query, setQuery] = (0, import_react14.useState)("");
  const [tagNames, setTagNames] = (0, import_react14.useState)([]);
  const [collection2, setCollection] = (0, import_react14.useState)({ type: "all" });
  const [inTrash, setInTrash] = (0, import_react14.useState)(false);
  const [sortLabelStr, setSortLabelStr] = (0, import_react14.useState)("");
  const sortCacheRef = (0, import_react14.useRef)(null);
  const externalSelectRef = (0, import_react14.useRef)(null);
  (0, import_react14.useEffect)(() => {
    if (externalSelectRef.current !== null) return;
    selectedIdRef.current = noteEntries[selectedIndex]?.id ?? null;
  }, [noteEntries, selectedIndex]);
  (0, import_react14.useEffect)(() => {
    const render = () => {
      const state = store.getState();
      const inTrashNow = state.ui.collection.type === "trash";
      const cache = sortCacheRef.current;
      let sorted;
      if (cache && cache.key[0] === state.data.notes && cache.key[1] === state.settings.sortType && cache.key[2] === state.settings.sortReversed && cache.key[3] === inTrashNow) {
        sorted = cache.sorted;
      } else {
        const allEntries = [];
        for (const [id, note] of state.data.notes) {
          allEntries.push({ id, note });
        }
        sorted = sortEntries(
          allEntries,
          state.settings.sortType,
          state.settings.sortReversed,
          inTrashNow
        );
        sortCacheRef.current = {
          key: [state.data.notes, state.settings.sortType, state.settings.sortReversed, inTrashNow],
          sorted
        };
      }
      const q = state.ui.searchQuery;
      setQuery(q);
      let filtered = sorted;
      if (q) {
        const parsed = parseQuery(q);
        filtered = sorted.filter((e) => matchParsed(e.note, parsed));
      }
      filtered = filtered.filter(
        (e) => inCollection(e.note, state.ui.collection, q !== "")
      );
      setNoteEntries(filtered);
      setInTrash(inTrashNow);
      setSortLabelStr(sortLabel(state));
      const opened = state.ui.openedNote;
      if (opened !== openedRef.current) {
        openedRef.current = opened;
        if (opened && filtered.some((e) => e.id === opened)) {
          selectedIdRef.current = opened;
        }
      }
      const ext = externalSelectRef.current;
      if (ext) {
        const at = filtered.findIndex((e) => e.id === ext);
        if (at >= 0) {
          selectedIdRef.current = ext;
          setSelectedIndex(at);
          externalSelectRef.current = null;
        }
      } else {
        const at = filtered.findIndex((e) => e.id === selectedIdRef.current);
        if (at >= 0) {
          setSelectedIndex(at);
        } else {
          setSelectedIndex((i) => Math.max(0, Math.min(i, filtered.length - 1)));
        }
      }
      setConnected(state.simperium.connected);
      setPending(pendingCount(state.simperium));
      const tags2 = [];
      for (const [, tag] of state.data.tags) {
        tags2.push(tag.name);
      }
      setAllTagNames(tags2);
      setTagNames(tagRows(state.data.tags));
      setCollection(state.ui.collection);
    };
    render();
    const unsubscribe = store.subscribe(render);
    return unsubscribe;
  }, [store]);
  const setExternalSelect = (id) => {
    externalSelectRef.current = id;
  };
  return { noteEntries, selectedIndex, setSelectedIndex, setExternalSelect, connected, pending, allTagNames, query, setQuery, tagNames, collection: collection2, inTrash, sortLabelStr };
}

// src/tui/notice.ts
var import_react15 = __toESM(require_react(), 1);
function useNotice() {
  const [notice, setNoticeState] = (0, import_react15.useState)(null);
  const setNotice = (message) => setNoticeState({ message, isError: false });
  const setNoticeError = (message) => setNoticeState({ message, isError: true });
  const clearNotice = () => setNoticeState(null);
  return { notice, setNotice, setNoticeError, clearNotice };
}
function noticeColor(notice) {
  return notice.isError ? theme2.error.color : theme2.success.color;
}

// src/tui/note-focus.ts
function handleNoteKey(input, keyName, ctx) {
  const { store, selectedEntry, itemIndex, setItemIndex, setItemAsk, setNotice, setExportAsk, setBlogSendAsk } = ctx;
  const items = selectedEntry ? checklistItems(selectedEntry.note.content ?? "") : [];
  const at = Math.min(itemIndex, items.length - 1);
  if (keyName === "downArrow" || input === "j") {
    if (items.length === 0) return false;
    setItemIndex(Math.min(at + 1, items.length - 1));
    return true;
  }
  if (keyName === "upArrow" || input === "k") {
    if (items.length === 0) return false;
    setItemIndex(Math.max(at - 1, 0));
    return true;
  }
  if (input === "c") {
    if (selectedEntry && items.length > 0 && !selectedEntry.note.deleted) {
      const content = toggleChecklistItem(selectedEntry.note.content ?? "", at);
      store.dispatch({
        type: "EDIT_NOTE",
        noteId: selectedEntry.id,
        changes: { content }
      });
    }
    return true;
  }
  if (input === "a") {
    if (selectedEntry && !selectedEntry.note.deleted) {
      setItemAsk?.(true);
    } else if (selectedEntry?.note.deleted) {
      setNotice?.("In trash: press u to restore first");
    }
    return true;
  }
  if (input === "w") {
    if (selectedEntry && !selectedEntry.note.deleted) {
      setExportAsk?.(true);
    } else if (selectedEntry?.note.deleted) {
      setNotice?.("In trash: press u to restore first");
    }
    return true;
  }
  if (input === "b") {
    if (selectedEntry?.note.deleted) {
      setNotice?.("In trash: press u to restore first");
    } else if (selectedEntry) {
      setBlogSendAsk?.({ onYes: () => {
      }, onNo: () => setBlogSendAsk(null) });
    }
    return true;
  }
  return false;
}

// src/tui/pane-arrows.ts
function handlePaneArrow(keyName, ctx) {
  if (keyName === "leftArrow") {
    if (ctx.noteFocused) ctx.setNoteFocused(false);
    else {
      ctx.setTagsOpen(true);
      ctx.setTagsFocused(true);
    }
    return true;
  }
  if (keyName === "rightArrow") {
    if (!ctx.noteFocused) ctx.setNoteFocused(true);
    return true;
  }
  return false;
}

// src/tui/use-reselect.ts
function useReselect(ctx) {
  const store = ctx.store;
  return (id) => {
    if (id === null) {
      store.dispatch({ type: "SEARCH", searchQuery: "" });
      ctx.setExternalSelect(null);
      return;
    }
    ctx.setExternalSelect(id);
    store.dispatch({ type: "SEARCH", searchQuery: "" });
  };
}

// src/tui/inline-editor-state.ts
var import_react16 = __toESM(require_react(), 1);
function useInlineEditorState() {
  const [open, setOpen] = (0, import_react16.useState)(false);
  const [base, setBase] = (0, import_react16.useState)("");
  const openEdit = (content) => {
    setBase(content);
    setOpen(true);
  };
  const closeEdit = () => setOpen(false);
  return { open, base, openEdit, closeEdit };
}

// src/tui/App.tsx
var import_jsx_runtime18 = __toESM(require_jsx_runtime(), 1);
function App({ store, width, height, onQuit, onLogout, runEditor, onForceSync, copyText, startNew }) {
  const { exit, suspendTerminal } = use_app_default();
  const { setRawMode } = use_stdin_default();
  const view = useAppState(store);
  const { noteEntries, selectedIndex, setSelectedIndex, connected, pending, allTagNames, query, setQuery, tagNames, collection: collection2, inTrash, sortLabelStr } = view;
  const [rendered, setRendered] = (0, import_react17.useState)(false);
  const [helpOpen, setHelpOpen] = (0, import_react17.useState)(false);
  const [tagEditorOpen, setTagEditorOpen] = (0, import_react17.useState)(false);
  const [logoutAsk, setLogoutAsk] = (0, import_react17.useState)(false);
  const [searchOpen, setSearchOpen] = (0, import_react17.useState)(false);
  const [tagsOpen, setTagsOpen] = (0, import_react17.useState)(false);
  const [tagsFocused, setTagsFocused] = (0, import_react17.useState)(false);
  const [noteFocused, setNoteFocused] = (0, import_react17.useState)(false);
  const [itemIndex, setItemIndex] = (0, import_react17.useState)(0);
  const [tagIndex, setTagIndex] = (0, import_react17.useState)(0);
  const [tagDialog, setTagDialog] = (0, import_react17.useState)(null);
  const [emptyAsk, setEmptyAsk] = (0, import_react17.useState)(0);
  const [copyResult, setCopyResult] = (0, import_react17.useState)(null);
  const [historyOpen, setHistoryOpen] = (0, import_react17.useState)(false);
  const [historyIndex, setHistoryIndex] = (0, import_react17.useState)(0);
  const [reading, setReading] = (0, import_react17.useState)(false);
  const { itemAsk, setItemAsk } = useItemAsk();
  const { exportAsk, setExportAsk } = useExportAsk();
  const { setBlogSendAsk } = useBlogSendAsk();
  const { open: inlineEditOpen, base: inlineEditBase, openEdit: openInlineEdit, closeEdit: closeInlineEdit } = useInlineEditorState();
  const { notice, setNotice, setNoticeError, clearNotice } = useNotice();
  const [syncedAt, setSyncedAt] = (0, import_react17.useState)(null);
  const syncedTimerRef = (0, import_react17.useRef)(null);
  const tagsAutoOpenedRef = (0, import_react17.useRef)(false);
  useAppEffects(width, tagNames.length, setTagsOpen, syncedTimerRef, startNew ? () => handleKey("n", {}) : void 0);
  const handleKey = (input, key) => {
    recordKeyEvent(input, key, Boolean(searchOpen || tagEditorOpen || tagDialog?.kind === "rename" || emptyAsk || logoutAsk || itemAsk || exportAsk || useBlogSendAsk().blogOpen));
    if (notice) clearNotice();
    const keyName = keyNameFromEvent(key);
    if (helpOpen) {
      if (keyName === "Escape" || input === "?") {
        setHelpOpen(false);
      }
      return;
    }
    if (historyOpen) {
      handleHistoryKey(input, keyName, { store, noteEntries, selectedIndex, historyIndex, setHistoryIndex, setHistoryOpen });
      return;
    }
    if (emptyAsk || tagEditorOpen || logoutAsk || tagDialog || itemAsk || exportAsk || useBlogSendAsk().blogOpen || inlineEditOpen) return;
    if (reading && !tagsFocused && !searchOpen && (keyName === "Escape" || keyName === "Enter")) {
      setReading(false);
      return;
    }
    if (searchOpen) {
      handleSearchKey(input, key, {
        store,
        setSearchOpen,
        setQuery,
        setSelectedIndex,
        rememberSelection: () => remember(noteEntries[selectedIndex]?.id ?? null, query !== "")
      });
      return;
    }
    if (input === "/") {
      setSearchOpen(true);
      return;
    }
    if (handleSearchClearKey(keyName, { store, query, selectedId: selectedEntry?.id ?? null, remember })) return;
    if (tagsFocused) {
      handleTagsKey(input, keyName, { store, tagNames, tagIndex, setTagIndex, setSelectedIndex, setTagsFocused, setTagsOpen, setTagDialog });
      return;
    }
    if (input === "t") {
      setTagsOpen(true);
      setTagsFocused(true);
      return;
    }
    if (handlePaneArrow(keyName, { tagsOpen, noteFocused, setTagsOpen, setTagsFocused, setNoteFocused })) return;
    if (keyName === "Tab" && tagsOpen) {
      setTagsFocused(true);
      return;
    }
    if (noteFocused) {
      if (keyName === "Escape" || keyName === "Tab") {
        setNoteFocused(false);
        return;
      }
      const noteKeyCtx = { store, selectedEntry, itemIndex, setItemIndex, setItemAsk, setNotice, setExportAsk, setBlogSendAsk };
      if (handleNoteKey(input, keyName, noteKeyCtx)) return;
    }
    const action = noteKeyAction(input, selectedEntry?.id ?? null, store.getState());
    if (action) {
      store.dispatch(action);
      if (action.type === "SELECT_TRASH") setTagIndex(tagNames.length + 2);
      else if (action.type === "SHOW_ALL_NOTES") setTagIndex(0);
      return;
    }
    if (inTrash && selectedEntry && "gpPhmw".includes(input)) {
      setNotice("In trash: press u to restore first");
      return;
    }
    handleIdleKey(input, {
      store,
      selectedEntry,
      onForceSync,
      copyText,
      syncedTimerRef,
      setSyncedAt,
      setCopyResult,
      setTagEditorOpen,
      setEmptyAsk,
      setExportAsk,
      setNotice
    });
    if (input === "h") {
      openHistory({ store, selectedEntry, setHistoryOpen, setHistoryIndex });
    } else if (input === "e") {
      editSelectedNote({ store, selectedEntry, setRawMode, runEditor, onEditorError: setNoticeError, suspend: suspendTerminal });
    } else if (input === "n") {
      createNote({ store, topNote: noteEntries[0]?.note, setRawMode, runEditor, setSelectedIndex, onEditorError: setNoticeError, onNoteCreated: () => setNotice("New note saved \u2014 press g to add tags"), suspend: suspendTerminal });
    } else if (input === "j" || keyName === "downArrow") {
      setSelectedIndex((i) => Math.min(i + 1, noteEntries.length - 1));
    } else if (input === "k" || keyName === "upArrow") {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (keyName === "Enter") {
      if (width < 50) setReading(true);
      else setRendered((r) => !r);
    } else if (keyName === "Tab") {
      setNoteFocused(true);
    } else if (input === "q") {
      if (onQuit) {
        onQuit();
      } else {
        exit();
      }
    } else if (input === "v") {
      setRendered((r) => !r);
    } else if (input === "?") {
      setHelpOpen(true);
    } else if (input === "L") {
      if (onLogout) {
        setLogoutAsk(true);
      }
    } else if (input === "i") {
      if (selectedEntry) openInlineEdit(selectedEntry.note.content ?? "");
    }
  };
  const remember = useReselect({ store, setExternalSelect: view.setExternalSelect });
  use_input_default((input, key) => {
    for (const ch of splitPastedInput(input) ?? [input]) handleKey(ch, key);
  }, { isActive: emptyAsk === 0 });
  const listCount = import_react17.default.useMemo(() => {
    const st = store.getState();
    let count = 0;
    for (const note of st.data.notes.values()) {
      if (Boolean(note.deleted) === false) count++;
    }
    return count;
  }, [store, view.noteEntries]);
  const selectedEntry = noteEntries[selectedIndex] || null;
  const selectedNote = selectedEntry?.note ?? null;
  const noteItems = noteFocused && selectedEntry ? checklistItems(selectedEntry.note.content ?? "") : [];
  const cursorLine = noteItems.length > 0 ? noteItems[Math.min(itemIndex, noteItems.length - 1)].line : null;
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Box_default, { flexDirection: "column", height, children: helpOpen ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Help, { width, height, editor: selectEditor(process.env) }) : /* @__PURE__ */ (0, import_jsx_runtime18.jsxs)(import_jsx_runtime18.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      MainPanes,
      {
        store,
        view,
        width,
        height,
        tagsOpen,
        tagsFocused,
        tagIndex,
        rendered,
        searchOpen,
        selectedNote,
        historyOpen,
        historyIndex,
        reading,
        noteFocused,
        cursorLine,
        inlineEditOpen,
        onCloseEdit: closeInlineEdit,
        inlineEditBase,
        onSaveEdit: (value) => {
          saveInlineEdit({ store, selectedEntry, base: inlineEditBase, local: value, onEditorError: setNoticeError });
          closeInlineEdit();
        }
      }
    ),
    notice ? /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(Text, { color: noticeColor(notice), children: notice.message }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
      BottomArea,
      {
        store,
        view: {
          ...view,
          noteEntries: view.noteEntries.slice(0, listCount),
          sortLabelStr: syncedAt ? "synced " + syncedAt : view.sortLabelStr
        },
        selectedEntry,
        width,
        onLogout,
        tagEditorOpen,
        setTagEditorOpen,
        tagDialog,
        setTagDialog,
        logoutAsk,
        setLogoutAsk,
        emptyAsk,
        setEmptyAsk,
        copyResult,
        tagsFocused,
        searchOpen,
        itemIndex,
        setNotice,
        setNoticeError
      }
    )
  ] }) });
}

// src/tui/Root.tsx
var import_jsx_runtime19 = __toESM(require_jsx_runtime(), 1);
function Root(props) {
  const [phase, setPhase] = (0, import_react18.useState)("loading");
  const [store, setStore] = (0, import_react18.useState)(null);
  const [error, setError] = (0, import_react18.useState)("");
  const [lockMessage, setLockMessage] = (0, import_react18.useState)(null);
  const [size, setSize] = (0, import_react18.useState)({ width: props.width, height: props.height });
  const { stdout } = use_stdout_default();
  (0, import_react18.useEffect)(() => {
    const onResize = () => {
      setSize({
        width: stdout.columns ?? props.width,
        height: stdout.rows ?? size.height
      });
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout, props.width, size.height]);
  (0, import_react18.useEffect)(() => {
    let cancelled = false;
    loadToken(props.dataDir).then((auth) => {
      if (cancelled) return;
      if (auth === null || auth.server !== props.server) {
        setPhase("login");
      } else {
        const onLogout = () => {
          logout2(props.dataDir);
          setStore(null);
          setPhase("login");
        };
        setStore(props.makeStoreFor(auth, onLogout));
        setPhase("app");
      }
    }).catch((e) => {
      if (cancelled) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("holds the instance lock")) {
        setLockMessage(msg);
        props.onLockError?.(msg);
        return;
      }
      setPhase("login");
    });
    return () => {
      cancelled = true;
    };
  }, [props.dataDir, props.server, props.makeStoreFor]);
  const handleLogout = (0, import_react18.useCallback)(() => {
    logout2(props.dataDir);
    setStore(null);
    setPhase("login");
  }, [props.dataDir]);
  const onLoggedIn = (0, import_react18.useCallback)(
    async (auth) => {
      try {
        await saveToken(props.dataDir, { ...auth, server: props.server });
        const onLogout = () => {
          logout2(props.dataDir);
          setStore(null);
          setPhase("login");
        };
        setStore(props.makeStoreFor(auth, onLogout));
        setPhase("app");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("holds the instance lock")) {
          setLockMessage(msg);
          props.onLockError?.(msg);
          return;
        }
        setError(msg);
      }
    },
    [props.dataDir, props.makeStoreFor]
  );
  if (phase === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(Box_default, { flexDirection: "column", children: [
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Text, { children: "Loading..." }),
      lockMessage ? /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(Text, { ...theme2.error, children: lockMessage }) : null
    ] });
  }
  if (phase === "login") {
    return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(Box_default, { flexDirection: "column", children: [
      /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
        Login,
        {
          width: size.width,
          height: size.height,
          requestCode: props.requestCode,
          completeLogin: props.completeLogin,
          passwordLogin: props.passwordLogin,
          onLoggedIn
        }
      ),
      error ? /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(Text, { ...theme2.error, children: [
        "Error: ",
        error
      ] }) : null
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(
    App,
    {
      store,
      width: size.width,
      height: size.height,
      onQuit: props.onQuit,
      startNew: props.startNew,
      onLogout: () => {
        store.dispatch({ type: "REALLY_LOG_OUT" });
        void handleLogout();
      }
    }
  );
}

// src/cli/main.tsx
function buildStore(opts, auth, onLogout) {
  const instanceLock = acquireInstanceLock(opts.dataDir);
  let stopSaving = instanceLock.release;
  let noteGhosts;
  const store = makeStore({
    preloadedState: loadState(opts.dataDir),
    sync: {
      appId: opts.appId,
      token: auth.token,
      username: auth.email,
      clientOptions: opts.server ? { url: opts.server } : void 0,
      ghostStoreProvider: (b) => {
        const g = new FileGhostStore(opts.dataDir, b.name);
        if (b.name === "note") {
          noteGhosts = g;
        }
        return g;
      },
      noteEditDelayMs: opts.noteEditDelayMs,
      authWatchdogMs: opts.authWatchdogMs,
      onLogout: () => {
        stopSaving();
        if (opts.statusDir) {
          removeStatusFile(opts.statusDir);
        }
        onLogout();
      }
    }
  });
  const startSaving = persistOnChange(store, opts.dataDir);
  const stopStatus = opts.statusDir ? watchStatus(store, opts.statusDir, { delayMs: opts.statusDelayMs }) : () => {
  };
  stopSaving = () => {
    startSaving();
    stopStatus();
    instanceLock.release();
  };
  if (noteGhosts)
    void requeueUnsynced(
      store,
      noteGhosts,
      // T313/T314 — offline edits wait for the note bucket's catch-up, then rebase
      () => whenCatchUpApplied(store.client, "note")
    ).catch(() => {
    });
  trackDeletions(store, opts.dataDir);
  if (noteGhosts) {
    void resendDeletions(
      store,
      opts.dataDir,
      noteGhosts
    ).catch(() => {
    });
  }
  return { store, stopSaving };
}
function accountStore(opts, auth, onLogout) {
  const dir = accountDir(opts.dataDir, auth.email);
  secureMkdir(dir);
  return buildStore({ ...opts, dataDir: dir }, auth, onLogout);
}
function stateDir() {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg && xdg !== "") {
    return path8.join(xdg, "snote");
  }
  return path8.join(os2.homedir(), ".local", "state", "snote");
}
async function writeReport(log, dataDir) {
  const dir = stateDir();
  let bundle;
  try {
    const crashes = fs9.readdirSync(dir).filter((f) => f.startsWith("crash-") && f.endsWith(".json")).sort();
    if (crashes.length > 0) {
      const raw = fs9.readFileSync(path8.join(dir, crashes.at(-1)), "utf8");
      bundle = { ...JSON.parse(raw), source: "crash" };
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      log("could not be saved");
      return 0;
    }
  }
  if (!bundle) {
    try {
      const store = makeStore({ preloadedState: loadState(dataDir), stubClient: {} });
      const session = sessionSnapshot(store.getState(), getKeyLog(), {
        columns: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
        version: "0.0.1"
      });
      bundle = { source: "live", session };
    } catch {
      log("could not be saved");
      return 0;
    }
  }
  const file = path8.join(
    dir,
    `report-${(/* @__PURE__ */ new Date()).toISOString().replaceAll(":", "-")}.json`
  );
  try {
    secureMkdir(dir);
    secureWriteFileSync(file, JSON.stringify(bundle, null, 2));
  } catch {
    log("could not be saved");
    return 0;
  }
  log(file);
  log(
    'Hand this file to your coding agent and say: "reproduce and fix this". It knows what to do (.claude/skills/snote-fix).'
  );
  return 0;
}
async function main(argv, io) {
  const log = io?.log ?? console.log;
  const reportOnly = argv.includes("--report");
  const { args, startNew } = splitNewFlag(argv.filter((a) => a !== "--report"));
  if (argv.includes("--version") || argv.includes("-v")) {
    log(`snote ${VERSION}`);
    return 0;
  }
  let o;
  try {
    o = parseCli(args);
  } catch (e) {
    log(`error: ${e.message}`);
    log(USAGE);
    return 2;
  }
  if (reportOnly) {
    return writeReport(log, o.dataDir ?? defaultDataDir());
  }
  const dataDir = o.dataDir ?? defaultDataDir();
  const appId = o.appId ?? APP_ID;
  if (o.help) {
    log(USAGE);
    return 0;
  }
  if (o.check) {
    log(
      checkReport({
        editor: process.env.EDITOR ?? "nvim",
        dataDir,
        columns: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24
      })
    );
    log(envReport(process.env));
    return 0;
  }
  if (o.logout) {
    await logout2(dataDir);
    log("logged out");
    return 0;
  }
  await prepareDataDir(dataDir);
  const calls = loginCalls(o.server, appId);
  let stopSaving = () => {
  };
  let lastStore;
  const makeStoreFor = (auth, onLogout) => {
    const dir = statusDir(process.env);
    const built = accountStore(
      { dataDir, appId, server: o.server, statusDir: fs9.existsSync(dir) ? dir : void 0 },
      auth,
      onLogout
    );
    stopSaving = built.stopSaving;
    lastStore = built.store;
    return built.store;
  };
  let locked = false;
  const { waitUntilExit, unmount, clear } = render_default(
    import_react19.default.createElement(Root, {
      dataDir,
      server: o.server,
      width: process.stdout.columns ?? 80,
      height: process.stdout.rows ?? 24,
      makeStoreFor,
      startNew,
      requestCode: calls.requestCode,
      completeLogin: calls.completeLogin,
      passwordLogin: calls.passwordLogin,
      // T304: when another process holds the instance lock, show the message
      // and return non-zero instead of swallowing into the login screen.
      onLockError: (msg) => {
        try {
          log(msg);
          locked = true;
          try {
            unmount();
          } catch {
          }
        } catch {
        }
      }
    })
  );
  let crashed;
  const crash = (err) => {
    if (crashed) return crashed;
    if (locked) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("holds the instance lock")) return Promise.resolve(1);
    }
    const report = crashReport(err, {
      version: "0.0.1",
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      when: /* @__PURE__ */ new Date(),
      home: os2.homedir()
    });
    const dir = stateDir();
    const file = path8.join(
      dir,
      `crash-${report.record.when.replaceAll(":", "-")}.json`
    );
    let session;
    try {
      if (lastStore) {
        session = sessionSnapshot(lastStore.getState(), getKeyLog(), {
          columns: process.stdout.columns ?? 80,
          rows: process.stdout.rows ?? 24,
          version: "0.0.1"
        });
      } else {
        session = {
          version: "0.0.1",
          terminal: `${process.stdout.columns ?? 80}x${process.stdout.rows ?? 24}`,
          noteCount: 0,
          noteLengths: [],
          tagCount: 0,
          collectionType: "all",
          keys: getKeyLog()
        };
      }
    } catch {
      session = {
        version: "0.0.1",
        terminal: `${process.stdout.columns ?? 80}x${process.stdout.rows ?? 24}`,
        noteCount: 0,
        noteLengths: [],
        tagCount: 0,
        collectionType: "all",
        keys: []
      };
    }
    let pathText;
    try {
      secureMkdir(dir);
      secureWriteFileSync(file, JSON.stringify({ ...report.record, session }, null, 2));
      pathText = file;
    } catch {
      pathText = "could not be saved";
    }
    try {
      unmount();
    } catch {
    }
    try {
      clear();
    } catch {
    }
    process.stderr.write(report.message.replace("{path}", pathText) + "\n");
    try {
      fs9.fsyncSync(1);
    } catch {
    }
    process.exit(1);
  };
  const onUncaught = (err) => {
    process.exitCode = 1;
    void crash(err);
  };
  const onRejection = (reason) => {
    process.exitCode = 1;
    void crash(reason);
  };
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);
  const win = globalThis;
  if (win.window && typeof win.window.addEventListener === "function") {
    const g = globalThis;
    const listeners = /* @__PURE__ */ new Map();
    g.addEventListener ??= (type, l) => {
      let set = listeners.get(type);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        listeners.set(type, set);
      }
      set.add(l);
    };
    g.dispatchEvent ??= (e) => {
      const type = e.type ?? "error";
      for (const l of listeners.get(type) ?? []) l(e);
      return e.defaultPrevented !== true;
    };
    win.window.error ??= class ErrorEvent {
      type;
      message;
      error;
      defaultPrevented = false;
      constructor(type, opts) {
        this.type = type ?? "error";
        this.message = opts?.message ?? "";
        this.error = opts?.error;
      }
      preventDefault() {
        this.defaultPrevented = true;
      }
    };
    win.window.addEventListener("error", (event) => {
      const e = event;
      if (e.defaultPrevented === true) return;
      e.preventDefault?.();
      onUncaught(e.error ?? new Error(String(e.message)));
    });
  }
  let code = 0;
  try {
    await waitUntilExit();
  } catch (err) {
    code = await crash(err);
  }
  process.off("uncaughtException", onUncaught);
  process.off("unhandledRejection", onRejection);
  if (code !== 0) return code;
  stopSaving();
  if (locked) return 1;
  return 0;
}

// src/cli/index.ts
main(process.argv.slice(2)).then((code) => process.exit(code));
/*! Bundled license information:

react/cjs/react-jsx-runtime.production.js:
  (**
   * @license React
   * react-jsx-runtime.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
