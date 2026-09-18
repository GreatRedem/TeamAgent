import { strict as assert } from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const site = await read("./nginx/nuraai.conf");
const headers = await read("./nginx/nuraai-security-headers.conf");
const snippet = "include /etc/nginx/snippets/nuraai-security-headers.conf;";
const units = Object.fromEntries(
  await Promise.all(
    ["api", "worker", "migrate"].map(async (name) => [
      name,
      await read(`./systemd/nuraai-${name}.service`),
    ]),
  ),
);

function blocks(text) {
  const root = { title: "", lines: [], children: [] };
  const stack = [root];
  for (const line of text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    const parent = stack.at(-1);
    if (line.endsWith("{")) {
      const child = { title: line.slice(0, -1).trim(), lines: [], children: [] };
      parent.children.push(child);
      stack.push(child);
    } else if (line === "}") {
      assert.ok(stack.length > 1);
      stack.pop();
    } else {
      assert.ok(line.endsWith(";"), line);
      parent.lines.push(line);
    }
  }
  assert.equal(stack.length, 1);
  return root;
}

const servers = blocks(site).children;
const https = servers.find((server) => server.lines.includes("listen 443 ssl;"));
const http = servers.find((server) => server.lines.includes("listen 80;"));
const locations = https.children.filter((child) => child.title.startsWith("location "));
const location = (title) => {
  const found = locations.find((child) => child.title === `location ${title}`);
  assert.ok(found, title);
  return found;
};

function selectedLocation(request) {
  const path = request.split("?")[0];
  const exact = locations.find((child) => child.title === `location = ${path}`);
  if (exact) return exact;
  for (const child of locations) {
    const match = /^location (~\*?) (.+)$/.exec(child.title);
    if (match && new RegExp(match[2], match[1] === "~*" ? "i" : "").test(path)) return child;
  }
  return location("/");
}

for (const [entry, unit] of Object.entries(units)) {
  test(`${entry} uses the required environment, direct Node runner, and conservative sandbox`, () => {
    const lines = unit.split(/\r?\n/).filter(Boolean);
    for (const expected of [
      "User=nuraai",
      "Group=nuraai",
      "WorkingDirectory=/opt/nuraai/current",
      "EnvironmentFile=/etc/nuraai/runtime.env",
      "ExecStartPre=/usr/bin/node /opt/nuraai/current/apps/api/production.mjs config",
      `ExecStart=/usr/bin/node /opt/nuraai/current/apps/api/production.mjs ${entry}`,
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "ProtectSystem=strict",
      "ProtectHome=true",
      "CapabilityBoundingSet=",
      "AmbientCapabilities=",
      "UMask=0077",
      "KillSignal=SIGTERM",
      "KillMode=control-group",
      "StandardOutput=journal",
      "StandardError=journal",
      "Wants=network-online.target",
      "After=network-online.target",
    ]) {
      assert.equal(lines.filter((line) => line === expected).length, 1, expected);
    }
    assert.equal(lines.filter((line) => line.startsWith("Exec")).length, 2);
    assert.doesNotMatch(
      unit,
      /MemoryDenyWriteExecute|ReadWritePaths|Environment=|EnvironmentFile=-|postgres.*\.service|npm|npx|tsx|\/bin\/(?:ba)?sh|ExecReload|ExecStop|\[Socket\]/i,
    );
    if (entry === "migrate") {
      assert.ok(lines.includes("Type=oneshot"));
      assert.ok(lines.includes("Restart=no"));
      assert.ok(lines.includes("TimeoutStartSec=900"));
      assert.doesNotMatch(unit, /\[Install\]|WantedBy=|RequiredBy=|RemainAfterExit=/);
    } else {
      for (const expected of [
        "Type=simple",
        "Restart=on-failure",
        "RestartSec=5",
        "StartLimitIntervalSec=60",
        "StartLimitBurst=5",
        "TimeoutStartSec=60",
        `TimeoutStopSec=${entry === "api" ? 120 : 900}`,
        "WantedBy=multi-user.target",
      ])
        assert.ok(lines.includes(expected), expected);
      assert.doesNotMatch(unit, /migrat|%i|@/i);
    }
  });
}

