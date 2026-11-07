// Regressione: ERR_FAILED dopo il login dell'access layer davanti al sito.
//
// Catena riprodotta (sintetica, nessuna rete esterna): l'host risponde a
// `/index.html` con un redirect «pretty URL» verso `/`, quindi il precache
// dell'install conserva una copia con `redirected === true`. Poi, con la
// sessione scaduta o sul ritorno `/cdn-cgi/access/authorized`, la navigazione
// riceve un `opaqueredirect`, il worker scendeva sul ripiego in cache e dava a
// `respondWith` una risposta rediretta: il browser la rifiuta (ERR_FAILED).
// Vale anche offline.
//
// Perché un server proprio e non il preview della suite: il preview non sa
// fare redirect, scadenza di sessione né un ritorno con cookie. Qui un piccolo
// server Node serve lo STESSO `dist/` (il build vero, sw.js compreso) e
// aggiunge soltanto quei comportamenti. Il «login» è un secondo server su un
// altro origin (localhost contro 127.0.0.1), che serve una pagina fissa.
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { waitForServiceWorkerControl } from "./helpers.js";

const DIST = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const LOGIN_MARKER = "PAGINA DI LOGIN SINTETICA";
const APP_TITLE = /<title>([^<]*)<\/title>/.exec(readFileSync(join(DIST, "index.html"), "utf8"))?.[1] ?? "";

type Mode = "normal" | "expired" | "access";

interface Rig {
  readonly origin: string;
  mode: Mode;
  close(): Promise<void>;
}

async function listen(server: Server, host: string): Promise<number> {
  await new Promise<void>((done) => server.listen(0, host, done));
  return (server.address() as AddressInfo).port;
}

async function startRig(): Promise<Rig> {
  const login = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>login</title><h1>${LOGIN_MARKER}</h1>`);
  });
  const loginPort = await listen(login, "127.0.0.1");
  // `localhost` and `127.0.0.1` are different origins for the browser.
  const loginUrl = `http://localhost:${loginPort}/login`;

  const rig: { mode: Mode } = { mode: "normal" };
  const app = createServer((req, res) => {
    let path = new URL(req.url ?? "/", "http://x").pathname;
    const hasSession = /(^|;\s*)session=ok/.test(req.headers.cookie ?? "");
    if (rig.mode === "access") {
      if (path === "/cdn-cgi/access/authorized") {
        res.writeHead(302, { location: "/", "set-cookie": "session=ok; Path=/; HttpOnly" });
        return void res.end();
      }
      if (!hasSession) {
        res.writeHead(302, { location: loginUrl });
        return void res.end();
      }
    }
    if (rig.mode === "expired") {
      res.writeHead(302, { location: loginUrl });
      return void res.end();
    }
    // Host «pretty URL»: /index.html is a redirect to /.
    if (path === "/index.html") {
      res.writeHead(308, { location: "/" });
      return void res.end();
    }
    if (path === "/") path = "/index.html";
    const file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      return void res.end("not found");
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(readFileSync(file));
  });
  const port = await listen(app, "127.0.0.1");
  return {
    origin: `http://127.0.0.1:${port}`,
    get mode() {
      return rig.mode;
    },
    set mode(value: Mode) {
      rig.mode = value;
    },
    close: async () => {
      await Promise.all([
        new Promise((done) => app.close(done)),
        new Promise((done) => login.close(done)),
      ]);
    },
  };
}

/** Installs the worker and proves the premise: the precached /index.html is a redirected copy. */
async function installWorker(page: Page, rig: Rig): Promise<void> {
  await page.goto(`${rig.origin}/`);
  await waitForServiceWorkerControl(page);
  const redirected = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const hit = await (await caches.open(name)).match("/index.html");
      if (hit) return hit.redirected;
    }
    return null;
  });
  expect(redirected, "premise: the precache must hold the redirected copy of /index.html").toBe(true);
}

test.describe("service worker behind a login redirect layer", () => {
  let rig: Rig;
  test.beforeEach(async () => {
    rig = await startRig();
  });
  test.afterEach(async () => {
    await rig.close();
  });

  test("an expired session reaches the login page instead of failing", async ({ page }) => {
    await installWorker(page, rig);
    rig.mode = "expired";
    await page.goto(`${rig.origin}/`);
    await expect(page.getByRole("heading", { name: LOGIN_MARKER })).toBeVisible();
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  test("the login return path is left to the network and lands on the app", async ({ page, context }) => {
    await installWorker(page, rig);
    rig.mode = "access";
    await context.clearCookies();
    await page.goto(`${rig.origin}/cdn-cgi/access/authorized?code=synthetic`);
    expect(page.url()).toBe(`${rig.origin}/`);
    await expect(page).toHaveTitle(APP_TITLE);
    expect((await context.cookies(rig.origin)).map((c) => c.name)).toContain("session");
  });

  test("a cold start offline shows the app from the cache", async ({ page, context }) => {
    await installWorker(page, rig);
    await context.setOffline(true);
    await page.goto(`${rig.origin}/`);
    await expect(page).toHaveTitle(APP_TITLE);
  });
});
