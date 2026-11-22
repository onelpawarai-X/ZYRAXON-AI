/*
 * Runtime bridge for the web build.
 *
 * The web app cannot host Electron's <webview>, and Google and most real sites
 * refuse to load inside an <iframe>. This shim gives the existing Browser panel
 * and the Universal Search overlay a real Chromium surface by relaying frames
 * and input over /browser-ws. The Chromium profile is persistent, so logins
 * survive reloads and restarts.
 */
(function () {
  var state = {
    url: "about:blank",
    title: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    secure: true,
  };
  var callbacks = { state: [], selection: [], permission: [], reviewMode: [] };
  var socket = null;
  var review = false;
  var pending = "https://www.google.com/";
  var image = null;
  var viewport = null;
  var visible = false;
  var retry = null;

  function emit(kind, value) {
    for (var i = 0; i < callbacks[kind].length; i++) {
      try {
        callbacks[kind][i](value);
      } catch (error) {
        console.error("[remote-browser]", error);
      }
    }
  }

  function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  function point(event) {
    if (!image) return { x: 0, y: 0 };
    var rect = image.getBoundingClientRect();
    var width = image.naturalWidth || 1280;
    var height = image.naturalHeight || 800;
    var scale = Math.min(rect.width / width, rect.height / height);
    var drawnWidth = width * scale;
    var drawnHeight = height * scale;
    var left = rect.left + (rect.width - drawnWidth) / 2;
    var top = rect.top + (rect.height - drawnHeight) / 2;
    return {
      x: Math.round((event.clientX - left) / scale),
      y: Math.round((event.clientY - top) / scale),
    };
  }

  function modifiers(event) {
    return (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
  }

  function onMouseDown(event) {
    if (viewport) viewport.focus();
    var p = point(event);
    if (review) {
      send({ type: "review", x: p.x, y: p.y });
      return;
    }
    send({
      type: "mouse",
      event: "pressed",
      x: p.x,
      y: p.y,
      button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
    });
  }

  function onMouseUp(event) {
    if (review) return;
    var p = point(event);
    send({
      type: "mouse",
      event: "released",
      x: p.x,
      y: p.y,
      button: event.button === 2 ? "right" : event.button === 1 ? "middle" : "left",
    });
  }

  function onMouseMove(event) {
    if (review) return;
    var p = point(event);
    send({ type: "mouse", event: "moved", x: p.x, y: p.y });
  }

  function onWheel(event) {
    event.preventDefault();
    var p = point(event);
    send({ type: "wheel", x: p.x, y: p.y, deltaX: event.deltaX, deltaY: event.deltaY });
  }

  function onKeyDown(event) {
    var mods = modifiers(event);
    send({ type: "key", event: "keydown", key: event.key, code: event.code, modifiers: mods });
    if (
      ["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(event.key) >= 0 ||
      (mods & 6)
    ) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    send({ type: "key", event: "keyup", key: event.key, code: event.code, modifiers: modifiers(event) });
  }

  function ensureViewport() {
    if (viewport && document.body.contains(viewport)) return viewport;
    viewport = document.querySelector('[aria-label="ZYRAXON browser viewport"]');
    if (!viewport) return null;
    viewport.style.position = "relative";
    viewport.style.overflow = "hidden";
    viewport.style.background = "#000";
    viewport.tabIndex = 0;
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("keyup", onKeyUp);
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;user-select:none;";
      image.addEventListener("mousedown", onMouseDown);
      image.addEventListener("mouseup", onMouseUp);
      image.addEventListener("mousemove", onMouseMove);
      image.addEventListener("wheel", onWheel, { passive: false });
      image.addEventListener("contextmenu", function (event) {
        event.preventDefault();
      });
      viewport.appendChild(image);
    }
    return viewport;
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    var protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(protocol + "//" + location.host + "/browser-ws");
    socket.onopen = function () {
      send({ type: "navigate", url: pending });
    };
    socket.onclose = function () {
      retry = window.setTimeout(connect, 1500);
    };
    socket.onerror = function () {};
    socket.onmessage = function (event) {
      var message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message.type === "state") {
        state = {
          url: message.url || "",
          title: message.title || "",
          loading: Boolean(message.loading),
          canGoBack: Boolean(message.canGoBack),
          canGoForward: Boolean(message.canGoForward),
          secure: Boolean(message.secure),
        };
        emit("state", state);
      }
      if (message.type === "frame") {
        ensureViewport();
        if (image) image.src = "data:image/jpeg;base64," + message.data;
      }
      if (message.type === "selection") emit("selection", message);
      if (message.type === "error") console.warn("[remote-browser]", message.message);
    };
  }

  function subscribe(kind, callback) {
    callbacks[kind].push(callback);
    if (kind === "state" && state.url) callback(state);
    return function () {
      var index = callbacks[kind].indexOf(callback);
      if (index >= 0) callbacks[kind].splice(index, 1);
    };
  }

  var browser = {
    create: function (url) {
      pending = url || pending;
      ensureViewport();
      connect();
      send({ type: "navigate", url: pending });
    },
    navigate: function (url) {
      pending = url;
      send({ type: "navigate", url: url });
    },
    back: function () {
      send({ type: "back" });
    },
    forward: function () {
      send({ type: "forward" });
    },
    reload: function () {
      send({ type: "reload" });
    },
    stop: function () {
      send({ type: "stop" });
    },
    setBounds: function (next) {
      visible = !next || next.visible !== false;
      ensureViewport();
      if (image) image.style.display = visible ? "block" : "none";
      if (next && next.width > 1 && next.height > 1) {
        send({ type: "resize", width: Math.round(next.width), height: Math.round(next.height) });
      }
    },
    resize: function (width, height) {
      send({ type: "resize", width: Math.round(width), height: Math.round(height) });
    },
    getState: function () {
      return Promise.resolve(state);
    },
    openExternal: function () {
      window.open(state.url || pending, "_blank", "noopener");
    },
    respondPermission: function () {},
    setReviewMode: function (enabled) {
      review = Boolean(enabled);
      if (image) image.style.cursor = review ? "crosshair" : "default";
      emit("reviewMode", review);
    },
    getReviewMode: function () {
      return Promise.resolve(review);
    },
    onState: function (callback) {
      return subscribe("state", callback);
    },
    onPermissionRequest: function (callback) {
      return subscribe("permission", callback);
    },
    onReviewSelection: function (callback) {
      return subscribe("selection", callback);
    },
    onReviewModeChanged: function (callback) {
      return subscribe("reviewMode", callback);
    },
  };

  window.api = window.api || {};
  window.api.browser = browser;
  connect();

  var observer = new MutationObserver(function () {
    ensureViewport();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  /* Universal Search still renders a sandboxed iframe in the packaged bundle.
     Replace that frame with the same live Chromium surface. */
  function attachSearchOverlay() {
    var frame = document.querySelector('iframe[title="In-app browser"]');
    if (!frame || !frame.parentElement) return;
    var parent = frame.parentElement;
    if (parent.querySelector("[data-zyraxon-remote]")) return;
    var shell = document.createElement("div");
    shell.setAttribute("data-zyraxon-remote", "1");
    shell.style.cssText = "position:absolute;inset:0;background:#000;overflow:hidden;z-index:1;";
    var canvas = document.createElement("img");
    canvas.alt = "";
    canvas.draggable = false;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;user-select:none;";
    shell.appendChild(canvas);
    shell.tabIndex = 0;
    parent.style.position = "relative";
    parent.appendChild(shell);
    frame.style.display = "none";

    var searchState = { url: frame.src || "https://www.google.com/", title: "", loading: false, canGoBack: false, canGoForward: false, secure: true };
    var searchSocket = null;
    var searchReview = false;
    var searchImage = canvas;
    var searchPending = searchState.url;
    function searchPoint(event) {
      var rect = searchImage.getBoundingClientRect();
      var width = searchImage.naturalWidth || 1280;
      var height = searchImage.naturalHeight || 800;
      var scale = Math.min(rect.width / width, rect.height / height);
      var left = rect.left + (rect.width - width * scale) / 2;
      var top = rect.top + (rect.height - height * scale) / 2;
      return { x: Math.round((event.clientX - left) / scale), y: Math.round((event.clientY - top) / scale) };
    }
    function searchSend(payload) {
      if (searchSocket && searchSocket.readyState === WebSocket.OPEN) searchSocket.send(JSON.stringify(payload));
    }
    function searchConnect() {
      var protocol = location.protocol === "https:" ? "wss:" : "ws:";
      searchSocket = new WebSocket(protocol + "//" + location.host + "/browser-ws");
      searchSocket.onopen = function () {
        searchSend({ type: "navigate", url: searchPending });
      };
      searchSocket.onmessage = function (event) {
        var message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          return;
        }
        if (message.type === "frame") searchImage.src = "data:image/jpeg;base64," + message.data;
        if (message.type === "state") searchState = message;
      };
    }
    searchConnect();
    shell.addEventListener("mousedown", function (event) {
      shell.focus();
      var p = searchPoint(event);
      if (searchReview) {
        searchSend({ type: "review", x: p.x, y: p.y });
        return;
      }
      searchSend({ type: "mouse", event: "pressed", x: p.x, y: p.y, button: "left" });
    });
    shell.addEventListener("mouseup", function (event) {
      if (searchReview) return;
      var p = searchPoint(event);
      searchSend({ type: "mouse", event: "released", x: p.x, y: p.y, button: "left" });
    });
    shell.addEventListener("mousemove", function (event) {
      if (searchReview) return;
      var p = searchPoint(event);
      searchSend({ type: "mouse", event: "moved", x: p.x, y: p.y });
    });
    shell.addEventListener("wheel", function (event) {
      event.preventDefault();
      var p = searchPoint(event);
      searchSend({ type: "wheel", x: p.x, y: p.y, deltaX: event.deltaX, deltaY: event.deltaY });
    }, { passive: false });
    shell.addEventListener("keydown", function (event) {
      var mods = modifiers(event);
      searchSend({ type: "key", event: "keydown", key: event.key, code: event.code, modifiers: mods });
      if (
        ["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(event.key) >= 0 ||
        (mods & 6)
      ) {
        event.preventDefault();
      }
    });
    shell.addEventListener("keyup", function (event) {
      searchSend({ type: "key", event: "keyup", key: event.key, code: event.code, modifiers: modifiers(event) });
    });
    var srcObserver = new MutationObserver(function () {
      if (frame.src && frame.src !== searchPending) {
        searchPending = frame.src;
        searchSend({ type: "navigate", url: frame.src });
      }
    });
    srcObserver.observe(frame, { attributes: true, attributeFilter: ["src"] });
    var goneObserver = new MutationObserver(function () {
      if (!document.body.contains(frame)) {
        searchSocket && searchSocket.close();
        srcObserver.disconnect();
        goneObserver.disconnect();
        shell.remove();
      }
    });
    goneObserver.observe(document.body, { childList: true, subtree: true });
  }



  /* ---- final overrides: one visible remote viewport, panel shell, overlays ---- */

  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      try {
        var raw = typeof input === "string" ? input : input && input.url;
        if (raw) {
          var parsed = new URL(raw, location.href);
          var directory = parsed.searchParams.get("directory");
          if (directory) window.__zyraxonDirectory = directory;
          var headers = (init && init.headers) || (input && input.headers);
          if (headers) {
            if (typeof headers.get === "function") {
              var header = headers.get("x-zyraxon-directory");
              if (header) window.__zyraxonDirectory = header;
            } else {
              var header = headers["x-zyraxon-directory"] || headers["X-Zyraxon-Directory"];
              if (header) window.__zyraxonDirectory = header;
            }
          }
        }
      } catch (error) {}
      return originalFetch.apply(this, arguments);
    };
  }
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      var parsed = new URL(url, location.href);
      var directory = parsed.searchParams.get("directory");
      if (directory) window.__zyraxonDirectory = directory;
    } catch (error) {}
    return originalXhrOpen.apply(this, arguments);
  };

  document.addEventListener(
    "click",
    function (event) {
      var review = event.target.closest && event.target.closest('button[aria-controls="review-panel"]');
      var browserButton = event.target.closest && event.target.closest('button[aria-controls="browser-panel"]');
      if (!review && !browserButton) return;
      var wanted = review ? "review" : "browser";
      window.setTimeout(function () {
        var tabs = document.querySelectorAll('[role="tab"]');
        for (var i = 0; i < tabs.length; i++) {
          if ((tabs[i].textContent || "").trim().toLowerCase().indexOf(wanted) >= 0) {
            tabs[i].click();
            break;
          }
        }
      }, 250);
    },
    true,
  );

  function ensureViewport() {
    var preferred = document.querySelector('[data-zyraxon-panel-shell] [aria-label="ZYRAXON browser viewport"]');
    if (preferred && preferred !== viewport) viewport = null;
    if (viewport && document.body.contains(viewport)) return viewport;
    viewport = preferred || document.querySelector('[aria-label="ZYRAXON browser viewport"]');
    if (!viewport) return null;
    viewport.style.position = "relative";
    viewport.style.overflow = "hidden";
    viewport.style.background = "#000";
    viewport.tabIndex = 0;
    viewport.addEventListener("keydown", onKeyDown);
    viewport.addEventListener("keyup", onKeyUp);
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      image.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;user-select:none;";
      image.addEventListener("mousedown", onMouseDown);
      image.addEventListener("mouseup", onMouseUp);
      image.addEventListener("mousemove", onMouseMove);
      image.addEventListener("wheel", onWheel, { passive: false });
      image.addEventListener("contextmenu", function (event) {
        event.preventDefault();
      });
      viewport.appendChild(image);
    } else if (image.parentElement !== viewport) {
      viewport.appendChild(image);
    }
    return viewport;
  }

  function attachSearchOverlay() {
    var frame = document.querySelector('iframe[title="In-app browser"]');
    if (!frame || !frame.parentElement) return;
    var parent = frame.parentElement;
    if (parent.querySelector("[data-zyraxon-remote]")) return;

    var fixed = frame.closest(".fixed") || frame.closest('[class*="fixed"]');
    if (fixed) {
      fixed.style.padding = "0";
      fixed.style.alignItems = "stretch";
      fixed.style.justifyContent = "stretch";
      var card = fixed.firstElementChild;
      if (card) {
        card.style.maxWidth = "none";
        card.style.maxHeight = "none";
        card.style.width = "100vw";
        card.style.height = "100vh";
        card.style.borderRadius = "0";
      }
    }

    var shell = document.createElement("div");
    shell.setAttribute("data-zyraxon-remote", "1");
    shell.style.cssText =
      "position:absolute;inset:0;background:#000;overflow:hidden;z-index:1;display:flex;flex-direction:column;";
    var toolbar = document.createElement("div");
    toolbar.setAttribute("data-zyraxon-toolbar", "1");
    toolbar.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:6px 8px;background:#1b1b1b;border-bottom:1px solid #333;flex:0 0 auto;";
    function searchButton(label, title, onclick) {
      var b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        "background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 7px;cursor:pointer;";
      b.onclick = onclick;
      toolbar.appendChild(b);
      return b;
    }
    searchButton("←", "Back", function () {
      searchSend({ type: "back" });
    });
    searchButton("→", "Forward", function () {
      searchSend({ type: "forward" });
    });
    searchButton("⟳", "Reload", function () {
      searchSend({ type: "reload" });
    });
    var address = document.createElement("input");
    address.type = "text";
    address.placeholder = "Type a URL and press Enter";
    address.style.cssText =
      "flex:1;min-width:0;background:#0f0f0f;color:#eee;border:1px solid #444;border-radius:4px;padding:5px 8px;outline:none;";
    address.addEventListener("keydown", function (event) {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        var value = address.value.trim();
        if (value) {
          searchPending = value;
          searchSend({ type: "navigate", url: value });
          address.blur();
        }
      }
    });
    address.addEventListener("mousedown", function (event) {
      event.stopPropagation();
    });
    toolbar.appendChild(address);
    searchButton("✕", "Close", function () {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    toolbar.addEventListener("mousedown", function (event) {
      event.stopPropagation();
    });
    toolbar.addEventListener("keydown", function (event) {
      event.stopPropagation();
    });
    toolbar.addEventListener("keyup", function (event) {
      event.stopPropagation();
    });
    toolbar.addEventListener("wheel", function (event) {
      event.stopPropagation();
    });
    shell.appendChild(toolbar);
    var stage = document.createElement("div");
    stage.style.cssText = "position:relative;flex:1;min-height:0;background:#000;overflow:hidden;";
    var canvas = document.createElement("img");
    canvas.alt = "";
    canvas.draggable = false;
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;user-select:none;";
    stage.appendChild(canvas);
    shell.appendChild(stage);
    shell.tabIndex = 0;
    parent.style.position = "relative";
    parent.appendChild(shell);
    frame.style.display = "none";

    var searchState = {
      url: frame.src || "https://www.google.com/",
      title: "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      secure: true,
    };
    var searchSocket = null;
    var searchReview = false;
    var searchImage = canvas;
    var searchPending = searchState.url;
    var searchRetry = null;
    address.value = searchState.url;
    function searchPoint(event) {
      var rect = searchImage.getBoundingClientRect();
      var width = searchImage.naturalWidth || 1280;
      var height = searchImage.naturalHeight || 800;
      var scale = Math.min(rect.width / width, rect.height / height);
      var left = rect.left + (rect.width - width * scale) / 2;
      var top = rect.top + (rect.height - height * scale) / 2;
      return { x: Math.round((event.clientX - left) / scale), y: Math.round((event.clientY - top) / scale) };
    }
    function searchSend(payload) {
      if (searchSocket && searchSocket.readyState === WebSocket.OPEN) searchSocket.send(JSON.stringify(payload));
    }
    function searchConnect() {
      if (searchSocket && (searchSocket.readyState === WebSocket.OPEN || searchSocket.readyState === WebSocket.CONNECTING)) return;
      var protocol = location.protocol === "https:" ? "wss:" : "ws:";
      searchSocket = new WebSocket(protocol + "//" + location.host + "/browser-ws");
      searchSocket.onopen = function () {
        var box = stage.getBoundingClientRect();
        if (box.width > 1 && box.height > 1) {
          searchSend({ type: "resize", width: Math.round(box.width), height: Math.round(box.height) });
        }
        searchSend({ type: "navigate", url: searchPending });
      };
      searchSocket.onclose = function () {
        searchRetry = window.setTimeout(searchConnect, 1500);
      };
      searchSocket.onerror = function () {};
      searchSocket.onmessage = function (event) {
        var message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          return;
        }
        if (message.type === "frame") searchImage.src = "data:image/jpeg;base64," + message.data;
        if (message.type === "state") {
          searchState = message;
          if (document.activeElement !== address) address.value = message.url || "";
        }
      };
    }
    searchConnect();
    if (window.ResizeObserver) {
      var searchResize = new ResizeObserver(function () {
        var box = stage.getBoundingClientRect();
        if (box.width > 1 && box.height > 1) {
          searchSend({ type: "resize", width: Math.round(box.width), height: Math.round(box.height) });
        }
      });
      searchResize.observe(stage);
    }
    shell.addEventListener("mousedown", function (event) {
      if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
      shell.focus();
      var p = searchPoint(event);
      if (searchReview) {
        searchSend({ type: "review", x: p.x, y: p.y });
        return;
      }
      searchSend({ type: "mouse", event: "pressed", x: p.x, y: p.y, button: "left" });
    });
    shell.addEventListener("mouseup", function (event) {
      if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
      if (searchReview) return;
      var p = searchPoint(event);
      searchSend({ type: "mouse", event: "released", x: p.x, y: p.y, button: "left" });
    });
    shell.addEventListener("mousemove", function (event) {
      if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
      if (searchReview) return;
      var p = searchPoint(event);
      searchSend({ type: "mouse", event: "moved", x: p.x, y: p.y });
    });
    shell.addEventListener(
      "wheel",
      function (event) {
        if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
        event.preventDefault();
        var p = searchPoint(event);
        searchSend({ type: "wheel", x: p.x, y: p.y, deltaX: event.deltaX, deltaY: event.deltaY });
      },
      { passive: false },
    );
    shell.addEventListener("keydown", function (event) {
      if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
      var mods = modifiers(event);
      searchSend({ type: "key", event: "keydown", key: event.key, code: event.code, modifiers: mods });
      if (
        ["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(event.key) >= 0 ||
        mods & 6
      ) {
        event.preventDefault();
      }
    });
    shell.addEventListener("keyup", function (event) {
      if (event.target.closest && event.target.closest("[data-zyraxon-toolbar]")) return;
      searchSend({ type: "key", event: "keyup", key: event.key, code: event.code, modifiers: modifiers(event) });
    });
    var srcObserver = new MutationObserver(function () {
      if (frame.src && frame.src !== searchPending) {
        searchPending = frame.src;
        searchSend({ type: "navigate", url: frame.src });
      }
    });
    srcObserver.observe(frame, { attributes: true, attributeFilter: ["src"] });
    var goneObserver = new MutationObserver(function () {
      if (!document.body.contains(frame)) {
        searchSocket && searchSocket.close();
        if (searchRetry) clearTimeout(searchRetry);
        srcObserver.disconnect();
        goneObserver.disconnect();
        shell.remove();
      }
    });
    goneObserver.observe(document.body, { childList: true, subtree: true });
  }

  function makePanelShell(container, options) {
    options = options || {};
    if (container.querySelector("[data-zyraxon-panel-shell]")) return container.querySelector("[data-zyraxon-panel-shell]");
    var root = document.createElement("div");
    root.setAttribute("data-zyraxon-panel-shell", "1");
    root.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;background:#111;z-index:2;";
    var bar = document.createElement("div");
    bar.setAttribute("data-zyraxon-toolbar", "1");
    bar.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:6px 8px;background:#1b1b1b;border-bottom:1px solid #333;flex:0 0 auto;";
    function button(label, title, onclick) {
      var b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        "background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 7px;cursor:pointer;";
      b.onclick = onclick;
      bar.appendChild(b);
      return b;
    }
    button("←", "Back", function () {
      browser.back();
    });
    button("→", "Forward", function () {
      browser.forward();
    });
    button("⟳", "Reload", function () {
      browser.reload();
    });
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type a URL and press Enter";
    input.value = state.url && state.url !== "about:blank" ? state.url : "https://www.google.com/";
    input.style.cssText =
      "flex:1;min-width:0;background:#0f0f0f;color:#eee;border:1px solid #444;border-radius:4px;padding:5px 8px;outline:none;";
    input.addEventListener("keydown", function (event) {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        var value = input.value.trim();
        if (value) {
          browser.navigate(value);
          input.blur();
        }
      }
    });
    input.addEventListener("mousedown", function (event) {
      event.stopPropagation();
    });
    bar.appendChild(input);
    if (options.close) button("✕", "Close", options.close);
    root.appendChild(bar);
    var viewport = document.createElement("div");
    viewport.setAttribute("aria-label", "ZYRAXON browser viewport");
    viewport.style.cssText = "position:relative;flex:1;min-height:0;background:#000;overflow:hidden;";
    viewport.tabIndex = 0;
    root.appendChild(viewport);
    container.style.position = container.style.position || "relative";
    container.appendChild(root);
    if (window.ResizeObserver) {
      var panelResize = new ResizeObserver(function () {
        var box = viewport.getBoundingClientRect();
        if (box.width > 1 && box.height > 1) browser.resize(box.width, box.height);
      });
      panelResize.observe(viewport);
    }
    root._zyraxonUnsubscribe = browser.onState(function (next) {
      if (document.activeElement !== input) input.value = next.url || "";
    });
    if (state.url && state.url !== "about:blank") input.value = state.url;
    browser.create(state.url && state.url !== "about:blank" ? state.url : "https://www.google.com/");
    ensureViewport();
    return root;
  }

  function ensureBrowserPanel() {
    var panel = document.querySelector(
      '#session-side-panel-browser-tabpanel, #browser-panel, [data-zyraxon-browser-tab]',
    );
    if (!panel) return;
    makePanelShell(panel, {});
  }

  var overlayShell = null;
  function openRemoteOverlay(url) {
    if (overlayShell && document.body.contains(overlayShell)) overlayShell.remove();
    var overlay = document.createElement("div");
    overlay.setAttribute("data-zyraxon-remote-overlay", "1");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:12px;";
    var card = document.createElement("div");
    card.style.cssText =
      "position:relative;width:100%;height:100%;max-width:1400px;max-height:900px;background:#111;border:1px solid #333;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6);";
    overlay.appendChild(card);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    makePanelShell(card, {
      close: function () {
        overlay.remove();
        ensureViewport();
      },
    });
    browser.create(url || "https://www.google.com/");
    overlayShell = overlay;
    ensureViewport();
  }

  function openFileOverlay(path) {
    var overlay = document.createElement("div");
    overlay.setAttribute("data-zyraxon-file-overlay", "1");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;";
    var card = document.createElement("div");
    card.style.cssText =
      "display:flex;flex-direction:column;width:100%;height:100%;max-width:1200px;max-height:900px;background:#111;color:#eee;border:1px solid #333;border-radius:10px;overflow:hidden;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;";
    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;align-items:center;padding:8px 10px;background:#1b1b1b;border-bottom:1px solid #333;flex:0 0 auto;";
    var title = document.createElement("div");
    title.textContent = path;
    title.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    var close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText =
      "background:#2a2a2a;color:#eee;border:1px solid #444;border-radius:4px;padding:3px 7px;cursor:pointer;";
    close.onclick = function () {
      overlay.remove();
    };
    bar.appendChild(title);
    bar.appendChild(close);
    var pre = document.createElement("pre");
    pre.style.cssText =
      "flex:1;min-height:0;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#0d0d0d;";
    pre.textContent = "Loading…";
    card.appendChild(bar);
    card.appendChild(pre);
    overlay.appendChild(card);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    var candidates = [];
    if (path.charAt(0) === "/") {
      var slash = path.lastIndexOf("/");
      candidates.push({ directory: path.slice(0, slash), path: path.slice(slash + 1) });
      if (path.indexOf("/workspace/project/ZYRAXON-AI/") === 0) {
        candidates.push({
          directory: "/workspace/project/ZYRAXON-AI",
          path: path.slice("/workspace/project/ZYRAXON-AI/".length),
        });
      }
    } else {
      if (window.__zyraxonDirectory) candidates.push({ directory: window.__zyraxonDirectory, path: path });
      candidates.push({ directory: "/workspace/project/ZYRAXON-AI", path: path });
      candidates.push({ path: path });
    }
    var attempt = 0;
    function showText(content) {
      pre.textContent = content || "(empty file)";
    }
    function showBinary(data) {
      pre.textContent = "Binary file: " + path + "\n\n";
      var link = document.createElement("a");
      link.href = "data:application/octet-stream;base64," + data.content;
      link.download = path.split("/").pop() || "file";
      link.textContent = "Download file";
      link.style.cssText = "color:#7cc4ff;";
      pre.appendChild(link);
    }
    function tryNext() {
      if (attempt >= candidates.length) {
        pre.textContent = "Could not open " + path + "\n(no content returned)";
        return;
      }
      var candidate = candidates[attempt++];
      var url =
        location.origin +
        "/file/content?path=" +
        encodeURIComponent(candidate.path) +
        (candidate.directory ? "&directory=" + encodeURIComponent(candidate.directory) : "");
      fetch(url, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          if (data && data.type === "text" && data.content) {
            showText(data.content);
            return;
          }
          if (data && data.type === "binary" && data.content) {
            showBinary(data);
            return;
          }
          tryNext();
        })
        .catch(function () {
          tryNext();
        });
    }
    tryNext();
  }

  browser.openExternal = function () {
    if (state.url) window.open(state.url, "_blank", "noopener");
  };
  window.api = window.api || {};
  window.api.openLink = function (url) {
    if (url) window.dispatchEvent(new CustomEvent("zyraxon-open-in-app-browser", { detail: { url: url } }));
  };
  window.api.openExternal = function (url) {
    if (url) window.open(url, "_blank", "noopener");
  };
  window.api.openInAppBrowser = function (url) {
    if (url) window.dispatchEvent(new CustomEvent("zyraxon-open-in-app-browser", { detail: { url: url } }));
  };
  window.api.openFile = function (path) {
    if (path) openFileOverlay(path);
  };
  window.api.openPath = function (path) {
    if (path) openFileOverlay(path);
  };

})();