test("HTTP and TLS reject unknown hosts and redirect only to the configured literal origin", () => {
  assert.equal(servers.length, 4);
  for (const port of [80, 443]) {
    const tls = port === 443 ? " ssl" : "";
    const fallback = servers.find((server) =>
      server.lines.includes(`listen ${port}${tls} default_server;`),
    );
    assert.ok(fallback.lines.includes(`listen [::]:${port}${tls} default_server;`));
    assert.ok(fallback.lines.includes("return 444;"));
    if (port === 443) {
      assert.ok(fallback.lines.includes("ssl_reject_handshake on;"));
      assert.ok(fallback.lines.includes("ssl_protocols TLSv1.2 TLSv1.3;"));
    }
    const server = port === 443 ? https : http;
    assert.ok(server.lines.includes("server_name example.invalid;"));
    for (const title of [
      "if ($host != example.invalid)",
      `if ($http_host !~* "^example[.]invalid(:${port})?$")`,
    ]) {
      assert.deepEqual(server.children.find((child) => child.title === title)?.lines, [
        "return 444;",
      ]);
    }
  }
  assert.ok(https.lines.includes("ssl_protocols TLSv1.2 TLSv1.3;"));
  assert.ok(https.lines.includes("ssl_certificate /etc/nginx/tls/REPLACE_WITH_FULLCHAIN.pem;"));
  assert.ok(
    https.lines.includes("ssl_certificate_key /etc/nginx/tls/REPLACE_WITH_PRIVATE_KEY.pem;"),
  );
  assert.deepEqual(http.children.find((child) => child.title === "location /").lines, [
    "return 308 https://example.invalid$request_uri;",
  ]);
  assert.doesNotMatch(site, /https:\/\/\$(?:host|http_host|server_name)|TLSv1(?:\.1)?;/);
});

test("only exact API namespaces proxy unchanged paths and queries, without retries or interception", () => {
  const api = location("~ ^/(auth|teams|users)(/|$)");
  assert.equal((site.match(/proxy_pass /g) ?? []).length, 1);
  for (const directive of [
    "proxy_pass http://127.0.0.1:3000;",
    "proxy_http_version 1.1;",
    "proxy_set_header Host example.invalid;",
    "proxy_set_header X-Forwarded-Host example.invalid;",
    "proxy_set_header X-Forwarded-Proto https;",
    "proxy_set_header X-Forwarded-Port 443;",
    "proxy_set_header X-Forwarded-For $remote_addr;",
    "proxy_set_header X-Real-IP $remote_addr;",
    'proxy_set_header Forwarded "";',
    'proxy_set_header Connection "";',
    "proxy_next_upstream off;",
    "proxy_intercept_errors off;",
    "proxy_cache off;",
  ])
    assert.ok(api.lines.includes(directive), directive);
  assert.doesNotMatch(api.lines.join("\n"), /try_files|return |rewrite|error_page/);
  assert.doesNotMatch(site, /rewrite|error_page|proxy_add_x_forwarded_for|Access-Control-Allow/);
  for (const namespace of ["auth", "teams", "users"]) {
    for (const suffix of ["", "/", "?page=2", "/missing.js?next=%2Fapp%3Fa%3D1"]) {
      assert.equal(selectedLocation(`/${namespace}${suffix}`), api);
    }
    for (const path of [`/${namespace}-other`, `/${namespace}x`, `/app/${namespace}`]) {
      assert.notEqual(selectedLocation(path), api);
    }
  }
  assert.deepEqual(selectedLocation("/api/teams?x=1").lines, ["return 404;"]);
});

