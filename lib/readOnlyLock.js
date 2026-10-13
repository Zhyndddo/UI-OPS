// Round 508 — TEMPORARY read-only lock on every ticket and every package.
//
// Why: the Booking Không Trong Package data path has been producing inconsistent numbers
// (Rounds 492-507); until the root cause is found nothing may change tickets or packages.
//
// How: lib/supabaseClient.js wraps the client's .from(table). For the locked tables below every
// write (insert / update / upsert / delete) is NOT sent — it resolves to { data: null, error }
// instead — while reads (select) pass through untouched. One choke point, so it covers every page,
// the public magic-link pages and every popup without editing them one by one.
//
// To UNLOCK: set NEXT_PUBLIC_LOCK_TICKETS_PACKAGES=off in the deploy env (or set LOCK_ACTIVE to false) and redeploy.
// Server routes (app/api/*, cron) use their own service-role client and are NOT affected.

export const LOCK_ACTIVE = process.env.NEXT_PUBLIC_LOCK_TICKETS_PACKAGES !== "off";

// Tables that are fully write-locked.
export const LOCKED_TABLES = new Set([
  // tickets (every ticket type lives in `tickets`; `ticket_tabs` is the type/status config)
  "tickets",
  "ticket_tabs",
  // packages
  "media_booking_packages",
  "media_booking_package_lines",
  "media_booking_package_categories",
  "media_booking_content_entries",
  "release_package_items",
]);

// Package decisions are also stored on the release row. An update on `releases` is blocked only when it
// changes nothing but these columns (a package-only patch). A normal release edit that merely includes
// them among other fields is left alone so the rest of the release page keeps working.
const RELEASE_PACKAGE_KEYS = new Set(["project_type", "package_locked", "package_total_value", "int_media_requested"]);

const WRITE_METHODS = new Set(["insert", "update", "upsert", "delete"]);

function isPackageOnlyReleasePatch(method, payload) {
  if (method !== "update" || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  return keys.length > 0 && keys.every((k) => RELEASE_PACKAGE_KEYS.has(k));
}

let lastNotice = 0;
function notifyBlocked(table, method) {
  if (typeof window === "undefined") return;
  console.warn(`[read-only lock] ${method} on "${table}" was blocked.`);
  const now = Date.now();
  if (now - lastNotice < 2500) return;
  lastNotice = now;
  window.dispatchEvent(new CustomEvent("readonly-blocked", { detail: { table, method } }));
}

// A chainable stand-in for a Postgrest builder: .select().single().eq()... all return itself and
// awaiting it yields the blocked result, so existing `const { error } = await ...` code keeps working.
function blockedBuilder(table, method) {
  const result = {
    data: null,
    error: { message: "Tickets and packages are read-only right now — nothing was saved.", code: "READ_ONLY_LOCK", details: `${method} ${table}`, hint: null },
    count: null,
    status: 403,
    statusText: "Read-only lock",
  };
  const settled = Promise.resolve(result);
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return settled.then.bind(settled);
      if (prop === "catch") return settled.catch.bind(settled);
      if (prop === "finally") return settled.finally.bind(settled);
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}

export function applyReadOnlyLock(client) {
  if (!client || !LOCK_ACTIVE) return client;
  const originalFrom = client.from.bind(client);
  client.from = (table) => {
    const builder = originalFrom(table);
    const fullyLocked = LOCKED_TABLES.has(table);
    if (!fullyLocked && table !== "releases") return builder;
    return new Proxy(builder, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        if (WRITE_METHODS.has(prop)) {
          return (...args) => {
            if (fullyLocked || isPackageOnlyReleasePatch(prop, args[0])) {
              notifyBlocked(table, prop);
              return blockedBuilder(table, prop);
            }
            return value.apply(target, args);
          };
        }
        return value.bind(target);
      },
    });
  };
  return client;
}
