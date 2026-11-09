/* Fatih Çay Evi — R638 adayı: Adisyon için asgari veriyle hata izleme.
 * Yapılandırma dağıtımda window.FATIH_POSTHOG_CONFIG üzerinden sağlanır.
 * Eksik yapılandırmada ve AB dışındaki bölgelerde pasiftir.
 */
(function fatihPostHogErrorMonitor() {
  "use strict";
  const config = window.FATIH_POSTHOG_CONFIG;
  const debug = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const token = config && config.projectToken;
  const host = config && config.apiHost;

  if (typeof token !== "string" || !token || typeof host !== "string" || !host) {
    if (debug) console.warn("FATIH_POSTHOG_CONFIG variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once FATIH_POSTHOG_CONFIG is configured");
    return;
  }
  if (host.replace(/\/+$/, "") !== "https://eu.i.posthog.com" || !/^phc_[A-Za-z0-9_-]+$/.test(token)) {
    if (debug) console.warn("PostHog: geçerli AB projesi yapılandırması bekleniyor.");
    return;
  }

  const seen = new Map();
  const pending = [];
  let client = null;
  let count = 0;

  function safeType(name) {
    return ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError"].includes(name) ? name : "Error";
  }
  function safeFile(value) {
    try {
      const url = new URL(String(value || ""), location.origin);
      if (url.origin !== location.origin) return "external";
      if (!/^\/(?:assets\/js|adisyon)\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) return "application";
      return url.pathname.split("/").pop();
    } catch (_) {
      return "unknown";
    }
  }
  function report(entry) {
    if (!client || navigator.onLine === false) return;
    const error = new Error(entry.kind + " in " + entry.file + ":" + entry.line);
    error.name = entry.type;
    error.stack = error.name + ": " + error.message + "\n    at " + entry.file + ":" + entry.line + ":0";
    try {
      client.captureException(error, {
        app_area: "adisyon",
        error_kind: entry.kind,
        source_file: entry.file,
        source_line: entry.line,
        $geoip_disable: true
      });
    } catch (_) {
      // İzleme hatası çalışan adisyonu etkilememeli.
    }
  }
  function enqueue(kind, name, file, line) {
    if (count >= 10) return;
    const entry = {
      kind: kind,
      type: safeType(name),
      file: safeFile(file),
      line: Number.isInteger(line) && line >= 0 && line <= 999999 ? line : 0
    };
    const key = [entry.kind, entry.type, entry.file, entry.line].join(":");
    const now = Date.now();
    if (now - (seen.get(key) || 0) < 60000) return;
    seen.set(key, now);
    count += 1;
    if (client) report(entry);
    else pending.push(entry);
  }

  window.addEventListener("error", function (event) {
    if (!event.error) return; // Kaynak dosyası yükleme hataları hariç.
    enqueue("uncaught", event.error.name, event.filename, event.lineno);
  });
  window.addEventListener("unhandledrejection", function () {
    // Promise nedenini okumayız: finans/müşteri verisi içerebilir.
    enqueue("promise", "Error", "", 0);
  });

  // PostHog'un resmî tarayıcı kod parçacığıyla uyumlu kuyruklu başlatma.
  try {
    const ph = window.posthog || [];
    if (!ph.__SV && !ph.__loaded) {
      window.posthog = ph;
      ph._i = [];
      ph.init = function (key, settings, namespace) {
        const label = namespace || "posthog";
        const target = namespace ? (ph[namespace] = []) : ph;
        target.people = target.people || [];
        "init capture register register_once unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" ").forEach(function (name) {
          target[name] = function () {
            target.push([name].concat(Array.prototype.slice.call(arguments, 0)));
          };
        });
        ph._i.push([key, settings, label]);
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = settings.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js";
        document.head.appendChild(script);
      };
      ph.__SV = 1;
    }
    window.posthog.init(token, {
      api_host: host.replace(/\/+$/, ""),
      defaults: "2026-08-30",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "never",
      persistence: "memory",
      advanced_disable_decide: true,
      before_send: function (event) {
        if (!event || event.event !== "$exception") return null;
        const properties = { $geoip_disable: true };
        const input = event.properties || {};
        ["$exception_list", "$exception_type", "$exception_message", "$exception_stack_trace", "$exception_fingerprint", "app_area", "error_kind", "source_file", "source_line"].forEach(function (key) {
          if (Object.prototype.hasOwnProperty.call(input, key)) properties[key] = input[key];
        });
        return Object.assign({}, event, { properties: properties });
      },
      loaded: function (posthog) {
        client = posthog;
        pending.splice(0).forEach(report);
      }
    });
  } catch (_) {
    // Hata izleme durursa, çalışan adisyon etkilenmez.
  }
})();