test("health and metrics are private on both public listeners", () => {
  for (const server of [http, https]) {
    const deny = server.children.find(
      (child) => child.title === "location ~ ^/(health|metrics)(/|$)",
    );
    assert.deepEqual(deny?.lines, ["return 404;"]);
  }
  for (const path of [
    "/health",
    "/health/ready?probe=1",
    "/health/live",
    "/metrics",
    "/metrics/extra.js",
  ]) {
    assert.deepEqual(selectedLocation(path).lines, ["return 404;"]);
  }
  assert.doesNotMatch(site, /9100/);
});

test("static location ordering preserves immutable assets, real 404s, and no-cache SPA index", () => {
  assert.ok(https.lines.includes("root /opt/nuraai/current/apps/web/dist;"));
  assert.ok(https.lines.includes("include /etc/nginx/mime.types;"));
  assert.ok(https.lines.includes("client_max_body_size 2m;"));
  const assets = location("~ ^/assets/");
  assert.ok(assets.lines.includes("try_files $uri =404;"));
  assert.ok(
    assets.lines.includes('add_header Cache-Control "public, max-age=31536000, immutable";'),
  );
  for (const path of [
    "/assets/index-hash.js?v=1",
    "/assets/missing.css",
    "/assets/missing.unknown",
  ]) {
    assert.equal(selectedLocation(path), assets);
  }
  for (const path of ["/assets", "/.env", "/assets/.env"]) {
    assert.deepEqual(selectedLocation(path).lines, ["return 404;"]);
  }
  for (const path of ["/missing.js", "/missing.css", "/favicon.ico"]) {
    assert.ok(selectedLocation(path).lines.includes("try_files $uri =404;"));
  }
  const index = location("= /index.html");
  assert.ok(index.lines.includes("try_files $uri =404;"));
  assert.ok(index.lines.includes('add_header Cache-Control "no-cache" always;'));
  assert.ok(
    selectedLocation("/app/team/agents?tab=all").lines.includes("try_files $uri /index.html;"),
  );
});

test("security headers survive every cache-header scope without imposing untested wallet CSP", () => {
  assert.deepEqual(headers.trim().split(/\r?\n/), [
    "add_header X-Content-Type-Options nosniff always;",
    "add_header X-Frame-Options DENY always;",
    "add_header Referrer-Policy strict-origin-when-cross-origin always;",
  ]);
  for (const server of [http, https]) assert.ok(server.lines.includes(snippet));
  for (const child of locations) {
    if (child.lines.some((line) => line.startsWith("add_header "))) {
      assert.ok(child.lines.includes(snippet), child.title);
    }
  }
  assert.doesNotMatch(
    site + headers,
    /Content-Security-Policy|add_header_inherit|Strict-Transport-Security/,
  );
});

test("deployment inventory contains no credential material, env copies, or worker instances", async () => {
  assert.deepEqual((await readdir(new URL("./systemd/", import.meta.url))).sort(), [
    "nuraai-api.service",
    "nuraai-migrate.service",
    "nuraai-worker.service",
  ]);
  assert.deepEqual((await readdir(new URL("./nginx/", import.meta.url))).sort(), [
    "nuraai-security-headers.conf",
    "nuraai.conf",
  ]);
  for (const template of [site, headers, ...Object.values(units)]) {
    assert.doesNotMatch(
      template,
      /^\s*#|JWT_SECRET|DATABASE_URL|MODEL_API_KEY|BEGIN .*PRIVATE KEY|postgres(?:ql)?:\/\/|https?:\/\/[^\s/]+:[^\s/]+@/m,
    );
  }
});

test("the release gate includes the dependency-free static deployment suite", async () => {
  const { scripts } = JSON.parse(await read("../package.json"));
  assert.equal(scripts["test:deploy"], "node --test deploy/templates.test.mjs");
  assert.ok(scripts["release:check"].split(" && ").includes("npm run test:deploy"));
  const worker = await read("../apps/api/src/worker.ts");
  assert.match(worker, /listen\(\{ port: 9100, host: "127\.0\.0\.1" \}\)/);
  const app = await read("../apps/api/src/app.ts");
  assert.match(app, /bodyLimit: 1_048_576/);
});
